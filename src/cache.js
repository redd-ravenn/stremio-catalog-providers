const { catalogDb } = require('./db');
const log = require('./utils/logger');
const { CACHE_DURATION_DAYS } = process.env;

const cacheDuration = (CACHE_DURATION_DAYS ? parseInt(CACHE_DURATION_DAYS, 10) : 3) * 24 * 60 * 60;

const getCache = (key) => {
    return new Promise((resolve, reject) => {
        catalogDb.get("SELECT value, expiration FROM cache WHERE key = ?", [key], (err, row) => {
            if (err) {
                log.error(`Error fetching cache for key ${key}:`, err);
                return reject(err);
            }
            if (row && row.expiration > Date.now()) {
                log.info(`Cache hit for key ${key}`);
                resolve(JSON.parse(row.value));
            } else {
                log.info(`Cache miss for key ${key}`);
                resolve(null);
            }
        });
    });
};

const setCache = (key, value, page = 1, skip = 0, providerId = null, type = null, sortBy = null) => {
    const expiration = Date.now() + cacheDuration * 1000;

    catalogDb.run(`
        INSERT OR REPLACE INTO cache (key, value, expiration, page, skip, provider_id, type, sortBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
        [key, JSON.stringify(value), expiration, page, skip, providerId, type, sortBy], 
        (err) => {
            if (err) {
                log.error('Error setting cache:', err);
            } else {
                log.debug(`Cache set with page: ${page}, skip: ${skip}, providerId: ${providerId}, type: ${type}, sortBy: ${sortBy}`);
            }
        }
    );
};

const cleanUpCache = () => {
    catalogDb.run("DELETE FROM cache WHERE expiration <= ?", [Date.now()], (err) => {
        if (err) {
            log.error('Failed to clean up cache:', err);
        } else {
            log.info('Cache cleanup completed successfully.');
        }
    });
};

setInterval(cleanUpCache, 24 * 60 * 60 * 1000);

module.exports = {
    getCache,
    setCache,
    cleanUpCache,
};
