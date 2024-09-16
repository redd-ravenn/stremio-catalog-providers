const express = require('express');
const catalogRoutes = require('./catalog');
const configureRoutes = require('./configure');
const manifestRoutes = require('./manifest');
const posterRoutes = require('./poster');
const providersRoutes = require('./providers');
const log = require('../helpers/logger');

const router = express.Router();

const isBase64 = (str) => {
    try {
        return btoa(atob(str)) === str;
    } catch (err) {
        return false;
    }
};

const decodeBase64Middleware = (req, res, next) => {
    try {
        const pathParts = req.path.split('/');

        const decodedParts = pathParts.map(part => {
            if (isBase64(part)) {
                try {
                    return Buffer.from(part, 'base64').toString('utf8');
                } catch (e) {
                    return part;
                }
            } else {
                return part;
            }
        });

        req.url = decodedParts.join('/');

        next();
    } catch (error) {
        log.error('Base64 decoding error :', error);
        res.status(400).send('Bad request: Invalid base64 encoding.');
    }
};

router.use(decodeBase64Middleware);

router.use((req, res, next) => {
    log.info(`--- Request received ---`);
    log.info(`${req.method} ${req.originalUrl}`);
    next();
});

router.use(catalogRoutes);
router.use(configureRoutes);
router.use(manifestRoutes);
router.use(posterRoutes);
router.use(providersRoutes);

router.use((err, req, res, next) => {
    const errorTime = new Date().toISOString();
    log.error(`${errorTime} - Error: ${err.stack}`);

    res.status(500).send(`Something broke! If you need help, please provide this timestamp to the developer : ${errorTime}`);
});

module.exports = router;
