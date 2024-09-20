const log = require('../helpers/logger');
const { pool } = require('../helpers/db');
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

async function fetchProvidersFromDatabase() {
    try {
        const result = await pool.query(`SELECT * FROM providers`);
        const rows = result.rows;

        log.debug(`Fetched ${rows.length} providers from the database.`);

        if (rows.length > 0) {
            const now = new Date();
            const lastFetched = new Date(rows[0].last_fetched);

            log.debug(`Current time: ${now.toISOString()}, Last fetched: ${lastFetched.toISOString()}`);

            if (!isNaN(lastFetched.getTime())) {
                const timeDifference = now.getTime() - lastFetched.getTime();
                const twentyFourHoursInMillis = 24 * 60 * 60 * 1000;

                log.debug(`Time difference: ${timeDifference} ms (${(timeDifference / (1000 * 60)).toFixed(2)} minutes)`);

                if (timeDifference < twentyFourHoursInMillis) {
                    log.info('Providers fetched from the database (less than 24 hours old).');
                    return rows;
                } else {
                    log.info(`Providers are older than 24 hours. Time since last fetch: ${(timeDifference / (1000 * 60 * 60)).toFixed(2)} hours.`);
                }
            } else {
                log.error('Invalid date format for last_fetched.');
            }
        } else {
            log.info('No providers found in the database.');
        }

        return null;
    } catch (err) {
        log.error(`Error fetching providers from the database: ${err.message}`);
        throw err;
    }
}

async function updateProvidersInDatabase(providers) {
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
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(provider_id) DO UPDATE SET
            provider_name = EXCLUDED.provider_name,
            logo_path = EXCLUDED.logo_path,
            display_priorities = EXCLUDED.display_priorities,
            last_fetched = EXCLUDED.last_fetched;
    `;

    const currentTimestamp = new Date().toISOString();

    try {
        for (const provider of uniqueProviders) {
            await pool.query(insertOrUpdateProvider, [
                provider.provider_id, 
                provider.provider_name, 
                provider.logo_path, 
                provider.display_priorities, 
                currentTimestamp
            ]);
            log.debug(`Inserted/Updated provider: ${provider.provider_name} (ID: ${provider.provider_id})`);
        }

        log.info('Providers successfully updated in the database.');
        return uniqueProviders;
    } catch (err) {
        log.error('Error updating providers in the database:', err.message);
        throw err;
    }
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
