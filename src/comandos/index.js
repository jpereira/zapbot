/*
 * Mapa comando -> handler. Cada 'cmd' do comandos.json precisa de um handler aqui.
 */

const { botConfig } = require('../botConfig');
const { cmdBoletos } = require('./boletos');
const { cmdBot } = require('./bot');
const { cmdCache } = require('./cache');
const { cmdCotacao } = require('./cotacao');
const { cmdCrypto } = require('./crypto');
const { cmdCve } = require('./cve');
const { cmdDebug } = require('./debug');
const { cmdEnquete } = require('./enquete');
const { cmdEveryone } = require('./everyone');
const { cmdGet } = require('./get');
const { cmdGif } = require('./gif');
const { cmdGpt } = require('./gpt');
const { cmdHelp } = require('./help');
const { cmdJoke } = require('./joke');
const { cmdKernel } = require('./kernel');
const { cmdListaGeral } = require('./listageral');
const { cmdMeme } = require('./meme');
const { cmdMonitor } = require('./monitor');
const { cmdNews } = require('./news');
const { cmdNoffa } = require('./noffa');
const { cmdPing } = require('./ping');
const { cmdSet } = require('./set');
const { cmdEdit, cmdUndo } = require('./show');
const { cmdStats } = require('./stats');
const { cmdSticker } = require('./sticker');
const { cmdTempo } = require('./tempo');
const { cmdUptime } = require('./uptime');
const { cmdWalissu } = require('./walissu');
const { cmdWatch } = require('./watch');
const { printError } = require('../log');

// cmd do comandos.json -> handler
const HANDLERS = {
    '/boletos': cmdBoletos,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/cotacao': cmdCotacao,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/edit': cmdEdit,
    '/enquete': cmdEnquete,
    '/everyone': cmdEveryone,
    '/get': cmdGet,
    '/gif': cmdGif,
    '/gpt': cmdGpt,
    '/help': cmdHelp,
    '/joke': cmdJoke,
    '/kernel': cmdKernel,
    '/listageral': cmdListaGeral,
    '/meme': cmdMeme,
    '/monitor': cmdMonitor,
    '/news': cmdNews,
    '/noffa': cmdNoffa,
    '/ping': cmdPing,
    '/set': cmdSet,
    '/show': cmdUndo,
    '/stats': cmdStats,
    '/sticker': cmdSticker,
    '/tempo': cmdTempo,
    '/uptime': cmdUptime,
    '/version': cmdUptime,
    '/walissu': cmdWalissu,
    '/watch': cmdWatch
};

// Avisa no boot se o comandos.json tiver comando sem handler (ou vice-versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no comandos.json mas não tem handler.`);
}

module.exports = {
    HANDLERS
};
