const express = require('express');
const path = require('path');
const fs = require('fs');
const log = require('../helpers/logger');

const router = express.Router();

router.get('/poster/:filename', (req, res) => {
    const filePath = path.join(__dirname, '../../db/rpdbPosters', req.params.filename);
    
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            log.error(`Poster not found: ${filePath}`);
            res.status(404).send('Poster not found');
        } else {
            res.sendFile(filePath);
        }
    });
});

module.exports = router;
