/*
 * Command -> handler map. Each 'cmd' of commands.json needs a handler here.
 */

const { botConfig } = require('../botConfig');
const { cmdBackup } = require('./backup');
const { cmdBills } = require('./boletos');
const { cmdBot } = require('./bot');
const { cmdCache } = require('./cache');
const { cmdQuote } = require('./cotacao');
const { cmdCron } = require('./cron');
const { cmdCrypto } = require('./crypto');
const { cmdCve } = require('./cve');
const { cmdDebug } = require('./debug');
const { cmdDefi } = require('./defi');
const { cmdPoll } = require('./enquete');
const { cmdGet } = require('./get');
const { cmdGiphy } = require('./giphy');
const { cmdGpt } = require('./gpt');
const { cmdHelp } = require('./help');
const { cmdJoke } = require('./joke');
const { cmdKernel } = require('./kernel');
const { cmdListGeneral } = require('./listageral');
const { cmdMeme } = require('./meme');
const { cmdMonitor } = require('./monitor');
const { cmdMuted } = require('./mudo');
const { cmdNews } = require('./news');
const { cmdNoffa } = require('./noffa');
const { cmdPing } = require('./ping');
const { cmdPixelArt } = require('./pixelart');
const { cmdSet } = require('./set');
const { cmdShow } = require('./show');
const { cmdStats } = require('./stats');
const { cmdSticker } = require('./sticker');
const { cmdTime } = require('./tempo');
const { cmdTldr } = require('./tldr');
const { cmdAll } = require('./todos');
const { cmdTranslate } = require('./traduzir');
const { cmdUptime } = require('./uptime');
const { cmdWalissu } = require('./walissu');
const { cmdWatch } = require('./watch');
const { cmdWhois } = require('./whois');
const { printError } = require('../log');

// commands.json cmd -> handler
const HANDLERS = {
    '/backup': cmdBackup,
    '/boletos': cmdBills,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/cotacao': cmdQuote,
    '/cron': cmdCron,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/defi': cmdDefi,
    '/enquete': cmdPoll,
    '/get': cmdGet,
    '/giphy': cmdGiphy,
    '/gpt': cmdGpt,
    '/help': cmdHelp,
    '/joke': cmdJoke,
    '/kernel': cmdKernel,
    '/listageral': cmdListGeneral,
    '/meme': cmdMeme,
    '/monitor': cmdMonitor,
    '/mudo': cmdMuted,
    '/news': cmdNews,
    '/noffa': cmdNoffa,
    '/ping': cmdPing,
    '/pixelart': cmdPixelArt,
    '/set': cmdSet,
    '/show': cmdShow,
    '/stats': cmdStats,
    '/sticker': cmdSticker,
    '/tempo': cmdTime,
    '/tldr': cmdTldr,
    '/todos': cmdAll,
    '/traduzir': cmdTranslate,
    '/uptime': cmdUptime,
    '/version': cmdUptime,
    '/walissu': cmdWalissu,
    '/watch': cmdWatch,
    '/whois': cmdWhois
};

// Warns at boot if commands.json has a command without a handler (or vice versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no commands.json mas não tem handler.`);
}

module.exports = {
    HANDLERS
};
