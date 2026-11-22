/*
 * The bot loaded on top of the simulated environment, with shortcuts for the tests:
 * send messages (which go through the real 'message_create'), delete,
 * edit, create groups/contacts and read what the bot sent.
 */
const environment = require('./environment');

const fs = require('fs');
const path = require('path');

const src = (module) => require(path.join(environment.ROOT, 'src', module));

src('debugInstrumentation').installDebug();

const { client, cleanMarks } = src('client');
src('events/deleted');
src('events/edited');
src('events/reactions');
src('events/messages');
src('polls');
src('greetings');

const { dbAll, dbGet, dbRun, markDbReady } = src('db');
const { initializeDb } = src('initialization');
const { loadSettings, getSetting, setSetting } = src('settings');
const { state: stateAlt } = src('state');

const { OWNER, emails, logs, processes, network } = environment;

const GROUP = '120363000000000001@g.us';
const OTHERAlt = { jid: '5521911111111@c.us', user: '5521911111111', name: 'Fulano' };

let db = null;
const prepare = () => (db ??= initializeDb().then(markDbReady));

const TABLES = ['command_aliases', 'messages', 'message_edits', 'stats', 'watch_hits', 'watch_destinations', 'price_alerts',
    'settings', 'polls', 'poll_votes', 'schedules', 'defi_positions', 'mutes', 'mute_hits',
    'alerts', 'watch_sources', 'watch_masks', 'reactions', 'reaction_changes', 'monitor_contacts', 'monitor_history', 'group_greetings', 'forward_lists', 'warns', 'antilink', 'group_reopen', 'group_rules'];

/*
 * Clean state for each test: empty tables, settings at default, no
 * sent, with no network routes. bot.users comes true (the default is false: only the
 * owner) so the tests can use other people's commands, and the protection
 * against flood comes off (the tests repeat commands in sequence); whoever
 * tests the restriction or the flood changes again.
 */
async function restart() {
    await prepare();
    await src('debugContext').withContextDebug({ noTrace: true }, () =>
        setSetting('debug.enabled', false));
    src('debugCopy').cleanCopiesDebug();

    for (const t of TABLES) await dbRun(`DELETE FROM ${t}`);
    await loadSettings();
    await setSetting('bot.users', ['all']);
    await setSetting('bot.denied.enabled', false); // the default is on; the tests that count replies expect silence
    await setSetting('zapbot.lang', 'pt_BR'); // the test assertions are in Portuguese; en_US has separate tests
    await setSetting('flood.maxCommandRepeated', 0);

    // The /get downloads cache does not leak from one test to the next
    const tmp = src('constants').TMP_DIR;
    for (const fileAlt of fs.existsSync(tmp) ? fs.readdirSync(tmp) : []) fs.rmSync(path.join(tmp, fileAlt), { recursive: true, force: true });

    client.sent.length = 0;
    client.reacted.length = 0;
    client.refuseEdit = false;
    client.searches.length = 0;
    client.searchResults = [];
    cleanMarks();
    client.contacts.clear();
    client.chats.clear();
    client.lids.clear();
    network.clear();
    emails.length = 0;
    logs.length = 0;
    Object.assign(processes, { calls: [], fail: null, failSnippet: false, duration: 100, siteWithoutDuration: false, skipDownload: false, outputSize: 1024, speech: 'olá mundo, isto é um teste', errorOutput: null, post: null });
    stateAlt.ready = true;
    // One test's reconnection does not leak into the next
    Object.assign(stateAlt, { attempts: 0, outSince: null, waitingQr: false });
    stateAlt.restarting = false;
    src('connection').stopReconnection();
    src('email').cleanAlertsSent();
    src('flood').cleanFlood();

    createContact(OTHERAlt.jid, OTHERAlt.name);
    createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid]);
}

// A contact saved in your address book (isMyContact), with its name; block()/unblock() change isBlocked
function createContact(jid, nameAlt) {
    const [user] = jid.split('@');
    const contactAlt = {
        id: { _serialized: jid, user }, number: user, name: nameAlt, pushname: nameAlt, isMyContact: true, isGroup: false,
        isBlocked: false,
        async block() { this.isBlocked = true; return true; },
        async unblock() { this.isBlocked = false; return true; }
    };
    client.contacts.set(jid, contactAlt);
    return contactAlt;
}

/**
 * @param {string} id
 * @param {string} name
 * @param {Array<string|{jid:string, isAdmin?:boolean, isSuperAdmin?:boolean}>} members
 */
function createGroup(id, nameAlt, members = []) {
    const chat = {
        id: { _serialized: id, user: id.split('@')[0] },
        isGroup: true,
        name: nameAlt,
        groupMetadata: { subject: nameAlt },
        participants: members.map((m) => {
            const { jid, isAdmin = false, isSuperAdmin = false } = typeof m === 'string' ? { jid: m } : m;
            return { id: { _serialized: jid, user: jid.split('@')[0] }, isAdmin, isSuperAdmin };
        }),
        typing: 0,
        read: 0,
        async sendStateTyping() { this.typing++; },
        async sendSeen() { this.read++; },
        async leave() { client.chats.delete(id); }
    };
    client.chats.set(id, chat);
    return chat;
}

let sequence = 0;

/**
 * Message in whatsapp-web.js format (only what the bot uses).
 * @param {object} o
 * @param {string} [o.text]
 * @param {string} [o.chat]      chat where the message is (default: the Família group)
 * @param {string} [o.de]        who sent it (default: the owner)
 * @param {object} [o.quoted]    message respondida (outra criarMensagem)
 * @param {object} [o.media]     { mimetype, data } returned by downloadMedia()
 */
function createMessage({ text: textAlt = '', chat = GROUP, de = OWNER.jid, id, type = 'chat', quoted = null,
    media: mediaAlt = null, links, mentions = [], timestamp, extras = {} } = {}) {
    const fromMe = de === OWNER.jid;
    const group = chat.endsWith('@g.us');
    const broadcast = chat.endsWith('@broadcast');
    const channel = chat.endsWith('@newsletter');
    const idMsg = id ?? `MSG${++sequence}`;

    const msg = {
        id: { id: idMsg, remote: chat, fromMe, _serialized: `${fromMe}_${chat}_${idMsg}` },
        from: group || broadcast || channel ? chat : (fromMe ? OWNER.jid : de),
        to: group ? chat : (fromMe ? chat : OWNER.jid),
        author: group || broadcast ? de : undefined,
        isStatus: chat === 'status@broadcast',
        fromMe,
        body: textAlt,
        type: type,
        timestamp: timestamp ?? Math.floor(Date.now() / 1000),
        hasMedia: Boolean(mediaAlt),
        hasQuotedMsg: Boolean(quoted),
        links: links ?? [...String(textAlt).matchAll(/https?:\/\/\S+/g)].map(([link]) => ({ link })),
        mentionedIds: mentions,
        _data: { notifyName: client.contacts.get(de)?.pushname },

        async reply(content, chatId, options = {}) {
            return client.sendMessage(chatId || chat, content, { ...options, quotedMessageId: this.id._serialized });
        },
        async getChat() {
            return client.chats.get(chat) ?? { id: { _serialized: chat }, isGroup: false, name: chat, async sendStateTyping() {} };
        },
        async getContact() {
            return client.contacts.get(de) ?? { id: { _serialized: de }, number: de.split('@')[0] };
        },
        async getQuotedMessage() { return quoted; },
        async delete(paraAll) { this.deletedFor = paraAll ? 'todos' : 'mim'; },
        async react(emoji) { client.reacted.push({ id: this.id._serialized, emoji }); },
        async downloadMedia() { return mediaAlt; },
        ...extras
    };

    return msg;
}

// Errors logged by the bot (printError) since the log's `since` index
const errorsInLog = (since = 0) => logs.slice(since).filter(l => / \[\*\] /.test(l));

/**
 * Delivers a message to the bot ('message_create' event) and waits for it to finish.
 * Fails if the bot logs an error, unless `errorExpected` is true.
 * @returns {Promise<Array<{chatId, content, options, text}>>} what the bot sent
 */
async function deliver(msg, { expectedError: errorExpected = false } = {}) {
    const sentBefore = client.sent.length;
    const logBefore = logs.length;

    for (const handler of client.listeners('message_create')) await handler(msg);

    const errors = errorsInLog(logBefore);
    if (errors.length && !errorExpected) {
        throw new Error(`o bot registrou erro(s) inesperado(s):\n${errors.join('\n')}`);
    }

    return client.sent.slice(sentBefore).map(withText);
}

// Send with the text at hand (the id, outside the deepEqual, comes along)
function withText(e) {
    return Object.defineProperty({ ...e, text: text(e.content, e.options) }, 'id', { value: e.id });
}

// Text of a send (string, media caption, poll name...)
function text(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.pollName ?? '';
}

/**
 * Shortcut: the owner (or `de`) types `line` in `chat`.
 * @returns what the bot sent
 */
function run(line, optionsAlt = {}) {
    const { expectedError: errorExpected, ...rest } = optionsAlt;
    return deliver(createMessage({ text: line, ...rest }), { expectedError: errorExpected });
}

// Only the texts (the most common in asserts)
async function replyAlt(line, optionsAlt) {
    return (await run(line, optionsAlt)).map(e => e.text);
}

/**
 * Command that lists options to choose from (several contacts or groups with the
 * name): waits for the list to go out, replies `escolha` in the same chat and waits for the
 * command terminar.
 * @returns the texts of everything the bot sent, from the list onward
 */
async function replyChoosing(line, choice, optionsAlt = {}) {
    const beforeAlt = client.sent.length;
    const commandAlt = run(line, optionsAlt);
    const listed = () => client.sent.slice(beforeAlt).some(e => text(e.content).startsWith('🔎 '));

    for (let i = 0; i < 200 && !listed(); i++) await new Promise(setImmediate);
    if (!listed()) throw new Error(`${line}: o bot não listou opções para escolher`);

    for (const n of [].concat(choice)) await run(String(n), { chat: optionsAlt.chat });
    return (await commandAlt).map(e => e.text);
}

/*
 * Delete and edit events, in whatsapp-web.js format
 */
async function removeAlt(original, { byMe: byMim = original.fromMe } = {}) {
    const after = {
        fromMe: byMim,
        id: { id: `REVOKE_${original.id.id}` },
        _data: { protocolMessageKey: { id: original.id.id } },
        getChat: original.getChat
    };

    const beforeAlt = client.sent.length;
    for (const h of client.listeners('message_revoke_everyone')) await h(after, original);
    return client.sent.slice(beforeAlt).map(withText);
}

async function edit(original, newText, { old: oldAlt2 = original.body, editedAt: editedIn = Date.now(), really = true } = {}) {
    const msg = {
        ...original,
        latestEditSenderTimestampMs: really ? editedIn : undefined,
        latestEditMsgKey: really ? { id: `EDIT_${original.id.id}` } : undefined,
        body: newText
    };

    const beforeAlt = client.sent.length;
    for (const h of client.listeners('message_edit')) await h(msg, newText, oldAlt2);
    return client.sent.slice(beforeAlt).map(withText);
}

/**
 * whatsapp-web.js 'vote_update' event: `voter` chose `options` (list
 * empty = withdrew the vote) in the `enquete` poll (the /poll send or a
 * message with pollName/pollOptions/id).
 */
async function voteAlt(pollAlt, voter, optionsAlt, { when = Date.now() } = {}) {
    const poll = pollAlt.content ?? pollAlt;
    const vote = {
        voter,
        selectedOptions: optionsAlt.map(name => ({ name, localId: poll.pollOptions.findIndex(o => o.name === name) })),
        interractedAtTs: when,
        parentMessage: {
            id: pollAlt.id,
            pollName: poll.pollName,
            pollOptions: poll.pollOptions,
            allowMultipleAnswers: poll.options?.allowMultipleAnswers ?? poll.allowMultipleAnswers ?? false,
            timestamp: Math.floor(when / 1000)
        }
    };

    for (const h of client.listeners('vote_update')) await h(vote);
}

/**
 * whatsapp-web.js 'message_reaction' event: `de` reacted with `emoji` (empty =
 * removed the reaction) to the `original` message (a createMessage or a bot send).
 * @returns what the bot sent
 */
async function react(original, de, emoji, { when = Date.now(), byMe: byMim = de === OWNER.jid } = {}) {
    const keyAlt = original.id;
    const reaction = {
        id: { fromMe: byMim, remote: keyAlt.remote, id: `REACAO_${keyAlt.id}_${de}` },
        msgId: { fromMe: keyAlt.fromMe, remote: keyAlt.remote, id: keyAlt.id, _serialized: keyAlt._serialized },
        senderId: de,
        reaction: emoji,
        timestamp: when / 1000
    };

    const beforeAlt = client.sent.length;
    for (const h of client.listeners('message_reaction')) await h(reaction);
    return client.sent.slice(beforeAlt).map(withText);
}

/*
 * With the simulated clock, advances time little by little until the promise ends:
 * does not depend on how many async steps exist before each setTimeout.
 */
async function waitWithClock(t, promise, stepMs = 1000, maxSteps = 60) {
    let ended = false;
    promise.then(() => { ended = true; }, () => { ended = true; });

    for (let i = 0; i < maxSteps && !ended; i++) {
        for (let j = 0; j < 10; j++) await new Promise(setImmediate);
        if (!ended) t.mock.timers.tick(stepMs);
    }
    return promise;
}

module.exports = {
    ...environment,
    GROUP,
    OTHERAlt,
    erase: removeAlt,
    client,
    createContact,
    createGroup,
    createMessage,
    dbAll,
    dbGet,
    dbRun,
    edit,
    deliver,
    waitWithClock,
    errorsInLog,
    state: stateAlt,
    execute: run,
    getSetting,
    prepare,
    react,
    restart,
    replyAlt,
    replyChoosing,
    setSetting,
    src,
    text,
    voteAlt
};
