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
        const commands = createTableSQL.split(';');
        commands.forEach(command => {
            if (command.trim()) {
                db.run(command, (err) => {
                    if (err) {
                        log.error(`Error creating ${tableName}:`, err);
                    } else {
                        log.debug(`${tableName} table created or already exists`);
                    }
                });
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

const traktDb = createDatabaseAndTable(
    path.join(dbDir, 'trakt.db'),
    'Trakt DB',
    `CREATE TABLE IF NOT EXISTS trakt_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      last_fetched_at DATETIME DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS trakt_history (
      id INTEGER PRIMARY KEY,
      username TEXT,
      watched_at TEXT,
      type TEXT,
      title TEXT,
      imdb_id TEXT,
      tmdb_id INTEGER,
      FOREIGN KEY (username) REFERENCES trakt_tokens(username) ON DELETE CASCADE
    );`
);
  
module.exports = {
    providersDb,
    catalogDb,
    genresDb,
    traktDb
};
