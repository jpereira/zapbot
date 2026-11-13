/*
 * Mapa comando -> handler. Cada 'cmd' do comandos.js precisa de um handler aqui.
 */

const { botConfig } = require('../botConfig');
const { cmdBackup } = require('./backup');
const { cmdBatch } = require('./batch');
const { cmdBlock, cmdUnblock } = require('./block');
const { cmdBills } = require('./bills');
const { cmdBot } = require('./bot');
const { cmdCache } = require('./cache');
const { cmdRates } = require('./rates');
const { cmdCron } = require('./cron');
const { cmdCrypto } = require('./crypto');
const { cmdCve } = require('./cve');
const { cmdDebug } = require('./debug');
const { cmdDefi } = require('./defi');
const { cmdDraw } = require('./draw');
const { cmdPoll } = require('./poll');
const { cmdGet } = require('./get');
const { cmdGiphy } = require('./giphy');
const { cmdGpt } = require('./gpt');
const { cmdAlias } = require('./alias');
const { cmdAscii } = require('./ascii');
const { cmdHelp } = require('./help');
const { cmdGoodbye, cmdWelcome } = require('./saudacoes');
const { cmdJoke } = require('./joke');
const { cmdKernel } = require('./kernel');
const { cmdMembers } = require('./members');
const { cmdMeme } = require('./meme');
const { cmdMonitor } = require('./monitor');
const { cmdMute, cmdUnmute } = require('./mute');
const { cmdNews } = require('./news');
const { cmdNote } = require('../notas');
const { cmdNoffa } = require('./noffa');
const { cmdPing } = require('./ping');
const { cmdPixelArt } = require('./pixelart');
const { cmdProfile } = require('./profile');
const { cmdSearch } = require('./search');
const { cmdSet } = require('./set');
const { cmdShow } = require('./show');
const { cmdStats } = require('./stats');
const { cmdSticker } = require('./sticker');
const { cmdWeather } = require('./weather');
const { cmdMe } = require('./me');
const { cmdJoin, cmdLeave } = require('./grupos');
const { cmdTldr } = require('./tldr');
const { cmdEverybody } = require('./everybody');
const { cmdTranslate } = require('./translate');
const { cmdUptime } = require('./uptime');
const { cmdWalissu } = require('./walissu');
const { cmdWatch } = require('./watch');
const { cmdWhois } = require('./whois');
const { printError } = require('../log');

// cmd do comandos.js -> handler
const HANDLERS = {
    '/alias': cmdAlias,
    '/ascii': cmdAscii,
    '/backup': cmdBackup,
    '/batch': cmdBatch,
    '/bills': cmdBills,
    '/block': cmdBlock,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/cron': cmdCron,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/defi': cmdDefi,
    '/draw': cmdDraw,
    '/everybody': cmdEverybody,
    '/get': cmdGet,
    '/giphy': cmdGiphy,
    '/goodbye': cmdGoodbye,
    '/gpt': cmdGpt,
    '/help': cmdHelp,
    '/join': cmdJoin,
    '/joke': cmdJoke,
    '/kernel': cmdKernel,
    '/leave': cmdLeave,
    '/me': cmdMe,
    '/members': cmdMembers,
    '/meme': cmdMeme,
    '/monitor': cmdMonitor,
    '/mute': cmdMute,
    '/news': cmdNews,
    '/noffa': cmdNoffa,
    '/notes': cmdNote,
    '/ping': cmdPing,
    '/pixelart': cmdPixelArt,
    '/poll': cmdPoll,
    '/profile': cmdProfile,
    '/rates': cmdRates,
    '/search': cmdSearch,
    '/set': cmdSet,
    '/show': cmdShow,
    '/stats': cmdStats,
    '/sticker': cmdSticker,
    '/tldr': cmdTldr,
    '/translate': cmdTranslate,
    '/unblock': cmdUnblock,
    '/unmute': cmdUnmute,
    '/uptime': cmdUptime,
    '/version': cmdUptime,
    '/walissu': cmdWalissu,
    '/watch': cmdWatch,
    '/weather': cmdWeather,
    '/welcome': cmdWelcome,
    '/whois': cmdWhois
};

// Avisa no boot se o comandos.js tiver comando sem handler (ou vice-versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no comandos.js mas não tem handler.`);
}

module.exports = {
    HANDLERS
};
