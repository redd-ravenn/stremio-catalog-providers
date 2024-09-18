const express = require('express');
const log = require('../helpers/logger');
const { parseConfigParameters, extractCatalogInfo, getGenreId, fetchDiscoverContent, buildMetas } = require('../helpers/catalog');
const { fetchUserWatchedMovies, fetchUserWatchedShows, saveUserWatchedHistory } = require('../helpers/trakt');
const { traktDb } = require('../helpers/db');
const router = express.Router();

router.get("/:configParameters?/catalog/:type/:id/:extra?.json", async (req, res, next) => {
    const { id, configParameters, type, extra: extraParam } = req.params;
    const extra = extraParam ? decodeURIComponent(extraParam) : '';
    let skip = 0;

    log.debug(`Received parameters: id=${id}, type=${type}, configParameters=${configParameters}, extra=${extra}`);

    const parsedConfig = await parseConfigParameters(configParameters);
    const { catalogType, providerId } = extractCatalogInfo(id);
    const providers = [providerId.toString()];

    if (extra.startsWith('skip=')) {
        const skipValue = parseInt(extra.split('=')[1], 10);
        skip = isNaN(skipValue) ? 0 : skipValue;
    }

    const yearMatch = extra.match(/year=([^&]+)/);
    const ratingMatch = extra.match(/rating=([^&]+)/);
    const genreMatch = extra.match(/genre=([^&]+)/);

    let year = yearMatch ? yearMatch[1] : null;
    let rating = ratingMatch ? ratingMatch[1] : null;
    let genre = genreMatch ? genreMatch[1] : null;

    if (genre) {
        genre = await getGenreId(genre, type);
    }

    try {
        const sortBy = catalogType === 'movies'
            ? (id.includes('-new') ? 'primary_release_date.desc' : 'popularity.desc')
            : (id.includes('-new') ? 'first_air_date.desc' : 'popularity.desc');

        const discoverResults = await fetchDiscoverContent(
            catalogType,
            providers,
            parsedConfig.ageRange,
            sortBy,
            genre,
            parsedConfig.tmdbApiKey,
            parsedConfig.language,
            skip,
            parsedConfig.regions,
            year,
            rating
        );

        let filteredResults = discoverResults.results;

        if (parsedConfig.filterContentWithoutPoster === 'true') {
            filteredResults = filteredResults.filter(content => content.poster_path);
        }

        if (parsedConfig.hideTraktHistory === 'true' && parsedConfig.traktUsername) {
            const traktUsername = parsedConfig.traktUsername;
            const watchedEmoji = parsedConfig.watchedEmoji || '✔️';
            
            const lastFetchedRow = await new Promise((resolve, reject) => {
                traktDb.get(`SELECT last_fetched_at FROM trakt_tokens WHERE username = ?`, [traktUsername], (err, row) => {
                    if (err) {
                        log.error(`Error checking last fetched time for user ${traktUsername}: ${err.message}`);
                        return reject(err);
                    }
                    resolve(row);
                });
            });
        
            const lastFetchedAt = lastFetchedRow ? new Date(lastFetchedRow.last_fetched_at) : null;
            const now = new Date();
        
            if (!lastFetchedAt || (now - lastFetchedAt) >= 24 * 60 * 60 * 1000) {
                log.info(`User ${traktUsername} history has not been fetched in the last 24 hours. Triggering asynchronous fetch.`);
        
                (async () => {
                    try {
                        const tokensRow = await new Promise((resolve, reject) => {
                            traktDb.get(`SELECT access_token, refresh_token FROM trakt_tokens WHERE username = ?`, [traktUsername], (err, row) => {
                                if (err) {
                                    log.error(`Error retrieving Trakt tokens for user ${traktUsername}: ${err.message}`);
                                    return reject(err);
                                }
                                resolve(row);
                            });
                        });
        
                        if (tokensRow) {
                            const { access_token } = tokensRow;
                            const [movieHistory, showHistory] = await Promise.all([
                                fetchUserWatchedMovies(traktUsername, access_token),
                                fetchUserWatchedShows(traktUsername, access_token)
                            ]);
        
                            log.info(`Successfully fetched watched movies and shows for user ${traktUsername}.`);
        
                            await Promise.all([
                                saveUserWatchedHistory(traktUsername, movieHistory),
                                saveUserWatchedHistory(traktUsername, showHistory)
                            ]);
        
                            log.info(`Successfully saved watched history for user ${traktUsername} in the database.`);
        
                            await new Promise((resolve, reject) => {
                                traktDb.run(`UPDATE trakt_tokens SET last_fetched_at = ? WHERE username = ?`, [now.toISOString(), traktUsername], (err) => {
                                    if (err) {
                                        log.error(`Error updating last fetched time for user ${traktUsername}: ${err.message}`);
                                        return reject(err);
                                    }
                                    resolve();
                                });
                            });
                        } else {
                            log.error(`Unable to retrieve tokens for user ${traktUsername}.`);
                        }
                    } catch (error) {
                        log.error(`Error during asynchronous history fetch for user ${traktUsername}: ${error.message}`);
                    }
                })();
            }
        
            log.debug(`Fetching Trakt history for user ${traktUsername}`);
            const traktIds = await new Promise((resolve, reject) => {
                traktDb.all(`SELECT tmdb_id FROM trakt_history WHERE username = ? AND tmdb_id IS NOT NULL`, [traktUsername], (err, rows) => {
                    if (err) {
                        log.error(`Error fetching Trakt history for user ${traktUsername}: ${err.message}`);
                        return reject(err);
                    }
                    const ids = rows.map(row => `tmdb:${row.tmdb_id}`);
                    resolve(ids);
                });
            });
        
            filteredResults = filteredResults.map(content => {
                const contentId = `tmdb:${content.id}`;
                if (traktIds.includes(contentId)) {
                    content.title = `${watchedEmoji} ${content.title || content.name}`;
                }
                return content;
            });
        }

        const metas = await buildMetas(filteredResults, catalogType, parsedConfig.language, parsedConfig.rpdbApiKey);

        res.json({ metas });
    } catch (error) {
        log.error(`Error processing request: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

module.exports = router;
