const { fetchUserHistory } = require('../api/trakt');
const { traktDb } = require('./db');
const log = require('./logger');

const saveUserTokens = (username, accessToken, refreshToken) => {
    return new Promise((resolve, reject) => {
        traktDb.run(
            `INSERT INTO trakt_tokens (username, access_token, refresh_token) 
            VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET access_token = ?, refresh_token = ?`,
            [username, accessToken, refreshToken, accessToken, refreshToken],
            (err) => {
                if (err) {
                    log.error(`Error saving tokens for user ${username}: ${err.message}`);
                    return reject(err);
                }
                resolve();
            }
        );
    });
};

const fetchUserTokens = (username) => {
    return new Promise((resolve, reject) => {
        traktDb.get(
            `SELECT access_token, refresh_token FROM trakt_tokens WHERE username = ?`,
            [username],
            (err, row) => {
                if (err) {
                    log.error(`Error fetching tokens for user ${username}: ${err.message}`);
                    return reject(err);
                }
                if (!row) {
                    log.warn(`No tokens found for user ${username}`);
                    return reject(new Error(`No tokens found for user ${username}`));
                }
                resolve({
                    access_token: row.access_token,
                    refresh_token: row.refresh_token,
                });
            }
        );
    });
};

const fetchUserWatchedMovies = (username, accessToken) => {
    return fetchUserHistory(username, 'movies', accessToken);
};

const fetchUserWatchedShows = (username, accessToken) => {
    return fetchUserHistory(username, 'shows', accessToken);
};

module.exports = {
    saveUserTokens,
    fetchUserWatchedMovies,
    fetchUserWatchedShows,
    fetchUserTokens
};
