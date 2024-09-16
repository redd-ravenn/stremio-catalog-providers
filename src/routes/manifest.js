const express = require('express');
const log = require('../helpers/logger');
const generateManifest = require('../helpers/manifest');

const router = express.Router();

router.get("/:configParameters?/manifest.json", async (req, res) => {
    const { configParameters } = req.params;
    let config = {};

    if (configParameters) {
        try {
            config = JSON.parse(decodeURIComponent(configParameters));
        } catch (error) {
            log.error(`Failed to decode configParameters: ${error.message}`, error);
            return res.status(400).json({ error: 'Invalid config parameters' });
        }
    }

    log.debug(`Manifest request for language: ${config.language}`);

    try {
        const manifest = await generateManifest(config);
        res.json(manifest);
    } catch (error) {
        log.error(`Error generating manifest: ${error.message}`);
        res.status(500).json({ error: 'Error generating manifest' });
    }
});

module.exports = router;
