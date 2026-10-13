/*
 * The bot loaded on top of the simulated environment, with shortcuts for the tests:
 * send messages (which go through the real 'message_create'), delete,
 * edit, create groups/contacts and read what the bot sent.
 */
const environment = require('./environment');

const path = require('path');

const src = (modulo) => require(path.join(environment.ROOT, 'src', modulo));

src('debugInstrumentation').installDebug();

const { client, cleanMarks } = src('client');
src('events/presence');
src('events/deleted');
src('events/edited');
src('events/messages');
src('polls');

const { dbAll, dbGet, dbRun, markDbReady } = src('db');
const { initializeDb } = src('initialization');
const { loadSettings, getSetting, setSetting } = src('settings');
const { estado: stateAlt } = src('state');

const { OWNER, emails, logs, processes, network } = environment;

const GROUP = '120363000000000001@g.us';
const OTHERAlt = { jid: '5521911111111@c.us', user: '5521911111111', nome: 'Fulano' };

let db = null;
const prepare = () => (db ??= initializeDb().then(markDbReady));

const TABLES = ['command_aliases', 'messages', 'message_edits', 'stats', 'watch_hits', 'watch_destinations', 'price_alerts',
    'presence_logs', 'monitored_numbers', 'settings', 'polls', 'poll_votes', 'schedules', 'defi_positions', 'mutes', 'mute_hits',
    'alerts', 'watch_sources'];

/*
 * Clean state for each test: empty tables, settings at default, no
 * sent, with no network routes. bot.users comes true (the default is false: only the
 * owner) so the tests can use other people's commands, and the protection
 * against flood comes off (the tests repeat commands in sequence); whoever
 * tests the restriction or the flood changes again.
 */
async function restart() {
    await prepare();
    await src('debugContext').withContextDebug({ semRastro: true }, () =>
        setSetting('debug.enabled', false));
    src('debugCopy').cleanCopiesDebug();

    for (const t of TABLES) await dbRun(`DELETE FROM ${t}`);
    await loadSettings();
    await setSetting('bot.users', ['all']);
    await setSetting('flood.maxCommandRepeated', 0);

    client.enviadas.length = 0;
    client.recusarEdicao = false;
    cleanMarks();
    client.contatos.clear();
    client.chats.clear();
    client.lids.clear();
    network.limpar();
    emails.length = 0;
    logs.length = 0;
    Object.assign(processes, { chamadas: [], falhar: null, naoBaixar: false, tamanhoSaida: 1024 });
    stateAlt.pronto = true;
    // One test's reconnection does not leak into the next
    Object.assign(stateAlt, { tentativas: 0, foraDesde: null, aguardandoQr: false });
    stateAlt.reiniciando = false;
    src('connection').stopReconnection();
    src('email').cleanAlertsSent();
    src('flood').cleanFlood();

    createContact(OTHERAlt.jid, OTHERAlt.nome);
    createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid]);
}

// A contact saved in your address book (isMyContact), with its name
function createContact(jid, nameAlt) {
    const [user] = jid.split('@');
    const contactAlt = { id: { _serialized: jid, user }, number: user, name: nameAlt, pushname: nameAlt, isMyContact: true, isGroup: false };
    client.contatos.set(jid, contactAlt);
    return contactAlt;
}

/**
 * @param {string} id
 * @param {string} nome
 * @param {Array<string|{jid:string, isAdmin?:boolean, isSuperAdmin?:boolean}>} membros
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
        digitando: 0,
        async sendStateTyping() { this.digitando++; }
    };
    client.chats.set(id, chat);
    return chat;
}

let sequence = 0;

/**
 * Message in whatsapp-web.js format (only what the bot uses).
 * @param {object} o
 * @param {string} [o.texto]
 * @param {string} [o.chat]      chat where the message is (default: the Família group)
 * @param {string} [o.de]        who sent it (default: the owner)
 * @param {object} [o.citada]    mensagem respondida (outra criarMensagem)
 * @param {object} [o.midia]     { mimetype, data } returned by downloadMedia()
 */
function createMessage({ texto: textAlt = '', chat = GROUP, de = OWNER.jid, id, tipo: type = 'chat', citada: quoted = null,
    midia: mediaAlt = null, links, mencoes: mentions = [], timestamp, extras = {} } = {}) {
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
        _data: { notifyName: client.contatos.get(de)?.pushname },

        async reply(content, chatId, options = {}) {
            return client.sendMessage(chatId || chat, content, { ...options, quotedMessageId: this.id._serialized });
        },
        async getChat() {
            return client.chats.get(chat) ?? { id: { _serialized: chat }, isGroup: false, name: chat, async sendStateTyping() {} };
        },
        async getContact() {
            return client.contatos.get(de) ?? { id: { _serialized: de }, number: de.split('@')[0] };
        },
        async getQuotedMessage() { return quoted; },
        async downloadMedia() { return mediaAlt; },
        ...extras
    };

    return msg;
}

// Errors logged by the bot (printError) since the log's `desde` index
const errorsInLog = (since = 0) => logs.slice(since).filter(l => / \[\*\] /.test(l));

/**
 * Delivers a message to the bot ('message_create' event) and waits for it to finish.
 * Fails if the bot logs an error, unless `errorExpected` is true.
 * @returns {Promise<Array<{chatId, content, options, texto}>>} what the bot sent
 */
async function deliver(msg, { erroEsperado: errorExpected = false } = {}) {
    const sentBefore = client.enviadas.length;
    const logBefore = logs.length;

    for (const handler of client.listeners('message_create')) await handler(msg);

    const errors = errorsInLog(logBefore);
    if (errors.length && !errorExpected) {
        throw new Error(`o bot registrou erro(s) inesperado(s):\n${errors.join('\n')}`);
    }

    return client.enviadas.slice(sentBefore).map(withText);
}

// Send with the text at hand (the id, outside the deepEqual, comes along)
function withText(e) {
    return Object.defineProperty({ ...e, texto: text(e.content, e.options) }, 'id', { value: e.id });
}

// Text of a send (string, media caption, poll name...)
function text(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.pollName ?? '';
}

/**
 * Shortcut: the owner (or `de`) types `linha` in `chat`.
 * @returns what the bot sent
 */
function run(line, optionsAlt = {}) {
    const { erroEsperado: errorExpected, ...rest } = optionsAlt;
    return deliver(createMessage({ texto: line, ...rest }), { erroEsperado: errorExpected });
}

// Only the texts (the most common in asserts)
async function replyAlt(line, optionsAlt) {
    return (await run(line, optionsAlt)).map(e => e.texto);
}

/**
 * Command that lists options to choose from (several contacts or groups with the
 * name): waits for the list to go out, replies `escolha` in the same chat and waits for the
 * comando terminar.
 * @returns the texts of everything the bot sent, from the list onward
 */
async function replyChoosing(line, choice, optionsAlt = {}) {
    const beforeAlt = client.enviadas.length;
    const commandAlt = run(line, optionsAlt);
    const listed = () => client.enviadas.slice(beforeAlt).some(e => text(e.content).startsWith('🔎 '));

    for (let i = 0; i < 200 && !listed(); i++) await new Promise(setImmediate);
    if (!listed()) throw new Error(`${line}: o bot não listou opções para escolher`);

    for (const n of [].concat(choice)) await run(String(n), { chat: optionsAlt.chat });
    return (await commandAlt).map(e => e.texto);
}

/*
 * Delete and edit events, in whatsapp-web.js format
 */
async function removeAlt(original, { porMim: byMim = original.fromMe } = {}) {
    const after = {
        fromMe: byMim,
        id: { id: `REVOKE_${original.id.id}` },
        _data: { protocolMessageKey: { id: original.id.id } },
        getChat: original.getChat
    };

    const beforeAlt = client.enviadas.length;
    for (const h of client.listeners('message_revoke_everyone')) await h(after, original);
    return client.enviadas.slice(beforeAlt).map(withText);
}

async function edit(original, newText, { antigo: oldAlt2 = original.body, editadaEm: editedIn = Date.now(), realmente: really = true } = {}) {
    const msg = {
        ...original,
        latestEditSenderTimestampMs: really ? editedIn : undefined,
        latestEditMsgKey: really ? { id: `EDIT_${original.id.id}` } : undefined,
        body: newText
    };

    const beforeAlt = client.enviadas.length;
    for (const h of client.listeners('message_edit')) await h(msg, newText, oldAlt2);
    return client.enviadas.slice(beforeAlt).map(withText);
}

/**
 * whatsapp-web.js 'vote_update' event: `voter` chose `opcoes` (list
 * empty = withdrew the vote) in the `enquete` poll (the /enquete send or a
 * message with pollName/pollOptions/id).
 */
async function voteAlt(pollAlt, voter, optionsAlt, { quando: when = Date.now() } = {}) {
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

/*
 * With the simulated clock, advances time little by little until the promise ends:
 * does not depend on how many async steps exist before each setTimeout.
 */
async function waitWithClock(t, promise, passoMs = 1000, maxSteps = 60) {
    let ended = false;
    promise.then(() => { ended = true; }, () => { ended = true; });

    for (let i = 0; i < maxSteps && !ended; i++) {
        for (let j = 0; j < 10; j++) await new Promise(setImmediate);
        if (!ended) t.mock.timers.tick(passoMs);
    }
    return promise;
}

module.exports = {
    ...environment,
    GROUP,
    OTHERAlt,
    apagar: removeAlt,
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
    estado: stateAlt,
    executar: run,
    getSetting,
    prepare,
    restart,
    replyAlt,
    replyChoosing,
    setSetting,
    src,
    text,
    voteAlt
};
