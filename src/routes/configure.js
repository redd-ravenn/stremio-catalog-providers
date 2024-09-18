const express = require('express');
const path = require('path');
const log = require('../helpers/logger');

const router = express.Router();

router.use(express.static(path.join(__dirname, '../../public')));

router.get("/", (req, res) => {
    log.info('Redirecting to /configure');
    res.redirect("/configure");
});

router.get("/:configParameters?/configure", (req, res) => {
    log.info(`Sending public/configure.html`);
    res.sendFile(path.join(__dirname, `../../public/configure.html`));
});

router.get('/env', (req, res) => {
    log.info('Sending environment variable TRAKT_CLIENT_ID to client');
    res.json({
        TRAKT_CLIENT_ID: process.env.TRAKT_CLIENT_ID
    });
});

module.exports = router;
