const axios = require('axios');
const { traktDb } = require('../helpers/db');
const log = require('../helpers/logger');

async function saveUserTokens(username, accessToken, refreshToken) {
  return new Promise((resolve, reject) => {
    traktDb.run(
      `INSERT INTO trakt_tokens (username, access_token, refresh_token) 
       VALUES (?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET 
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token`,
      [username, accessToken, refreshToken],
      function (err) {
        if (err) {
          log.error(`Error saving tokens for user ${username}: ${err.message}`);
          return reject(err);
        }
        log.info(`Tokens successfully saved for user ${username}.`);
        resolve(this.lastID);
      }
    );
  });
}

async function fetchUserWatchedMovies(username, accessToken) {
  try {
    const response = await axios.get(`https://api.trakt.tv/users/${username}/watched/movies`, {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`
      }
    });
    log.info(`Successfully fetched watched movies for user ${username}.`);
    return response.data;
  } catch (error) {
    log.error(`Error fetching watched movies for user ${username}: ${error.response ? error.response.data : error.message}`);
    throw error;
  }
}

async function fetchUserWatchedShows(username, accessToken) {
  try {
    const response = await axios.get(`https://api.trakt.tv/users/${username}/watched/shows?extended=noseasons`, {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`
      }
    });
    log.info(`Successfully fetched watched shows for user ${username}.`);
    return response.data;
  } catch (error) {
    log.error(`Error fetching watched shows for user ${username}: ${error.response ? error.response.data : error.message}`);
    throw error;
  }
}

function saveUserWatchedHistory(username, history) {
  return new Promise((resolve, reject) => {
    const stmt = traktDb.prepare(`
      INSERT OR REPLACE INTO trakt_history (id, username, watched_at, type, title, imdb_id, tmdb_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    traktDb.serialize(() => {
      history.forEach(item => {
        const type = item.movie ? 'movie' : item.show ? 'show' : 'unknown';
        const traktId = item[type]?.ids?.trakt || null;
        const title = item[type]?.title || 'Unknown Title';
        const watchedAt = item.last_watched_at || null;
        const imdbId = item[type]?.ids?.imdb || null;
        const tmdbId = item[type]?.ids?.tmdb || null;

        if (traktId && title && watchedAt) {
          stmt.run(traktId, username, watchedAt, type, title, imdbId, tmdbId);
        } else {
          log.warn(`Missing data for item: ${JSON.stringify(item)}`);
        }
      });

      stmt.finalize(err => {
        if (err) {
          log.error(`Error saving watched history for user ${username}: ${err.message}`);
          return reject(err);
        }
        log.info(`Watched history successfully saved for user ${username}.`);
        resolve(true);
      });
    });
  });
}

async function updateUserWatchedHistory(username, accessToken) {
  try {
    const movieHistory = await fetchUserWatchedMovies(username, accessToken);
    const showHistory = await fetchUserWatchedShows(username, accessToken);

    await saveUserWatchedHistory(username, movieHistory);
    await saveUserWatchedHistory(username, showHistory);

    log.info(`History successfully updated for user ${username}.`);
  } catch (error) {
    log.error(`Error updating history for user ${username}: ${error.message}`);
  }
}

module.exports = {
  saveUserTokens,
  fetchUserWatchedMovies,
  fetchUserWatchedShows,
  saveUserWatchedHistory,
  updateUserWatchedHistory
};
