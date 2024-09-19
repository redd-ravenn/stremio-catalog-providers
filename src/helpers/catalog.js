const axios = require('axios');
const { genresDb } = require('../helpers/db');
const { discoverContent } = require('../api/tmdb');
const { getCachedPoster, setCachedPoster } = require('../helpers/cache');
const log = require('../helpers/logger');

const baseUrl = process.env.BASE_URL || 'http://localhost:7000';

async function parseConfigParameters(configParameters) {
    let parsedConfig = {};
    if (configParameters) {
        try {
            parsedConfig = JSON.parse(decodeURIComponent(configParameters));
        } catch (error) {
            log.error(`Error parsing configParameters: ${error.message}`);
        }
    }
    return parsedConfig;
}

function extractCatalogInfo(id) {
    const match = id.match(/^tmdb-discover-(movies|series)(-new|-popular)?-(\d+)$/);
    if (!match) {
        throw new Error('Invalid catalog id');
    }
    return {
        catalogType: match[1],
        providerId: parseInt(match[3], 10)
    };
}

async function getGenreId(genreName, type) {
    const genreRow = await new Promise((resolve, reject) => {
        genresDb.get("SELECT genre_id FROM genres WHERE genre_name = ? AND media_type = ?", [genreName, type === 'series' ? 'tv' : 'movie'], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
    return genreRow ? genreRow.genre_id : null;
}

async function fetchDiscoverContent(catalogType, providers, ageRange, sortBy, genre, tmdbApiKey, language, skip, regions, year = null, rating = null) {
    return await discoverContent(catalogType, providers, ageRange, sortBy, genre, tmdbApiKey, language, skip, regions, year, rating);
}

function getRpdbPoster(type, id, language, rpdbkey) {
    const tier = rpdbkey.split("-")[0];
    const lang = language.split("-")[0];
    const baseUrl = `https://api.ratingposterdb.com/${rpdbkey}/tmdb/poster-default/${type}-${id}.jpg?fallback=true`;
    return (tier === "t0" || tier === "t1") ? baseUrl : `${baseUrl}&lang=${lang}`;
}

async function getPosterUrl(content, catalogType, language, rpdbApiKey) {
    const posterId = `poster:${content.id}`;
    let posterUrl;
    if (rpdbApiKey) {
        const cachedPoster = await getCachedPoster(posterId);
        if (cachedPoster) {
            log.debug(`Using cached poster URL for id ${posterId}`);
            return cachedPoster.poster_url;
        }

        const rpdbImage = getRpdbPoster(catalogType, content.id, language, rpdbApiKey);
        try {
            const response = await axios.head(rpdbImage);
            if (response.status === 200) {
                log.debug(`RPDB poster found for id ${posterId}`);
                await setCachedPoster(posterId, rpdbImage);
                return rpdbImage;
            }
        } catch (error) {
            log.warn(`Error fetching RPDB poster: ${error.message}. Falling back to TMDB poster.`);
        }
    }
    posterUrl = `https://image.tmdb.org/t/p/w500${content.poster_path}`;
    return posterUrl;
}

async function buildMetas(filteredResults, catalogType, language, rpdbApiKey, addWatchedTraktBtn, hideTraktHistory, traktUsername) {
    return await Promise.all(filteredResults.map(async (content) => {
        const posterUrl = await getPosterUrl(content, catalogType, language, rpdbApiKey);


        let releaseInfo = catalogType === 'movies'
        ? content.release_date ? content.release_date.split('-')[0] : ''
        : content.first_air_date 
            ? content.last_air_date 
                ? `${content.first_air_date.split('-')[0]}-${content.last_air_date.split('-')[0]}`
                : content.first_air_date.split('-')[0]
            : '';

        const links = await buildLinks(content, catalogType, addWatchedTraktBtn, hideTraktHistory, traktUsername); 

        return {
            id: `tmdb:${content.id}`,
            type: catalogType === 'movies' ? 'movie' : 'series',
            name: catalogType === 'movies' ? content.title : content.name,
            poster: posterUrl,
            background: `https://image.tmdb.org/t/p/w1280${content.backdrop_path}`,
            description: content.overview,
            releaseInfo: releaseInfo || null,
            links
        };
    }));
}

async function buildLinks(content, catalogType, addWatchedTraktBtn, hideTraktHistory, traktUsername) {
    const links = [];

    if (content.genre_ids) {
        for (const genreId of content.genre_ids) {
            try {
                const genreName = await getGenreName(genreId, content.type);
                if (genreName) {
                    links.push({
                        name: genreName,
                        category: 'Genres',
                        url: `stremio:///discover`
                    });
                }
            } catch (error) {
                console.error(`Error fetching genre name for ID ${genreId}: ${error.message}`);
            }
        }
    }

    if (content.vote_average && content.id) {
        links.push({
            name: content.vote_average.toFixed(1),
            category: 'imdb',
            url: `https://imdb.com/title/tt${content.id}`
        });
    }

    if (addWatchedTraktBtn && addWatchedTraktBtn.trim() !== '' && hideTraktHistory === 'true' && traktUsername) {
        links.push({
            name: addWatchedTraktBtn,
            category: 'Trakt',
            url: `${baseUrl}/updateWatched/${traktUsername}/${catalogType}/${content.id}`
        });
    }

    return links;
}

async function getGenreName(genreId, type) {
    return new Promise((resolve, reject) => {
        genresDb.get("SELECT genre_name FROM genres WHERE genre_id = ? AND media_type = ?", [genreId, type === 'series' ? 'tv' : 'movie'], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.genre_name : null);
        });
    });
}

module.exports = {
    parseConfigParameters,
    extractCatalogInfo,
    getGenreId,
    fetchDiscoverContent,
    getPosterUrl,
    buildMetas
};
