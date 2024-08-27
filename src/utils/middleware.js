const log = require('./logger');

const requestLogger = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const origin = req.get('origin') || '';
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;

    log.info('--- Request received ---');
    log.debug(`Full URL: ${fullUrl}`);
    // log.debug(`Method: ${req.method}`);
    // log.debug(`Query parameters: ${JSON.stringify(req.query, null, 2)}`);
    // log.debug(`Request body: ${JSON.stringify(req.body, null, 2)}`);
    // log.debug(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    // log.debug(`User-Agent: ${userAgent}`);
    // log.debug(`Origin: ${origin}`);

    next();
};

const errorHandler = (err, req, res, next) => {
    log.error(`Error occurred: ${err.message}\nStack trace: ${err.stack}`);
    res.status(500).json({ error: 'Internal Server Error' });
};

module.exports = {
    requestLogger,
    errorHandler
};
