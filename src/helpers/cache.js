const log = require('../helpers/logger');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { CACHE_POSTER_CONTENT_DURATION_DAYS } = process.env;
const baseUrl = process.env.BASE_URL || 'http://localhost:7000';

const defaultCacheDurationDays = 3;

const posterCacheDurationDays = parseInt(CACHE_POSTER_CONTENT_DURATION_DAYS, 10) || defaultCacheDurationDays;
const posterCacheDurationMillis = posterCacheDurationDays * 24 * 60 * 60 * 1000;

log.debug(`Cache duration for posters: ${posterCacheDurationMillis} milliseconds (${posterCacheDurationDays} days)`);

const posterDirectory = path.join(__dirname, '../../db/rpdbPosters');

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

module.exports = {
    getCachedPoster,
    setCachedPoster
};
