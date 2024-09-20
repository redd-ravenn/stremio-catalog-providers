const { createClient } = require('redis');
const log = require('./logger');

let redisUnavailable = false;
let hasLoggedError = false;

const redisClient = createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    },
    password: process.env.REDIS_PASSWORD || null,
});

redisClient.on('ready', () => {
    if (redisUnavailable) {
        redisUnavailable = false;
        hasLoggedError = false;
        log.info('Redis is ready and connected.');
    }
});

redisClient.on('end', () => {
    if (!redisUnavailable) {
        redisUnavailable = true;
        log.warn('Redis connection closed. Marking as unavailable.');
    }
});

redisClient.on('error', (err) => {
    if (!redisUnavailable) {
        redisUnavailable = true;
    }
    if (!hasLoggedError) {
        log.error(`Redis error: ${err}. Marking Redis as unavailable.`);
        hasLoggedError = true;
    }
});

redisClient.connect().catch((err) => {
    if (!hasLoggedError) {
        log.error(`Failed to connect to Redis: ${err}. Disabling Redis cache temporarily.`);
        hasLoggedError = true;
    }
    redisUnavailable = true;
});

const safeRedisCall = async (operation, ...args) => {
    if (redisUnavailable) {
        log.warn('Redis is unavailable, skipping cache operation.');
        return null;
    }

    try {
        return await redisClient[operation](...args);
    } catch (err) {
        if (!redisUnavailable) {
            redisUnavailable = true;
            log.error(`Redis operation failed: ${err}. Marking Redis as unavailable.`);
        }
        return null;
    }
};

module.exports = {
    redisClient,
    safeRedisCall
};
