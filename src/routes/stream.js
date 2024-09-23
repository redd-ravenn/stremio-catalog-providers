const express = require('express');
const log = require('../helpers/logger');
const { parseConfigParameters } = require('../helpers/catalog');
const { prepareStreams } = require('../helpers/stream');
const { getRecommendationsFromTmdb, getSimilarContentFromTmdb, getContentFromImdbId } = require('../api/tmdb');

const router = express.Router();

router.get("/:configParameters?/stream/:type/:id.json", async (req, res, next) => {
    const { id, configParameters, type } = req.params;

    const origin = req.get('origin');
    const userAgent = req.headers['user-agent'] || '';
    log.debug(`Request Origin: ${origin}`);

    log.debug(`Received parameters: id=${id}, type=${type}, configParameters=${configParameters}`);

    const parsedConfig = await parseConfigParameters(configParameters);
    const additionalContent = parsedConfig.additionalContent || '';

    const recommendationsTitle = parsedConfig.recommendationsTitle || 'Recommendations';
    const similarTitle = parsedConfig.similarTitle || 'Similar';

    try {
        const content = await getContentFromImdbId(id, parsedConfig.tmdbApiKey, parsedConfig.language);
        if (!content) {
            log.warn(`Content not found for IMDb ID: ${id}`);
            return res.json({ streams: [] });
        }

        let recommendations = [];
        let similar = [];

        if (additionalContent === 'recommendations-similar') {
            recommendations = await getRecommendationsFromTmdb(content.tmdbId, type, parsedConfig.tmdbApiKey, parsedConfig.language);
            similar = await getSimilarContentFromTmdb(content.tmdbId, type, parsedConfig.tmdbApiKey, parsedConfig.language);
        } else if (additionalContent === 'recommendations') {
            recommendations = await getRecommendationsFromTmdb(content.tmdbId, type, parsedConfig.tmdbApiKey, parsedConfig.language);
        } else if (additionalContent === 'similar') {
            similar = await getSimilarContentFromTmdb(content.tmdbId, type, parsedConfig.tmdbApiKey, parsedConfig.language);
        }

        let streams = [];

        if (recommendations.length > 0) {
            streams.push({
                name: '📢',
                title: recommendationsTitle,
                externalUrl: 'https://web.stremio.com'
            });
            const recommendationStreams = await prepareStreams(recommendations, parsedConfig.tmdbApiKey, parsedConfig.language, true, true, userAgent, type);
            streams = streams.concat(recommendationStreams);
        }

        if (similar.length > 0) {
            streams.push({
                name: '🔍',
                title: similarTitle,
                externalUrl: 'https://web.stremio.com'
            });
            const similarStreams = await prepareStreams(similar, parsedConfig.tmdbApiKey, parsedConfig.language, true, true, userAgent, type);
            streams = streams.concat(similarStreams);
        }

        res.json({ streams });
    } catch (error) {
        log.error(`Error processing request: ${error.message}`, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

module.exports = router;
