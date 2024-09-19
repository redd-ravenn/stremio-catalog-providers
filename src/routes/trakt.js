const express = require('express');
const { saveUserTokens, fetchUserWatchedMovies, fetchUserWatchedShows, fetchUserTokens } = require('../helpers/trakt');
const { fetchUserProfile, exchangeCodeForToken, markContentAsWatched, saveUserWatchedHistory, lookupTraktId } = require('../api/trakt');
const log = require('../helpers/logger');
const router = express.Router();

const { TRAKT_CLIENT_ID } = process.env;

if (!TRAKT_CLIENT_ID) {
  log.warn('Environment variables TRAKT_CLIENT_ID is not set.');
}

router.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    log.error('Authorization code is missing.');
    return res.status(400).send('Error: Authorization code is missing.');
  }

  try {
    const { access_token, refresh_token } = await exchangeCodeForToken(code);

    if (!access_token || !refresh_token) {
      log.error('Received tokens are invalid or missing.');
      return res.status(500).send('Error receiving tokens.');
    }

    const userProfile = await fetchUserProfile(access_token);
    const username = userProfile.username;

    if (!username) {
      log.error('Received username is invalid or missing.');
      return res.status(500).send('Error receiving username.');
    }

    const now = new Date();

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

    res.redirect(`/configure?username=${encodeURIComponent(username)}`);
  } catch (error) {
    log.error(`Error during token exchange: ${error.response ? error.response.data : error.message}`);
    res.status(500).send('Error connecting to Trakt');
  }
});

router.get('/:configParameters?/updateWatched/:username/:type/:tmdbId', async (req, res) => {
  const { username, type, tmdbId } = req.params;

  if (!username) {
      return res.status(400).send('Invalid parameter: username is required');
  }

  if (!['movies', 'series'].includes(type)) {
      return res.status(400).send(`Invalid parameter: type must be 'movies' or 'series', received '${type}'`);
  }

  if (!tmdbId) {
      return res.status(400).send('Invalid parameter: tmdbId is required');
  }

  try {
      const { access_token, refresh_token } = await fetchUserTokens(username);

      if (!access_token || !refresh_token) {
          log.error(`Tokens missing for user ${username}`);
          return res.status(500).send('Error retrieving tokens');
      }

      const traktId = await lookupTraktId(tmdbId, type.slice(0, -1), access_token);

      const watched_at = new Date().toISOString();

      const response = await markContentAsWatched(access_token, type, traktId, watched_at);

      if (!response) {
          log.error(`Failed to mark content as watched for user ${username}`);
          return res.status(500).send('Error marking content as watched');
      }

      log.info(`Content ID ${traktId} of type ${type} marked as watched for user ${username}.`);

      const traktUrl = `https://trakt.tv/users/${username}/history/${type === 'movies' ? 'movies' : 'shows'}`;
      return res.redirect(traktUrl);
  } catch (error) {
      log.error(`Error in /updateWatched: ${error.message}`);
      return res.status(500).send('Internal server error');
  }
});

module.exports = router;
