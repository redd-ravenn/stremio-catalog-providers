const axios = require('axios');
const { safeRedisCall } = require('../helpers/redis');
const log = require('../helpers/logger');
const addToQueueTMDB = require('../helpers/bottleneck_tmdb');
const { pool } = require('../helpers/db');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const PREFETCH_PAGE_COUNT = process.env.PREFETCH_PAGE_COUNT ? parseInt(process.env.PREFETCH_PAGE_COUNT, 10) : 5;
const CACHE_CATALOG_CONTENT_DURATION_DAYS = process.env.CACHE_CATALOG_CONTENT_DURATION_DAYS ? parseInt(process.env.CACHE_CATALOG_CONTENT_DURATION_DAYS, 10) : 1;
const CACHE_DURATION_SECONDS = CACHE_CATALOG_CONTENT_DURATION_DAYS * 86400;

const makeRequest = (url, tmdbApiKey = null) => {
    if (tmdbApiKey) {
        url = `${url}${url.includes('?') ? '&' : '?'}api_key=${tmdbApiKey}`;
    }
    
    return new Promise((resolve, reject) => {
        addToQueueTMDB({
            fn: () => axios.get(url)
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

const determinePageFromSkip = async (providerId, skip, type, sortBy, ageRange, rating = null, genre = null, year = null, watchRegion = 'no-region', language = 'en') => {
    try {
        if (skip === 0 || skip === null || skip === '') {
            log.debug('Skip is 0 or null, returning page 1');
            return 1;
        }

        const keyPattern = `tmdb:${providerId}:${type}:${sortBy}:${ageRange}:${rating || 'no-rating'}:${genre || 'no-genre'}:${year || 'no-year'}:${watchRegion}:${language}:page:*:skip:*`;

        const keys = await safeRedisCall('keys', keyPattern);

        if (keys && keys.length > 0) {
            const filteredKeys = keys.filter(key => {
                const skipMatch = key.match(/skip:(\d+)/);
                return skipMatch && parseInt(skipMatch[1], 10) <= skip;
            });

            if (filteredKeys.length > 0) {
                filteredKeys.sort((a, b) => {
                    const skipA = parseInt(a.match(/skip:(\d+)/)[1], 10);
                    const skipB = parseInt(b.match(/skip:(\d+)/)[1], 10);
                    return skipB - skipA;
                });

                const bestMatchKey = filteredKeys[0];
                const cachedEntry = await safeRedisCall('get', bestMatchKey);

                if (cachedEntry) {
                    const parsedEntry = JSON.parse(cachedEntry);
                    log.debug(`Cached Entry: Page ${parsedEntry.page}, Skip ${parsedEntry.skip}`);
                    return parsedEntry.page + 1;
                }
            }
        }

        log.debug(`No cached entry found for skip=${skip}, returning default page`);
        return 1;

    } catch (error) {
        log.error('Error in determinePageFromSkip:', error);
        return 1;
    }
};

const fetchData = async (endpoint, params = {}, tmdbApiKey = null, providerId = null, ageRange = null, rating = null, genre = null, year = null, language = 'en') => {
    if (tmdbApiKey) {
        params.api_key = tmdbApiKey;
    }

    const { skip, type, sort_by: sortBy, watch_region: watchRegion = 'no-region' } = params;

    const page = providerId ? await determinePageFromSkip(providerId, skip, type, sortBy, ageRange, rating, genre, year, watchRegion, language) : 1;

    const { skip: _skip, type: _type, ...queryParamsWithoutSkipAndType } = params;
    const queryParamsWithPage = {
        ...queryParamsWithoutSkipAndType,
        page,
    };

    const queryString = new URLSearchParams(queryParamsWithPage).toString();
    const url = `${TMDB_BASE_URL}${endpoint}?${queryString}`;

    log.debug(`Request URL: ${url}`);

    const cacheKey = `tmdb:${providerId}:${type}:${sortBy}:${ageRange}:${rating || 'no-rating'}:${genre || 'no-genre'}:${year || 'no-year'}:${watchRegion}:${language}:page:${page}:skip:${skip}`;

    const cachedData = await safeRedisCall('get', cacheKey);

    if (cachedData) {
        log.debug(`Redis cache hit for key: ${cacheKey}`);
        return JSON.parse(cachedData);
    }

    const data = await makeRequest(url);

    if (data.total_pages >= page) {
        await safeRedisCall('setEx', cacheKey, CACHE_DURATION_SECONDS, JSON.stringify(data));
        log.debug(`Data stored in Redis cache for key: ${cacheKey}`);
    } else {
        log.debug(`Skipping cache: Page ${page} exceeds total_pages ${data.total_pages}`);
    }

    if (data.total_pages > page) {
        prefetchNextPages(endpoint, queryParamsWithPage, page, data.total_pages, providerId, ageRange, rating, genre, year, watchRegion, language);
    }

    return data;
};

const prefetchNextPages = async (endpoint, queryParamsWithPage, currentPage, totalPages, providerId, ageRange, rating = 'all', genre = 'all', year = 'all', watchRegion = 'no-region', language = 'en') => {
    const prefetchPromises = [];

    for (let i = 1; i <= PREFETCH_PAGE_COUNT; i++) {
        const nextPage = currentPage + i;
        const nextSkip = (nextPage - 1) * 20;

        const cacheKey = `tmdb:${providerId}:${queryParamsWithPage.type}:${queryParamsWithPage.sort_by}:${ageRange}:${rating}:${genre}:${year}:${watchRegion}:${language}:page:${nextPage}:skip:${nextSkip}`;

        const cachedData = await safeRedisCall('get', cacheKey);
        if (cachedData) {
            log.debug(`Prefetch skipped for URL: ${nextPage}, data already in cache`);
        } else {
            log.debug(`Preparing to prefetch page ${nextPage}`);
            prefetchPromises.push(
                (async () => {
                    try {
                        const nextQueryParamsWithPage = { ...queryParamsWithPage, page: nextPage };
                        delete nextQueryParamsWithPage.skip;
                        
                        const nextQueryString = new URLSearchParams(nextQueryParamsWithPage).toString();
                        const nextUrl = `${TMDB_BASE_URL}${endpoint}?${nextQueryString}`;

                        const nextData = await makeRequest(nextUrl);
                        await safeRedisCall('setEx', cacheKey, CACHE_DURATION_SECONDS, JSON.stringify(nextData));

                        log.debug(`Prefetched and stored data for URL: ${nextUrl} with page: ${nextPage}`);
                    } catch (error) {
                        log.warn(`Error prefetching URL: ${nextUrl} - ${error.message}`);
                    }
                })()
            );
        }

        if (nextPage > totalPages) {
            log.debug(`Stopping prefetch: nextPage (${nextPage}) exceeds totalPages (${totalPages})`);
            break;
        }
    }

    await Promise.all(prefetchPromises);
    log.debug(`Finished prefetching pages after page ${currentPage}`);
};

const discoverContent = async (type, watchProviders = [], ageRange = null, sortBy = 'popularity.desc', genre = null, tmdbApiKey = null, language = 'en', skip = 0, regions = [], year = null, rating = null) => { 
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/discover/${mediaType}`;

    regions = regions && regions.length > 0 ? regions : [];

    const providerId = watchProviders[0];

    const params = {
        with_watch_providers: watchProviders.join(','),
        sort_by: sortBy,
        language,
        skip,
        type
    };

    if (year) {
        const [startYear, endYear] = year.split('-');
        if (startYear && endYear) {
            if (mediaType === 'movie') {
                params['primary_release_date.gte'] = `${startYear}-01-01`;
                params['primary_release_date.lte'] = `${endYear}-12-31`;
            } else if (mediaType === 'tv') {
                params['first_air_date.gte'] = `${startYear}-01-01`;
                params['first_air_date.lte'] = `${endYear}-12-31`;
            }
        }
    }

    if (rating) {
        const [minRating, maxRating] = rating.split('-');
        if (minRating && maxRating) {
            params['vote_average.gte'] = minRating;
            params['vote_average.lte'] = maxRating;
        }
    }

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
        const clonedParams = { ...params };
    
        if (region) {
            clonedParams.watch_region = region;
        } else {
            delete clonedParams.watch_region;
        }
    
        return await fetchData(endpoint, clonedParams, tmdbApiKey, providerId, ageRange, rating, genre, year, language);
    };
    
    const results = await Promise.all(regions.map(region => fetchForRegion(region)));
    
    const combinedResults = results.reduce((acc, result) => acc.concat(result.results), []);
    
    const uniqueResults = Array.from(new Map(combinedResults.map(item => [item.id, item])).values());
    
    return {
        ...results[0],
        results: uniqueResults
    };
};


const fetchGenres = async (type, language, tmdbApiKey) => {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/genre/${mediaType}/list`;

    try {
        const params = {
            language,
            api_key: tmdbApiKey
        };

        const genresData = await fetchData(endpoint, params, tmdbApiKey);
        log.debug(`Genres retrieved for ${type} (${language})`);
        return genresData.genres;
    } catch (error) {
        log.error(`Error fetching genres from TMDB: ${error.message}`);
        throw error;
    }
};

const storeGenresInDb = async (genres, mediaType, language) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertGenreText = `
            INSERT INTO genres (genre_id, genre_name, media_type, language)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
        `;
        
        for (const genre of genres) {
            await client.query(insertGenreText, [genre.id, genre.name, mediaType, language]);
        }

        await client.query('COMMIT');
        log.info(`Genres stored for ${mediaType} (${language})`);
    } catch (err) {
        await client.query('ROLLBACK');
        log.error(`Error inserting genre: ${err.message}`);
        throw err;
    } finally {
        client.release();
    }
};

    const checkGenresExistForLanguage = async (language) => {
        try {
            log.debug(`Checking genres for ${language}`);
            const result = await pool.query(
                `SELECT 1 FROM genres WHERE language = $1 LIMIT 1`,
                [language]
            );
            return result.rows.length > 0;
        } catch (err) {
            log.error(`Error checking genres: ${err.message}`);
            throw err;
        }
    };

const fetchAndStoreGenres = async (language, tmdbApiKey) => {
    try {
        const movieGenres = await fetchGenres('movie', language, tmdbApiKey);
        const tvGenres = await fetchGenres('series', language, tmdbApiKey);

        await storeGenresInDb(movieGenres, 'movie', language);
        await storeGenresInDb(tvGenres, 'tv', language);

        log.info(`Genres fetched and stored for ${language}`);
    } catch (error) {
        log.error(`Error fetching/storing genres: ${error.message}`);
    }
};

module.exports = { makeRequest, fetchData, discoverContent, checkGenresExistForLanguage, fetchAndStoreGenres };
