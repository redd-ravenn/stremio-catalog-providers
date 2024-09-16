const express = require('express');
const catalogRoutes = require('./catalog');
const configureRoutes = require('./configure');
const manifestRoutes = require('./manifest');
const posterRoutes = require('./poster');
const providersRoutes = require('./providers');
const log = require('../helpers/logger');

const router = express.Router();

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
