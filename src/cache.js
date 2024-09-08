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

const setCache = (key, value, page = 1, skip = 0, providerId = null, type = null, sortBy = null, ageRange = null) => {
    const expiration = Date.now() + cacheDuration * 1000;

    catalogDb.run(`
        INSERT OR REPLACE INTO cache (key, value, expiration, page, skip, provider_id, type, sortBy, ageRange)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [key, JSON.stringify(value), expiration, page, skip, providerId, type, sortBy, ageRange], 
        (err) => {
            if (err) {
                log.error('Error setting cache:', err);
            } else {
                log.debug(`Cache set with page: ${page}, skip: ${skip}, providerId: ${providerId}, type: ${type}, sortBy: ${sortBy}, ageRange: ${ageRange}`);
            }
        }
    );
};

const getCachedPoster = async (posterId) => {
    return new Promise((resolve, reject) => {
        catalogDb.get("SELECT * FROM rpdb_poster_cache WHERE id = ?", [posterId], (err, row) => {
            if (err) {
                log.error(`Error retrieving cached poster for id ${posterId}: ${err.message}`);
                reject(err);
            } else if (row) {
                log.debug(`Cache hit for poster id ${posterId}. Poster URL: ${row.poster_url}`);
                resolve(row);
            } else {
                log.debug(`Cache miss for poster id ${posterId}`);
                resolve(null);
            }
        });
    });
};

const setCachedPoster = async (posterId, posterUrl) => {
    return new Promise((resolve, reject) => {
        catalogDb.run(`INSERT OR REPLACE INTO rpdb_poster_cache (id, poster_url) VALUES (?, ?)`, [posterId, posterUrl], function (err) {
            if (err) {
                log.error(`Error caching poster id ${posterId}: ${err.message}`);
                reject(err);
            } else {
                log.debug(`Poster id ${posterId} cached with URL: ${posterUrl}`);
                resolve();
            }
        });
    });
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
    getCachedPoster,
    setCachedPoster
};
