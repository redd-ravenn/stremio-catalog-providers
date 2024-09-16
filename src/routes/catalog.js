const express = require('express');
const log = require('../helpers/logger');
const { parseConfigParameters, extractCatalogInfo, getGenreId, fetchDiscoverContent, buildMetas } = require('../helpers/catalog');

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

    let genre = null;
    if (extra.includes('genre=')) {
        const genreName = extra.split('genre=')[1];
        log.debug(`Extracting genre: ${genreName}`);
        genre = await getGenreId(genreName, type);
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
            parsedConfig.trailerFallback
        );

        let filteredResults = discoverResults.results;

        if (parsedConfig.filterContentWithoutPoster === 'true') {
            filteredResults = filteredResults.filter(content => content.poster_path);
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