const axios = require('axios');
const queue = require('./utils/queue');
const { providersDb, genresDb } = require('./db');
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

const fetchData = async (endpoint, params = {}, tmdbApiKey = null) => {
    if (tmdbApiKey) {
        params.api_key = tmdbApiKey;
    }

    const queryParams = new URLSearchParams({
        ...params,
        language: params.language || TMDB_LANGUAGE,
    }).toString();

    const url = `${TMDB_BASE_URL}${endpoint}?${queryParams}`;

    const cachedData = await getCache(url);
    if (cachedData) {
        return cachedData;
    }

    const data = await makeRequest(url, tmdbApiKey);

    setCache(url, data);
    log.debug(`Data stored in cache for URL: ${url}`);

    return data;
};

const discoverContent = async (type, watchProviders = [], page = 1, ageRange = null, sortBy = 'popularity.desc', genre = null, tmdbApiKey = null, language = TMDB_LANGUAGE) => {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/discover/${mediaType}`;
    
    const params = {
        watch_region: TMDB_WATCH_REGION,
        with_watch_providers: watchProviders.join(','),
        page,
        sort_by: sortBy,
        language,
    };

    if (ageRange) {
        switch(ageRange) {
            case '0-5':
                if (mediaType === 'movie') {
                    params.certification_country = 'US';
                    params.certification = 'G';
                    params.without_genres = '27,18,53,80,10752,37,10749,10768,10767,10766,10764,10763,9648,99,36';
                    // without_genres = Horror, Drama, Thriller, Crime, War, Western, Erotic, War & Politics, Talk, Soap, Reality, News, Mystery, Documentary, History
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
                    // without_genres = same as case '0-5'
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

    log.debug(`[discoverContent] Final params: ${JSON.stringify(params)}`);
    return await fetchData(endpoint, params, tmdbApiKey);
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
        const movieEndpoint = `/watch/providers/movie`;
        const tvEndpoint = `/watch/providers/tv`;

        const [movieData, tvData] = await Promise.all([
            fetchData(movieEndpoint, { watch_region: TMDB_WATCH_REGION }),
            fetchData(tvEndpoint, { watch_region: TMDB_WATCH_REGION })
        ]);

        const combinedProviders = mergeProviders([...movieData.results, ...tvData.results]);

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
