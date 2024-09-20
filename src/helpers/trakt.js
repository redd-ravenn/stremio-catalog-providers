const { fetchUserHistory } = require('../api/trakt');
const { pool } = require('./db');
const log = require('./logger');

const saveUserTokens = async (username, accessToken, refreshToken) => {
    try {
        await pool.query(
            `INSERT INTO trakt_tokens (username, access_token, refresh_token) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (username) DO UPDATE SET access_token = $2, refresh_token = $3`,
            [username, accessToken, refreshToken]
        );
        log.info(`Tokens saved for user ${username}`);
    } catch (err) {
        log.error(`Error saving tokens for user ${username}: ${err.message}`);
        throw err;
    }
};

const fetchUserTokens = async (username) => {
    try {
        const result = await pool.query(
            `SELECT access_token, refresh_token FROM trakt_tokens WHERE username = $1`,
            [username]
        );
        const row = result.rows[0];

        if (!row) {
            log.warn(`No tokens found for user ${username}`);
            throw new Error(`No tokens found for user ${username}`);
        }

        return {
            access_token: row.access_token,
            refresh_token: row.refresh_token,
        };
    } catch (err) {
        log.error(`Error fetching tokens for user ${username}: ${err.message}`);
        throw err;
    }
};

const fetchUserWatchedMovies = async (username, accessToken) => {
    return fetchUserHistory(username, 'movies', accessToken);
};

const fetchUserWatchedShows = async (username, accessToken) => {
    return fetchUserHistory(username, 'shows', accessToken);
};

module.exports = {
    saveUserTokens,
    fetchUserWatchedMovies,
    fetchUserWatchedShows,
    fetchUserTokens
};
