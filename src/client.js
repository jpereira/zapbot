/*
 * The whatsapp-web.js client and the mark of the messages sent by the bot itself.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');

const { BIN_CHROMIUM } = require('./constants');
const { printError, printSuccess } = require('./log');

const client = new Client({
    authStrategy: new LocalAuth(),

    webVersion: '2.3000.1023151854-alpha',

    /*
     * Without a remote cache: a third-party repo's HTML (main branch) would run on the
     * origin web.whatsapp.com, with access to the session. WhatsApp Web is loaded
     * straight from the official site.
     */
    webVersionCache: { type: 'none' },

    puppeteer: {
        headless: true,
        // On Windows, remove executablePath and args.
        executablePath: BIN_CHROMIUM,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

printSuccess('Client created');

// Message to your own number (PHONE_NUMBER): bot notices
function messageToSelf(message) {
    return client.sendMessage(process.env.PHONE_NUMBER, message)
        .catch(err => printError('messageToSelf falhou:', err.message));
}

/*
 * Messages sent by the bot itself also fire 'message_create' with
 * fromMe=true. Without this mark, a reply starting with "/" (e.g.: the
 * /noffa echoing "/cache -a") would run as an owner command.
 *
 * msg.reply() also goes through client.sendMessage(). The text is registered
 * BEFORE the send because the event may arrive before sendMessage resolves.
 */
const SENT_TTL_MS = 60 * 1000;
const sentByBotAlt = new Map(); // text -> [expires at, ...]

function sendingText(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.description ?? null;
}

function markSentByBot(textAlt) {
    textAlt = String(textAlt ?? '').trim();
    if (!textAlt.startsWith('/')) return; // only what could become a command

    const nowAlt = Date.now();
    const validAlt = (sentByBotAlt.get(textAlt) ?? []).filter(t => t > nowAlt);
    sentByBotAlt.set(textAlt, [...validAlt, nowAlt + SENT_TTL_MS]);
}

// Consumes the mark: true if this message was sent by the bot
function wasSentByBot(textAlt) {
    textAlt = String(textAlt ?? '').trim();

    const nowAlt = Date.now();
    const validAlt = (sentByBotAlt.get(textAlt) ?? []).filter(t => t > nowAlt);
    if (!validAlt.length) {
        sentByBotAlt.delete(textAlt);
        return false;
    }

    validAlt.shift();
    if (validAlt.length) sentByBotAlt.set(textAlt, validAlt);
    else sentByBotAlt.delete(textAlt);
    return true;
}

/*
 * /stats: the bot replies leave through your account and come back on 'message_create'
 * as yours. Each send leaves a mark in the chat; your next message there
 * consumes the mark and is not counted.
 */
const botPerChatSendings = new Map(); // chatId -> [expires at, ...]

function botMarkSending(chatId) {
    const nowAlt = Date.now();
    const validAlt = (botPerChatSendings.get(chatId) ?? []).filter(t => t > nowAlt);
    botPerChatSendings.set(chatId, [...validAlt, nowAlt + SENT_TTL_MS]);
}

function botConsumeSending(chatId) {
    const nowAlt = Date.now();
    const validAlt = (botPerChatSendings.get(chatId) ?? []).filter(t => t > nowAlt);
    const found = validAlt.length > 0;

    validAlt.shift();
    if (validAlt.length) botPerChatSendings.set(chatId, validAlt);
    else botPerChatSendings.delete(chatId);
    return found;
}

const sendMessageOriginal = client.sendMessage.bind(client);

client.sendMessage = (chatId, content, options = {}) => {
    markSentByBot(sendingText(content, options));
    botMarkSending(chatId);
    return sendMessageOriginal(chatId, content, options);
};

// Marks that never became 'message_create' (send failed) expire here
function cleanMarksExpired() {
    const nowAlt = Date.now();
    for (const [textAlt, expirations] of sentByBotAlt) {
        if (!expirations.some(t => t > nowAlt)) sentByBotAlt.delete(textAlt);
    }
    for (const [chatId, expirations] of botPerChatSendings) {
        if (!expirations.some(t => t > nowAlt)) botPerChatSendings.delete(chatId);
    }
}

// Forgets all the marks (the tests start each case with no pending sends)
function cleanMarks() {
    sentByBotAlt.clear();
    botPerChatSendings.clear();
}

// Called in app.js
function marksStartCleanup() {
    setInterval(cleanMarksExpired, SENT_TTL_MS);
}

module.exports = {
    client,
    botConsumeSending,
    wasSentByBot,
    marksStartCleanup,
    cleanMarks,
    markSentByBot,
    messageToSelf
};
