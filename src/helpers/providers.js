const log = require('../helpers/logger');
const { providersDb } = require('../helpers/db');
const { makeRequest } = require('../api/tmdb');

async function fetchProvidersFromTMDB(apiKey) {
    try {
        const [movieData, tvData] = await Promise.all([
            makeRequest(`https://api.themoviedb.org/3/watch/providers/movie`, apiKey),
            makeRequest(`https://api.themoviedb.org/3/watch/providers/tv`, apiKey)
        ]);

        if (!movieData || !tvData) {
            throw new Error('Failed to fetch providers from TMDB');
        }

        return [...movieData.results, ...tvData.results];
    } catch (error) {
        log.error(`Error fetching providers from TMDB: ${error.message}`);
        throw error;
    }
}

function fetchProvidersFromDatabase() {
    return new Promise((resolve, reject) => {
        providersDb.all(`SELECT * FROM providers`, (err, rows) => {
            if (err) {
                log.error(`Error fetching providers from the database: ${err.message}`);
                return reject(err);
            }

            log.debug(`Fetched ${rows ? rows.length : 0} providers from the database.`);

            if (rows && rows.length > 0) {
                const now = new Date();
                const lastFetched = new Date(rows[0].last_fetched);

                log.debug(`Current time: ${now.toISOString()}, Last fetched: ${lastFetched.toISOString()}`);

                if (!isNaN(lastFetched.getTime())) {
                    const timeDifference = now.getTime() - lastFetched.getTime();
                    const twentyFourHoursInMillis = 24 * 60 * 60 * 1000;

                    log.debug(`Time difference: ${timeDifference} ms (${(timeDifference / (1000 * 60)).toFixed(2)} minutes)`);

                    if (timeDifference < twentyFourHoursInMillis) {
                        log.info('Providers fetched from the database (less than 24 hours old).');
                        return resolve(rows);
                    } else {
                        log.info(`Providers are older than 24 hours. Time since last fetch: ${(timeDifference / (1000 * 60 * 60)).toFixed(2)} hours.`);
                    }
                } else {
                    log.error('Invalid date format for last_fetched.');
                }
            } else {
                log.info('No providers found in the database.');
            }

            resolve(null);
        });
    });
}

function updateProvidersInDatabase(providers) {
    return new Promise((resolve, reject) => {
        const mergedProviders = {};

        providers.forEach(provider => {
            const { provider_id, provider_name, logo_path, display_priorities } = provider;
            if (!mergedProviders[provider_name]) {
                mergedProviders[provider_name] = { 
                    provider_id, 
                    provider_name, 
                    logo_path, 
                    display_priorities: JSON.stringify(display_priorities)
                };
            }
        });

        const uniqueProviders = Object.values(mergedProviders);

        const insertOrUpdateProvider = `
            INSERT INTO providers (provider_id, provider_name, logo_path, display_priorities, last_fetched) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(provider_id) DO UPDATE SET
                provider_name = excluded.provider_name,
                logo_path = excluded.logo_path,
                display_priorities = excluded.display_priorities,
                last_fetched = excluded.last_fetched;
        `;

        const currentTimestamp = new Date().toISOString();
        providersDb.serialize(() => {
            const stmt = providersDb.prepare(insertOrUpdateProvider);
            uniqueProviders.forEach(provider => {
                stmt.run(
                    provider.provider_id, 
                    provider.provider_name, 
                    provider.logo_path, 
                    provider.display_priorities,
                    currentTimestamp,
                    (err) => {
                        if (err) {
                            log.error('Error updating provider in database:', err.message);
                            return reject(err);
                        }
                        log.debug(`Inserted/Updated provider: ${provider.provider_name} (ID: ${provider.provider_id})`);
                    }
                );
            });
            stmt.finalize();
        });

        log.info('Providers successfully updated in the database.');
        resolve(uniqueProviders);
    });
}

async function getProviders(apiKey) {
    const providersFromDb = await fetchProvidersFromDatabase();
    if (providersFromDb) {
        return providersFromDb;
    }

    const providersFromApi = await fetchProvidersFromTMDB(apiKey);
    const updatedProviders = await updateProvidersInDatabase(providersFromApi);
    return updatedProviders;
}

module.exports = { getProviders };
