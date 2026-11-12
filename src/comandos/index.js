/*
 * Mapa comando -> handler. Cada 'cmd' do comandos.js precisa de um handler aqui.
 */

const { botConfig } = require('../botConfig');
const { cmdBackup } = require('./backup');
const { cmdBatch } = require('./batch');
const { cmdBlock, cmdUnblock } = require('./block');
const { cmdBoletos } = require('./boletos');
const { cmdBot } = require('./bot');
const { cmdCache } = require('./cache');
const { cmdCotacao } = require('./cotacao');
const { cmdCron } = require('./cron');
const { cmdCrypto } = require('./crypto');
const { cmdCve } = require('./cve');
const { cmdDebug } = require('./debug');
const { cmdDefi } = require('./defi');
const { cmdDesenhe } = require('./desenhe');
const { cmdEnquete } = require('./enquete');
const { cmdGet } = require('./get');
const { cmdGiphy } = require('./giphy');
const { cmdGpt } = require('./gpt');
const { cmdAlias } = require('./alias');
const { cmdAscii } = require('./ascii');
const { cmdHelp } = require('./help');
const { cmdJoke } = require('./joke');
const { cmdKernel } = require('./kernel');
const { cmdListaGeral } = require('./listageral');
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
const { cmdTempo } = require('./tempo');
const { cmdMe } = require('./me');
const { cmdJoin, cmdLeave } = require('./grupos');
const { cmdTldr } = require('./tldr');
const { cmdTodos } = require('./todos');
const { cmdTraduzir } = require('./traduzir');
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
    '/block': cmdBlock,
    '/boletos': cmdBoletos,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/cotacao': cmdCotacao,
    '/cron': cmdCron,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/defi': cmdDefi,
    '/desenhe': cmdDesenhe,
    '/enquete': cmdEnquete,
    '/get': cmdGet,
    '/giphy': cmdGiphy,
    '/gpt': cmdGpt,
    '/help': cmdHelp,
    '/join': cmdJoin,
    '/joke': cmdJoke,
    '/kernel': cmdKernel,
    '/leave': cmdLeave,
    '/listageral': cmdListaGeral,
    '/me': cmdMe,
    '/meme': cmdMeme,
    '/monitor': cmdMonitor,
    '/mute': cmdMute,
    '/news': cmdNews,
    '/noffa': cmdNoffa,
    '/notes': cmdNote,
    '/ping': cmdPing,
    '/pixelart': cmdPixelArt,
    '/profile': cmdProfile,
    '/search': cmdSearch,
    '/set': cmdSet,
    '/show': cmdShow,
    '/stats': cmdStats,
    '/sticker': cmdSticker,
    '/tempo': cmdTempo,
    '/tldr': cmdTldr,
    '/todos': cmdTodos,
    '/traduzir': cmdTraduzir,
    '/unblock': cmdUnblock,
    '/unmute': cmdUnmute,
    '/uptime': cmdUptime,
    '/version': cmdUptime,
    '/walissu': cmdWalissu,
    '/watch': cmdWatch,
    '/whois': cmdWhois
};

// Avisa no boot se o comandos.js tiver comando sem handler (ou vice-versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no comandos.js mas não tem handler.`);
}

module.exports = {
    HANDLERS
};
