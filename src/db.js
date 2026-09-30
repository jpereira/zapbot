/*
 * SQLite connection, Promise versions (dbGet/dbAll/dbRun) and the database-ready signal (dbReady).
 */

const path = require('path');
const fs = require('fs-extra');
const sqlite3 = require('sqlite3').verbose();

const { CACHE_DIR } = require('./constants');
const { printError, printInfo } = require('./log');

/*
 * Database (SQLite)
 */
const dbPath = path.join(CACHE_DIR, 'bot_database.db');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return printError('Erro ao conectar ao SQLite:', err.message);
    printInfo(`Conectado com sucesso ao banco de dados SQLite: ${dbPath}`);
});

// Promise versions to use async/await
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

/*
 * dbReady: resolved when the tables were created and the settings loaded
 * (see initializeDb, called in app.js). Handlers that use the database do
 * `await dbReady` before querying.
 */
let flagReady;
const dbReady = new Promise(resolve => { flagReady = resolve; });

function markDbReady() {
    flagReady();
}

module.exports = {
    dbAll,
    dbGet,
    dbReady,
    dbRun,
    markDbReady
};
