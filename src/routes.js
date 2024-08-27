const express = require('express');
const path = require('path');
const log = require('./utils/logger');
const { requestLogger, errorHandler } = require('./utils/middleware');
const { providersDb, genresDb } = require('./db');
const { discoverContent, getGenres } = require('./tmdb');
const { TMDB_LANGUAGE } = process.env;

const router = express.Router();

router.use(requestLogger);

router.post("/update-catalog", async (req, res) => {
    const { type, catalog } = req.body;
    log.info(`Received request to update catalog for type: ${type}, catalog: ${catalog}`);

    if (!type || (type !== 'movie' && type !== 'series')) {
        return res.status(400).json({ error: 'Invalid type. Must be "movie" or "series".' });
    }

    if (!catalog || (catalog !== 'popular' && catalog !== 'new')) {
        return res.status(400).json({ error: 'Invalid catalog. Must be "popular" or "new".' });
    }

    const sortBy = catalog === 'new'
        ? (type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc')
        : 'popularity.desc';

    try {
        const providers = await new Promise((resolve, reject) => {
            providersDb.all('SELECT provider_id FROM providers', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows.map(row => row.provider_id));
            });
        });

        if (providers.length === 0) {
            return res.status(400).json({ error: 'No providers found.' });
        }

        log.info('Providers list retrieved successfully.');

        for (const provider of providers) {
            log.info(`Fetching content from provider: ${provider}`);
            const discoverResults = await discoverContent(type, [provider], 1, null, sortBy);
            log.info(`Results from provider ${provider} fetched successfully.`);

            const filteredResults = discoverResults.results.filter(content => content.poster_path);

            log.info(`Filtered results from provider ${provider} processed successfully.`);
        }

        log.info('Catalog update completed.');
        res.json({ success: true });
    } catch (error) {
        log.error(`Error updating catalog: ${error.message}`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get("/:configParameters?/catalog/:type/:id/:extra?.json", async (req, res, next) => {
    const { id, configParameters, type, extra: extraParam } = req.params;

    const extra = extraParam ? decodeURIComponent(extraParam) : '';
    let page = 1;
    let ageRange = null;
    let genre = null;
    let tmdbApiKey = null;
    let language = TMDB_LANGUAGE;

    log.debug(`Received parameters: id=${id}, type=${type}, configParameters=${configParameters}, extra=${extra}`);

    if (configParameters) {
        try {
            const parsedConfig = JSON.parse(decodeURIComponent(configParameters));
            ageRange = parsedConfig.ageRange || null;
            tmdbApiKey = parsedConfig.tmdbApiKey || null;
            language = parsedConfig.language || TMDB_LANGUAGE;
            log.debug(`Config parameters extracted: ageRange=${ageRange}, tmdbApiKey=${tmdbApiKey}, language=${language}`);
        } catch (error) {
            log.error(`Error parsing configParameters: ${error.message}`);
        }
    } else {
        log.warn('configParameters is missing');
    }

    if (extra.startsWith('skip=')) {
        const skipValue = parseInt(extra.split('=')[1], 10);
        page = Math.floor(skipValue / 20) + 1;
        log.debug(`Skip parameter found, page set to: ${page}`);
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
        const match = id.match(/^tmdb-discover-(movies|series)(-new)?-(\d+)$/);

        if (!match) {
            return res.status(400).json({ error: 'Invalid catalog id' });
        }

        const catalogType = match[1];
        const providerId = parseInt(match[3], 10);
        const providers = [providerId.toString()];

        const sortBy = catalogType === 'movies' 
            ? (id.includes('-new') ? 'primary_release_date.desc' : 'popularity.desc') 
            : (id.includes('-new') ? 'first_air_date.desc' : 'popularity.desc');

        log.debug(`Calling discoverContent with parameters: type=${catalogType}, page=${page}, ageRange=${ageRange}, sortBy=${sortBy}, genre=${genre}, language=${language}`);

        const discoverResults = await discoverContent(catalogType, providers, page, ageRange, sortBy, genre, tmdbApiKey, language);

        const filteredResults = discoverResults.results.filter(content => content.poster_path);

        const metas = filteredResults.map(content => ({
            id: `tmdb:${content.id}`,
            type: catalogType === 'movies' ? 'movie' : 'series',
            name: catalogType === 'movies' ? content.title : content.name,
            poster: `https://image.tmdb.org/t/p/w500${content.poster_path}`,
            background: `https://image.tmdb.org/t/p/w1280${content.backdrop_path}`,
            description: content.overview,
            year: catalogType === 'movies' ? content.release_date?.split('-')[0] : content.first_air_date?.split('-')[0],
            imdbRating: content.vote_average ? content.vote_average.toFixed(1) : null,
        }));

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
