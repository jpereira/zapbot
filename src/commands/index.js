/*
 * Command -> handler map. Each 'cmd' of commands.js needs a handler here.
 */

const { botConfig } = require('../botConfig');
const { cmdBackup } = require('./backup');
const { cmdBatch } = require('./batch');
const { cmdBlock, cmdUnblock } = require('./block');
const { cmdBills } = require('./bills');
const { cmdBot } = require('./bot');
const { cmdCalc } = require('./calc');
const { cmdCall } = require('./call');
const { cmdCarbon } = require('./carbon');
const { cmdCache } = require('./cache');
const { cmdContacts } = require('./contacts');
const { cmdCron } = require('./cron');
const { cmdCrypto } = require('./crypto');
const { cmdCve } = require('./cve');
const { cmdDebug } = require('./debug');
const { cmdDefi } = require('./defi');
const { cmdDraw } = require('./draw');
const { cmdPoll } = require('./poll');
const { cmdForward } = require('./forward');
const { cmdGet } = require('./get');
const { cmdGiphy } = require('./giphy');
const { cmdGpt } = require('./gpt');
const { cmdGroup } = require('./group');
const { cmdDemote, cmdPromote } = require('./admins');
const { cmdAlias } = require('./alias');
const { cmdAntibadword } = require('./antibadword');
const { cmdAntilink } = require('./antilink');
const { cmdAntitag } = require('./antitag');
const { cmdAscii } = require('./ascii');
const { cmdHelp } = require('./help');
const { cmdInvite } = require('./invite');
const { cmdOcr } = require('./ocr');
const { cmdUsage } = require('./usage');
const { cmdQr } = require('./qr');
const { cmdGoodbye, cmdWelcome } = require('./greetings');
const { cmdStatus } = require('./status');
const { cmdTts } = require('./tts');
const { cmdGames } = require('./games');
const { cmdJoke } = require('./joke');
const { cmdKernel } = require('./kernel');
const { cmdMembers } = require('./members');
const { cmdMeme } = require('./meme');
const { cmdMonitor } = require('./monitor');
const { cmdMute, cmdUnmute } = require('./mute');
const { cmdNews } = require('./news');
const { cmdNote } = require('../notes');
const { cmdNoffa } = require('./noffa');
const { cmdPing } = require('./ping');
const { cmdPixelArt } = require('./pixelart');
const { cmdProfile } = require('./profile');
const { cmdSearch } = require('./search');
const { cmdSet } = require('./set');
const { cmdShow } = require('./show');
const { cmdStats } = require('./stats');
const { cmdSticker } = require('./sticker');
const { cmdStocks } = require('./stocks');
const { cmdWeather } = require('./weather');
const { cmdMe } = require('./me');
const { cmdJoin, cmdLeave } = require('./groups');
const { cmdTldr } = require('./tldr');
const { cmdEverybody } = require('./everybody');
const { cmdStt } = require('./stt');
const { cmdTranslate } = require('./translate');
const { cmdUptime } = require('./uptime');
const { cmdWalissu } = require('./walissu');
const { cmdWarn } = require('./warn');
const { cmdWatch } = require('./watch');
const { cmdWhois } = require('./whois');
const { printError } = require('../log');

// commands.js cmd -> handler
const HANDLERS = {
    '/alias': cmdAlias,
    '/antibadword': cmdAntibadword,
    '/antilink': cmdAntilink,
    '/antitag': cmdAntitag,
    '/ascii': cmdAscii,
    '/backup': cmdBackup,
    '/batch': cmdBatch,
    '/bills': cmdBills,
    '/block': cmdBlock,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/calc': cmdCalc,
    '/call': cmdCall,
    '/carbon': cmdCarbon,
    '/contacts': cmdContacts,
    '/cron': cmdCron,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/defi': cmdDefi,
    '/demote': cmdDemote,
    '/draw': cmdDraw,
    '/everybody': cmdEverybody,
    '/forward': cmdForward,
    '/games': cmdGames,
    '/get': cmdGet,
    '/giphy': cmdGiphy,
    '/goodbye': cmdGoodbye,
    '/gpt': cmdGpt,
    '/group': cmdGroup,
    '/help': cmdHelp,
    '/invite': cmdInvite,
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
    '/ocr': cmdOcr,
    '/ping': cmdPing,
    '/pixelart': cmdPixelArt,
    '/poll': cmdPoll,
    '/profile': cmdProfile,
    '/promote': cmdPromote,
    '/qr': cmdQr,
    '/search': cmdSearch,
    '/set': cmdSet,
    '/show': cmdShow,
    '/stats': cmdStats,
    '/status': cmdStatus,
    '/sticker': cmdSticker,
    '/stocks': cmdStocks,
    '/stt': cmdStt,
    '/tldr': cmdTldr,
    '/translate': cmdTranslate,
    '/tts': cmdTts,
    '/unblock': cmdUnblock,
    '/unmute': cmdUnmute,
    '/uptime': cmdUptime,
    '/usage': cmdUsage,
    '/version': cmdUptime,
    '/walissu': cmdWalissu,
    '/warn': cmdWarn,
    '/watch': cmdWatch,
    '/weather': cmdWeather,
    '/welcome': cmdWelcome,
    '/whois': cmdWhois
};

// Warns at boot if commands.js has a command without a handler (or vice versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Command '${c.cmd}' is in commands.js but has no handler.`);
}

module.exports = {
    HANDLERS
};
