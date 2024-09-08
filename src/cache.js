const { catalogDb } = require('./db');
const log = require('./utils/logger');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { CACHE_CATALOG_CONTENT_DURATION_DAYS, CACHE_POSTER_CONTENT_DURATION_DAYS } = process.env;
const baseUrl = process.env.BASE_URL || 'http://localhost:7000';

const defaultCacheDurationDays = 3;
const cacheCatalogDurationDays = parseInt(CACHE_CATALOG_CONTENT_DURATION_DAYS, 10) || defaultCacheDurationDays;
const cacheCatalogDurationMillis = cacheCatalogDurationDays * 24 * 60 * 60 * 1000;

const posterCacheDurationDays = parseInt(CACHE_POSTER_CONTENT_DURATION_DAYS, 10) || defaultCacheDurationDays;
const posterCacheDurationMillis = posterCacheDurationDays * 24 * 60 * 60 * 1000;

log.debug(`Cache duration for catalog: ${cacheCatalogDurationMillis} milliseconds (${cacheCatalogDurationDays} days)`);
log.debug(`Cache duration for posters: ${posterCacheDurationMillis} milliseconds (${posterCacheDurationDays} days)`);

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
    const expiration = Date.now() + cacheCatalogDurationMillis;
    log.debug(`Setting cache with expiration: ${new Date(expiration).toUTCString()}`);

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

const posterDirectory = path.join(__dirname, '../db/rpdbPosters');

if (!fs.existsSync(posterDirectory)) {
    fs.mkdirSync(posterDirectory, { recursive: true });
}

const formatFileName = (posterId) => {
    return posterId.replace(/[^a-zA-Z0-9-_]/g, '_');
};

const getCachedPoster = async (posterId) => {
    const formattedPosterId = formatFileName(posterId);
    const filePath = path.join(posterDirectory, `${formattedPosterId}.jpg`);
    const fileStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

    if (fileStats && (Date.now() - fileStats.mtimeMs < posterCacheDurationMillis)) {
        const posterUrl = `${baseUrl}/poster/${formattedPosterId}.jpg`;
        log.debug(`Cache hit for poster id ${posterId}, serving from ${posterUrl}`);
        return { poster_url: posterUrl };
    } else {
        log.debug(`Cache miss or expired for poster id ${posterId}`);
        return null;
    }
};

const setCachedPoster = async (posterId, posterUrl) => {
    const formattedPosterId = formatFileName(posterId);
    const filePath = path.join(posterDirectory, `${formattedPosterId}.jpg`);

    try {
        const response = await axios.get(posterUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(filePath, response.data);
        log.debug(`Poster id ${posterId} cached at ${filePath}`);
    } catch (error) {
        log.error(`Error caching poster id ${posterId} from URL ${posterUrl}: ${error.message}`);
        throw error;
    }
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
