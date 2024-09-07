const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const log = require('./utils/logger');

const dbDir = path.join(__dirname, '../db');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    log.debug('Created db directory');
}

const providersDb = new sqlite3.Database(path.join(dbDir, 'providers.db'), (err) => {
    if (err) {
        log.error('Failed to connect to providers.db:', err);
    } else {
        log.debug('Connected to providers.db successfully');
    }
});

const catalogDb = new sqlite3.Database(path.join(dbDir, 'catalog.db'), (err) => {
    if (err) {
        log.error('Failed to connect to catalog.db:', err);
    } else {
        log.debug('Connected to catalog.db successfully');
    }
});

const genresDb = new sqlite3.Database(path.join(dbDir, 'genres.db'), (err) => {
    if (err) {
        log.error('Failed to connect to genres.db:', err);
    } else {
        log.debug('Connected to genres.db successfully');
    }
});

providersDb.serialize(() => {
    providersDb.run(`CREATE TABLE IF NOT EXISTS providers (
        provider_id INTEGER PRIMARY KEY,
        provider_name TEXT,
        logo_path TEXT
    )`, (err) => {
        if (err) {
            log.error('Error creating providers table:', err);
        } else {
            log.debug('Providers table created or already exists');
        }
    });
});
catalogDb.serialize(() => {
    catalogDb.run(`CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT,
        expiration INTEGER,
        page INTEGER DEFAULT 1,
        skip INTEGER DEFAULT 0,
        provider_id INTEGER,
        type TEXT,
        sortBy TEXT
    )`, (err) => {
        if (err) {
            log.error('Error creating cache table:', err);
        } else {
            log.debug('Cache table created or already exists with type and sort_by columns');
        }
    });
});

genresDb.serialize(() => {
    genresDb.run(`CREATE TABLE IF NOT EXISTS genres (
        genre_id INTEGER PRIMARY KEY,
        genre_name TEXT,
        media_type TEXT
    )`, (err) => {
        if (err) {
            log.error('Error creating genres table:', err);
        } else {
            log.debug('Genres table created or already exists');
        }
    });
});

module.exports = {
    providersDb,
    catalogDb,
    genresDb
};
