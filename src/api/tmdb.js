const axios = require('axios');
const log = require('../helpers/logger');
const addToQueue = require('../helpers/bottleneck');
const { genresDb, catalogDb } = require('../helpers/db');
const { getCache, setCache } = require('../helpers/cache');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const PREFETCH_PAGE_COUNT = process.env.PREFETCH_PAGE_COUNT ? parseInt(process.env.PREFETCH_PAGE_COUNT, 10) : 5;

const makeRequest = (url, tmdbApiKey = null) => {
    if (tmdbApiKey) {
        url = `${url}${url.includes('?') ? '&' : '?'}api_key=${tmdbApiKey}`;
    }

    return new Promise((resolve, reject) => {
        addToQueue({
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

const determinePageFromSkip = async (providerId, skip, catalogDb, type, sortBy, ageRange) => {
    try {
        const cachedEntry = await new Promise((resolve, reject) => {
            catalogDb.get(
                "SELECT page, skip FROM cache WHERE provider_id = ? AND skip <= ? AND type = ? AND sortBy = ? AND ageRange = ? ORDER BY skip DESC LIMIT 1",
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
            log.debug(`Cached Entry: Page ${cachedEntry.page}, Skip ${cachedEntry.skip}`);
            
            const nextPage = Math.ceil((skip + 1) / 20);
            log.debug(`Determined Page to Serve: ${nextPage}`);
            return nextPage;
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

        log.debug(`Last Entry in Cache: ${lastEntry ? `Page ${lastEntry.page}, Skip ${lastEntry.skip}` : 'None'}`);

        if (lastEntry) {
            return lastEntry.page + 1;
        }

        log.debug('Default to Page 1');
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
        language: params.language,
        type,
    };

    if (sortBy) {
        queryParamsWithPage.sort_by = sortBy;
    }

    const queryString = new URLSearchParams(queryParamsWithPage).toString();

    const url = `${TMDB_BASE_URL}${endpoint}?${queryString}`;

    log.debug(`Request URL: ${url}`);

    const cachedData = await getCache(url, skip);
    if (cachedData) {
        return cachedData;
    }

    const data = await makeRequest(url, tmdbApiKey);

    if (data.total_pages >= page) {
        setCache(url, data, page, skip, providerId, type, sortBy, ageRange);
        log.debug(`Data stored in cache for URL: ${url} with page: ${page}, skip: ${skip}, providerId: ${providerId}, type: ${type}, sort_by: ${sortBy}, ageRange: ${ageRange}`);
    } else {
        log.debug(`Skipping cache: Page ${page} exceeds total_pages ${data.total_pages}`);
    }

    if (data.total_pages > page) {
        prefetchNextPages(endpoint, queryParamsWithPage, page, data.total_pages, tmdbApiKey, providerId, ageRange);
    }

    return data;
};

const prefetchNextPages = async (endpoint, queryParamsWithPage, currentPage, totalPages, tmdbApiKey, providerId, ageRange) => {
    const prefetchPromises = [];

    for (let i = 1; i <= PREFETCH_PAGE_COUNT; i++) {
        const nextPage = currentPage + i;

        if (nextPage > totalPages) {
            log.debug(`Stopping prefetch: nextPage (${nextPage}) exceeds totalPages (${totalPages})`);
            break;
        }

        const nextQueryParamsWithPage = { ...queryParamsWithPage, page: nextPage };
        const nextQueryString = new URLSearchParams(nextQueryParamsWithPage).toString();
        const nextUrl = `${TMDB_BASE_URL}${endpoint}?${nextQueryString}`;

        log.debug(`Preparing to prefetch URL: ${nextUrl}`);

        prefetchPromises.push(
            (async () => {
                try {
                    const nextData = await makeRequest(nextUrl, tmdbApiKey);
                    setCache(nextUrl, nextData, nextPage, (currentPage - 1) * 20 + nextPage * 20, providerId, queryParamsWithPage.type, queryParamsWithPage.sort_by, ageRange);
                    log.debug(`Prefetched and stored data for URL: ${nextUrl} with page: ${nextPage}`);
                } catch (error) {
                    log.warn(`Error prefetching URL: ${nextUrl} - ${error.message}`);
                }
            })()
        );
    }

    Promise.all(prefetchPromises).then(() => log.debug(`Finished prefetching pages after ${currentPage}`));
};

const discoverContent = async (type, watchProviders = [], ageRange = null, sortBy = 'popularity.desc', genre = null, tmdbApiKey = null, language, skip = 0, regions = [], year = null, rating = null) => { 
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
        if (region) {
            params.watch_region = region;
        } else {
            delete params.watch_region;
        }

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

const storeGenresInDb = (genres, mediaType, language) => 
    new Promise((resolve, reject) => {
        genresDb.serialize(() => {
            genresDb.run('BEGIN TRANSACTION');
            const insertGenre = genresDb.prepare(`
                INSERT INTO genres (genre_id, genre_name, media_type, language)
                VALUES (?, ?, ?, ?)
                ON CONFLICT DO NOTHING;
            `);

            genres.forEach((genre, index) => {
                insertGenre.run(genre.id, genre.name, mediaType, language, (err) => {
                    if (err) {
                        log.error(`Error inserting genre: ${err.message}`);
                        genresDb.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    if (index === genres.length - 1) {
                        insertGenre.finalize();
                        genresDb.run('COMMIT');
                        log.info(`Genres stored for ${mediaType} (${language})`);
                        resolve();
                    }
                });
            });
        });
    });

const checkGenresExistForLanguage = async (language) => 
    new Promise((resolve, reject) => {
        log.debug(`Checking genres for ${language}`);
        genresDb.get(
            `SELECT 1 FROM genres WHERE language = ? LIMIT 1`,
            [language], 
            (err, row) => err ? reject(err) : resolve(!!row)
        );
    });

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
