/*
 * Ambiente dos testes: carrega o bot com o WhatsApp, o SQLite, a rede, o SMTP
 * e os binários externos SIMULADOS. Nada sai da máquina e nada toca o cache/
 * de verdade (ZAPBOT_CACHE_DIR aponta para uma pasta temporária).
 *
 * Tem que ser o PRIMEIRO require de cada arquivo de teste: os módulos do bot
 * leem process.env e criam o cliente ao carregar.
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.join(__dirname, '..', '..');

/*
 * Variáveis de ambiente: um bot "limpo", sem chaves nem SMTP
 */
const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-teste-'));
process.on('exit', () => fs.rmSync(CACHE_DIR, { recursive: true, force: true }));

const ENV_LIMPAS = [
    'OPENAI_API_KEY', 'OPENAI_TIMEOUT_MS', 'OPENAI_MODEL', 'GIPHY_API_KEY', 'GOOGLE_TRANSLATE_API_KEY',
    'QRCODE_EMAIL_ENABLE', 'QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_PORT', 'QRCODE_EMAIL_SMTP_USER',
    'QRCODE_EMAIL_SMTP_PASS', 'QRCODE_EMAIL_SMTP_FROM', 'QRCODE_EMAIL_SMTP_TO', 'QRCODE_EMAIL_SMTP_ANTIPHISHING'
];
for (const v of ENV_LIMPAS) delete process.env[v];

process.env.ZAPBOT_CACHE_DIR = CACHE_DIR;
process.env.ZAPBOT_HEARTBEAT_FILE = path.join(CACHE_DIR, 'heartbeat.json');
process.env.APP_ENV = 'test'; // debug.enabled começa desligado
process.env.PHONE_NUMBER = '5521900000000@c.us';

const DONO = { user: '5521900000000', jid: '5521900000000@c.us', nome: 'Dono' };

/*
 * Log: o bot escreve com console.log; guardamos (sem as cores) para os testes
 * poderem conferir, e só imprimimos com DEBUG_TESTES=1.
 */
const logs = [];
const consoleLog = console.log;
console.log = (...args) => {
    const linha = args.map(a => (typeof a === 'string' ? a : require('util').inspect(a))).join(' ')
        // eslint-disable-next-line no-control-regex -- tira as cores ANSI (\x1b[...m) do log
        .replace(/\x1b\[[0-9;]*m/g, '');
    logs.push(linha);
    if (process.env.DEBUG_TESTES) consoleLog(linha);
};

/*
 * whatsapp-web.js
 */
class ClienteFalso extends EventEmitter {
    constructor() {
        super();
        this.info = { wid: { _serialized: DONO.jid, user: DONO.user }, pushname: DONO.nome };
        this.enviadas = [];            // { chatId, content, options }
        this.contatos = new Map();     // jid -> contato
        this.chats = new Map();        // chatId -> chat
        this.lids = new Map();         // "123@lid" -> "5521...@c.us"
        this.inicializado = 0;
        this.destruido = 0;
    }

    async initialize() { this.inicializado++; }
    async destroy() { this.destruido++; }
    async getState() { return 'CONNECTED'; }

    async sendMessage(chatId, content, options = {}) {
        const enviada = { chatId, content, options };
        // Como o Message do whatsapp-web.js: o id da mensagem enviada (fora dos deepEqual dos testes)
        const id = `BOT${this.enviadas.length + 1}`;
        Object.defineProperty(enviada, 'id', { value: { id, remote: chatId, fromMe: true, _serialized: `true_${chatId}_${id}` } });
        this.enviadas.push(enviada);
        return enviada;
    }

    async getContactById(id) {
        if (!this.contatos.has(id)) throw new Error(`contato ${id} não encontrado`);
        return this.contatos.get(id);
    }

    async getChatById(id) {
        if (!this.chats.has(id)) throw new Error(`chat ${id} não encontrado`);
        return this.chats.get(id);
    }

    async getChats() {
        return [...this.chats.values()];
    }

    async getContacts() {
        return [...this.contatos.values()];
    }

    // Como no whatsapp-web.js: o id do número no WhatsApp, ou null se ele não tem conta
    async getNumberId(numero) {
        const jid = `${numero}@c.us`;
        return this.contatos.has(jid) ? { user: numero, server: 'c.us', _serialized: jid } : null;
    }

    async getContactLidAndPhone(lids) {
        return lids.map(lid => ({ lid, pn: this.lids.get(lid) ?? null }));
    }
}

class MessageMedia {
    constructor(mimetype, data, filename) {
        Object.assign(this, { mimetype, data, filename });
    }

    // O tipo sai da extensão, como no whatsapp-web.js (que usa o mime-types)
    static fromFilePath(arquivo) {
        const TIPOS = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4',
            mp3: 'audio/mpeg', ogg: 'audio/ogg', pdf: 'application/pdf' };
        const tipo = TIPOS[path.extname(arquivo).slice(1)] ?? 'application/octet-stream';
        return new MessageMedia(tipo, fs.readFileSync(arquivo).toString('base64'), path.basename(arquivo));
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
 * sqlite3 → node:sqlite em memória (mesma API de callbacks que o bot usa)
 */
class BancoFalso {
    constructor(arquivo, cb) {
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
        try { cb(null, this.normalizar(this.db.prepare(sql).get(...params))); } catch (e) { cb(e); }
    }

    all(sql, params, cb) {
        try { cb(null, this.db.prepare(sql).all(...params).map(r => this.normalizar(r))); } catch (e) { cb(e); }
    }

    // node:sqlite devolve objetos sem protótipo; o sqlite3 devolve objetos comuns
    normalizar(r) {
        return r && { ...r };
    }
}

/*
 * Rede (axios): cada teste registra as respostas por URL. Uma URL sem resposta
 * registrada falha, então nenhum teste acessa a internet por engano.
 */
const RESPOSTA_HTTP = Symbol('resposta HTTP completa');

const rede = {
    rotas: [],
    chamadas: [],

    /*
     * padrao: trecho da URL (string) ou RegExp.
     * resposta: o corpo (response.data), uma função(url, cfg) que devolve o
     * corpo, um Error (a requisição falha) ou rede.http({ data, headers }).
     */
    responder(metodo, padrao, resposta) {
        this.rotas.unshift({ metodo, padrao, resposta });
    },

    limpar() {
        this.rotas = [];
        this.chamadas = [];
    },

    // Resposta com headers/status além do corpo
    http({ data, headers = {}, status = 200 }) {
        return { [RESPOSTA_HTTP]: true, data, headers, status };
    },

    async despachar(metodo, url, cfg = {}) {
        this.chamadas.push({ metodo, url, cfg });
        const rota = this.rotas.find(r => r.metodo === metodo &&
            (r.padrao instanceof RegExp ? r.padrao.test(url) : url.includes(r.padrao)));

        if (!rota) throw new Error(`teste sem resposta simulada para ${metodo.toUpperCase()} ${url}`);

        const resposta = typeof rota.resposta === 'function' ? await rota.resposta(url, cfg) : rota.resposta;
        if (resposta instanceof Error) throw resposta;
        if (resposta?.[RESPOSTA_HTTP]) return { data: resposta.data, headers: resposta.headers, status: resposta.status };
        return { data: resposta, headers: {}, status: 200 };
    }
};

const axiosFalso = {
    get: (url, cfg) => rede.despachar('get', url, cfg),
    post: (url, body, cfg) => rede.despachar('post', url, { ...cfg, body })
};

// Erro no formato do axios (err.response.status, err.code)
function erroHttp(status, mensagem = `HTTP ${status}`, extra = {}) {
    const err = new Error(mensagem);
    err.response = { status, data: extra.data };
    if (extra.code) err.code = extra.code;
    return err;
}

/*
 * SMTP
 */
const emails = [];
const nodemailerFalso = {
    createTransport: () => ({
        sendMail: async (m) => {
            if (nodemailerFalso.falhar) throw new Error('SMTP fora do ar');
            emails.push(m);
            return { messageId: `<teste-${emails.length}>` };
        }
    }),
    falhar: false
};

/*
 * yt-dlp / ffmpeg: o spawn falso só cria o arquivo de saída
 */
const processos = {
    chamadas: [],
    falhar: null,        // 'yt-dlp' | 'ffmpeg'
    naoBaixar: false,    // yt-dlp termina sem criar o arquivo (acima do --max-filesize)
    tamanhoSaida: 1024
};

function spawnFalso(bin, args) {
    const filho = new EventEmitter();
    filho.kill = () => {};
    processos.chamadas.push({ bin, args });

    setImmediate(() => {
        const nome = path.basename(bin);

        if (processos.falhar === nome) {
            filho.emit('close', 1, null);
            return;
        }

        if (nome === 'yt-dlp' && !processos.naoBaixar) {
            fs.writeFileSync(args[args.indexOf('-o') + 1], 'video');
        }

        if (nome === 'ffmpeg') {
            fs.writeFileSync(args[args.length - 1], Buffer.alloc(processos.tamanhoSaida));
        }

        filho.emit('close', 0, null);
    });

    return filho;
}

/*
 * sharp: devolve um "webp" fixo
 */
const sharpFalso = () => {
    const cadeia = {
        rotate: () => cadeia,
        resize: () => cadeia,
        webp: () => cadeia,
        toBuffer: async () => Buffer.from('webp-enquadrado')
    };
    return cadeia;
};

const SIMULADOS = {
    'whatsapp-web.js': { Client: ClienteFalso, LocalAuth: class {}, MessageMedia, Location, Poll },
    sqlite3: { verbose: () => ({ Database: BancoFalso }) },
    axios: axiosFalso,
    nodemailer: nodemailerFalso,
    sharp: sharpFalso,
    'qrcode-terminal': { generate: () => {} },
    child_process: { ...require('child_process'), spawn: spawnFalso }
};

const carregar = Module._load;
Module._load = function (pedido, ...resto) {
    if (Object.hasOwn(SIMULADOS, pedido)) return SIMULADOS[pedido];
    return carregar.call(this, pedido, ...resto);
};

module.exports = {
    CACHE_DIR,
    DONO,
    Location,
    MessageMedia,
    Poll,
    RAIZ,
    emails,
    erroHttp,
    logs,
    nodemailer: nodemailerFalso,
    processos,
    rede
};
