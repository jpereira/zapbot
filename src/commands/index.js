/*
 * Command -> handler map. Each 'cmd' of bot-config.json needs a handler here.
 */

const { botConfig } = require('../botConfig');
const { cmdBills } = require('./boletos');
const { cmdBot } = require('./bot');
const { cmdCache } = require('./cache');
const { cmdQuote } = require('./cotacao');
const { cmdCrypto } = require('./crypto');
const { cmdCve } = require('./cve');
const { cmdDebug } = require('./debug');
const { cmdPoll } = require('./enquete');
const { cmdEveryone } = require('./everyone');
const { cmdGet } = require('./get');
const { cmdGif } = require('./gif');
const { cmdGpt } = require('./gpt');
const { cmdHelp } = require('./help');
const { cmdJoke } = require('./joke');
const { cmdKernel } = require('./kernel');
const { cmdListGeneral } = require('./listageral');
const { cmdMeme } = require('./meme');
const { cmdMonitor } = require('./monitor');
const { cmdNews } = require('./news');
const { cmdNoffa } = require('./noffa');
const { cmdPing } = require('./ping');
const { cmdSet } = require('./set');
const { cmdEdit, cmdUndo } = require('./show');
const { cmdStats } = require('./stats');
const { cmdSticker } = require('./sticker');
const { cmdTime } = require('./tempo');
const { cmdUalisu } = require('./ualisu');
const { cmdUptime } = require('./uptime');
const { cmdWatch } = require('./watch');
const { printError } = require('../log');

// bot-config.json cmd -> handler
const HANDLERS = {
    '/boletos': cmdBills,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/cotacao': cmdQuote,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/edit': cmdEdit,
    '/enquete': cmdPoll,
    '/everyone': cmdEveryone,
    '/get': cmdGet,
    '/gif': cmdGif,
    '/gpt': cmdGpt,
    '/help': cmdHelp,
    '/joke': cmdJoke,
    '/kernel': cmdKernel,
    '/listageral': cmdListGeneral,
    '/meme': cmdMeme,
    '/monitor': cmdMonitor,
    '/news': cmdNews,
    '/noffa': cmdNoffa,
    '/ping': cmdPing,
    '/set': cmdSet,
    '/show': cmdUndo,
    '/stats': cmdStats,
    '/sticker': cmdSticker,
    '/tempo': cmdTime,
    '/ualisu': cmdUalisu,
    '/uptime': cmdUptime,
    '/version': cmdUptime,
    '/watch': cmdWatch
};

// Warns at boot if the bot-config has a command without a handler (or vice versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no bot-config.json mas não tem handler.`);
}

module.exports = {
    HANDLERS
};
