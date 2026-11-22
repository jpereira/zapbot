/*
 * The whatsapp-web.js client and the mark of the messages sent by the bot itself.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');

const { BIN_CHROMIUM } = require('./constants');
const { printError, printSuccess } = require('./log');
const { logIsCopy } = require('./debugCopy');
const { contextDebug } = require('./debugContext');
const { maskPhones } = require('./util/phone');
const { phoneBotJid } = require('./botPhone');
const { register: registerReply } = require('./usageCollector');

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
    return client.sendMessage(phoneBotJid(), message)
        .catch(err => printError('messageToSelf failed:', err.message));
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

/*
 * The ids of the last messages the bot sent (replies, notices, status): /forward -N skips these
 * when counting the messages "above". Memory only; after a restart, what was left behind counts.
 */
const MAX_IDS_DO_BOT = 500;
const idsSentByBot = new Set();

function botRegisterSending(sent) {
    const id = sent?.id?._serialized;
    if (!id) return;
    idsSentByBot.add(id);
    if (idsSentByBot.size > MAX_IDS_DO_BOT) idsSentByBot.delete(idsSentByBot.values().next().value);
}

// true: this message was sent by the bot (reply, notice, status...)
const sentByBot = (m) => idsSentByBot.has(m?.id?._serialized);

const sendMessageOriginal = client.sendMessage.bind(client);

client.sendMessage = (chatId, content, options = {}) => {
    registerReply(content);
    // The copy is ignored by message_create, so it leaves no mark for the next message.
    if (logIsCopy(content)) return sendMessageOriginal(chatId, content, options);
    if (contextDebug().maskPhones) {
        if (typeof content === 'string') content = maskPhones(content);
        if (typeof options.caption === 'string') {
            options = { ...options, caption: maskPhones(options.caption) };
        }
    }
    markSentByBot(sendingText(content, options));
    botMarkSending(chatId);
    return sendMessageOriginal(chatId, content, options).then((sent) => {
        botRegisterSending(sent);
        return sent;
    });
};

/**
 * Swaps the text of a bot notice ("Processando…", a choice question)
 * by the conclusion, without sending another message. Without a notice, or if WhatsApp does not
 * let it edit, replies to `msg` separately. The bot's edit is yours (fromMe): the
 * 'message_edit' does not save it as edited.
 * @returns {Promise<object|null>} the message with the conclusion
 */
async function completeNotice(msg, notice, textAlt, options = {}) {
    registerReply(textAlt);
    if (contextDebug().maskPhones) textAlt = maskPhones(textAlt);
    if (notice) {
        try {
            if (await notice.edit(textAlt, options)) return notice;
        } catch (e) {
            printError(`Could not edit the notice: ${e.message}`);
        }
    }
    return msg.reply(textAlt, null, options);
}

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
    completeNotice,
    botConsumeSending,
    sentByBot,
    wasSentByBot,
    marksStartCleanup,
    cleanMarks,
    markSentByBot,
    messageToSelf
};
