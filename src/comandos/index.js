/*
 * Mapa comando -> handler. Cada 'cmd' do comandos.json precisa de um handler aqui.
 */

const { botConfig } = require('../botConfig');
const { cmdBackup } = require('./backup');
const { cmdBoletos } = require('./boletos');
const { cmdBot } = require('./bot');
const { cmdCache } = require('./cache');
const { cmdCotacao } = require('./cotacao');
const { cmdCron } = require('./cron');
const { cmdCrypto } = require('./crypto');
const { cmdCve } = require('./cve');
const { cmdDebug } = require('./debug');
const { cmdDefi } = require('./defi');
const { cmdEnquete } = require('./enquete');
const { cmdGet } = require('./get');
const { cmdGiphy } = require('./giphy');
const { cmdGpt } = require('./gpt');
const { cmdHelp } = require('./help');
const { cmdJoke } = require('./joke');
const { cmdKernel } = require('./kernel');
const { cmdListaGeral } = require('./listageral');
const { cmdMeme } = require('./meme');
const { cmdMonitor } = require('./monitor');
const { cmdMute, cmdUnmute } = require('./mute');
const { cmdNews } = require('./news');
const { cmdNoffa } = require('./noffa');
const { cmdPing } = require('./ping');
const { cmdPixelArt } = require('./pixelart');
const { cmdSet } = require('./set');
const { cmdShow } = require('./show');
const { cmdStats } = require('./stats');
const { cmdSticker } = require('./sticker');
const { cmdTempo } = require('./tempo');
const { cmdTldr } = require('./tldr');
const { cmdTodos } = require('./todos');
const { cmdTraduzir } = require('./traduzir');
const { cmdUptime } = require('./uptime');
const { cmdWalissu } = require('./walissu');
const { cmdWatch } = require('./watch');
const { cmdWhois } = require('./whois');
const { printError } = require('../log');

// cmd do comandos.json -> handler
const HANDLERS = {
    '/backup': cmdBackup,
    '/boletos': cmdBoletos,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/cotacao': cmdCotacao,
    '/cron': cmdCron,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/defi': cmdDefi,
    '/enquete': cmdEnquete,
    '/get': cmdGet,
    '/giphy': cmdGiphy,
    '/gpt': cmdGpt,
    '/help': cmdHelp,
    '/joke': cmdJoke,
    '/kernel': cmdKernel,
    '/listageral': cmdListaGeral,
    '/meme': cmdMeme,
    '/monitor': cmdMonitor,
    '/mute': cmdMute,
    '/news': cmdNews,
    '/noffa': cmdNoffa,
    '/ping': cmdPing,
    '/pixelart': cmdPixelArt,
    '/set': cmdSet,
    '/show': cmdShow,
    '/stats': cmdStats,
    '/sticker': cmdSticker,
    '/tempo': cmdTempo,
    '/tldr': cmdTldr,
    '/todos': cmdTodos,
    '/traduzir': cmdTraduzir,
    '/unmute': cmdUnmute,
    '/uptime': cmdUptime,
    '/version': cmdUptime,
    '/walissu': cmdWalissu,
    '/watch': cmdWatch,
    '/whois': cmdWhois
};

// Avisa no boot se o comandos.json tiver comando sem handler (ou vice-versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no comandos.json mas não tem handler.`);
}

module.exports = {
    HANDLERS
};
