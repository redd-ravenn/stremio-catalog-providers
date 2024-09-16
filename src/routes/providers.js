const express = require('express');
const log = require('../helpers/logger');
const { getProviders } = require('../helpers/providers');

const router = express.Router();

router.post('/fetch-providers', async (req, res) => {
    const { apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
    }

    try {
        const providers = await getProviders(apiKey);
        return res.json(providers);
    } catch (error) {
        log.error(`Error fetching providers: ${error.message}`);
        return res.status(500).json({ error: 'Failed to fetch providers' });
    }
});

module.exports = router;
