const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const log = require('../helpers/logger');

const dbDir = path.join(__dirname, '../../db');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    log.debug('Created db directory');
}

const createDatabaseAndTable = (dbPath, tableName, createTableSQL) => {
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            log.error(`Failed to connect to ${tableName}:`, err);
        } else {
            log.debug(`Connected to ${tableName} successfully`);
        }
    });

    db.serialize(() => {
        db.run(createTableSQL, (err) => {
            if (err) {
                log.error(`Error creating ${tableName}:`, err);
            } else {
                log.debug(`${tableName} created or already exists`);
            }
        });
    });

    return db;
};

const providersDb = createDatabaseAndTable(
    path.join(dbDir, 'providers.db'),
    'providers',
    `CREATE TABLE IF NOT EXISTS providers (
        provider_id INTEGER PRIMARY KEY,
        provider_name TEXT,
        logo_path TEXT,
        display_priorities TEXT,
        last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
);

const catalogDb = createDatabaseAndTable(
    path.join(dbDir, 'catalog.db'),
    'cache',
    `CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT,
        expiration INTEGER,
        page INTEGER DEFAULT 1,
        skip INTEGER DEFAULT 0,
        provider_id INTEGER,
        type TEXT,
        sortBy TEXT,
        ageRange TEXT
    )`
);

const genresDb = createDatabaseAndTable(
    path.join(dbDir, 'genres.db'),
    'genres',
    `CREATE TABLE IF NOT EXISTS genres (
        genre_id INTEGER,
        genre_name TEXT,
        media_type TEXT,
        language TEXT,
        PRIMARY KEY (genre_id, media_type, language),
        UNIQUE (genre_id, media_type, language)
    )`
);

module.exports = {
    providersDb,
    catalogDb,
    genresDb
};
