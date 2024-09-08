const axios = require('axios');
const queue = require('./utils/queue');
const { providersDb, genresDb, catalogDb } = require('./db');
const { TMDB_BEARER_TOKEN, TMDB_LANGUAGE, TMDB_WATCH_REGION } = process.env;
const { getCache, setCache } = require('./cache');
const log = require('./utils/logger');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const makeRequest = (url, tmdbApiKey = null) => {
    const headers = {};

    if (!tmdbApiKey) {
        headers['Authorization'] = `Bearer ${TMDB_BEARER_TOKEN}`;
    }

    return new Promise((resolve, reject) => {
        queue.push({
            fn: () => axios.get(url, { headers })
                .then(response => {
                    log.debug(`API request successful for URL: ${url}`);
                    resolve(response.data);
                })
                .catch(error => {
                    log.error(`Error during API request for URL: ${url} - ${error.message}`);
                    reject(error);
                })
        });
    });
};

const determinePageFromSkip = async (providerId, skip, catalogDb, type, sortBy, ageRange) => {
    try {
        const cachedEntry = await new Promise((resolve, reject) => {
            catalogDb.get(
                "SELECT page, skip FROM cache WHERE provider_id = ? AND skip = ? AND type = ? AND sortBy = ? AND ageRange = ? ORDER BY skip DESC LIMIT 1",
                [providerId, skip, type, sortBy, ageRange],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });

        if (cachedEntry) {
            log.debug('Cached Entry:', cachedEntry);
            log.debug('Determined Page from Cache:', cachedEntry.page);
            return cachedEntry.page;
        }

        const lastEntry = await new Promise((resolve, reject) => {
            catalogDb.get(
                "SELECT page, skip FROM cache WHERE provider_id = ? AND type = ? AND sortBy = ? AND ageRange = ? ORDER BY skip DESC LIMIT 1",
                [providerId, type, sortBy, ageRange],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });

        log.debug('Last Entry:', lastEntry);

        if (lastEntry) {
            log.debug('Current Skip:', skip, 'Last Skip:', lastEntry.skip);

            if (skip > lastEntry.skip) {
                log.debug('Determined Page:', lastEntry.page + 1);
                return lastEntry.page + 1;
            }
        }

        log.debug('Default Page:', 1);
        return 1;
    } catch (error) {
        log.error('Error in determinePageFromSkip:', error);
        return 1;
    }
};

const fetchData = async (endpoint, params = {}, tmdbApiKey = null, providerId = null, ageRange = null) => {
    if (tmdbApiKey) {
        params.api_key = tmdbApiKey;
    }

    const { skip, type, sort_by: sortBy, ...queryParams } = params;

    const page = providerId ? await determinePageFromSkip(providerId, skip, catalogDb, type, sortBy, ageRange) : 1;

    const queryParamsWithPage = {
        ...queryParams,
        page,
        language: params.language || TMDB_LANGUAGE,
    };

    if (sortBy) {
        queryParamsWithPage.sort_by = sortBy;
    }

    const queryString = new URLSearchParams(queryParamsWithPage).toString();

    const url = `${TMDB_BASE_URL}${endpoint}?${queryString}`;

    log.debug('Request URL:', url);

    const cachedData = await getCache(url, skip);
    if (cachedData) {
        return cachedData;
    }

    const data = await makeRequest(url, tmdbApiKey);

    setCache(url, data, page, skip, providerId, type, sortBy, ageRange);
    log.debug(`Data stored in cache for URL: ${url} with page: ${page}, skip: ${skip}, providerId: ${providerId}, type: ${type}, sortBy: ${sortBy}, ageRange: ${ageRange}`);

    return data;
};

const discoverContent = async (type, watchProviders = [], ageRange = null, sortBy = 'popularity.desc', genre = null, tmdbApiKey = null, language = TMDB_LANGUAGE, skip = 0) => {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/discover/${mediaType}`;

    const regions = TMDB_WATCH_REGION ? TMDB_WATCH_REGION.split(',') : [];
    const providerId = watchProviders[0];

    const params = {
        with_watch_providers: watchProviders.join(','),
        sort_by: sortBy,
        language,
        skip,
        type
    };

    if (ageRange) {
        switch(ageRange) {
            case '0-5':
                if (mediaType === 'movie') {
                    params.certification_country = 'US';
                    params.certification = 'G';
                    params.without_genres = '27,18,53,80,10752,37,10749,10768,10767,10766,10764,10763,9648,99,36';
                }
                if (mediaType === 'tv') {
                    params.with_genres = '10762'; // Kids only
                }
                break;

            case '6-11':
                if (mediaType === 'movie') {
                    params.certification_country = 'US';
                    params.certification = 'G';
                    params.without_genres = '27,18,53,80,10752,37,10749,10768,10767,10766,10764,10763,9648,99,36';
                }
                if (mediaType === 'tv') {
                    params.with_genres = '10762'; // Kids only
                }
                break;

            case '12-15':
                if (mediaType === 'movie') {
                    params.certification_country = 'US';
                    params.certification = 'PG';
                }
                if (mediaType === 'tv') {
                    params.with_genres = '16'; // Animation only
                }
                break;

            case '16-17':
                if (mediaType === 'movie') {
                    params.certification_country = 'US';
                    params.certification = 'PG-13';
                }
                break;

            case '18+':
                if (mediaType === 'movie') {
                    params.include_adult = true; 
                }
                break;

            default:
                log.warn(`Unknown ageRange: ${ageRange}`);
                break;
        }
    }

    if (genre) {
        params.with_genres = genre;
    }

    const fetchForRegion = async (region) => {
        params.watch_region = region;
        return await fetchData(endpoint, params, tmdbApiKey, providerId, ageRange);
    };

    const results = await Promise.all(regions.map(region => fetchForRegion(region)));

    const combinedResults = results.reduce((acc, result) => acc.concat(result.results), []);

    const uniqueResults = Array.from(new Map(combinedResults.map(item => [item.id, item])).values());

    return {
        ...results[0],
        results: uniqueResults
    };
};

const mergeProviders = (providers) => {
    const merged = {};

    providers.forEach(provider => {
        const { provider_id, provider_name, logo_path } = provider;

        if (!merged[provider_name]) {
            merged[provider_name] = { provider_id, logo_path };
        }
    });

    return Object.entries(merged).map(([provider_name, details]) => ({
        provider_id: details.provider_id,
        provider_name,
        logo_path: details.logo_path
    }));
};

const updateProviders = async () => {
    try {
        const regions = TMDB_WATCH_REGION ? TMDB_WATCH_REGION.split(',') : [];
        const movieEndpoint = `/watch/providers/movie`;
        const tvEndpoint = `/watch/providers/tv`;

        const fetchProvidersForRegion = async (region) => {
            const params = { watch_region: region };
            const [movieData, tvData] = await Promise.all([
                fetchData(movieEndpoint, params),
                fetchData(tvEndpoint, params)
            ]);
            return [...movieData.results, ...tvData.results];
        };

        const results = await Promise.all(regions.map(region => fetchProvidersForRegion(region)));
        const combinedProviders = mergeProviders(results.flat());

        const insertOrUpdateProvider = providersDb.prepare(`
            INSERT INTO providers (provider_id, provider_name, logo_path) 
            VALUES (?, ?, ?)
            ON CONFLICT(provider_id) DO UPDATE SET
                provider_name = excluded.provider_name,
                logo_path = excluded.logo_path;
        `);

        combinedProviders.forEach(provider => {
            insertOrUpdateProvider.run(provider.provider_id, provider.provider_name, provider.logo_path);
        });

        insertOrUpdateProvider.finalize();
        log.info('Providers update completed.');
    } catch (error) {
        log.error(`Error during providers update: ${error.message}`);
    }
};

const scheduleUpdates = () => {
    log.info('Scheduling provider and genre updates every 72 hours.');
    setInterval(async () => {
        log.info('Starting provider update...');
        await updateProviders();

        log.info('Starting genre update...');
        await updateGenres();
    }, 3 * 24 * 60 * 60 * 1000);
};

const getGenres = async (type) => {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/genre/${mediaType}/list`;
    
    const data = await fetchData(endpoint);
    log.debug(`Genres retrieved for type ${type}`);
    return data.genres;
};

const updateGenres = async () => {
    try {
        const genresMap = new Map();

        const movieGenres = await getGenres('movie');
        const tvGenres = await getGenres('series');

        movieGenres.concat(tvGenres).forEach(genre => {
            if (genresMap.has(genre.name)) {
                const existingGenre = genresMap.get(genre.name);
                existingGenre.ids.push(genre.id);
            } else {
                genresMap.set(genre.name, {
                    name: genre.name,
                    ids: [genre.id],
                    mediaTypes: new Set([genre.media_type || (movieGenres.includes(genre) ? 'movie' : 'tv')])
                });
            }
        });

        const insertOrUpdateGenre = genresDb.prepare(`
            INSERT INTO genres (genre_id, genre_name, media_type)
            VALUES (?, ?, ?)
            ON CONFLICT(genre_id) DO UPDATE SET
                genre_name = excluded.genre_name,
                media_type = excluded.media_type;
        `);

        genresMap.forEach((value) => {
            const mediaTypes = Array.from(value.mediaTypes).join(',');
            value.ids.forEach(id => {
                insertOrUpdateGenre.run(id, value.name, mediaTypes);
            });
        });

        insertOrUpdateGenre.finalize();

        log.info('Genres update completed.');
    } catch (error) {
        log.error(`Error during genres update: ${error.message}`);
    }
};

(async () => {
    try {
        log.info('Initializing provider and genre updates.');
        await updateProviders();
        await updateGenres();
        scheduleUpdates();
    } catch (error) {
        log.error(`Initialization error: ${error.message}`);
    }
})();

module.exports = { makeRequest, fetchData, discoverContent, updateProviders, getGenres };
