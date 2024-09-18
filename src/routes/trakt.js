const express = require('express');
const axios = require('axios');
const { traktDb } = require('../helpers/db');
const { saveUserTokens, fetchUserWatchedMovies, fetchUserWatchedShows, saveUserWatchedHistory } = require('../helpers/trakt');
const log = require('../helpers/logger');
const router = express.Router();

const { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, BASE_URL } = process.env;
const TRAKT_REDIRECT_URI = `${BASE_URL}/callback`;

if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET || !TRAKT_REDIRECT_URI) {
  log.warn('Environment variables TRAKT_CLIENT_ID orTRAKT_CLIENT_SECRET are not set.');
}

router.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    log.error('Authorization code is missing.');
    return res.status(400).send('Error: Authorization code is missing.');
  }

  try {
    const response = await axios.post('https://api.trakt.tv/oauth/token', {
      code: code,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      redirect_uri: TRAKT_REDIRECT_URI,
      grant_type: 'authorization_code',
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const { access_token, refresh_token } = response.data;

    if (!access_token || !refresh_token) {
      log.error('Received tokens are invalid or missing.');
      return res.status(500).send('Error receiving tokens.');
    }

    const userProfileResponse = await axios.get('https://api.trakt.tv/users/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
      }
    });

    const username = userProfileResponse.data.username;
    log.info(`Received username: ${username}`);

    if (!username) {
      log.error('Received username is invalid or missing.');
      return res.status(500).send('Error receiving username.');
    }

    const lastFetchedRow = await new Promise((resolve, reject) => {
      traktDb.get(`SELECT last_fetched_at FROM trakt_tokens WHERE username = ?`, [username], (err, row) => {
        if (err) {
          log.error(`Error checking last fetched time for user ${username}: ${err.message}`);
          return reject(err);
        }
        resolve(row);
      });
    });

    const lastFetchedAt = lastFetchedRow ? new Date(lastFetchedRow.last_fetched_at) : null;
    const now = new Date();

    if (lastFetchedAt && (now - lastFetchedAt) < 24 * 60 * 60 * 1000) {
      log.info(`User ${username} history was already fetched in the last 24 hours.`);
      return res.redirect(`/configure?username=${encodeURIComponent(username)}`);
    }

    await saveUserTokens(username, access_token, refresh_token);
    log.info(`Successfully saved tokens and username for user ${username}.`);

    const [movieHistory, showHistory] = await Promise.all([
      fetchUserWatchedMovies(username, access_token),
      fetchUserWatchedShows(username, access_token)
    ]);

    log.info(`Successfully fetched watched movies and shows for user ${username}.`);

    await Promise.all([
      saveUserWatchedHistory(username, movieHistory),
      saveUserWatchedHistory(username, showHistory)
    ]);

    log.info(`Successfully saved watched history for user ${username} in the database.`);

    await new Promise((resolve, reject) => {
      traktDb.run(`UPDATE trakt_tokens SET last_fetched_at = ? WHERE username = ?`, [now.toISOString(), username], (err) => {
        if (err) {
          log.error(`Error updating last fetched time for user ${username}: ${err.message}`);
          return reject(err);
        }
        resolve();
      });
    });

    res.redirect(`/configure?username=${encodeURIComponent(username)}`);
  } catch (error) {
    log.error(`Error during token exchange: ${error.response ? error.response.data : error.message}`);
    res.status(500).send('Error connecting to Trakt');
  }
});

module.exports = router;
