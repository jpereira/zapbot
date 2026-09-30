/*
 * Conexão com o SQLite, versões com Promise (dbGet/dbAll/dbRun) e o sinal de banco pronto (dbPronto).
 */

const path = require('path');
const fs = require('fs-extra');
const sqlite3 = require('sqlite3').verbose();

const { CACHE_DIR } = require('./constantes');
const { printError, printInfo } = require('./log');

/*
 * Banco de dados (SQLite)
 */
const dbPath = path.join(CACHE_DIR, 'bot_database.db');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return printError('Erro ao conectar ao SQLite:', err.message);
    printInfo(`Conectado com sucesso ao banco de dados SQLite: ${dbPath}`);
});

// Versões com Promise para usar async/await
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

/*
 * dbPronto: resolvida quando as tabelas foram criadas e os settings carregados
 * (ver inicializarBanco, chamada no app.js). Handlers que usam o banco fazem
 * `await dbPronto` antes de consultar.
 */
let sinalizarPronto;
const dbPronto = new Promise(resolve => { sinalizarPronto = resolve; });

function marcarBancoPronto() {
    sinalizarPronto();
}

module.exports = {
    dbAll,
    dbGet,
    dbPronto,
    dbRun,
    marcarBancoPronto
};
