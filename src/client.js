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

/*
 * Everything the bot sends, by chat and text, for a short time: its replies come back as 'message_create' from you, and
 * whoever waits for something typed by you (the /notes -lock password) must not take the bot's own question for the answer.
 */
const sentTexts = new Map(); // "chat|text" -> [expires at, ...]

function markText(chatId, content) {
    const text = String(content ?? '').trim();
    if (!text) return;
    const nowAlt = Date.now();
    if (sentTexts.size > 500) for (const [k, v] of sentTexts) if (v.every(t => t <= nowAlt)) sentTexts.delete(k);
    const key = `${chatId}|${text}`;
    sentTexts.set(key, [...(sentTexts.get(key) ?? []).filter(t => t > nowAlt), nowAlt + SENT_TTL_MS]);
}

// true (and consumes the mark) if the bot sent this text in this chat
function wasBotText(chatId, content) {
    const key = `${chatId}|${String(content ?? '').trim()}`;
    const valid = (sentTexts.get(key) ?? []).filter(t => t > Date.now());
    if (!valid.length) {
        sentTexts.delete(key);
        return false;
    }
    valid.shift();
    if (valid.length) sentTexts.set(key, valid);
    else sentTexts.delete(key);
    return true;
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

/*
 * What the bot sends with a decrypted note (/notes of a protected tag) must not stay anywhere: the 'message_create' of
 * that message does not save it (neither the text, nor the media it would download), and if it was saved before we knew
 * its id, it is deleted when the send resolves. Marked by chat and text (the event may come before the id) and by id.
 */
const noStoreTexts = new Map(); // "chat|text" -> [expires at, ...]
const noStoreIds = new Set();

function markNoStore(chatId, content, options = {}) {
    const key = `${chatId}|${String(sendingText(content, options) ?? '').trim() || `file:${content?.filename ?? ''}`}`;
    const nowAlt = Date.now();
    if (noStoreTexts.size > 200) for (const [k, v] of noStoreTexts) if (v.every(t => t <= nowAlt)) noStoreTexts.delete(k);
    noStoreTexts.set(key, [...(noStoreTexts.get(key) ?? []).filter(t => t > nowAlt), nowAlt + SENT_TTL_MS]);
}

/** true if the message that came back on 'message_create' is one the bot sent with a decrypted note (it must not be saved) */
function isNoStore(msg) {
    const id = msg?.id?._serialized;
    if (id && noStoreIds.has(id)) return true;
    const chatId = msg?.fromMe ? msg?.id?.remote ?? msg?.to : null;
    const text = String(msg?.body ?? '').trim() || `file:${msg?._data?.filename ?? msg?.filename ?? ''}`;
    const key = `${chatId}|${text}`;
    const valid = (noStoreTexts.get(key) ?? []).filter(t => t > Date.now());
    if (!valid.length) return false;
    valid.shift();
    if (valid.length) noStoreTexts.set(key, valid);
    else noStoreTexts.delete(key);
    return true;
}

// The send resolved: if the event was faster and the message is already in the database, it goes (with its media)
async function forgetSent(sent) {
    const id = sent?.id?._serialized;
    if (!id) return;
    noStoreIds.add(id);
    if (noStoreIds.size > 500) noStoreIds.delete(noStoreIds.values().next().value);
    try {
        const { dbGet, dbRun } = require('./db');
        const fs = require('fs-extra');
        const row = await dbGet('SELECT media_path FROM messages WHERE id = ?', [sent.id.id]);
        if (!row) return;
        await dbRun('DELETE FROM messages WHERE id = ?', [sent.id.id]);
        if (row.media_path) await fs.remove(row.media_path).catch(() => {});
    } catch (err) {
        printError('Could not forget a message with a decrypted note:', err.message);
    }
}

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
    markText(chatId, sendingText(content, options));
    botMarkSending(chatId);
    // Lazy: notesLock requires this file
    const secret = require('./notesLock').isSecretOutput() || require('./secretOutput').inSecret();
    if (secret) markNoStore(chatId, content, options);
    return sendMessageOriginal(chatId, content, options).then(async (sent) => {
        botRegisterSending(sent);
        if (secret) await forgetSent(sent);
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
    botRegisterSending,
    sentByBot,
    wasSentByBot,
    wasBotText,
    isNoStore,
    forgetSent,
    marksStartCleanup,
    cleanMarks,
    markSentByBot,
    messageToSelf
};
