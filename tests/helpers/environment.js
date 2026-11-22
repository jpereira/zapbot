/*
 * Test environment: loads the bot with WhatsApp, SQLite, the network, SMTP
 * and the SIMULATED external binaries. Nothing leaves the machine and nothing touches cache/
 * for real (ZAPBOT_CACHE_DIR points to a temporary folder).
 *
 * Must be the FIRST require of each test file: the bot modules
 * read process.env and create the client on load.
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');

/*
 * Environment variables: a "clean" bot, with no keys or SMTP
 */
const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-teste-'));
process.on('exit', () => fs.rmSync(CACHE_DIR, { recursive: true, force: true }));

const ENV_CLEAN = [
    'OPENAI_API_KEY', 'OPENAI_TIMEOUT_MS', 'OPENAI_MODEL', 'GIPHY_API_KEY',
    'QRCODE_EMAIL_ENABLE', 'QRCODE_EMAIL_FALLBACK_TERMINAL', 'QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_PORT', 'QRCODE_EMAIL_SMTP_USER',
    'QRCODE_EMAIL_SMTP_PASS', 'QRCODE_EMAIL_SMTP_FROM', 'QRCODE_EMAIL_SMTP_TO', 'QRCODE_EMAIL_SMTP_ANTIPHISHING'
];
for (const v of ENV_CLEAN) delete process.env[v];

process.env.ZAPBOT_CACHE_DIR = CACHE_DIR;
process.env.ZAPBOT_HEARTBEAT_FILE = path.join(CACHE_DIR, 'heartbeat.json');
process.env.PHONE_NUMBER = '5521900000000';

const OWNER = { user: '5521900000000', jid: '5521900000000@c.us', name: 'Dono' };

/*
 * Log: the bot writes with console.log; we keep it (without the colors) for the tests
 * to be able to check them, and we only print with DEBUG_TESTS=1.
 */
const logs = [];
const consoleLog = console.log;
console.log = (...args) => {
    const line = args.map(a => (typeof a === 'string' ? a : require('util').inspect(a))).join(' ')
        // eslint-disable-next-line no-control-regex -- removes the ANSI colors (\x1b[...m) from the log
        .replace(/\x1b\[[0-9;]*m/g, '');
    logs.push(line);
    if (process.env.DEBUG_TESTS) consoleLog(line);
};

/*
 * whatsapp-web.js
 */
class ClientFake extends EventEmitter {
    constructor() {
        super();
        this.info = { wid: { _serialized: OWNER.jid, user: OWNER.user }, pushname: OWNER.name };
        this.sent = [];            // { chatId, content, options }
        this.reacted = [];            // { id, emoji } of each bot msg.react()
        this.contacts = new Map();     // jid -> contact
        this.chats = new Map();        // chatId -> chat
        this.lids = new Map();         // "123@lid" -> "5521...@c.us"
        this.photos = new Map();        // id -> profile photo URL (no entry: no photo)
        this.initialized = 0;
        this.destroyed = 0;
        this.refuseEdit = false;    // edit() returns null, as when WhatsApp does not let it edit
        this.invites = new Map();     // invite code -> { id, subject, size, desc, refuse }
        this.inputs = [];            // codes accepted by acceptInvite
        this.searches = [];              // { query, options } of each searchMessages
        this.searchResults = [];   // what searchMessages returns (or an Error, which it throws)
    }

    async initialize() { this.initialized++; }
    async destroy() { this.destroyed++; }
    async getState() { return 'CONNECTED'; }

    async sendMessage(chatId, content, options = {}) {
        const sent = { chatId, content, options };
        // Like whatsapp-web.js' Message: the id of the sent message (outside the tests' deepEqual)
        const id = `BOT${this.sent.length + 1}`;
        Object.defineProperty(sent, 'id', { value: { id, remote: chatId, fromMe: true, _serialized: `true_${chatId}_${id}` } });
        // Editing swaps the text in place (as it appears in the chat) and, like WhatsApp Web,
        // fires 'message_edit' with your message
        Object.defineProperty(sent, 'edit', {
            value: async (textAlt) => {
                if (this.refuseEdit) return null;
                const oldAlt2 = sent.content;
                Object.assign(sent, { content: textAlt, editada: true });
                const edited = {
                    id: sent.id, fromMe: true, from: OWNER.jid, to: chatId, type: 'chat', body: textAlt,
                    timestamp: Math.floor(Date.now() / 1000),
                    latestEditSenderTimestampMs: Date.now(), latestEditMsgKey: { id: `EDIT_${id}` }
                };
                for (const h of this.listeners('message_edit')) await h(edited, textAlt, oldAlt2);
                return sent;
            }
        });
        this.sent.push(sent);
        return sent;
    }

    // Group invites: code -> { id, subject, size, desc }; acceptInvite notes what joined
    async getInviteInfo(codeAlt) {
        if (!this.invites.has(codeAlt)) throw new Error('Invite code not found');
        return this.invites.get(codeAlt);
    }

    async acceptInvite(codeAlt) {
        const info = await this.getInviteInfo(codeAlt);
        if (info.refuse) throw new Error(info.refuse);
        this.inputs.push(codeAlt);
        return info.id;
    }

    async getProfilePicUrl(id) { return this.photos.get(id); }

    async getContactById(id) {
        if (!this.contacts.has(id)) throw new Error(`contato ${id} não encontrado`);
        return this.contacts.get(id);
    }

    async getChatById(id) {
        if (!this.chats.has(id)) throw new Error(`chat ${id} não encontrado`);
        return this.chats.get(id);
    }

    async getChats() {
        return [...this.chats.values()];
    }

    async getContacts() {
        return [...this.contacts.values()];
    }

    async getBlockedContacts() {
        return [...this.contacts.values()].filter(c => c.isBlocked);
    }

    async searchMessages(query, options = {}) {
        this.searches.push({ query, options });
        if (this.searchResults instanceof Error) throw this.searchResults;
        return this.searchResults;
    }

    // The serialized id → the message (from searchResults), or null
    async getMessageById(id) {
        if (this.searchResults instanceof Error) throw this.searchResults;
        return this.searchResults.find(m => m.id?._serialized === id) ?? null;
    }

    // As in whatsapp-web.js: the number's id on WhatsApp, or null if it has no account
    async getNumberId(numberAlt) {
        const jid = `${numberAlt}@c.us`;
        return this.contacts.has(jid) ? { user: numberAlt, server: 'c.us', _serialized: jid } : null;
    }

    // As in whatsapp-web.js: the @lid/phone pair of each id (a @lid or a phone)
    async getContactLidAndPhone(ids) {
        return ids.map(id => (id.endsWith('@lid')
            ? { lid: id, pn: this.lids.get(id) ?? null }
            : { lid: [...this.lids].find(([, pn]) => pn === id)?.[0] ?? null, pn: id }));
    }
}

class MessageMedia {
    constructor(mimetype, data, filename) {
        Object.assign(this, { mimetype, data, filename });
    }

    // The type comes from the extension, as in whatsapp-web.js (which uses mime-types)
    static fromFilePath(fileAlt) {
        const TYPES = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4',
            mp3: 'audio/mpeg', webp: 'image/webp', ogg: 'audio/ogg', pdf: 'application/pdf' };
        const type = TYPES[path.extname(fileAlt).slice(1)] ?? 'application/octet-stream';
        return new MessageMedia(type, fs.readFileSync(fileAlt).toString('base64'), path.basename(fileAlt));
    }

    static async fromUrl(url) {
        if (MessageMedia.urls?.has(url)) return MessageMedia.urls.get(url);
        throw new Error(`fromUrl sem simulação: ${url}`);
    }
}
MessageMedia.urls = new Map();

class Location {
    constructor(latitude, longitude, description) {
        Object.assign(this, { latitude, longitude, description });
    }
}

class Poll {
    constructor(pollName, pollOptions, options = {}) {
        this.pollName = pollName;
        this.pollOptions = pollOptions.map((name, localId) => ({ name, localId }));
        this.options = { allowMultipleAnswers: options.allowMultipleAnswers === true };
    }
}

/*
 * sqlite3 → in-memory node:sqlite (same callback API the bot uses)
 */
class DbFake {
    constructor(fileAlt, cb) {
        this.db = new DatabaseSync(':memory:');
        if (cb) setImmediate(() => cb(null));
    }

    run(sql, params, cb) {
        try {
            const r = this.db.prepare(sql).run(...params);
            cb.call({ changes: Number(r.changes), lastID: Number(r.lastInsertRowid) }, null);
        } catch (e) {
            cb(e);
        }
    }

    get(sql, params, cb) {
        try { cb(null, this.normalize(this.db.prepare(sql).get(...params))); } catch (e) { cb(e); }
    }

    all(sql, params, cb) {
        try { cb(null, this.db.prepare(sql).all(...params).map(r => this.normalize(r))); } catch (e) { cb(e); }
    }

    // node:sqlite returns objects without a prototype; sqlite3 returns plain objects
    normalize(r) {
        return r && { ...r };
    }
}

/*
 * Network (axios): each test records the responses by URL. A URL with no response
 * registered failure, so no test reaches the internet by mistake.
 */
const REPLY_HTTP = Symbol('resposta HTTP completa');

const network = {
    rotas: [],
    calls: [],

    /*
     * fallback: URL snippet (string) or RegExp.
     * reply: the body (response.data), a function(url, cfg) that returns the
     * body, an Error (the request fails) or network.http({ data, headers }).
     */
    responder(method, defaults, reply) {
        this.rotas.unshift({ method, fallback: defaults, answer: reply });
    },

    clear() {
        this.rotas = [];
        this.calls = [];
    },

    // Response with headers/status besides the body
    http({ data, headers = {}, status = 200 }) {
        return { [REPLY_HTTP]: true, data, headers, status };
    },

    async dispatch(method, url, cfg = {}) {
        this.calls.push({ method, url, cfg });
        const rota = this.rotas.find(r => r.method === method &&
            (r.fallback instanceof RegExp ? r.fallback.test(url) : url.includes(r.fallback)));

        if (!rota) throw new Error(`teste sem resposta simulada para ${method.toUpperCase()} ${url}`);

        const reply = typeof rota.answer === 'function' ? await rota.answer(url, cfg) : rota.answer;
        if (reply instanceof Error) throw reply;
        if (reply?.[REPLY_HTTP]) return { data: reply.data, headers: reply.headers, status: reply.status };
        return { data: reply, headers: {}, status: 200 };
    }
};

const axiosFake = {
    get: (url, cfg) => network.dispatch('get', url, cfg),
    post: (url, body, cfg) => network.dispatch('post', url, { ...cfg, body })
};

// Error in axios' format (err.response.status, err.code)
function errorHttp(status, messageAlt = `HTTP ${status}`, extra = {}) {
    const err = new Error(messageAlt);
    err.response = { status, data: extra.data };
    if (extra.code) err.code = extra.code;
    return err;
}

/*
 * google-translate-api-x: the /translate package, without network. The call goes through the simulated network
 * (network.responder('post', 'google-translate-api-x', { text, from: { language: { iso } } })) e o
 * text and the options (to...) stay in network.calls.at(-1).cfg.body.
 */
const googleTranslateFake = {
    translate: async (textAlt, optionsAlt = {}) => (await network.dispatch('post', 'google-translate-api-x',
        { body: { text: textAlt, ...optionsAlt } })).data,
    languages: { auto: 'Automatic', en: 'English', es: 'Spanish', fr: 'French', pt: 'Portuguese', 'zh-CN': 'Chinese (Simplified)' }
};

/*
 * SMTP
 */
const emails = [];
const nodemailerFake = {
    createTransport: () => ({
        sendMail: async (m) => {
            if (nodemailerFake.fail) throw new Error('SMTP fora do ar');
            emails.push(m);
            return { messageId: `<teste-${emails.length}>` };
        }
    }),
    fail: false
};

/*
 * yt-dlp / ffmpeg: the fake spawn only creates the output file
 */
const processes = {
    calls: [],
    fail: null,        // 'yt-dlp' | 'ffmpeg'
    skipDownload: false,    // yt-dlp ends without creating the file (above --max-filesize)
    failSnippet: false, // yt-dlp fails only with --download-sections (a site that does not allow it)
    duration: 100,        // what ffprobe (and yt-dlp --print duration) report; null: neither knows
    siteWithoutDuration: false, // yt-dlp --print duration says NA (ffprobe still measures the file)
    outputSize: 1024,
    speech: 'olá mundo, isto é um teste', // the text that faster-whisper (python) returns
    errorOutput: null, // what yt-dlp writes in the log before failing
    ocr: 'texto da imagem', // the text that tesseract returns
    post: null // the JSON that yt-dlp -J returns (a photo post)
};

function spawnFake(bin, args, optionsAlt) {
    const child = new EventEmitter();
    child.kill = () => {};
    child.stdout = new EventEmitter();
    processes.calls.push({ bin, args });

    setImmediate(() => {
        const nameAlt = path.basename(bin);

        // yt-dlp -J (the post data): processos.post's JSON
        if (nameAlt === 'yt-dlp' && args.includes('-J')) {
            if (!processes.post) { child.emit('close', 1, null); return; }
            child.stdout.emit('data', `${JSON.stringify(processes.post)}\n`);
            child.emit('close', 0, null);
            return;
        }

        if (processes.fail === nameAlt || (processes.failSnippet && args.includes('--download-sections'))) {
            // The program output goes to the log file (stdio[1]), as in the real one
            if (processes.errorOutput && typeof optionsAlt?.stdio?.[1] === 'number') fs.writeSync(optionsAlt.stdio[1], processes.errorOutput);
            child.emit('close', 1, null);
            return;
        }

        // tesseract: the text on the output
        if (nameAlt === 'tesseract') {
            child.stdout.emit('data', `${processes.ocr}\n`);
            child.emit('close', 0, null);
            return;
        }

        // stt.py: the JSON on the last line of the output
        if (nameAlt === 'python') {
            // tts.py: the text it was asked to speak (the file goes away after the call)
            if (/tts\.py$/.test(args[0]) && args.includes('--input')) processes.spoken = fs.readFileSync(args[args.indexOf('--input') + 1], 'utf8');
            child.stdout.emit('data', `${JSON.stringify({ language: 'pt', duration: 5, text: processes.speech })}\n`);
            child.emit('close', 0, null);
            return;
        }

        if (nameAlt === 'ffprobe' || args.includes('--print')) {
            const without = processes.duration === null || (processes.siteWithoutDuration && nameAlt === 'yt-dlp');
            child.stdout.emit('data', `${without ? 'NA' : processes.duration}\n`);
            child.emit('close', 0, null);
            return;
        }

        if (nameAlt === 'yt-dlp' && !processes.skipDownload) {
            fs.writeFileSync(args[args.indexOf('-o') + 1], 'video');
        }

        if (nameAlt === 'ffmpeg') {
            fs.writeFileSync(args[args.length - 1], Buffer.alloc(processes.outputSize));
        }

        child.emit('close', 0, null);
    });

    return child;
}

/*
 * sharp: returns a fixed "webp". For /pixelart, a "png:WxH" image
 * reports the dimensions in metadata() and png() returns "png:WxH" of the result
 * (after the resize/extract). The inputs (including { text } and { create } of the
 * /sticker -txt) stay in sharpFake.inputs.
 */
const sharpFake = (inputAlt) => {
    sharpFake.inputs.push(inputAlt);
    const [, w, h] = String(inputAlt).match(/^png:(\d+)x(\d+)$/) ?? [];
    let dim = { width: Number(w), height: Number(h) };
    let format = 'webp';
    const chainAlt = {
        rotate: () => chainAlt,
        resize: (width, height, optionsAlt) => {
            sharpFake.resizes.push(optionsAlt);
            if (height) dim = { width, height };
            return chainAlt;
        },
        extract: ({ width, height }) => { dim = { width, height }; return chainAlt; },
        webp: () => chainAlt,
        // /qr -d: the RGBA pixels that the test puts in sharpFake.pixels ({ data, width, height })
        ensureAlpha: () => chainAlt,
        raw: () => { format = 'raw'; return chainAlt; },
        composite: () => chainAlt,
        extend: () => chainAlt,
        png: () => { format = 'png'; return chainAlt; },
        // /notes -export: the file that starts with "nao e image" fails; the rest becomes a 40x20 "jpeg"
        flatten: () => chainAlt,
        toColourspace: () => chainAlt,
        jpeg: () => { format = 'jpeg'; return chainAlt; },
        metadata: async () => dim,
        toBuffer: async (optionsAlt) => {
            if (format === 'raw') {
                const { data, width, height } = sharpFake.pixels;
                return optionsAlt?.resolveWithObject ? { data, info: { width, height, channels: 4 } } : data;
            }
            if (format !== 'jpeg') {
                const data = Buffer.from(format === 'png' ? `png:${dim.width}x${dim.height}` : 'webp-enquadrado');
                return optionsAlt?.resolveWithObject ? { data, info: dim } : data;
            }
            if (typeof inputAlt === 'string' && require('fs').readFileSync(inputAlt, 'latin1').startsWith('nao e imagem')) {
                throw new Error('Input file contains unsupported image format');
            }
            const data = Buffer.from('\xff\xd8jpeg-falso\xff\xd9', 'latin1');
            return optionsAlt?.resolveWithObject ? { data, info: { width: 40, height: 20 } } : data;
        }
    };
    return chainAlt;
};
sharpFake.inputs = [];
sharpFake.pixels = null;   // what raw() returns (see /qr -d)
sharpFake.resizes = [];   // the options of each resize (fit, position)

const SIMULATED = {
    'whatsapp-web.js': { Client: ClientFake, LocalAuth: class {}, MessageMedia, Location, Poll },
    sqlite3: { verbose: () => ({ Database: DbFake }) },
    axios: axiosFake,
    'google-translate-api-x': googleTranslateFake,
    nodemailer: nodemailerFake,
    sharp: sharpFake,
    'qrcode-terminal': { generate: () => {} },
    child_process: { ...require('child_process'), spawn: spawnFake }
};

const load = Module._load;
Module._load = function (request, ...rest) {
    if (Object.hasOwn(SIMULATED, request)) return SIMULATED[request];
    return load.call(this, request, ...rest);
};

module.exports = {
    CACHE_DIR,
    OWNER,
    Location,
    MessageMedia,
    Poll,
    ROOT,
    emails,
    errorHttp,
    logs,
    nodemailer: nodemailerFake,
    processes,
    network
};
