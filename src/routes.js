const express = require('express');
const path = require('path');
const log = require('./utils/logger');
const { requestLogger, errorHandler } = require('./utils/middleware');
const { providersDb, genresDb } = require('./db');
const { discoverContent, getGenres } = require('./tmdb');
const { getCachedPoster, setCachedPoster } = require('./cache');
const { TMDB_LANGUAGE } = process.env;
const axios = require('axios');

const router = express.Router();

router.use(requestLogger);

router.get("/:configParameters?/catalog/:type/:id/:extra?.json", async (req, res, next) => {
    const { id, configParameters, type, extra: extraParam } = req.params;
    const extra = extraParam ? decodeURIComponent(extraParam) : '';
    let ageRange = null;
    let genre = null;
    let tmdbApiKey = null;
    let rpdbApiKey = null;
    let language = TMDB_LANGUAGE;
    let skip = 0;
    let rpdbApiKeyValid = false;

    log.debug(`Received parameters: id=${id}, type=${type}, configParameters=${configParameters}, extra=${extra}`);

    if (configParameters) {
        try {
            const parsedConfig = JSON.parse(decodeURIComponent(configParameters));
            ageRange = parsedConfig.ageRange || null;
            tmdbApiKey = parsedConfig.tmdbApiKey || null;
            rpdbApiKey = parsedConfig.rpdbApiKey || null;
            language = parsedConfig.language || TMDB_LANGUAGE;
            log.debug(`Config parameters extracted: ageRange=${ageRange}, tmdbApiKey=${tmdbApiKey}, rpdbApiKey=${rpdbApiKey}, language=${language}`);
        } catch (error) {
            log.error(`Error parsing configParameters: ${error.message}`);
        }
    } else {
        log.warn('configParameters is missing');
    }

    const match = id.match(/^tmdb-discover-(movies|series)(-new)?-(\d+)$/);
    if (!match) {
        return res.status(400).json({ error: 'Invalid catalog id' });
    }
    const catalogType = match[1];
    const providerId = parseInt(match[3], 10);
    const providers = [providerId.toString()];

    if (extra.startsWith('skip=')) {
        const skipValue = parseInt(extra.split('=')[1], 10);
        skip = isNaN(skipValue) ? 0 : skipValue;
    }

    if (extra.includes('genre=')) {
        const genreName = extra.split('genre=')[1];
        log.debug(`Extracting genre: ${genreName}`);
        const genreRow = await new Promise((resolve, reject) => {
            genresDb.get("SELECT genre_id FROM genres WHERE genre_name = ? AND media_type = ?", [genreName, type === 'series' ? 'tv' : 'movie'], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
        if (genreRow) {
            genre = genreRow.genre_id;
            log.debug(`Genre ID extracted: ${genre}`);
        } else {
            log.warn(`Genre not found for name: ${genreName}`);
        }
    } else {
        log.warn('Genre parameter is missing in extra');
    }

    try {
        const sortBy = catalogType === 'movies'
            ? (id.includes('-new') ? 'primary_release_date.desc' : 'popularity.desc')
            : (id.includes('-new') ? 'first_air_date.desc' : 'popularity.desc');

        log.debug(`Calling discoverContent with parameters: type=${catalogType}, ageRange=${ageRange}, sortBy=${sortBy}, genre=${genre}, language=${language}, skip=${skip}`);

        const discoverResults = await discoverContent(catalogType, providers, ageRange, sortBy, genre, tmdbApiKey, language, skip, type);

        const validateRpdbApiKey = async (apiKey) => {
            if (!apiKey) {
                log.warn('No RPDB API Key provided.');
                return false;
            }
            try {
                log.debug(`Validating RPDB API Key: ${apiKey}`);
                const response = await axios.get(`https://api.ratingposterdb.com/${apiKey}/isValid`);
                if (response.status === 200) {
                    log.debug('RPDB API Key is valid.');
                    return true;
                } else {
                    log.warn('RPDB API Key is invalid.');
                    return false;
                }
            } catch (error) {
                log.error(`Error validating RPDB API Key: ${error.message}`);
                return false;
            }
        };

        const checkRpdbApiKeyRequests = async (apiKey) => {
            if (!apiKey) {
                log.warn('No RPDB API Key provided.');
                return false;
            }
            try {
                log.debug(`Checking RPDB API Key request count with key: ${apiKey}`);
                const response = await axios.get(`https://api.ratingposterdb.com/${apiKey}/requests`);
                if (response.status === 200) {
                    log.info(`RPDB API Key requests: ${response.data.req}, limit: ${response.data.limit}`);
                    return response.data.req < response.data.limit;
                } else {
                    log.warn('Unable to retrieve RPDB API Key request count.');
                    return false;
                }
            } catch (error) {
                log.error(`Error checking RPDB API Key request count: ${error.message}`);
                return false;
            }
        };

        rpdbApiKeyValid = await validateRpdbApiKey(rpdbApiKey);

        const getRpdbPoster = (type, id, language, rpdbkey) => {
            const tier = rpdbkey.split("-")[0];
            const lang = language.split("-")[0];
            const baseUrl = `https://api.ratingposterdb.com/${rpdbkey}/tmdb/poster-default/${type}-${id}.jpg?fallback=true`;
            return tier === "t1" || lang === "en"
                ? baseUrl
                : `${baseUrl}&lang=${lang}`;
        };

        const getPosterUrl = async (content, rpdbApiKey) => {
            const posterId = `poster:${content.id}`;
        
            const cachedPoster = await getCachedPoster(posterId);
            if (cachedPoster) {
                log.debug(`Using cached poster URL for id ${posterId}`);
                return cachedPoster.poster_url;
            }
        
            let posterUrl;
            if (rpdbApiKey) {
                const isValid = await validateRpdbApiKey(rpdbApiKey);
                if (!isValid) {
                    posterUrl = `https://image.tmdb.org/t/p/w500${content.poster_path}`;
                } else {
                    const hasRequestsRemaining = await checkRpdbApiKeyRequests(rpdbApiKey);
                    if (!hasRequestsRemaining) {
                        log.warn('RPDB API Key request limit reached.');
                        posterUrl = `https://image.tmdb.org/t/p/w500${content.poster_path}`;
                    } else {
                        const rpdbImage = getRpdbPoster(catalogType, content.id, language, rpdbApiKey);
                        try {
                            log.debug(`Fetching RPDB poster URL: ${rpdbImage}`);
                            await axios.get(rpdbImage);
                            posterUrl = rpdbImage;
                        } catch (error) {
                            log.warn('Error fetching RPDB poster, falling back to TMDB poster.');
                            posterUrl = `https://image.tmdb.org/t/p/w500${content.poster_path}`;
                        }
                    }
                }
            } else {
                posterUrl = `https://image.tmdb.org/t/p/w500${content.poster_path}`;
            }
        
            await setCachedPoster(posterId, posterUrl);
        
            return posterUrl;
        };

        const filteredResults = discoverResults.results.filter(content => content.poster_path);

        const metas = await Promise.all(filteredResults.map(async (content) => ({
            id: `tmdb:${content.id}`,
            type: catalogType === 'movies' ? 'movie' : 'series',
            name: catalogType === 'movies' ? content.title : content.name,
            poster: await getPosterUrl(content, rpdbApiKey),
            background: `https://image.tmdb.org/t/p/w1280${content.backdrop_path}`,
            description: content.overview,
            year: catalogType === 'movies' ? content.release_date?.split('-')[0] : content.first_air_date?.split('-')[0],
            imdbRating: content.vote_average ? content.vote_average.toFixed(1) : null,
        })));

        return res.json({ metas });
    } catch (error) {
        log.error(`Error processing request: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

router.get('/providers', (req, res) => {
    log.info('Route /providers: Fetching providers from the database');

    providersDb.all('SELECT provider_id AS id, provider_name AS display_name, logo_path FROM providers', [], (err, rows) => {
        if (err) {
            log.error('Error querying database:', err);
            return res.status(500).json({ error: 'Error querying database' });
        }
        
        res.json(rows);
    });
});

router.get("/", (req, res) => {
    log.info('Route /: Redirecting to /configure');
    res.redirect("/configure");
});

router.get("/:configParameters?/configure", (req, res) => {
    log.info('Route /:configParameters?/configure: Sending configure.html page');
    res.sendFile(path.join(__dirname, '../public/configure.html'));
});

const getProvider = (providerId) => {
    return new Promise((resolve, reject) => {
        providersDb.get("SELECT * FROM providers WHERE provider_id = ?", [providerId], (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                resolve(row);
            } else {
                resolve(null);
            }
        });
    });
};

const manifestTemplate = {
    id: 'community.tmdb-addon',
    version: '1.0.0',
    name: 'TMDB Collection Addon',
    description: 'Addon that provides collections from TMDB.',
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: {
        configurable: true,
        configurationRequired: false,
    },
    config: [
        {
            key: 'tmdbApiKey',
            type: 'text',
            title: 'TMDB API Key (<a href="https://www.themoviedb.org/settings/api" target="_blank">Get it here</a>)',
        },
        {
            key: 'language',
            type: 'text',
            title: 'Language (<a href="https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes" target="_blank">ISO 639-1 codes</a>)',
            required: true,
        },
        {
            key: "providers",
            type: "text",
            title: "Providers list",
            required: true,
        },
        {
            key: "ageRange",
            type: "select",
            title: "Select Age Range",
            options: [
                { value: "0-5", title: "0-5 years" },
                { value: "6-11", title: "6-11 years" },
                { value: "12-15", title: "12-15 years" },
                { value: "16-17", title: "16-17 years" },
                { value: "18+", title: "18+ years (Adults)" },
            ],
            required: true,
        }      
    ]    
};

router.get("/:configParameters?/manifest.json", async (req, res, next) => {
    const { configParameters } = req.params;
    let config = { ...req.query };

    if (configParameters) {
        try {
            const decodedConfig = JSON.parse(decodeURIComponent(configParameters));
            config = { ...config, ...decodedConfig };
        } catch (error) {
            log.error(`Failed to decode configParameters: ${error.message}`, error);
            return res.status(400).json({ error: 'Invalid config parameters' });
        }
    }

    const providers = Array.isArray(config.providers) ? config.providers : [];

    if (!providers.length) {
        log.error('No providers specified.');
        return res.status(400).json({ error: 'No providers specified' });
    }

    try {
        const providerInfo = await Promise.all(providers.map(providerId => getProvider(providerId)));

        const [movieGenres, seriesGenres] = await Promise.all([
            getGenres('movie'),
            getGenres('series')
        ]);

        const genreOptions = (genres) => genres.map(genre => genre.name);

        const isKidsMode = config.ageRange && config.ageRange !== '18+';
        
        const catalogs = providerInfo.flatMap(provider => {
            if (!provider) {
                log.warn(`Provider with ID not found`);
                return [];
            }

            const popularMovieCatalog = {
                type: 'movie',
                id: `tmdb-discover-movies-${provider.provider_id}`,
                name: `Popular Movies - ${provider.provider_name}`,
                extra: [
                    { name: 'genre', isRequired: false, options: genreOptions(movieGenres) },
                    { name: 'skip', isRequired: false },
                ]
            };

            const newMovieCatalog = {
                type: 'movie',
                id: `tmdb-discover-movies-new-${provider.provider_id}`,
                name: `New Movies - ${provider.provider_name}`,
                extra: [
                    { name: 'genre', isRequired: false, options: genreOptions(movieGenres) },
                    { name: 'skip', isRequired: false },
                ]
            };

            const popularSeriesCatalog = {
                type: 'series',
                id: `tmdb-discover-series-${provider.provider_id}`,
                name: `Popular Series - ${provider.provider_name}`,
                extra: [
                    { name: 'genre', isRequired: false, options: genreOptions(seriesGenres) },
                    { name: 'skip', isRequired: false },
                ]
            };

            const newSeriesCatalog = {
                type: 'series',
                id: `tmdb-discover-series-new-${provider.provider_id}`,
                name: `New Series - ${provider.provider_name}`,
                extra: [
                    { name: 'genre', isRequired: false, options: genreOptions(seriesGenres) },
                    { name: 'skip', isRequired: false },
                ]
            };

            if (isKidsMode) {
                popularMovieCatalog.extra.push({ name: 'ageRange', value: config.ageRange });
                newMovieCatalog.extra.push({ name: 'ageRange', value: config.ageRange });
                popularSeriesCatalog.extra.push({ name: 'ageRange', value: config.ageRange });
                newSeriesCatalog.extra.push({ name: 'ageRange', value: config.ageRange });
            } else {
                popularMovieCatalog.extra.push({ name: 'ageRange', value: '18+' });
                newMovieCatalog.extra.push({ name: 'ageRange', value: '18+' });
                popularSeriesCatalog.extra.push({ name: 'ageRange', value: '18+' });
                newSeriesCatalog.extra.push({ name: 'ageRange', value: '18+' });
            }

            return [popularMovieCatalog, newMovieCatalog, popularSeriesCatalog, newSeriesCatalog];
        });

        const manifest = {
            ...manifestTemplate,
            catalogs: catalogs
        };

        log.info('Route /manifest.json: Sending manifest');
        res.json(manifest);
    } catch (error) {
        log.error(`Error generating manifest: ${error.message}`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.use(errorHandler);

module.exports = router;
