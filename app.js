/*
 * ZapBot - Bot para WhatsApp baseado no whatsapp-web.js
 *
 * Recupera mensagens apagadas, baixa vídeos (/get), cria figurinhas,
 * vigia mensagens por texto/regex (/watch), monitora contatos e mais. Os comandos são definidos em
 * config/bot-config.json e implementados neste arquivo (ver HANDLERS).
 *
 * Versão:  veja package.json
 * Autor:   Jorge Pereira <jpereiran@gmail.com>
 * Site:    https://github.com/jpereira/zapbot
 *
 * Copyright (c) 2026 Jorge Pereira
 *
 * Licenciado sob a licença MIT. É permitido usar, copiar, modificar,
 * mesclar, publicar, distribuir, sublicenciar e/ou vender cópias deste
 * software, desde que este aviso de copyright seja mantido.
 *
 * O SOFTWARE É FORNECIDO "COMO ESTÁ", SEM GARANTIA DE QUALQUER TIPO.
 *
 * Projeto não oficial, sem vínculo com o WhatsApp ou a Meta. Usar bots em
 * contas pessoais viola os Termos de Serviço do WhatsApp e pode levar ao
 * banimento do número. Use por sua conta e risco.
 */

const { Client, MessageMedia, LocalAuth, Location, Poll } = require('whatsapp-web.js');
const { spawn } = require('child_process');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const os = require('os');
const util = require('util');
const path = require('path');

const axios = require('axios');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const colors = require('colors');
const fs = require('fs-extra');
const sharp = require('sharp');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const packageJson = require('./package.json');

// Carrega o .env antes de qualquer leitura de process.env
dotenv.config();

/*
 * Constantes
 */
const BOT_START_TIME = Date.now();
let BOT_AUTHENTICATED_TIME = 0;

// Tempo máximo que o WhatsApp permite apagar para todos: 68 horas em milissegundos
const MAX_DELETE_WINDOW = 68 * 60 * 60 * 1000;

// 1 dia em milissegundos (retenção das apagadas: setting 'cache.revokedRetentionDays')
const DAY_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = path.join(__dirname, 'cache');
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // mídias salvas para recuperar mensagens apagadas
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // arquivos temporários do /get

const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_YT = '/venv/bin/yt-dlp';

// /get: cada yt-dlp/ffmpeg é morto após este tempo; no máximo N downloads ao mesmo tempo
const GET_TIMEOUT_MS = 5 * 60 * 1000;
const GET_MAX_CONCURRENT = 2;

/*
 * Utilitários de tempo e log
 */
function getBotUptime(startedTime) {
    const totalSeconds = Math.floor((Date.now() - startedTime) / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (days) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
    if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
    if (!days && !hours) parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`);

    return parts.join(', ');
}

function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getCaller() {
    // [0] Error, [1] getCaller, [2] printX, [3] quem chamou printX
    return new Error().stack.split('\n')[3]?.trim()?.replace('at ', '');
}

/*
 * Todos os print* aceitam vários argumentos (como console.log).
 * Antes, printError('msg:', err.message) descartava o segundo argumento.
 */
function printDebug(...args) {
    console.log(colors.white(`[${getTimestamp()}] [DEBUG] [${getCaller()}] ${util.format(...args)}`));
}

function printInfo(...args) {
    console.log(colors.yellow(`[${getTimestamp()}] [!] ${util.format(...args)}`));
}

function printSuccess(...args) {
    console.log(colors.green(`[${getTimestamp()}] [+] ${util.format(...args)}`));
}

function printError(...args) {
    console.log(colors.red(`[${getTimestamp()}] [*] [${getCaller()}] ${util.format(...args)}`));
}

function printCall(senderContact, call) {
    console.log(colors.blue(`[${getTimestamp()}] [+] '${senderContact?.pushname}' used '${call}'`));
}

/*
 * Ambiente
 */
const APP_ENV = process.env.APP_ENV || 'dev';

// O debug mode vem do setting 'debug.enabled' (padrão: ligado se APP_ENV=dev, sem diferenciar maiúsculas)
printInfo(`Running in APP_ENV=${APP_ENV} QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE}`);

/*
 * Banco de dados (SQLite)
 */
const dbPath = path.join(CACHE_DIR, 'bot_database.db');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return printError('Erro ao conectar ao SQLite:', err.message);
    printInfo(`Conectado com sucesso ao banco de dados SQLite: ${dbPath}`);
});

// Versões com Promise para usar async/await
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

/*
 * Criação das tabelas.
 * Tudo em sequência (await): antes, o CREATE TABLE podia ainda não ter
 * terminado quando a primeira consulta chegava.
 *
 * Handlers que usam o banco fazem `await dbPronto` antes de consultar.
 */
async function inicializarBanco() {
    // Histórico de quando os contatos monitorados ficam online
    await dbRun(`
        CREATE TABLE IF NOT EXISTS presence_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT,
            display_name TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Números monitorados via /monitor
    await dbRun(`
        CREATE TABLE IF NOT EXISTS monitored_numbers (
            phone_number TEXT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Mensagens recebidas (para recuperar as apagadas)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,

            sender_name TEXT,
            sender_jid TEXT,
            sender_number TEXT,

            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,

            body TEXT,
            type TEXT,

            timestamp INTEGER,

            has_media INTEGER DEFAULT 0,
            media_path TEXT,

            location_lat REAL,
            location_lng REAL,

            raw_json TEXT,

            revoked INTEGER DEFAULT 0,
            revoked_at INTEGER
        )
    `);

    // Consulta do /show: apagadas de um chat, das mais recentes para as mais antigas
    await dbRun('CREATE INDEX IF NOT EXISTS idx_messages_chat_revoked ON messages (chat_id, revoked, revoked_at)');

    /*
     * Mensagens editadas (para o /edit): uma linha por edição, com o texto de
     * antes e o de depois. UNIQUE(message_id, edited_at): o WhatsApp Web avisa
     * a mesma edição mais de uma vez (body e caption), mas ela é gravada uma só.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS message_edits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            type TEXT,
            old_body TEXT,
            new_body TEXT,
            timestamp INTEGER,
            edited_at INTEGER,
            UNIQUE (message_id, edited_at)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_message_edits_chat ON message_edits (chat_id, edited_at)');

    /*
     * Estatísticas do /stats: contadores por chat, dia, hora e remetente.
     * As mensagens comuns saem do banco em 68 h; os contadores ficam
     * 'stats.retentionDays' dias.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS stats (
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            day TEXT NOT NULL,
            hour INTEGER NOT NULL,
            sender_id TEXT NOT NULL,
            sender_name TEXT,
            msgs INTEGER DEFAULT 0,
            media INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            edited INTEGER DEFAULT 0,
            PRIMARY KEY (chat_id, day, hour, sender_id)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_stats_chat_day ON stats (chat_id, day)');

    // Alertas de preço do /cotacao -alerta e do /crypto -alerta (disparam uma vez e saem)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS price_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            symbol TEXT NOT NULL,
            op TEXT NOT NULL,
            target REAL NOT NULL,
            price_at_creation REAL,
            created_at INTEGER NOT NULL
        )
    `);

    // Configurações gerais do bot (chave -> valor em JSON)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ocorrências do /watch: mensagens que casaram com alguma regra do setting 'watch.rules'.
    // UNIQUE(rule, message_id): a mesma mensagem não gera dois avisos para a mesma regra.
    await dbRun(`
        CREATE TABLE IF NOT EXISTS watch_hits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule TEXT NOT NULL,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            body TEXT,
            timestamp INTEGER,
            UNIQUE (rule, message_id)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_watch_hits_rule ON watch_hits (rule, timestamp)');

    await carregarSettings();

    for (const dir of [MEDIA_DIR, TMP_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printInfo(`Creating ${dir}`);
        }
    }
}

/*
 * Settings: configurações gerais persistidas na tabela `settings`.
 * Carregadas no boot para `settings` (memória); getSetting() lê de lá e
 * setSetting() valida, grava no banco e na memória. Alteráveis pelo /set.
 *
 * Cada chave declara: default (gravado no primeiro boot, sem sobrescrever o
 * existente), type (boolean | number | string | list), desc e, opcionalmente,
 * min/max (number), item() para normalizar/validar cada item de uma list,
 * separator (list cujos itens podem ter espaço/vírgula: ex. '\n', um por linha),
 * allowEmpty (string que pode ficar vazia) e secret (valor mascarado no /set e nos logs).
 */
// item() das listas de feeds do /news
function validarUrlFeed(v) {
    if (!isValidHttpUrl(v)) throw new Error(`URL inválida: ${v}`);
    return v;
}

const SETTINGS_SCHEMA = {
    'alerta.intervalMin': {
        default: 5,
        type: 'number', min: 1, max: 60,
        desc: 'Intervalo (minutos) entre as verificações dos alertas do /cotacao e do /crypto.'
    },
    'alerta.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de alertas de preço (somando /cotacao e /crypto).'
    },
    'bot.adminMode': {
        default: true,
        type: 'boolean',
        desc: 'Modo admin: só o dono usa comandos (o mesmo do /bot +admin|-admin).'
    },
    'bot.paused': {
        default: false,
        type: 'boolean',
        desc: 'Bot desligado: todos os comandos são ignorados, exceto o /bot (o mesmo do /bot -on|-off).'
    },
    'cache.editedRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as mensagens editadas ficam guardadas para o /edit.'
    },
    'cache.revokedRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as mensagens apagadas ficam guardadas para o /show.'
    },
    'commands.disabled': {
        default: [],
        type: 'list',
        desc: 'Comandos desativados em tempo de execução (somem do /help).',
        item: (v) => {
            const nome = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
            const command = botConfig.commands.find(c => c.cmd === nome || c.aliases?.includes(nome));
            if (!command) throw new Error(`comando desconhecido: ${nome}`);
            if (command.cmd === '/set') throw new Error('o /set não pode ser desativado');
            return command.cmd;
        }
    },
    'cotacao.coins': {
        default: ['EUR', 'USDT'],
        type: 'list',
        desc: 'Moedas exibidas pelo /cotacao (contra o real).',
        item: (v) => {
            const sym = v.toUpperCase();
            if (!COTACAO_SUPORTADAS[sym]) throw new Error(`moeda não suportada: ${sym}`);
            return sym;
        }
    },
    'crypto.coins': {
        default: ['BTC', 'ETH', 'SOL', 'HYPE'],
        type: 'list',
        desc: 'Moedas exibidas pelo /crypto.',
        item: (v) => {
            const sym = v.toUpperCase().replace(/USDT$/, '');
            if (!CRYPTO_SUPPORTED[sym]) throw new Error(`moeda não suportada: ${sym}`);
            return sym;
        }
    },
    'cve.max': {
        default: 10,
        type: 'number', min: 1, max: 20,
        desc: 'Quantidade de CVEs exibidas pelo /cve (o /cve <max> sobrepõe).'
    },
    'cve.maxDays': {
        default: 7,
        type: 'number', min: 1, max: 120, // 120: janela máxima aceita pelo NVD
        desc: 'Janela (dias) do /cve -highscore.'
    },
    'debug.enabled': {
        default: APP_ENV.toLowerCase() === 'dev',
        type: 'boolean',
        desc: 'Debug mode (o mesmo do /debug on|off).'
    },
    'edit.alert': {
        default: true,
        type: 'boolean',
        desc: 'Avisa no seu privado quando alguém edita uma mensagem; off só guarda para o /edit.'
    },
    'email.alerts': {
        default: true,
        type: 'boolean',
        desc: 'Avisa por e-mail (SMTP do QR Code) crash, queda, reconexão e outros eventos do bot.'
    },
    'get.maxDownloadMB': {
        default: 200,
        type: 'number', min: 10, max: 2000,
        desc: 'Tamanho máximo (MB) baixado pelo yt-dlp no /get, antes da conversão.'
    },
    'get.maxSizeMB': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Tamanho máximo (MB) do arquivo enviado pelo /get.'
    },
    'gif.giphy.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave do GIPHY (/gif), usada quando GIPHY_API_KEY não está no config/.env.'
    },
    'gif.tag': {
        default: 'fail',
        type: 'string',
        desc: 'Tag padrão do /gif quando nenhuma é informada.'
    },
    'monitor.max': {
        default: 20,
        type: 'number', min: 1, max: 1000,
        desc: 'Máximo de números monitorados pelo /monitor.'
    },
    'news.brasil': {
        // Os feeds listados em https://rss.feedspot.com/brazil_rss_feeds/ (a página é HTML, não RSS)
        default: [
            'http://lifeinrocinha.blogspot.com/feeds/posts/default?alt=rss',
            'https://braziliangringo.com/feed/',
            'https://brazilianspace.blogspot.com/feeds/posts/default?alt=rss',
            'https://cursosbiblicos.teo.br/feed/',
            'https://feeds.feedburner.com/aviacaobrasil',
            'https://feeds.feedburner.com/Eatrionet',
            'https://foodsafetybrazil.org/feed/',
            'https://jornaldebrasilia.com.br/feed/',
            'https://lyricalbrazil.com/feed/',
            'https://nocoupinbrazil.wordpress.com/feed/',
            'https://rioonwatch.org/?feed=rss2',
            'https://riorealblog.com/feed/',
            'https://vexus.com.br/en/feed/feed.xml',
            'https://www.absoluterio.com.br/blog-feed.xml',
            'https://www.brasilwire.com/feed/'
        ],
        type: 'list',
        desc: 'Feeds RSS do /news -brasil (blogs sobre o Brasil, do feedspot).',
        item: validarUrlFeed
    },
    'news.g1': {
        default: ['https://g1.globo.com/dynamo/rss2.xml'],
        type: 'list',
        desc: 'Feeds RSS do /news -g1.',
        item: validarUrlFeed
    },
    'news.gazeta': {
        default: ['https://www.gazetadopovo.com.br/feed/rss/brasil.xml'],
        type: 'list',
        desc: 'Feeds RSS do /news -gazeta (Gazeta do Povo).',
        item: validarUrlFeed
    },
    'news.hack': {
        default: [
            'https://feeds.feedburner.com/TheHackersNews',
            'https://www.bleepingcomputer.com/feed/',
            'https://krebsonsecurity.com/feed/'
        ],
        type: 'list',
        desc: 'Feeds RSS do /news -hack (hacking/segurança).',
        item: validarUrlFeed
    },
    'news.max': {
        default: 5,
        type: 'number', min: 1, max: 10,
        desc: 'Manchetes exibidas pelo /news (o /news <quantidade> sobrepõe).'
    },
    'openai.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave da OpenAI (/gpt), usada quando OPENAI_API_KEY não está no config/.env.'
    },
    'openai.timeout.ms': {
        default: 60000,
        type: 'number', min: 5000, max: 300000,
        desc: 'Timeout (ms) do /gpt, usado quando OPENAI_TIMEOUT_MS não está no config/.env.'
    },
    'revoke.status': {
        default: true,
        type: 'boolean',
        desc: 'Recupera status (stories) apagados; off ignora.'
    },
    'show.delayMs': {
        default: 700,
        type: 'number', min: 0, max: 10000,
        desc: 'Intervalo (ms) entre os envios do /show (evita flood/ban).'
    },
    'show.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de mensagens reexibidas por /show -N.'
    },
    'stats.enabled': {
        default: true,
        type: 'boolean',
        desc: 'Conta as mensagens de cada chat para o /stats; off para de contar (o histórico fica).'
    },
    'stats.retentionDays': {
        default: 90,
        type: 'number', min: 7, max: 365,
        desc: 'Dias que os contadores do /stats ficam guardados.'
    },
    'sticker.author': {
        default: 'https://github.com/jpereira/zapbot/',
        type: 'string',
        desc: 'Autor das figurinhas (/sticker e /get -st).'
    },
    'sticker.name': {
        default: 'ZapBot',
        type: 'string',
        desc: 'Nome do pacote das figurinhas (/sticker e /get -st).'
    },
    'tempo.city': {
        default: 'Niteroi, Rio de Janeiro, Brazil',
        type: 'string',
        desc: 'Cidade padrão do /tempo (ex.: "Niteroi, Rio de Janeiro, Brazil").'
    },
    'watch.hitsRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as ocorrências do /watch ficam guardadas.'
    },
    'watch.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de regras do /watch.'
    },
    'watch.rules': {
        default: [],
        type: 'list',
        separator: '\n',
        desc: 'Regras do /watch, uma por linha: texto (sem diferenciar maiúsculas/acentos) ou /regex/flags.',
        item: (v) => {
            compilarRegraWatch(v); // lança Error se a regra for inválida
            return v;
        }
    },
    'watch.showMax': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de ocorrências listadas por /watch -show.'
    }
};

const settings = new Map();

/*
 * Valida/normaliza um valor para a chave. Aceita o valor já tipado (vindo do
 * banco) ou texto (vindo do /set). Lança Error com a mensagem para o usuário.
 */
function validarSetting(key, value) {
    const schema = SETTINGS_SCHEMA[key];
    if (!schema) throw new Error(`setting desconhecido: ${key}`);

    switch (schema.type) {
        case 'boolean': {
            if (typeof value === 'boolean') return value;
            const v = String(value).trim().toLowerCase();
            if (['on', 'true', '1', 'sim', 'yes'].includes(v)) return true;
            if (['off', 'false', '0', 'nao', 'não', 'no'].includes(v)) return false;
            throw new Error('use on|off');
        }

        case 'number': {
            const n = Number(value);
            if (String(value).trim() === '' || !Number.isInteger(n)) throw new Error('precisa ser um número inteiro');
            if (n < schema.min || n > schema.max) throw new Error(`precisa estar entre ${schema.min} e ${schema.max}`);
            return n;
        }

        case 'string': {
            const s = String(value ?? '').trim();
            if (!s && schema.allowEmpty) return s;
            if (!s || s.length > 100) throw new Error('precisa ter de 1 a 100 caracteres');
            return s;
        }

        case 'list': {
            const itens = Array.isArray(value)
                ? value.map(String)
                : String(value ?? '').split(schema.separator ?? /[\s,]+/);
            const lista = itens.map(v => v.trim()).filter(Boolean).map(schema.item ?? (v => v));
            return [...new Set(lista)];
        }
    }

    throw new Error(`tipo inválido no schema: ${schema.type}`);
}

// Chaves renomeadas (antiga → nova): o valor salvo no banco vai para o nome novo
const SETTINGS_RENOMEADOS = {
    'api.key.giphy': 'gif.giphy.api.key'
};

async function carregarSettings() {
    for (const [antiga, nova] of Object.entries(SETTINGS_RENOMEADOS)) {
        await dbRun('UPDATE OR IGNORE settings SET key = ? WHERE key = ?', [nova, antiga]);
        await dbRun('DELETE FROM settings WHERE key = ?', [antiga]);
    }

    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        await dbRun('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(schema.default)]);
    }

    for (const row of await dbAll('SELECT key, value FROM settings')) {
        if (!SETTINGS_SCHEMA[row.key]) {
            printInfo(`Setting '${row.key}' desconhecido, ignorado.`);
            continue;
        }

        try {
            settings.set(row.key, validarSetting(row.key, JSON.parse(row.value)));
        } catch (e) {
            printError(`Setting '${row.key}' inválido (${e.message}), usando o padrão.`);
        }
    }

    printSuccess(`Loaded ${settings.size} settings (${[...settings.keys()].join(',')})`);
    printSuccess(`Loaded ${getSetting('crypto.coins').length} crypto coins (${getSetting('crypto.coins').join(',')})`);
    printInfo(`debug.enabled=${getSetting('debug.enabled')} commands.disabled=${getSetting('commands.disabled').join(',') || '-'}`);
    printInfo(`Loaded ${getSetting('watch.rules').length} watch rules`);
}

function getSetting(key) {
    return settings.has(key) ? settings.get(key) : SETTINGS_SCHEMA[key]?.default;
}

/*
 * Valor do config/.env ou, se vazio, do setting (ex.: chaves de API, timeouts).
 * O valor do .env passa pela mesma validação do setting: inválido é ignorado
 * (com aviso no log) e vale o setting.
 */
function envOuSetting(env, key) {
    const valor = process.env[env]?.trim();
    if (!valor) return getSetting(key);

    try {
        return validarSetting(key, valor);
    } catch (e) {
        printError(`${env} inválido (${e.message}), usando o setting '${key}'.`);
        return getSetting(key);
    }
}

async function setSetting(key, value) {
    value = validarSetting(key, value);

    await dbRun(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value)]
    );
    settings.set(key, value);

    return value;
}

function isDebugMode() {
    return getSetting('debug.enabled');
}

function stickerMeta() {
    return { stickerName: getSetting('sticker.name'), stickerAuthor: getSetting('sticker.author') };
}

const dbPronto = inicializarBanco().catch((e) => {
    console.error('Bootstrap Erro:', e);
    process.exit(1);
});

/*
 * Configuração dos comandos
 */
const botConfig = require('./config/bot-config.json');

// "disabled": true tira o comando do bot: não responde, não aparece no /help
const disabledCommands = botConfig.commands.filter(c => c.disabled).map(c => c.cmd);
botConfig.commands = botConfig.commands.filter(c => !c.disabled);

const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

if (disabledCommands.length) {
    printInfo(`Disabled ${disabledCommands.length} callers (${disabledCommands.join(',')})`);
}

// Comandos ativos: os do bot-config menos os do setting 'commands.disabled' (via /set)
function activeCommands() {
    const desativados = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !desativados.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

/*
 * E-mail do QR Code
 */
const transporter = nodemailer.createTransport({
    host: process.env.QRCODE_EMAIL_SMTP_HOST,
    port: process.env.QRCODE_EMAIL_SMTP_PORT,
    secure: true, // SSL (465)
    auth: {
        user: process.env.QRCODE_EMAIL_SMTP_USER,
        pass: process.env.QRCODE_EMAIL_SMTP_PASS
    }
    // Sem "tls.rejectUnauthorized: false": o certificado do SMTP precisa ser válido,
    // senão um MITM captura a senha e o QR Code (= sessão do WhatsApp).
});

/*
 * Alertas por e-mail (setting 'email.alerts', padrão on)
 * Crash, desconexão, reconexão, falha de autenticação, sessão perdida,
 * encerramento... vão por e-mail pelo mesmo SMTP do QR Code (QRCODE_EMAIL_SMTP_*),
 * para quando o próprio WhatsApp não está funcionando. O mesmo evento não se
 * repete antes de 5 minutos (evita uma enxurrada num loop de reconexão).
 */
const ALERTA_EMAIL_INTERVALO_MS = 5 * 60 * 1000;
const ultimoAlertaEmail = new Map(); // evento -> quando foi enviado

const smtpConfigurado = () => ['QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_USER', 'QRCODE_EMAIL_SMTP_TO']
    .every(v => process.env[v]?.trim());

const escaparHtml = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {string} evento    título (vai no assunto), ex.: '🔴 Desconectado'
 * @param {string} detalhes  texto livre (motivo, stack...)
 * @param {object} [o]
 * @param {boolean} [o.forcar] ignora o intervalo mínimo (crash, encerramento)
 */
async function alertarPorEmail(evento, detalhes = '', { forcar = false } = {}) {
    try {
        // Antes do banco carregar, getSetting devolve o padrão (on)
        if (!getSetting('email.alerts') || !smtpConfigurado()) return;

        const agora = Date.now();
        if (!forcar && agora - (ultimoAlertaEmail.get(evento) ?? 0) < ALERTA_EMAIL_INTERVALO_MS) {
            printInfo(`Alerta por e-mail '${evento}' não enviado: repetido em menos de 5 minutos.`);
            return;
        }
        ultimoAlertaEmail.set(evento, agora);

        const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const telefone = String(process.env.PHONE_NUMBER ?? '').split('@')[0].replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');
        const linhas = [
            ['📅 Quando', quando],
            ['📱 Número', telefone || '-'],
            ['🤖 Versão', packageJson.version],
            ['🖥️ Host', os.hostname()],
            ['⏱️ Processo no ar há', getBotUptime(BOT_START_TIME)],
            ['🛡️ Anti-Phishing Code', process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING || '-']
        ];

        await transporter.sendMail({
            from: process.env.QRCODE_EMAIL_SMTP_FROM,
            to: process.env.QRCODE_EMAIL_SMTP_TO,
            subject: `[ZapBot] ${evento}`,
            text: `${evento}\n\n${detalhes}\n\n${linhas.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
            html: `
                <h3>${escaparHtml(evento)}</h3>
                ${detalhes ? `<pre style="background:#f8f8f8;border:1px solid #ddd;padding:12px;white-space:pre-wrap;">${escaparHtml(detalhes)}</pre>` : ''}
                <table style="border-collapse:collapse;">
                    ${linhas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;"><strong>${escaparHtml(k)}</strong></td><td>${escaparHtml(v)}</td></tr>`).join('')}
                </table>
            `
        });

        printInfo(`Alerta por e-mail enviado: ${evento}`);
    } catch (err) {
        printError(`Alerta por e-mail '${evento}' falhou:`, err.message);
    }
}

// Espera o e-mail sair, mas não trava o encerramento se o SMTP não responder
const alertarAntesDeSair = (evento, detalhes, ms) => Promise.race([
    alertarPorEmail(evento, detalhes, { forcar: true }),
    new Promise(r => setTimeout(r, ms))
]);

/*
 * Crash: o Node já encerraria o processo numa exceção ou promise rejeitada sem
 * tratamento; aqui só avisamos antes. O Docker (restart: unless-stopped) sobe de novo.
 */
let encerrando = false;

async function encerrarPorCrash(tipo, err) {
    printError(`💥 ${tipo}:`, err);
    if (encerrando) return;
    encerrando = true;

    await alertarAntesDeSair('💥 Crash', `${tipo}\n\n${err?.stack || err}`, 10000);
    process.exit(1);
}

process.on('uncaughtException', err => encerrarPorCrash('uncaughtException', err));
process.on('unhandledRejection', err => encerrarPorCrash('unhandledRejection', err));

// docker stop / restart / Ctrl+C
for (const sinal of ['SIGTERM', 'SIGINT']) {
    process.on(sinal, async () => {
        if (encerrando) return;
        encerrando = true;

        printInfo(`🛑 ${sinal} recebido, encerrando.`);
        await alertarAntesDeSair('🛑 Bot encerrado', `Sinal ${sinal} (docker stop/restart ou Ctrl+C).`, 5000);
        process.exit(0);
    });
}

/*
 * Execução de processos externos (yt-dlp / ffmpeg)
 */
function runCommand(bin, args, logFd, timeoutMs = GET_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', logFd, logFd] });

        // Sem isto um download/conversão travado segura o /get (e o disco) para sempre
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (code === 0) return resolve();
            reject(new Error(signal === 'SIGKILL'
                ? `${bin} excedeu ${timeoutMs / 1000}s e foi interrompido`
                : `${bin} exited with code ${code}`));
        });
    });
}

function extractFirstUrl(text) {
    const m = String(text ?? '').match(/https?:\/\/[^\s"'<>]+/);
    return m ? m[0] : null;
}

function isValidHttpUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/*
 * Anti-SSRF do /get: o yt-dlp roda na rede do servidor, então uma URL como
 * http://192.168.0.1/ ou http://localhost:2375/ alcançaria a rede interna.
 * Recusamos hosts que resolvem para endereços privados/loopback/link-local.
 * (Não cobre redirects nem DNS rebinding feitos depois pelo yt-dlp.)
 */
const REDES_BLOQUEADAS = new net.BlockList();

for (const [rede, prefixo] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv4');
}

for (const [rede, prefixo] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv6');
}

function isEnderecoBloqueado(address) {
    // ::ffff:10.0.0.1 (IPv4 mapeado em IPv6) é checado como IPv4
    const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4) return REDES_BLOQUEADAS.check(v4, 'ipv4');

    return REDES_BLOQUEADAS.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

async function isUrlPublica(str) {
    const host = new URL(str).hostname.replace(/^\[|\]$/g, '');

    const enderecos = net.isIP(host)
        ? [{ address: host }]
        : await dns.lookup(host, { all: true }).catch(() => []);

    return enderecos.length > 0 && !enderecos.some(e => isEnderecoBloqueado(e.address));
}

function GetOptFromCommandForFfmpeg(opts, originalFile, outputFile) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const isAudio   = opts.opt.audio;    // -audio    | -a
    const startSec  = opts.opt.startSec; // -startSec | -ss
    const endSec    = opts.opt.endSec;   // -endSec   | -es
    // A entrada é um arquivo local baixado da internet: o ffmpeg não pode abrir
    // rede nem outros protocolos a partir dele (playlists/concat maliciosos)
    const args      = ['-y', '-protocol_whitelist', 'file'];

    if (startSec != null) {
        args.push('-ss', String(startSec));
    }

    if (isSticker) {
        args.push('-t', '6');
    } else if (startSec != null && endSec != null && Number(endSec) > Number(startSec)) {
        args.push('-t', String(Number(endSec) - Number(startSec)));
    }

    args.push('-i', originalFile);

    if (isAudio) {
        // Somente áudio
        args.push(
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            outputFile
        );
    } else if (isSticker) {
        // Sticker animado 512x512 enquadrado no meio do vídeo (como o /sticker):
        // escala até cobrir o quadrado e o crop (centralizado por padrão) corta as sobras
        args.push(
            '-vf',
            'fps=15,scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1',
            '-an',
            '-c:v', 'libx264',
            '-b:v', '500k',
            '-maxrate', '500k',
            '-bufsize', '1000k',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'baseline',
            '-movflags', '+faststart',
            outputFile
        );
    } else {
        // Vídeo normal
        args.push(
            '-c:v', 'libx264',
            '-b:v', '800k',
            '-maxrate', '800k',
            '-bufsize', '1600k',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'baseline',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            outputFile
        );
    }

    return args;
}

/*
 * Parser de opções estilo getopt
 */
function tokenizeCommand(input) {
    return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
        .map(m => m[1] ?? m[2] ?? m[3]);
}

function normalizeArg(arg) {
    // Corrige o typo comum: uol..com.br
    return arg.replace('..com.br', '.com.br');
}

function isOption(token) {
    return token.startsWith('-') && token.length > 1;
}

/*
 * Converte "-ss 10 -a https://..." em:
 *   { opt: { startSec: '10', audio: true, ..., argv: [...] }, argv: ['https://...'] }
 *
 * Opções com "values" vazios são booleanas; com values esperam um valor.
 * "-help" / "-h" são adicionados automaticamente a todo comando.
 * `given` guarda o nome canônico das opções informadas: distingue "-x" sem
 * valor (null, mas presente) de "-x" ausente (null).
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    // Mesmo array em result.argv e result.opt.argv
    const argv = [];
    const given = new Set();
    const result = { opt: { argv }, argv, given };

    const commandOptions = [
        { opts: ['help', 'h'], values: [], desc: 'Exibe ajuda.' },
        ...(config.cmd_opts ?? [])
    ];

    // alias -> definição canônica (ex.: ss -> startSec)
    const optionMap = new Map();

    for (const option of commandOptions) {
        if (!option.opts?.length) continue; // definições de argv posicional

        const canonicalName = option.opts[0];
        const expectedValues = (option.values ?? [])
            .filter(v => v != null && String(v).trim() !== '');
        const expectsValue = expectedValues.length > 0;

        result.opt[canonicalName] = expectsValue ? null : false;

        for (const alias of option.opts) {
            optionMap.set(alias, { ...option, canonicalName, expectedValues, expectsValue });
        }
    }

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Ignora o próprio comando (/get, /download...)
        if (i === 0 && token.startsWith('/')) continue;

        if (!isOption(token)) {
            argv.push(normalizeArg(token));
            continue;
        }

        const option = optionMap.get(token.slice(1));

        // Opção desconhecida vai para argv
        if (!option) {
            argv.push(normalizeArg(token));
            continue;
        }

        const { canonicalName } = option;
        given.add(canonicalName);

        if (!option.expectsValue) {
            result.opt[canonicalName] = true;
            continue;
        }

        if (option.expectedValues.length === 1) {
            const nextToken = tokens[i + 1];

            if (nextToken === undefined || isOption(nextToken)) {
                result.opt[canonicalName] = null;
                continue;
            }

            result.opt[canonicalName] = normalizeArg(nextToken);
            i++;
            continue;
        }

        // Opção com múltiplos valores
        const values = [];
        for (let x = 0; x < option.expectedValues.length; x++) {
            const nextToken = tokens[i + 1];
            if (nextToken === undefined || isOption(nextToken)) break;
            values.push(normalizeArg(nextToken));
            i++;
        }
        result.opt[canonicalName] = values;
    }

    return result;
}

/**
 * Formata a ajuda de um comando no estilo "command -help".
 * (Antes existiam duas funções quase idênticas; agora só esta.)
 */
function formatCommandHelp(command) {
    const lines = [`Usage: ${command.usage ?? command.cmd}`];

    if (command.help) lines.push(command.help);

    const cmdOpts = command.cmd_opts ?? [];
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            const opts = o.opts.filter(Boolean).map(opt => `-${opt}`).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc ?? '' };
        });

    const positional = cmdOpts
        .filter(o => o?.argv?.length)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc ?? '' }));

    // Uma única coluna para Options e Arguments ficarem alinhados
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));

    if (options.length) {
        lines.push('', 'Options:');
        options.forEach(o => lines.push(`  ${o.syntax.padEnd(width)}  ${o.desc}`));
    }

    if (positional.length) {
        lines.push('', 'Arguments:');
        positional.forEach(a => lines.push(`  ${a.syntax.padEnd(width)}  ${a.desc}`));
    }

    if (command.aliases?.length) {
        lines.push('', `Aliases: ${command.aliases.join(', ')}`);
    }

    return lines.join('\n');
}

function getCommandSyntax(cmd) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command) : null;
}

/*
 * Utilitários de cache
 */
function getDirSize(dir) {
    let total = 0;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        total += entry.isDirectory() ? getDirSize(fullPath) : fs.statSync(fullPath).size;
    }

    return total;
}

function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function listCacheLevelOnly(dir = CACHE_DIR) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    if (!entries.length) return 'Diretório vazio.\n';

    let totalBytes = 0;

    const rows = entries.map((entry, index) => {
        const fullPath = path.join(dir, entry.name);
        const branch = index === entries.length - 1 ? '└── ' : '├── ';
        const sizeBytes = entry.isDirectory() ? getDirSize(fullPath) : fs.statSync(fullPath).size;

        totalBytes += sizeBytes;

        return {
            name: entry.isDirectory() ? `${branch}📁 ${entry.name}/` : `${branch}${entry.name}`,
            size: humanSize(sizeBytes)
        };
    });

    const maxName = Math.max(...rows.map(r => r.name.length));

    let output = rows
        .map(r => `${r.name.padEnd(maxName)}  ${r.size.padStart(10)}`)
        .join('\n');

    output += '\n';
    output += `${''.padEnd(maxName, '─')} ${'─'.repeat(12)}\n`;
    output += `${'Total:'.padEnd(maxName)}  ${humanSize(totalBytes).padStart(10)}`;

    return output;
}

// Pasta cache/media/ano/mes/dia
function obterPastaMidia() {
    const agora = new Date();
    const pastaDestino = path.join(
        MEDIA_DIR,
        String(agora.getFullYear()),
        String(agora.getMonth() + 1).padStart(2, '0'),
        String(agora.getDate()).padStart(2, '0')
    );

    fs.mkdirSync(pastaDestino, { recursive: true });
    return pastaDestino;
}

/*
 * O id e o mimetype da mensagem vêm do cliente de quem enviou: um cliente
 * modificado pode mandar "../../app/app" como id. Só letras, números, _ e -.
 */
const nomeSeguro = (valor, padrao) => String(valor ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || padrao;

// true se `arquivo` está dentro de MEDIA_DIR (vale também para caminhos já gravados no banco)
function isCaminhoDeMidia(arquivo) {
    if (!arquivo) return false;
    const relativo = path.relative(MEDIA_DIR, path.resolve(arquivo));
    return relativo !== '' && !relativo.startsWith('..') && !path.isAbsolute(relativo);
}

/*
 * Limpeza do banco + mídias:
 *  - mensagens normais: removidas após a janela de "apagar para todos" (68h),
 *    porque depois disso não podem mais ser apagadas;
 *  - mensagens APAGADAS (revoked=1): guardadas por 'cache.revokedRetentionDays' (padrão 30),
 *    para o /show continuar funcionando.
 * Com o /cache -clean -force, as duas janelas são 0 e tudo é removido.
 */
async function limparCacheAntigo(maxDeleteWin = MAX_DELETE_WINDOW, retencaoApagadas = getSetting('cache.revokedRetentionDays') * DAY_MS) {
    await dbPronto;

    const agora = Date.now();
    const filtro = `
        (revoked = 0 AND timestamp < ?)
        OR (revoked = 1 AND COALESCE(revoked_at, timestamp) < ?)
    `;
    const params = [agora - maxDeleteWin, agora - retencaoApagadas];

    try {
        const rows = await dbAll(`SELECT media_path FROM messages WHERE media_path IS NOT NULL AND (${filtro})`, params);

        for (const row of rows) {
            if (isCaminhoDeMidia(row.media_path) && fs.existsSync(row.media_path)) {
                printInfo(`Removendo ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }

        const res = await dbRun(`DELETE FROM messages WHERE ${filtro}`, params);
        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} registros antigos limpos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do cache:', err.message);
    }
}

/*
 * Limpeza geral (/cache -c -f): TODAS as mensagens (inclusive as apagadas
 * guardadas para o /show e as editadas do /edit), todas as mídias e todos os temporários.
 * No fim, VACUUM devolve o espaço ao disco: DELETE sozinho não encolhe o .db.
 * Não mexe em monitored_numbers, presence_logs nem watch_hits (configuração e histórico).
 */
async function limparTudo() {
    await dbPronto;

    const bytesAntes = getDirSize(CACHE_DIR);
    const { total, apagadas } = await dbGet(
        'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
    );

    const { editadas } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');

    await dbRun('DELETE FROM messages');
    await dbRun('DELETE FROM message_edits');
    limparConteudoDiretorio(MEDIA_DIR);
    limparConteudoDiretorio(TMP_DIR);
    await dbRun('VACUUM');

    return { total, apagadas, editadas, liberado: Math.max(0, bytesAntes - getDirSize(CACHE_DIR)) };
}

// Edições mais antigas que 'cache.editedRetentionDays'
async function limparEditadasAntigas() {
    await dbPronto;

    try {
        const res = await dbRun('DELETE FROM message_edits WHERE edited_at < ?',
            [Date.now() - getSetting('cache.editedRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} edições antigas removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza das editadas:', err.message);
    }
}

// Contadores do /stats mais antigos que 'stats.retentionDays'
async function limparStatsAntigas() {
    await dbPronto;

    try {
        const { day } = diaEHora(Date.now() - getSetting('stats.retentionDays') * DAY_MS);
        const res = await dbRun('DELETE FROM stats WHERE day < ?', [day]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} contadores antigos do /stats removidos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do /stats:', err.message);
    }
}

// Ocorrências do /watch mais antigas que 'watch.hitsRetentionDays'
async function limparWatchAntigo() {
    await dbPronto;

    try {
        const res = await dbRun('DELETE FROM watch_hits WHERE timestamp < ?',
            [Date.now() - getSetting('watch.hitsRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} ocorrências antigas do /watch removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza do /watch:', err.message);
    }
}

function limparConteudoDiretorio(dirPath) {
    if (!fs.existsSync(dirPath)) {
        printInfo(`Diretório não existe: ${dirPath}`);
        return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        fs.rmSync(path.join(dirPath, entry.name), { recursive: true, force: true });
    }

    printInfo(`Conteúdo de ${dirPath} removido (${entries.length} itens).`);
}

async function limparArquivosAntigos(dir = TMP_DIR, maxAgeHours = 2) {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    try {
        for (const file of await fs.readdir(dir)) {
            const fullPath = path.join(dir, file);

            try {
                const stat = await fs.stat(fullPath);
                if (!stat.isFile()) continue;

                if (now - stat.mtimeMs > maxAgeMs) {
                    await fs.unlink(fullPath);
                    printInfo(`[cleanup] Deleted: ${fullPath}`);
                }
            } catch (err) {
                printError(`[cleanup] Error processing ${fullPath}:`, err.message);
            }
        }
    } catch (err) {
        printError(`[cleanup] Error reading directory ${dir}:`, err.message);
    }
}

/*
 * Limpeza periódica. Antes rodava a CADA mensagem recebida
 * (um DELETE no SQLite + varredura de pasta por mensagem).
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function rodarLimpeza() {
    limparCacheAntigo();
    limparArquivosAntigos();
    limparWatchAntigo();
    limparEditadasAntigas();
    limparStatsAntigas();
}

// Primeira execução adiada: no primeiro boot as tabelas ainda estão sendo criadas.
setTimeout(rodarLimpeza, 60 * 1000);
setInterval(rodarLimpeza, CLEANUP_INTERVAL_MS);

/*
 * Utilitários de contato
 */
function messageToSelf(message) {
    return client.sendMessage(process.env.PHONE_NUMBER, message)
        .catch(err => printError('messageToSelf falhou:', err.message));
}

function normalizerPhoneNumber(phoneNumber) {
    return String(phoneNumber ?? '').replace(/\D/g, '');
}

function isPhoneNumber(value) {
    const digits = normalizerPhoneNumber(value);
    return digits.length >= 10 && digits.length <= 13;
}

function normalizeWid(wid) {
    if (!wid) return null;
    return `${wid.split('@')[0].split(':')[0]}@c.us`;
}

/**
 * Remove o identificador de dispositivo (:1, :93 etc.)
 * sem alterar o servidor original: @lid continua @lid.
 */
function removeDeviceSuffix(jid) {
    if (!jid || typeof jid !== 'string') return null;

    const atIndex = jid.indexOf('@');
    if (atIndex === -1) return jid;

    const userPart = jid.substring(0, atIndex).split(':')[0];
    const serverPart = jid.substring(atIndex + 1);

    return `${userPart}@${serverPart}`;
}

const lidPhoneCache = new Map();

/**
 * Converte um identificador @lid para o telefone real @c.us.
 */
async function resolveLidToPhone(lidJid) {
    const normalizedLid = removeDeviceSuffix(lidJid);

    if (!normalizedLid?.endsWith('@lid')) return normalizedLid;
    if (lidPhoneCache.has(normalizedLid)) return lidPhoneCache.get(normalizedLid);

    try {
        const result = await client.getContactLidAndPhone([normalizedLid]);

        const mapping = Array.isArray(result)
            ? result.find(item => removeDeviceSuffix(item?.lid) === normalizedLid)
            : null;

        let phoneJid = mapping?.pn || null;

        if (phoneJid && !phoneJid.includes('@')) {
            phoneJid = `${phoneJid}@c.us`;
        }

        phoneJid = removeDeviceSuffix(phoneJid);

        if (phoneJid?.endsWith('@c.us')) {
            lidPhoneCache.set(normalizedLid, phoneJid);
            return phoneJid;
        }

        return null;
    } catch (error) {
        printError('[LID] Falha ao converter LID para telefone:', normalizedLid, error?.message || String(error));
        return null;
    }
}

/*
 * Nome real de um grupo (chatId @g.us -> assunto do grupo).
 * O msg._data.chat nem sempre vem preenchido (ou vem com dados de outro chat),
 * então buscamos o chat pelo id. Cache curto: o assunto do grupo pode mudar.
 */
const GROUP_NAME_TTL_MS = 10 * 60 * 1000;
const groupNameCache = new Map();

async function resolverNomeDoGrupo(chatId) {
    if (!chatId?.endsWith('@g.us')) return null;

    const cache = groupNameCache.get(chatId);
    if (cache && Date.now() - cache.at < GROUP_NAME_TTL_MS) return cache.name;

    const chat = await client.getChatById(chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] getChatById falhou para ${chatId}: ${err?.message || err}`);
        return null;
    });

    // getChatById monta o modelo completo do grupo e quebra para alguns grupos (@lid);
    // nesse caso lemos o assunto direto das coleções do WhatsApp Web.
    const name =
        chat?.name ||
        chat?.groupMetadata?.subject ||
        (await nomeDoGrupoNoStore(chatId)) ||
        null;

    if (name) groupNameCache.set(chatId, { name, at: Date.now() });
    return name;
}

async function nomeDoGrupoNoStore(chatId) {
    if (!client.pupPage) return null;

    return client.pupPage.evaluate((id) => {
        const { Chat, GroupMetadata } = window.require('WAWebCollections');
        const wid = window.require('WAWebWidFactory').createWid(id);
        const chat = Chat.get(wid);

        return GroupMetadata?.get(wid)?.subject || chat?.name || chat?.formattedTitle || null;
    }, chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] Store sem o grupo ${chatId}: ${err?.message || err}`);
        return null;
    });
}

/*
 * Troca as menções cruas do texto (@111780869222483, que pode ser LID ou telefone)
 * pelo nome do contato: "@111780869222483" -> "@Fulano".
 * mentionedIds (da mensagem) ajuda a saber se o número é @lid ou @c.us;
 * sem ele (ocorrências antigas) tentamos os dois.
 */
const mentionNameCache = new Map();

async function nomeDaMencao(user, mentionedIds = []) {
    if (mentionNameCache.has(user)) return mentionNameCache.get(user);

    const candidatos = mentionedIds
        .map(m => removeDeviceSuffix(typeof m === 'string' ? m : m?._serialized))
        .filter(jid => jid?.split('@')[0] === user);

    if (!candidatos.length) candidatos.push(`${user}@lid`, `${user}@c.us`);

    let nome = null;

    for (const jid of candidatos) {
        // Para um @lid, o contato pelo telefone real costuma ter o nome salvo na agenda
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : null;

        for (const id of [phoneJid, jid].filter(Boolean)) {
            const contact = await client.getContactById(id).catch(() => null);
            nome = contact?.name || contact?.pushname || contact?.verifiedName || null;
            if (nome) break;
        }

        if (!nome && phoneJid) nome = `+${phoneJid.split('@')[0]}`;
        if (nome) break;
    }

    if (nome) mentionNameCache.set(user, nome);
    return nome;
}

async function resolverMencoes(texto, mentionedIds = []) {
    texto = String(texto ?? '');
    const users = [...new Set([...texto.matchAll(/@(\d{6,})/g)].map(m => m[1]))];

    for (const user of users) {
        const nome = await nomeDaMencao(user, mentionedIds);
        if (nome) texto = texto.replaceAll(`@${user}`, `@${nome}`);
    }

    return texto;
}

/*
 * main()
 */
const banner = `
*          ____ ____ _____
|_        /_  // __ \`/ __ \\
(O) [@@]   / // /_/ / /_/ /
|#|/|__|\\ /___\\__,_/ .___/
'-' d  b          /_/
`;
console.log(colors.rainbow(banner));
printInfo('🤖 Starting ZapBot...');

const client = new Client({
    authStrategy: new LocalAuth(),

    webVersion: '2.3000.1023151854-alpha',

    /*
     * Sem cache remoto: o HTML de um repo de terceiros (branch main) rodaria na
     * origem web.whatsapp.com, com acesso à sessão. O WhatsApp Web é carregado
     * direto do site oficial.
     */
    webVersionCache: { type: 'none' },

    puppeteer: {
        headless: true,
        // No Windows, remova executablePath e args.
        executablePath: '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

printSuccess('Client created');

/*
 * Mensagens enviadas pelo próprio bot também disparam 'message_create' com
 * fromMe=true. Sem esta marca, uma resposta que começasse com "/" (ex.: o
 * /noffa ecoando "/cache -c -f") rodaria como comando do dono.
 *
 * msg.reply() também passa por client.sendMessage(). O texto é registrado
 * ANTES do envio porque o evento pode chegar antes do sendMessage resolver.
 */
const ENVIADAS_TTL_MS = 60 * 1000;
const enviadasPeloBot = new Map(); // texto -> [expira em, ...]

function textoDoEnvio(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.description ?? null;
}

function marcarEnviadaPeloBot(texto) {
    texto = String(texto ?? '').trim();
    if (!texto.startsWith('/')) return; // só o que poderia virar comando

    const agora = Date.now();
    const validas = (enviadasPeloBot.get(texto) ?? []).filter(t => t > agora);
    enviadasPeloBot.set(texto, [...validas, agora + ENVIADAS_TTL_MS]);
}

// Consome a marca: true se esta mensagem foi enviada pelo bot
function foiEnviadaPeloBot(texto) {
    texto = String(texto ?? '').trim();

    const agora = Date.now();
    const validas = (enviadasPeloBot.get(texto) ?? []).filter(t => t > agora);
    if (!validas.length) {
        enviadasPeloBot.delete(texto);
        return false;
    }

    validas.shift();
    if (validas.length) enviadasPeloBot.set(texto, validas);
    else enviadasPeloBot.delete(texto);
    return true;
}

/*
 * /stats: as respostas do bot saem pela sua conta e voltam no 'message_create'
 * como suas. Cada envio deixa uma marca no chat; a próxima mensagem sua ali
 * consome a marca e não é contada.
 */
const enviosDoBotPorChat = new Map(); // chatId -> [expira em, ...]

function marcarEnvioDoBot(chatId) {
    const agora = Date.now();
    const validas = (enviosDoBotPorChat.get(chatId) ?? []).filter(t => t > agora);
    enviosDoBotPorChat.set(chatId, [...validas, agora + ENVIADAS_TTL_MS]);
}

function consumirEnvioDoBot(chatId) {
    const agora = Date.now();
    const validas = (enviosDoBotPorChat.get(chatId) ?? []).filter(t => t > agora);
    const achou = validas.length > 0;

    validas.shift();
    if (validas.length) enviosDoBotPorChat.set(chatId, validas);
    else enviosDoBotPorChat.delete(chatId);
    return achou;
}

const sendMessageOriginal = client.sendMessage.bind(client);

client.sendMessage = (chatId, content, options = {}) => {
    marcarEnviadaPeloBot(textoDoEnvio(content, options));
    marcarEnvioDoBot(chatId);
    return sendMessageOriginal(chatId, content, options);
};

// Marcas que nunca viraram 'message_create' (envio falhou) expiram aqui
setInterval(() => {
    const agora = Date.now();
    for (const [texto, expiracoes] of enviadasPeloBot) {
        if (!expiracoes.some(t => t > agora)) enviadasPeloBot.delete(texto);
    }
    for (const [chatId, expiracoes] of enviosDoBotPorChat) {
        if (!expiracoes.some(t => t > agora)) enviosDoBotPorChat.delete(chatId);
    }
}, ENVIADAS_TTL_MS);

/*
 * Estado da conexão + reinício com trava.
 * Antes, watchdog, 'disconnected' e iniciarBot() podiam reiniciar o cliente
 * ao mesmo tempo, corrompendo a sessão e gerando QR Codes após a autenticação.
 */
let isReady = false;
let isRestarting = false;
let lastDisconnectReason = null;

// Motivos em que reiniciar não resolve: exigem ação manual.
const NAO_REINICIAR = new Set(['LOGOUT', 'CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE']);

async function restartClient(motivo) {
    if (isRestarting) {
        printInfo(`Restart ignorado (já em andamento). Motivo: ${motivo}`);
        return;
    }

    isRestarting = true;
    isReady = false;
    printInfo(`♻️ Reiniciando cliente. Motivo: ${motivo}`);

    try {
        await client.destroy();
    } catch (e) {
        printError('destroy falhou:', e.message);
    }

    await new Promise(r => setTimeout(r, 5000));

    try {
        await client.initialize();
    } catch (e) {
        printError('initialize falhou:', e.message);
        alertarPorEmail('❌ Falha ao reiniciar', `Motivo do reinício: ${motivo}\ninitialize falhou: ${e.message}`);
    } finally {
        isRestarting = false;
    }
}

// Health check: só depois que o cliente ficou pronto
setInterval(async () => {
    if (!isReady || isRestarting) return;

    try {
        await client.getState();
    } catch {
        printInfo('Healthcheck falhou');
    }
}, 30000);

// Watchdog: só vigia um cliente que já esteve pronto e não está reiniciando
setInterval(async () => {
    if (!isReady || isRestarting) return;

    if (!client.pupBrowser?.isConnected()) {
        alertarPorEmail('♻️ Browser caiu', 'O Chromium desconectou; o watchdog está reiniciando o cliente.');
        await restartClient('browser desconectado (watchdog)');
    }
}, 30000);

/*
 * QR Code
 */
let lastQrSent = null;
let qrEmailSending = false;
let qrEmailCounter = 0;

client.on('qr', async (qr) => {
    const currentdatetimeday =
        new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false }) + ' BRT';

    const emailEnabled = String(process.env.QRCODE_EMAIL_ENABLE).trim().toLowerCase() === 'true';

    printInfo(`[QR] PID=${process.pid} emailEnabled=${emailEnabled}`);

    // Diagnóstico: QR depois de já ter autenticado indica sessão perdida.
    if (BOT_AUTHENTICATED_TIME > 0 || lastDisconnectReason) {
        printError(
            '⚠️ QR recebido APÓS autenticação.',
            `lastDisconnect=${lastDisconnectReason} restarting=${isRestarting} ready=${isReady}`
        );
        alertarPorEmail('🔑 Sessão perdida: novo QR Code',
            `O WhatsApp pediu um novo QR Code depois de já ter autenticado (último motivo: ${lastDisconnectReason ?? '-'}).\n` +
            'Leia o QR Code no terminal (docker logs) ou no e-mail do QR Code, se QRCODE_EMAIL_ENABLE=true.');
    }

    if (!emailEnabled) {
        printInfo(`QR Code received at (${currentdatetimeday}), scan it please`);
        qrcodeTerminal.generate(qr, { small: true });
        return;
    }

    // Ignora o mesmo QR já enviado e envios simultâneos
    if (qr === lastQrSent || qrEmailSending) return;

    qrEmailSending = true;

    try {
        const myantiphishing = process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING;
        const pngBuffer = await qrcode.toBuffer(qr, { type: 'png', width: 300 });
        const phoneNumber = process.env.PHONE_NUMBER.split('@')[0];
        const maskPhone = phoneNumber.replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');

        // O contador real só é atualizado após sucesso no SMTP
        const nextQrEmailCounter = qrEmailCounter + 1;

        const info = await transporter.sendMail({
            from: process.env.QRCODE_EMAIL_SMTP_FROM,
            to: process.env.QRCODE_EMAIL_SMTP_TO,
            subject: '[ZapBot] WhatsApp QR Code Authentication',
            html: `
                <table width="50%" style="background:#f8f8f8;border:1px solid #dddddd;border-radius:5px;">
                    <tr>
                        <td style="padding:12px;">
                            <strong>🔢 QR Code:</strong>
                            <span style="color:#d9534f;font-weight:bold;">#${nextQrEmailCounter}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📱 Phone Number:</strong>
                            <span style="color:#d9534f;font-weight:bold;">${maskPhone}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>🛡️ Anti-Phishing Code:</strong>
                            <span style="color:#d9534f;font-weight:bold;">${myantiphishing}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📅 Generated At:</strong>
                            <span style="color:#000000;font-weight:bold;">${currentdatetimeday}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;">
                            <strong>⚠️ Atenção:</strong>
                            Este QR Code substitui qualquer QR Code enviado anteriormente.
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📱 Escaneie o QR:</strong>
                            <br><br>
                            <img src="cid:qrcode">
                        </td>
                    </tr>
                </table>
            `,
            attachments: [
                {
                    filename: `qrcode-${nextQrEmailCounter}.png`,
                    content: pngBuffer,
                    cid: 'qrcode'
                }
            ]
        });

        lastQrSent = qr;
        qrEmailCounter = nextQrEmailCounter;

        printInfo(
            `QR Code #${qrEmailCounter} received at (${currentdatetimeday}) ` +
            `and sent to '${process.env.QRCODE_EMAIL_SMTP_TO}' (messageId=${info.messageId})`
        );
    } catch (err) {
        printError('Erro ao enviar QR por email:', err);
    } finally {
        qrEmailSending = false;
    }
});

/*
 * Eventos de conexão
 */
client.on('authenticated', () => {
    printSuccess('🔐 Whatsapp authentication success!');
    BOT_AUTHENTICATED_TIME = Date.now();

    if (!isDebugMode()) return;

    const page = client.pupPage;

    if (!page) {
        printDebug('[WA] pupPage ainda não disponível');
        return;
    }

    page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('[BROWSER PAGE ERROR]', err));
    page.on('error', err => console.error('[BROWSER ERROR]', err));
    page.on('requestfailed', request => {
        console.error('[BROWSER REQUEST FAILED]', request.url(), request.failure()?.errorText);
    });

    setTimeout(async () => {
        try {
            const debug = await client.pupPage.evaluate(() => ({
                href: location.href,
                title: document.title,
                readyState: document.readyState,
                WWebJS: typeof window.WWebJS,
                Store: typeof window.Store,
                AuthStore: typeof window.AuthStore,
                requireExists: typeof window.require,
                webpackChunk: typeof window.webpackChunkwhatsapp_web_client
            }));

            console.log('[WA DEBUG]', debug);
        } catch (err) {
            console.error('[WA DEBUG ERROR]', err);
        }
    }, 5000);
});

client.on('disconnected', async (reason) => {
    isReady = false;
    BOT_AUTHENTICATED_TIME = 0;
    lastDisconnectReason = reason;
    printInfo(`💥 WhatsApp desconectou: ${reason}`);

    if (NAO_REINICIAR.has(String(reason))) {
        printError(`Motivo '${reason}' exige ação manual (outra instância ou sessão revogada). Não vou reiniciar em loop.`);
        alertarPorEmail('🔴 Desconectado (ação manual)',
            `Motivo: ${reason}\nO bot NÃO vai reiniciar sozinho: outra instância abriu a sessão ou ela foi revogada no celular.`);
        return;
    }

    alertarPorEmail('🔴 Desconectado', `Motivo: ${reason}\nO cliente será reiniciado automaticamente.`);

    await restartClient(`disconnected: ${reason}`);
});

client.on('loading_screen', (percent, message) => {
    printInfo(`[WA] loading_screen: ${percent}% - ${message}`);
});

client.on('auth_failure', msg => {
    printError('[WA] auth_failure:', msg);
    alertarPorEmail('⛔ Falha de autenticação', `auth_failure: ${msg}`);
});

// Estados em que o WhatsApp Web parou de funcionar para esta sessão
const ESTADOS_PROBLEMA = new Set(['CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE', 'DEPRECATED_VERSION', 'PROXYBLOCK', 'SMB_TOS_BLOCK', 'TOS_BLOCK', 'UNLAUNCHED']);

client.on('change_state', state => {
    printInfo(`[WA STATE]=${state}`);
    if (ESTADOS_PROBLEMA.has(state)) alertarPorEmail(`⚠️ Estado do WhatsApp: ${state}`, `O WhatsApp Web mudou para o estado ${state}.`);
});

let jaFicouPronto = false;

client.on('ready', async () => {
    isReady = true;
    const motivoDaQueda = lastDisconnectReason;
    lastDisconnectReason = null;

    // Os settings vêm do banco: avisa já no boot se o bot está desligado ou em modo admin
    await dbPronto;
    const listaAvisos = [
        getSetting('bot.paused') && 'Bot desligado: use /bot -on para ativar os comandos.',
        getSetting('bot.adminMode') && 'Modo admin ligado: só você usa comandos (/bot -admin desliga).'
    ].filter(Boolean);
    const avisos = listaAvisos.map(a => ` ${a}`).join('');

    printSuccess(`🤖 ZapBot ${packageJson.version} inicializado! Informando ${process.env.PHONE_NUMBER}`);
    messageToSelf(`🤖 ZapBot ${packageJson.version} inicializado.${avisos}`);

    alertarPorEmail(jaFicouPronto ? '🔄 Reconectado' : '🟢 Bot iniciado',
        [jaFicouPronto ? `Conectado de novo${motivoDaQueda ? ` (a queda foi: ${motivoDaQueda})` : ''}.` : 'Conectado ao WhatsApp.',
         ...listaAvisos].join('\n'));
    jaFicouPronto = true;
});

/*
 * Presença dos números monitorados
 */
client.on('presence_update', async (presence) => {
    // Sem o /monitor carregado, números já cadastrados não geram avisos
    if (!findCommand('/monitor')) return;
    if (!presence?.id) return;

    const myid = process.env.PHONE_NUMBER;

    try {
        const rawId = presence.id._serialized || presence.id;
        const number = rawId.split('@')[0].split(':')[0];
        const currentStatus = presence.status || (presence.type === 'available' ? 'available' : 'unavailable');

        // Antes isto mandava uma mensagem no WhatsApp para CADA evento de presença.
        if (isDebugMode()) {
            printDebug(`[Presence] ${number} -> ${currentStatus}`, presence);
        }

        if (currentStatus !== 'available') return;

        const row = await dbGet('SELECT phone_number FROM monitored_numbers WHERE phone_number = ?', [number]);
        if (!row) return;

        const contact = await client.getContactById(normalizeWid(rawId)).catch(() => null);
        const displayName = contact?.pushname || contact?.name || number;

        await dbRun(
            'INSERT INTO presence_logs (phone_number, display_name, status) VALUES (?, ?, ?)',
            [number, displayName, currentStatus]
        );

        if (myid) {
            await client.sendMessage(myid, `🔔 *${displayName}* (${number}) acabou de ficar online.`);
            printSuccess(`Notificação enviada e salva no banco para: ${number}`);
        }
    } catch (error) {
        printError('Erro controlado no evento de presença:', error.message);
    }
});

/*
 * Contadores do /stats
 */

// Dia (AAAA-MM-DD) e hora (0-23) no fuso de São Paulo
function diaEHora(ms) {
    const s = new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false });
    return { day: s.slice(0, 10), hour: Number(s.slice(11, 13)) % 24 };
}

/**
 * Soma 1 no contador do remetente (msgs, media, deleted ou edited).
 * @param {object} c { chatId, chatName, isGroup, senderId, senderName, quando (ms), campos: {msgs, media, deleted, edited} }
 */
async function contarStats({ chatId, chatName, isGroup, senderId, senderName, quando = Date.now(), campos }) {
    if (!getSetting('stats.enabled')) return;
    if (!chatId || chatId === 'status@broadcast' || !senderId) return;
    // O seu privado recebe os alertas do bot: não é conversa
    if (chatId === client.info?.wid?._serialized) return;

    const { day, hour } = diaEHora(quando);
    const v = { msgs: 0, media: 0, deleted: 0, edited: 0, ...campos };

    await dbRun(
        `INSERT INTO stats (chat_id, chat_name, is_group, day, hour, sender_id, sender_name, msgs, media, deleted, edited)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (chat_id, day, hour, sender_id) DO UPDATE SET
            chat_name   = COALESCE(excluded.chat_name, stats.chat_name),
            sender_name = COALESCE(excluded.sender_name, stats.sender_name),
            msgs        = stats.msgs + excluded.msgs,
            media       = stats.media + excluded.media,
            deleted     = stats.deleted + excluded.deleted,
            edited      = stats.edited + excluded.edited`,
        [chatId, chatName, isGroup ? 1 : 0, day, hour, senderId, senderName, v.msgs, v.media, v.deleted, v.edited]
    ).catch(err => printError('/stats: erro ao contar:', err.message));
}

/*
 * Recuperação de mensagens apagadas
 *
 * O mesmo renderizador é usado em dois lugares:
 *  - evento 'message_revoke_everyone' → envia para você mesmo, na hora;
 *  - comando /show                    → reenvia no chat atual, sob demanda.
 */

// Timestamp salvo em segundos (WhatsApp) ou milissegundos (Date.now())
function paraMs(valor) {
    const n = Number(valor);
    return n < 10_000_000_000 ? n * 1000 : n;
}

function formatarData(valor) {
    return new Date(paraMs(valor)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Status (stories) chegam pelo chat 'status@broadcast'
const isStatus = (row) => row.chat_id === 'status@broadcast';

/**
 * Descobre nome do chat e do remetente de uma mensagem apagada.
 * Com os objetos do evento (after/before) consegue nomes mais precisos;
 * sem eles (/show) usa o que foi gravado no banco.
 */
async function resolverAutorApagada(row, { after, before, protocolKey } = {}) {
    let nomeChat = row.chat_name || 'Conversa desconhecida';
    let nomeRemetente = row.sender_name || 'Desconhecido';
    let numeroRemetente = row.sender_number || null;

    // Nome real do chat onde a exclusão aconteceu
    if (after) {
        try {
            const chat = await after.getChat();
            if (chat?.name) nomeChat = chat.name;
        } catch (chatError) {
            printError('[Revoke] Não foi possível recuperar o chat:', chatError.message);
        }
    }

    // Remetente pela mensagem original, quando disponível
    if (before) {
        try {
            const contato = await before.getContact();

            nomeRemetente = contato.pushname || contato.name || contato.shortName || nomeRemetente;

            const contatoId = contato.id?._serialized || '';

            if (contatoId.endsWith('@c.us')) {
                numeroRemetente = contatoId.split('@')[0];
            } else if (contato.number) {
                numeroRemetente = contato.number;
            }
        } catch (contactError) {
            printError('[Revoke] Não foi possível recuperar o contato original:', contactError.message);
        }
    }

    // Converte @lid para telefone real, se possível
    const senderId = before?.author || protocolKey?.participant;

    if (senderId?.endsWith('@lid')) {
        const phoneId = await resolveLidToPhone(senderId);

        if (phoneId) {
            numeroRemetente = phoneId.replace('@c.us', '').replace(/\D/g, '');

            const contato = await client.getContactById(phoneId).catch(() => null);
            nomeRemetente = contato?.pushname || contato?.name || contato?.shortName || nomeRemetente;
        }
    }

    return { nomeChat, nomeRemetente, numeroRemetente };
}

/**
 * Envia uma mensagem apagada (texto, mídia, localização ou contato) para `destino`.
 *
 * @param {string} destino              chat que vai receber
 * @param {object} row                  linha da tabela messages
 * @param {object} info                 { nomeChat, nomeRemetente, numeroRemetente }
 * @param {object} [opcoes]
 * @param {string} [opcoes.titulo]      primeira linha do alerta
 * @param {string[]} [opcoes.extras]    linhas extras após "Enviada em"
 */
async function enviarMensagemApagada(destino, row, info, { titulo = '❌ *MENSAGEM APAGADA DETECTADA*', extras = [] } = {}) {
    let alertaTexto = `${titulo}\n\n`;

    if (row.is_group === 1) {
        alertaTexto += `👥 *Grupo:* ${info.nomeChat}\n`;
    }

    alertaTexto +=
        `👤 *Nome:* ${info.nomeRemetente}\n` +
        `📱 *Número:* ${info.numeroRemetente ? `+${info.numeroRemetente}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(row.timestamp)}\n`;

    for (const linha of extras) {
        alertaTexto += `${linha}\n`;
    }

    // Localização
    if (row.type === 'location' && row.location_lat !== null && row.location_lng !== null) {
        const latitude = Number(row.location_lat);
        const longitude = Number(row.location_lng);

        alertaTexto +=
            '🗺️ *Tipo:* LOCALIZAÇÃO\n' +
            `🔗 *Link do mapa:* https://www.google.com/maps?q=${latitude},${longitude}`;

        await client.sendMessage(destino, alertaTexto);
        await client.sendMessage(destino, new Location(latitude, longitude, row.body || 'Localização compartilhada'));
        return;
    }

    // Contato / vCard
    if (['vcard', 'contact', 'multi_vcard'].includes(row.type)) {
        alertaTexto +=
            '📇 *Tipo:* CARTÃO DE CONTATO\n' +
            '💡 *Nota:* O contato está anexado abaixo.';

        // O body vem de quem enviou: só vai cru se for mesmo um vCard (nunca um texto como "/cache -c -f")
        if (!row.body || /^BEGIN:VCARD/i.test(row.body.trim())) {
            await client.sendMessage(destino, alertaTexto);
            if (row.body) await client.sendMessage(destino, row.body, { parseVCards: true });
        } else {
            await client.sendMessage(destino, `${alertaTexto}\n💬 *Conteúdo:* "${row.body}"`);
        }
        return;
    }

    // Arquivo físico
    if (row.has_media && isCaminhoDeMidia(row.media_path) && fs.existsSync(row.media_path)) {
        const mediaAnexo = MessageMedia.fromFilePath(row.media_path);
        const mimetype = mediaAnexo.mimetype || '';
        const legenda = row.body || 'Sem texto';

        if (row.type === 'audio' || row.type === 'ptt' || mimetype.startsWith('audio/')) {
            alertaTexto += '🎵 *Tipo:* ÁUDIO / NOTA DE VOZ';

            await client.sendMessage(destino, alertaTexto);
            await client.sendMessage(destino, mediaAnexo, { sendAudioAsVoice: true });
            return;
        }

        if (row.type === 'video' || row.type === 'image' || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
            alertaTexto +=
                `🎬 *Tipo:* ${String(row.type).toUpperCase()}\n` +
                `💬 *Legenda:* "${legenda}"`;

            await client.sendMessage(destino, mediaAnexo, { caption: alertaTexto });
            return;
        }

        alertaTexto +=
            '📄 *Tipo:* DOCUMENTO\n' +
            `💬 *Legenda:* "${legenda}"`;

        await client.sendMessage(destino, mediaAnexo, { caption: alertaTexto, sendMediaAsDocument: true });
        return;
    }

    // Mídia que existia mas o arquivo já não está no disco
    if (row.has_media) {
        alertaTexto += `📎 *Tipo:* ${String(row.type).toUpperCase()} _(arquivo não disponível no cache)_\n`;
    }

    // Texto
    alertaTexto += `💬 *Texto:* "${row.body || 'Mensagem sem conteúdo'}"`;

    await client.sendMessage(destino, alertaTexto, { linkPreview: true });
}

client.on('message_revoke_everyone', async (after, before) => {
    const protocolKey = after._data?.protocolMessageKey;
    const targetId = protocolKey?.id || before?.id?.id || after?.id?.id;

    if (!targetId) {
        printError('[Revoke] Não foi possível identificar a mensagem apagada.');
        return;
    }

    let row;
    try {
        await dbPronto;
        row = await dbGet('SELECT * FROM messages WHERE id = ?', [targetId]);
    } catch (err) {
        printError('[Revoke] Erro ao consultar banco:', err.message);
        return;
    }

    if (!row) {
        printError(`[Revoke] Mensagem apagada ID ${targetId} não encontrada no banco.`);
        return;
    }

    if (isStatus(row) && !getSetting('revoke.status')) {
        printDebug(`[Revoke] Status apagado ID ${targetId} ignorado (revoke.status off).`);
        return;
    }

    try {
        const info = await resolverAutorApagada(row, { after, before, protocolKey });

        // Marca como apagada ANTES de enviar: mesmo que o envio falhe, o /show encontra.
        // Também grava os nomes resolvidos agora, que são mais precisos que os do recebimento.
        await dbRun(
            `UPDATE messages
                SET revoked = 1,
                    revoked_at = ?,
                    chat_name = ?,
                    sender_name = ?,
                    sender_number = COALESCE(?, sender_number)
              WHERE id = ?`,
            [Date.now(), info.nomeChat, info.nomeRemetente, info.numeroRemetente, row.id]
        );

        // Apagada por você: conta para o seu número (no privado, o remetente gravado é o outro participante)
        const deMim = Boolean(after?.fromMe || before?.fromMe);

        await contarStats({
            chatId: row.chat_id, chatName: info.nomeChat, isGroup: row.is_group,
            senderId: deMim ? meuIdStats() : (row.sender_number || row.sender_jid),
            senderName: deMim ? (client.info?.pushname || 'Você') : info.nomeRemetente,
            campos: { deleted: 1 }
        });

        await enviarMensagemApagada(client.info.wid._serialized, row, info, {
            titulo: isStatus(row) ? '📸 *STATUS APAGADO DETECTADO*' : '❌ *MENSAGEM APAGADA DETECTADA*'
        });
    } catch (sendError) {
        printError('[Revoke] Erro ao processar item apagado:', sendError.message);
    }
});

/*
 * Mensagens editadas
 *
 * Mesma ideia das apagadas: o evento 'message_edit' grava a edição (texto de
 * antes e de depois) na tabela message_edits e avisa você no privado (setting
 * 'edit.alert'); o /edit reexibe sob demanda.
 */
async function enviarMensagemEditada(destino, row, info, { titulo = '✏️ *MENSAGEM EDITADA DETECTADA*' } = {}) {
    let texto = `${titulo}\n\n`;

    if (row.is_group === 1) {
        texto += `👥 *Grupo:* ${info.nomeChat}\n`;
    }

    texto +=
        `👤 *Nome:* ${info.nomeRemetente}\n` +
        `📱 *Número:* ${info.numeroRemetente ? `+${info.numeroRemetente}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(row.timestamp)}\n` +
        `✏️ *Editada em:* ${formatarData(row.edited_at)}\n` +
        `📝 *Antes:* "${row.old_body || '(vazio)'}"\n` +
        `💬 *Depois:* "${row.new_body || '(vazio)'}"`;

    await client.sendMessage(destino, texto, { linkPreview: false });
}

client.on('message_edit', async (msg, newBody, prevBody) => {
    try {
        /*
         * O whatsapp-web.js emite este evento em qualquer 'change:body/caption',
         * inclusive quando o WhatsApp Web só termina de carregar o texto. Edição
         * de verdade traz latestEditSenderTimestampMs/latestEditMsgKey.
         */
        if (!msg.latestEditSenderTimestampMs && !msg.latestEditMsgKey) return;

        // As suas edições (e as do próprio bot) não interessam
        if (msg.fromMe) return;

        const antes = String(prevBody ?? '');
        const depois = String(newBody ?? '');
        if (antes === depois) return;

        const messageId = msg.id?.id;
        const chatId = msg.id?.remote || msg.from;

        if (!messageId || !chatId) {
            printError('[Edit] Não foi possível identificar a mensagem editada.');
            return;
        }

        await dbPronto;

        // O que já sabemos da mensagem original (gravada no message_create)
        const original = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);

        const row = {
            message_id: messageId,
            chat_id: chatId,
            chat_name: original?.chat_name || null,
            is_group: chatId.endsWith('@g.us') ? 1 : 0,
            sender_name: original?.sender_name || null,
            sender_number: original?.sender_number || null,
            type: msg.type,
            old_body: antes,
            new_body: depois,
            timestamp: original?.timestamp || msg.timestamp,
            edited_at: Number(msg.latestEditSenderTimestampMs) || Date.now()
        };

        const info = await resolverAutorApagada(row, { after: msg, before: msg });
        row.chat_name = info.nomeChat;
        row.sender_name = info.nomeRemetente;
        row.sender_number = info.numeroRemetente;

        const res = await dbRun(
            `INSERT OR IGNORE INTO message_edits
                (message_id, chat_id, chat_name, is_group, sender_name, sender_number,
                 type, old_body, new_body, timestamp, edited_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.message_id, row.chat_id, row.chat_name, row.is_group, row.sender_name, row.sender_number,
             row.type, row.old_body, row.new_body, row.timestamp, row.edited_at]
        );

        // Mesma edição avisada de novo (body e caption): já gravada e avisada
        if (!res.changes) return;

        // Se a mensagem for apagada depois, o /show mostra o texto final
        await dbRun('UPDATE messages SET body = ? WHERE id = ? AND revoked = 0', [depois, messageId]);

        printInfo(`[Edit] Mensagem ${messageId} editada em ${row.chat_name}`);

        await contarStats({
            chatId, chatName: row.chat_name, isGroup: row.is_group,
            senderId: original?.sender_number || original?.sender_jid || row.sender_number,
            senderName: row.sender_name,
            campos: { edited: 1 }
        });

        if (getSetting('edit.alert')) {
            await enviarMensagemEditada(client.info.wid._serialized, row, info);
        }
    } catch (err) {
        printError('[Edit] Erro ao processar mensagem editada:', err.message);
    }
});

/*
 * Watch: toda mensagem recebida (menos as suas e os comandos) é testada contra
 * as regras do setting 'watch.rules'. Cada regra é:
 *   texto        → "contém", sem diferenciar maiúsculas nem acentos
 *   /regex/flags → RegExp do JavaScript (as flags g e y são ignoradas)
 * Quando casa, a ocorrência vai para watch_hits e você é avisado no privado.
 */
const REGRA_REGEX = /^\/(.+)\/([a-z]*)$/s;
const REGRA_MAX_LEN = 200;

const semAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// regra -> função de teste (compilada uma vez, não a cada mensagem)
const regrasCompiladas = new Map();

function compilarRegraWatch(regra) {
    if (regrasCompiladas.has(regra)) return regrasCompiladas.get(regra);

    if (!regra || regra.length > REGRA_MAX_LEN) {
        throw new Error(`a regra precisa ter de 1 a ${REGRA_MAX_LEN} caracteres`);
    }

    let testar;
    const m = regra.match(REGRA_REGEX);

    if (m) {
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(`regex inválida: ${e.message}`);
        }
        testar = (texto) => re.test(texto);
    } else {
        const alvo = semAcentos(regra);
        testar = (texto) => semAcentos(texto).includes(alvo);
    }

    regrasCompiladas.set(regra, testar);
    return testar;
}

async function verificarWatch({ msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp }) {
    // As suas mensagens ficam de fora: inclusive os próprios avisos do /watch no seu privado
    if (msg.fromMe || !body) return;
    if (!findCommand('/watch')) return;

    const regras = getSetting('watch.rules');
    if (!regras.length) return;

    const casadas = regras
        .map((regra, i) => ({ regra, n: i + 1 }))
        .filter(({ regra }) => {
            try {
                return compilarRegraWatch(regra)(body);
            } catch {
                return false;
            }
        });

    if (!casadas.length) return;

    // Só avisa das ocorrências novas (o WhatsApp pode reenviar a mesma mensagem)
    const novas = [];

    for (const c of casadas) {
        const res = await dbRun(
            `INSERT OR IGNORE INTO watch_hits
                (rule, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.regra, msgIdPure, chatId, chatName, isGroup, senderName, senderNumber, body, timestamp]
        );

        if (res.changes) novas.push(c);
    }

    if (!novas.length) return;

    let texto = '👀 *WATCH: MENSAGEM DETECTADA*\n\n';

    for (const c of novas) {
        texto += `🔎 *Regra #${c.n}:* ${c.regra}\n`;
    }

    if (isGroup) {
        texto += `👥 *Grupo:* ${chatName}\n`;
    }

    texto +=
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(timestamp)}\n` +
        `💬 *Texto:* "${await resolverMencoes(body, msg.mentionedIds)}"`;

    printInfo(`/watch: regra(s) ${novas.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);
    await client.sendMessage(client.info.wid._serialized, texto, { linkPreview: false });
}

/*
 * Inicialização
 */
async function iniciarBot() {
    try {
        printInfo('Starting WhatsApp authentication...');
        await client.initialize();
    } catch (error) {
        printError('Erro capturado na inicialização:', error.message);

        // Fecha o navegador antigo se ele tiver sido aberto parcialmente
        try {
            printInfo('Fechando instâncias pendentes do navegador...');
            await client.destroy();
        } catch {
            printInfo('Nenhum navegador ativo para destruir.');
        }

        if (error.message.includes('Execution context was destroyed') || error.message.includes('browser is already running')) {
            printInfo('Reiniciando o processo de inicialização em 5 segundos...');
            setTimeout(iniciarBot, 5000);
        }
    }
}

iniciarBot();

/*
 * Handlers de comandos
 */

// Resposta padrão de erro dos comandos /get e /cache
function formatarErroComando(e) {
    let texto = `⚠️💥 ${e.message}.`;

    if (e?.cause?.cmd) texto += `\n🛠️ *Cmd*:    ${e.cause.cmd}`;
    if (e?.cause?.inner) texto += `\n⛓️‍💥 *Inner*:  ${e.cause.inner.message || e.cause.inner}`;

    return `${texto}\n`;
}

async function cmdHelp({ msg, args }) {
    // Lê direto do texto: o parser de opções descarta um primeiro token que começa com "/"
    let requestedCommand = args.split(/\s+/)[0];

    // /help /get  |  /help get
    if (requestedCommand) {
        if (!requestedCommand.startsWith('/')) {
            requestedCommand = `/${requestedCommand}`;
        }

        const command = findCommand(requestedCommand);

        if (!command) {
            await msg.reply(`❌ Comando não encontrado: ${requestedCommand}`);
            return;
        }

        await msg.reply('🤖 *AJUDA*\n\n```' + formatCommandHelp(command) + '\n```');
        return;
    }

    // /help sozinho: todos os comandos
    const helpText =
        '🤖 *MENU DE AJUDA*\n\n```' +
        activeCommands().map(formatCommandHelp).join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

async function cmdDebug({ msg, opts }) {
    // Persistido no setting 'debug.enabled': sobrevive a reinícios
    if (opts.opt.on) await setSetting('debug.enabled', true);
    if (opts.opt.off) await setSetting('debug.enabled', false);

    await msg.reply(isDebugMode() ? '🪲 Debug Ativado.' : '🪲 Debug Desativado.');
}

// Também atende o /version: o banner já traz a versão
async function cmdUptime({ msg }) {
    const conectado = BOT_AUTHENTICATED_TIME ? getBotUptime(BOT_AUTHENTICATED_TIME) : 'não conectado';

    await msg.reply(
        `🤖 *ZapBot ${packageJson.version}*\n` +
        '━━━━━━━━━━━━━━━━━━\n' +
        `⚡ Online: *${getBotUptime(BOT_START_TIME)}*\n` +
        `🔐 Conectado: *${conectado}*`
    );
}

async function cmdPing({ msg }) {
    await msg.reply('pong');
}

async function cmdNoffa({ msg, args, quotedMsg }) {
    const rainbowHearts = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '🧡', '💛', '💚', '💙', '💜'];

    // Antes usava só a primeira palavra (argv[1]) e gerava "undefined" sem argumento.
    const text = [args, quotedMsg?.body].filter(Boolean).join(' ').trim();

    if (!text) {
        await msg.reply('Syntax: /noffa <texto> (ou responda uma mensagem)');
        return;
    }

    let index = 0;
    let rainbowText = text.replace(/ /g, () => ` ${rainbowHearts[index++ % rainbowHearts.length]} `);

    // A resposta nunca começa com "/": não pode ser lida como comando (ver marcarEnviadaPeloBot)
    if (rainbowText.startsWith('/')) rainbowText = `${rainbowHearts[0]} ${rainbowText}`;

    await msg.reply(rainbowText);
}

/*
 * Moedas aceitas pelo /crypto -a (par <TOKEN>USDT na Binance) e seus ícones.
 * As ativas ficam no setting 'crypto.coins'.
 */
const CRYPTO_SUPPORTED = {
    BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'Ⓗ', BNB: '🔶', XRP: '✕', DOGE: 'Ð',
    ADA: '₳', TRX: '🔺', AVAX: '🔻', LINK: '🔗', DOT: '●', LTC: 'Ł', TON: '💎',
    SUI: '💧', PEPE: '🐸', SHIB: '🐕', XLM: '🚀', NEAR: 'Ⓝ', UNI: '🦄'
};

const fmtPrecoCrypto = (value) =>
    Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

async function cmdCrypto(ctx) {
    const { msg, opts } = ctx;
    await dbPronto;

    if (opts.given.has('alerta')) {
        await tratarAlertaDePreco('crypto', ctx);
        return;
    }

    const ativas = getSetting('crypto.coins');
    const token = (v) => String(v ?? '').trim().toUpperCase().replace(/USDT$/, '');

    if (opts.opt.list) {
        const lista = Object.entries(CRYPTO_SUPPORTED)
            .map(([sym, icon]) => `${ativas.includes(sym) ? '*' : ' '} ${icon} ${sym}`)
            .join('\n');

        await msg.reply('🪙 *MOEDAS SUPORTADAS*\n\n```\n' + lista + '\n```\n_* = ativada_');
        return;
    }

    if (opts.opt.add !== null || opts.opt.del !== null) {
        // Mexe na configuração global: só o dono do bot
        if (!msg.fromMe) {
            await msg.reply('⛔ Apenas o dono do bot pode alterar as moedas.');
            return;
        }

        const adicionar = opts.opt.add !== null;
        const sym = token(adicionar ? opts.opt.add : opts.opt.del);

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/crypto') + '```');
            return;
        }

        if (adicionar) {
            if (!CRYPTO_SUPPORTED[sym]) {
                await msg.reply(`❌ Moeda não suportada: ${sym}\n💡 _Veja as suportadas com /crypto -l_`);
                return;
            }
            if (ativas.includes(sym)) {
                await msg.reply(`ℹ️ ${sym} já está ativada.`);
                return;
            }
            await setSetting('crypto.coins', [...ativas, sym]);
            await msg.reply(`✅ ${CRYPTO_SUPPORTED[sym]} ${sym} adicionada.`);
            return;
        }

        if (!ativas.includes(sym)) {
            await msg.reply(`ℹ️ ${sym} não está ativada.`);
            return;
        }
        await setSetting('crypto.coins', ativas.filter(c => c !== sym));
        await msg.reply(`🗑️ ${sym} removida.`);
        return;
    }

    if (!ativas.length) {
        await msg.reply('ℹ️ Nenhuma moeda ativada.\n💡 _Adicione com /crypto -a <TOKEN>_');
        return;
    }

    try {
        const symbols = ativas.map(c => `${c}USDT`);

        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
            params: { symbols: JSON.stringify(symbols) },
            timeout: 10000
        });

        const fmtPrice = fmtPrecoCrypto;

        const fmtVolume = (value) => {
            const n = Number(value);
            if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
            if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
            if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
            return `$${n.toFixed(2)}`;
        };

        const pct = (value) => {
            const n = Number(value);
            return `${n >= 0 ? '🟢' : '🔴'} ${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
        };

        // Mantém a ordem configurada (a Binance não garante a ordem da resposta)
        const coins = data.map(item => ({
            symbol: item.symbol.replace(/USDT$/, ''),
            icon: CRYPTO_SUPPORTED[item.symbol.replace(/USDT$/, '')] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        })).sort((a, b) => ativas.indexOf(a.symbol) - ativas.indexOf(b.symbol));

        const topGainer = [...coins].sort((a, b) => b.change - a.change)[0];

        let text = '🚀 *CRYPTO MARKET*\n\n```\n';

        for (const c of coins) {
            const priceLine = `💰 $${fmtPrice(c.price)}`.padEnd(14);
            const change = pct(c.change).padStart(10);

            text += `${c.icon} ${c.symbol}\n`;
            text += `    ${priceLine}${change}\n`;
            text += `    📈 $${fmtPrice(c.high)}\n`;
            text += `    📉 $${fmtPrice(c.low)}\n`;
            text += `    📊 ${fmtVolume(c.volume)}\n\n`;
        }

        text += '```';
        text += `🔥 *Top:* ${topGainer.icon} ${topGainer.symbol}\n`;
        text += '🟡 Binance\n';
        text += '⚡ Live Market Data';

        await msg.reply(text);
    } catch (error) {
        printError('/crypto:', error.message);
        await msg.reply('❌ Error fetching crypto prices.');
    }
}

/*
 * /cotacao [MOEDA...]
 * Cotação contra o real: valor atual, abertura e fechamento anterior, máxima e
 * mínima do dia e variação. Moedas fiduciárias vêm do Yahoo Finance (se falhar,
 * da AwesomeAPI, que não informa a abertura); o USDT vem dos candles diários
 * da Binance (o "dia" da Binance vira às 21h de Brasília).
 */
const COTACAO_SUPORTADAS = {
    USD: { icone: '🇺🇸', nome: 'Dólar', fonte: 'fiat' },
    EUR: { icone: '🇪🇺', nome: 'Euro', fonte: 'fiat' },
    GBP: { icone: '🇬🇧', nome: 'Libra', fonte: 'fiat' },
    USDT: { icone: '🪙', nome: 'Tether', fonte: 'binance' }
};

const COTACAO_TIMEOUT_MS = 10000;

async function cotacaoYahoo(moeda) {
    const { data } = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${moeda}BRL=X`, {
        params: { interval: '1d', range: '5d' },
        headers: { 'User-Agent': 'Mozilla/5.0' }, // sem ele o Yahoo responde 429
        timeout: COTACAO_TIMEOUT_MS
    });

    const r = data?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r?.meta?.regularMarketPrice || !q) throw new Error('resposta sem cotação');

    const n = q.close.length;
    const valido = (v) => (Number.isFinite(v) ? v : null);

    // Fechamento anterior: último close válido antes do candle de hoje
    let fechamento = null;
    for (let i = n - 2; i >= 0 && fechamento === null; i--) fechamento = valido(q.close[i]);

    return {
        atual: r.meta.regularMarketPrice,
        abertura: valido(q.open[n - 1]),
        fechamento,
        max: valido(r.meta.regularMarketDayHigh) ?? valido(q.high[n - 1]),
        min: valido(r.meta.regularMarketDayLow) ?? valido(q.low[n - 1]),
        fonte: 'Yahoo Finance'
    };
}

// Reserva do Yahoo: sem abertura; o fechamento anterior sai de bid - varBid
async function cotacaoAwesome(moeda) {
    const { data } = await axios.get(`https://economia.awesomeapi.com.br/json/last/${moeda}-BRL`, { timeout: COTACAO_TIMEOUT_MS });
    const d = data?.[`${moeda}BRL`];
    if (!d?.bid) throw new Error('resposta sem cotação');

    const atual = Number(d.bid);
    return {
        atual,
        abertura: null,
        fechamento: atual - Number(d.varBid),
        max: Number(d.high),
        min: Number(d.low),
        fonte: 'AwesomeAPI'
    };
}

async function cotacaoBinance(moeda) {
    const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
        params: { symbol: `${moeda}BRL`, interval: '1d', limit: 2 },
        timeout: COTACAO_TIMEOUT_MS
    });

    // [abertura em, open, high, low, close, ...]: ontem e hoje
    const [ontem, hoje] = data;
    if (!hoje) throw new Error('resposta sem cotação');

    return {
        atual: Number(hoje[4]),
        abertura: Number(hoje[1]),
        fechamento: Number(ontem[4]),
        max: Number(hoje[2]),
        min: Number(hoje[3]),
        fonte: 'Binance'
    };
}

async function buscarCotacao(moeda) {
    if (COTACAO_SUPORTADAS[moeda].fonte === 'binance') return cotacaoBinance(moeda);

    try {
        return await cotacaoYahoo(moeda);
    } catch (err) {
        printError(`/cotacao: Yahoo falhou para ${moeda} (${err.message}), usando a AwesomeAPI.`);
        return cotacaoAwesome(moeda);
    }
}

const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

function fmtVariacao(atual, base) {
    if (!base) return null;
    const pct = ((atual - base) / base) * 100;
    const sinal = pct > 0 ? '+' : '';
    const icone = pct > 0 ? '🟢' : pct < 0 ? '🔴' : '⚪';
    return `${icone} ${sinal}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

async function cmdCotacao(ctx) {
    const { msg, opts } = ctx;
    await dbPronto;

    if (opts.given.has('alerta')) {
        await tratarAlertaDePreco('cotacao', ctx);
        return;
    }

    const ativas = getSetting('cotacao.coins');

    if (opts.opt.list) {
        const lista = Object.entries(COTACAO_SUPORTADAS)
            .map(([sym, { icone, nome }]) => `${ativas.includes(sym) ? '✅' : '▫️'} ${icone} *${sym}* — ${nome}`)
            .join('\n');

        await msg.reply('💱 *MOEDAS SUPORTADAS* _(contra o real)_\n\n' + lista +
            '\n\n_✅ = habilitada (aparece no /cotacao)_\n💡 _/cotacao -a <MOEDA> habilita, /cotacao -d <MOEDA> desabilita._');
        return;
    }

    if (opts.given.has('add') || opts.given.has('del')) {
        // Mexe na configuração global: só o dono do bot
        if (!msg.fromMe) {
            await msg.reply('⛔ Apenas o dono do bot pode alterar as moedas.');
            return;
        }

        const adicionar = opts.given.has('add');
        const sym = String((adicionar ? opts.opt.add : opts.opt.del) ?? '').trim().toUpperCase();

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/cotacao') + '```');
            return;
        }

        if (!COTACAO_SUPORTADAS[sym]) {
            await msg.reply(`❌ Moeda não suportada: ${sym}\n💡 _Veja as suportadas com /cotacao -l_`);
            return;
        }

        if (adicionar === ativas.includes(sym)) {
            await msg.reply(`ℹ️ ${sym} já está ${adicionar ? 'habilitada' : 'desabilitada'}.`);
            return;
        }

        await setSetting('cotacao.coins', adicionar ? [...ativas, sym] : ativas.filter(c => c !== sym));
        await msg.reply(adicionar
            ? `✅ ${COTACAO_SUPORTADAS[sym].icone} ${sym} habilitada.`
            : `🗑️ ${sym} desabilitada.`);
        return;
    }

    // Sem argumentos: as moedas habilitadas; com argumentos: só as pedidas
    const pedidas = opts.argv.length
        ? opts.argv.join(' ').toUpperCase().split(/[\s,]+/).filter(Boolean)
        : ativas;
    const invalidas = pedidas.filter(m => !COTACAO_SUPORTADAS[m]);

    if (invalidas.length) {
        await msg.reply(`❌ Moeda não suportada: ${invalidas.join(', ')}\n💡 _Suportadas: ${Object.keys(COTACAO_SUPORTADAS).join(', ')}_`);
        return;
    }

    if (!pedidas.length) {
        await msg.reply('ℹ️ Nenhuma moeda habilitada.\n💡 _Habilite com /cotacao -a <MOEDA> (veja /cotacao -l)._');
        return;
    }

    const resultados = await Promise.allSettled(pedidas.map(buscarCotacao));
    const fontes = new Set();
    let texto = '💱 *COTAÇÕES* _(em reais)_\n';

    pedidas.forEach((moeda, i) => {
        const { icone, nome } = COTACAO_SUPORTADAS[moeda];
        const r = resultados[i];

        texto += `\n${icone} *${moeda}/BRL* _(${nome})_\n`;

        if (r.status === 'rejected') {
            printError(`/cotacao ${moeda}:`, r.reason?.message);
            texto += '   ⚠️ _Cotação indisponível agora._\n';
            return;
        }

        const c = r.value;
        fontes.add(c.fonte);

        const doDia = fmtVariacao(c.atual, c.fechamento);
        const desdeAbertura = fmtVariacao(c.atual, c.abertura);

        texto += `   💰 *${fmtReal(c.atual)}*${doDia ? `  ${doDia}` : ''}\n`;
        texto += `   🔔 Abertura: ${c.abertura ? fmtReal(c.abertura) : '—'}${desdeAbertura ? ` _(${desdeAbertura} desde a abertura)_` : ''}\n`;
        texto += `   🏁 Fechamento anterior: ${c.fechamento ? fmtReal(c.fechamento) : '—'}\n`;
        if (c.max && c.min) texto += `   📈 Máx: ${fmtReal(c.max)}  📉 Mín: ${fmtReal(c.min)}\n`;
    });

    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    texto += `\n🕐 _${agora}${fontes.size ? ` · ${[...fontes].join(', ')}` : ''}_\n`;
    texto += '💡 _% ao lado do valor: variação desde o fechamento anterior._';

    await msg.reply(texto);
}

/*
 * Alertas de preço: /cotacao -alerta e /crypto -alerta
 *   -alerta                 → lista os alertas do comando, numerados
 *   -alerta USD > 5.30      → avisa no seu privado quando o USD passar de R$ 5,30
 *   -alerta BTC < 90000     → (no /crypto) quando o BTC ficar abaixo de $90.000
 *   -alerta -rm 2 | all     → remove o alerta nº 2 da lista (ou todos)
 * Cada alerta dispara UMA vez e é removido. A verificação roda a cada
 * 'alerta.intervalMin' minutos. Só o dono cria e remove.
 */
const ALERTA_TIPOS = {
    cotacao: {
        cmd: '/cotacao',
        suportada: (sym) => Boolean(COTACAO_SUPORTADAS[sym]),
        icone: (sym) => COTACAO_SUPORTADAS[sym].icone,
        par: (sym) => `${sym}/BRL`,
        fmt: fmtReal,
        exemplo: 'USD > 5.30',
        precos: async (syms) => Object.fromEntries(
            await Promise.all(syms.map(async sym => [sym, (await buscarCotacao(sym)).atual]))
        )
    },
    crypto: {
        cmd: '/crypto',
        suportada: (sym) => Boolean(CRYPTO_SUPPORTED[sym]),
        icone: (sym) => CRYPTO_SUPPORTED[sym],
        par: (sym) => `${sym}/USDT`,
        fmt: (v) => `$${fmtPrecoCrypto(v)}`,
        exemplo: 'BTC < 90000',
        precos: async (syms) => {
            const { data } = await axios.get('https://api.binance.com/api/v3/ticker/price', {
                params: { symbols: JSON.stringify(syms.map(sym => `${sym}USDT`)) },
                timeout: COTACAO_TIMEOUT_MS
            });
            return Object.fromEntries(data.map(d => [d.symbol.replace(/USDT$/, ''), Number(d.price)]));
        }
    }
};

const OPERADORES = {
    '>': { testar: (preco, alvo) => preco > alvo, texto: 'acima de', icone: '📈' },
    '<': { testar: (preco, alvo) => preco < alvo, texto: 'abaixo de', icone: '📉' }
};

// "5.30", "5,30" ou "90000" (sem separador de milhar)
function lerValorAlerta(texto) {
    const v = Number(String(texto).replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Lê "USD > 5.30", "USD>5,30" ou "btc < 90000".
 * @returns {{sym: string, op: string, alvo: number} | null}
 */
function lerRegraAlerta(texto) {
    const m = String(texto).trim().match(/^([a-z0-9]+)\s*([<>])\s*([\d.,]+)$/i);
    if (!m) return null;

    const alvo = lerValorAlerta(m[3]);
    return alvo ? { sym: m[1].toUpperCase(), op: m[2], alvo } : null;
}

const listarAlertas = (kind) =>
    dbAll('SELECT * FROM price_alerts WHERE kind = ? ORDER BY id', [kind]);

function descreverAlerta(kind, a) {
    const t = ALERTA_TIPOS[kind];
    return `${t.icone(a.symbol)} ${t.par(a.symbol)} ${OPERADORES[a.op].texto} *${t.fmt(a.target)}*`;
}

async function tratarAlertaDePreco(kind, { msg, opts }) {
    const t = ALERTA_TIPOS[kind];

    // Os avisos vão para o SEU privado: só o dono cria, lista e remove
    if (!msg.fromMe) {
        await msg.reply('⛔ Apenas o dono do bot pode usar os alertas.');
        return;
    }

    const alertas = await listarAlertas(kind);

    // -rm <nº|all>
    if (opts.given.has('rm')) {
        const alvo = String(opts.opt.rm ?? '').trim().toLowerCase();

        if (alvo === 'all') {
            await dbRun('DELETE FROM price_alerts WHERE kind = ?', [kind]);
            await msg.reply(`🗑️ ${plural(alertas.length, 'alerta removido', 'alertas removidos')}.`);
            return;
        }

        const alerta = /^\d+$/.test(alvo) ? alertas[Number(alvo) - 1] : null;

        if (!alerta) {
            await msg.reply(`❌ Alerta nº ${alvo || '?'} não existe. Veja a lista com ${t.cmd} -alerta`);
            return;
        }

        await dbRun('DELETE FROM price_alerts WHERE id = ?', [alerta.id]);
        await msg.reply(`🗑️ Alerta removido: ${descreverAlerta(kind, alerta)}`);
        return;
    }

    const regraTexto = opts.argv.join(' ').trim();

    // Sem regra: lista
    if (!regraTexto) {
        if (!alertas.length) {
            await msg.reply(`🔔 Nenhum alerta no ${t.cmd}.\n💡 _Crie com ${t.cmd} -alerta ${t.exemplo}_`);
            return;
        }

        const linhas = alertas.map((a, i) => `${i + 1}. ${descreverAlerta(kind, a)} _(criado ${formatarData(a.created_at)})_`);
        await msg.reply(`🔔 *ALERTAS DE PREÇO* _(${t.cmd})_\n\n${linhas.join('\n')}\n\n` +
            `💡 _Verificados a cada ${plural(getSetting('alerta.intervalMin'), 'minuto', 'minutos')}. Remova com ${t.cmd} -alerta -rm <nº|all>._`);
        return;
    }

    const regra = lerRegraAlerta(regraTexto);

    if (!regra) {
        await msg.reply(`❌ Regra inválida: "${regraTexto}"\n💡 _Formato: ${t.cmd} -alerta ${t.exemplo} (use > ou <; sem separador de milhar)_`);
        return;
    }

    if (!t.suportada(regra.sym)) {
        await msg.reply(`❌ Moeda não suportada: ${regra.sym}\n💡 _Veja as suportadas com ${t.cmd} -l_`);
        return;
    }

    const max = getSetting('alerta.max');
    const total = (await dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n;

    if (total >= max) {
        await msg.reply(`❌ Limite de ${max} alertas atingido (setting alerta.max). Remova algum antes.`);
        return;
    }

    let preco;
    try {
        preco = (await t.precos([regra.sym]))[regra.sym];
        if (!Number.isFinite(preco)) throw new Error('sem preço');
    } catch (err) {
        printError(`${t.cmd} -alerta: preço de ${regra.sym}:`, err.message);
        await msg.reply(`⚠️ Não consegui consultar o preço de ${regra.sym} agora. Tente de novo em instantes.`);
        return;
    }

    const op = OPERADORES[regra.op];

    // Já cumprido: dispararia na hora, o que não é o que se quer de um alerta
    if (op.testar(preco, regra.alvo)) {
        await msg.reply(`ℹ️ ${t.par(regra.sym)} já está ${op.texto} ${t.fmt(regra.alvo)}: agora está em *${t.fmt(preco)}*.`);
        return;
    }

    await dbRun(
        'INSERT INTO price_alerts (kind, symbol, op, target, price_at_creation, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [kind, regra.sym, regra.op, regra.alvo, preco, Date.now()]
    );

    await msg.reply(`🔔 *Alerta criado*\n${descreverAlerta(kind, { symbol: regra.sym, op: regra.op, target: regra.alvo })}\n` +
        `💰 Agora: ${t.fmt(preco)}\n` +
        `💡 _Aviso no seu privado; verificação a cada ${plural(getSetting('alerta.intervalMin'), 'minuto', 'minutos')}._`);
}

/*
 * Verificação periódica: um tique por minuto, que só consulta os preços
 * quando passou 'alerta.intervalMin' desde a última vez. Uma consulta por
 * moeda, mesmo com vários alertas nela.
 */
let ultimaVerificacaoAlertas = 0;
let verificandoAlertas = false;

async function verificarAlertasDePreco({ forcar = false } = {}) {
    if (verificandoAlertas || !isReady) return;
    if (!forcar && Date.now() - ultimaVerificacaoAlertas < getSetting('alerta.intervalMin') * 60 * 1000) return;

    verificandoAlertas = true;
    ultimaVerificacaoAlertas = Date.now();

    try {
        await dbPronto;
        const alertas = await dbAll('SELECT * FROM price_alerts ORDER BY id');

        for (const [kind, t] of Object.entries(ALERTA_TIPOS)) {
            const doTipo = alertas.filter(a => a.kind === kind);
            if (!doTipo.length) continue;

            let precos;
            try {
                precos = await t.precos([...new Set(doTipo.map(a => a.symbol))]);
            } catch (err) {
                printError(`Alertas ${t.cmd}: falha ao consultar preços:`, err.message);
                continue;
            }

            for (const a of doTipo) {
                const preco = precos[a.symbol];
                if (!Number.isFinite(preco) || !OPERADORES[a.op].testar(preco, a.target)) continue;

                // Remove ANTES de avisar: se o envio falhar, não repete o aviso a cada verificação
                await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);

                const variacao = fmtVariacao(preco, a.price_at_creation);
                await client.sendMessage(client.info.wid._serialized,
                    `🔔 *ALERTA DE PREÇO*\n\n` +
                    `${OPERADORES[a.op].icone} ${t.icone(a.symbol)} *${t.par(a.symbol)}* ficou ${OPERADORES[a.op].texto} ${t.fmt(a.target)}\n` +
                    `💰 Agora: *${t.fmt(preco)}*${variacao ? ` _(${variacao} desde a criação)_` : ''}\n` +
                    `📅 Alerta criado em ${formatarData(a.created_at)}`
                ).catch(err => printError('Alerta de preço: falha ao avisar:', err.message));

                printInfo(`Alerta de preço disparado: ${a.symbol} ${a.op} ${a.target} (agora ${preco})`);
            }
        }
    } catch (err) {
        printError('Erro ao verificar alertas de preço:', err.message);
    } finally {
        verificandoAlertas = false;
    }
}

setInterval(verificarAlertasDePreco, 60 * 1000);

/*
 * /enquete [-m] Pergunta | opção 1 | opção 2 ...
 * Envia uma enquete nativa do WhatsApp no chat. Separadores: "|" ou uma por
 * linha (a 1ª linha é a pergunta). -m (ou -multi) permite marcar várias opções.
 * O -m só vale no começo: no meio do texto faz parte da pergunta.
 */
const ENQUETE_MAX_OPCOES = 12;
const ENQUETE_MAX_PERGUNTA = 255;
const ENQUETE_MAX_OPCAO = 100;

async function cmdEnquete({ msg, args, chatId }) {
    let texto = String(args ?? '').trim();
    let multi = false;

    const flag = texto.match(/^-(m|multi)(\s+|$)/i);
    if (flag) {
        multi = true;
        texto = texto.slice(flag[0].length);
    }

    const partes = (texto.includes('|') ? texto.split('|') : texto.split('\n'))
        .map(p => p.trim())
        .filter(Boolean);

    let [pergunta, ...opcoes] = partes;
    const erro = (m) => msg.reply(`❌ ${m}\n\n` + '```' + getCommandSyntax('/enquete') + '```');

    if (!pergunta || opcoes.length < 2) {
        await erro('Informe a pergunta e pelo menos 2 opções.');
        return;
    }

    if (opcoes.length > ENQUETE_MAX_OPCOES) {
        await erro(`No máximo ${ENQUETE_MAX_OPCOES} opções (foram ${opcoes.length}).`);
        return;
    }

    if (pergunta.length > ENQUETE_MAX_PERGUNTA || opcoes.some(o => o.length > ENQUETE_MAX_OPCAO)) {
        await erro(`A pergunta vai até ${ENQUETE_MAX_PERGUNTA} caracteres e cada opção até ${ENQUETE_MAX_OPCAO}.`);
        return;
    }

    // O WhatsApp não aceita opções repetidas
    const repetidas = opcoes.filter((o, i) => opcoes.findIndex(x => x.toLowerCase() === o.toLowerCase()) !== i);
    if (repetidas.length) {
        await erro(`Opção repetida: ${[...new Set(repetidas)].join(', ')}`);
        return;
    }

    // A enquete volta no 'message_create' como sua: nunca pode parecer um comando
    if (pergunta.startsWith('/')) pergunta = `📊 ${pergunta}`;

    await client.sendMessage(chatId, new Poll(pergunta, opcoes, { allowMultipleAnswers: multi }));
}

async function cmdEveryone({ msg, senderContact }) {
    const groupChat = await msg.getChat().catch(() => null);

    if (!groupChat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    let text = '';
    const mentions = [];

    for (const participant of groupChat.participants) {
        const cleanId = participant.id._serialized.split(':')[0];

        if (participant.id.user === senderContact?.id?.user) continue;

        if (cleanId && !mentions.includes(cleanId)) {
            mentions.push(cleanId);
            text += `@${participant.id.user} `;
        }
    }

    if (!mentions.length) {
        printDebug('Nenhum outro participante encontrado para marcar.');
        return;
    }

    try {
        await client.sendMessage(groupChat.id._serialized, text, {
            mentions,
            quotedMessageId: msg.id._serialized
        });
        printSuccess('/everyone responded OK');
    } catch (replyError) {
        printError('Erro interno do WhatsApp Web ao processar menções:', replyError.message);
    }
}

/*
 * /monitor
 * Aceita tanto o estilo das opções do bot-config (/monitor -add 5521...)
 * quanto o posicional (/monitor add 5521...).
 * Antes o switch usava argv[0], que é sempre "/monitor": nenhum subcomando funcionava.
 */
async function cmdMonitor({ msg, opts }) {
    let sub = null;
    let alvo = null;

    for (const s of ['list', 'logs', 'clean']) {
        if (opts.opt[s] === true) sub = s;
    }

    // "-add +55 21 99999-8888": o parser só pega "+55"; o resto do número cai em argv
    if (typeof opts.opt.add === 'string') { sub = 'add'; alvo = [opts.opt.add, ...opts.argv].join(' '); }
    if (typeof opts.opt.del === 'string') { sub = 'del'; alvo = [opts.opt.del, ...opts.argv].join(' '); }

    if (!sub && opts.argv.length) {
        sub = opts.argv[0].toLowerCase();
        alvo = opts.argv.slice(1).join(' ');
    }

    try {
        switch (sub) {
            case 'logs': {
                const rows = await dbAll(`
                    SELECT pl.phone_number, pl.display_name, pl.status, pl.timestamp
                    FROM presence_logs pl
                    INNER JOIN monitored_numbers mn ON pl.phone_number = mn.phone_number
                    ORDER BY pl.timestamp DESC
                    LIMIT 50
                `);

                if (!rows.length) {
                    await msg.reply('Nenhum histórico encontrado para os números ativos. Use /monitor -list');
                    return;
                }

                let responseText = '📊 *Histórico de Presença (Números Ativos):*\n';
                for (const row of rows) {
                    responseText += `⏱️ *${row.display_name}* ficou online em: _${row.timestamp}_\n`;
                }

                await msg.reply(responseText);
                return;
            }

            case 'list': {
                const rows = await dbAll('SELECT phone_number, timestamp FROM monitored_numbers LIMIT ?', [getSetting('monitor.max')]);

                if (!rows.length) {
                    await msg.reply('Nenhum número está sendo monitorado.');
                    return;
                }

                let responseText = '📲🔔 *Números Monitorados:*\n\n';
                for (const row of rows) {
                    responseText += `* ${row.phone_number} adicionado em: _${row.timestamp}_\n`;
                }

                await msg.reply(responseText);
                return;
            }

            case 'clean': {
                const res = await dbRun('DELETE FROM monitored_numbers');

                await msg.reply(res.changes === 0
                    ? 'A lista de monitoramento já estava vazia. Nenhum número foi removido.'
                    : `🧼 Faxina concluída! Todos os números foram removidos.\nTotal de números limpos: *${res.changes}*`);
                return;
            }

            case 'add': {
                const phoneNumber = normalizerPhoneNumber(alvo);

                if (!isPhoneNumber(phoneNumber)) {
                    await msg.reply('Número inválido informado.');
                    return;
                }

                const total = await dbGet('SELECT COUNT(*) AS n FROM monitored_numbers');
                const max = getSetting('monitor.max');
                if (total.n >= max) {
                    await msg.reply(`Limite de ${max} números monitorados atingido.`);
                    return;
                }

                const existe = await dbGet('SELECT phone_number FROM monitored_numbers WHERE phone_number = ?', [phoneNumber]);

                if (existe) {
                    await msg.reply(`🔔 O número ${phoneNumber} já está sendo monitorado.`);
                    return;
                }

                await dbRun('INSERT INTO monitored_numbers (phone_number) VALUES (?)', [phoneNumber]);
                await msg.reply(`🔔 O número ${phoneNumber} agora está sendo monitorado.`);
                printInfo(`O número ${phoneNumber} agora está sendo monitorado.`);
                return;
            }

            case 'del': {
                const phoneNumber = normalizerPhoneNumber(alvo);

                if (!isPhoneNumber(phoneNumber)) {
                    await msg.reply('Número inválido informado.');
                    return;
                }

                const res = await dbRun('DELETE FROM monitored_numbers WHERE phone_number = ?', [phoneNumber]);

                await msg.reply(res.changes
                    ? `Número ${phoneNumber} removido com sucesso.`
                    : `O número ${phoneNumber} não está sendo monitorado.`);
                return;
            }

            default:
                await msg.reply('```' + getCommandSyntax('/monitor') + '```');
        }
    } catch (err) {
        printError('/monitor:', err.message);
        await msg.reply(`Erro no /monitor: ${err.message}`);
    }
}

/*
 * Figurinha a partir de imagem: recorte quadrado 512x512 enquadrado no MEIO
 * da imagem (sem isto o WhatsApp Web converte sem centralizar). WebP já é
 * figurinha e vai como está; vídeos seguem com a conversão do whatsapp-web.js.
 */
const STICKER_SIZE = 512;
const STICKER_MAX_BYTES = 100 * 1024;          // limite do WhatsApp: figurinha estática
const STICKER_ANIMADO_MAX_BYTES = 500 * 1024;  // limite do WhatsApp: figurinha animada

async function enquadrarSticker(media) {
    if (!media?.mimetype?.startsWith('image/') || media.mimetype === 'image/webp') return media;

    try {
        const animado = media.mimetype === 'image/gif';
        const maxBytes = animado ? STICKER_ANIMADO_MAX_BYTES : STICKER_MAX_BYTES;
        const entrada = Buffer.from(media.data, 'base64');
        let saida;

        // Reduz a qualidade até caber no limite do WhatsApp
        for (const quality of [80, 60, 40, 20]) {
            saida = await sharp(entrada, { animated: animado })
                .rotate() // respeita a orientação EXIF de fotos de celular
                .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'cover', position: 'centre' })
                .webp({ quality })
                .toBuffer();

            if (saida.length <= maxBytes) break;
        }

        return new MessageMedia('image/webp', saida.toString('base64'), 'sticker.webp');
    } catch (err) {
        // Sem o recorte a figurinha ainda sai, só que sem centralizar
        printError('/sticker: falha ao enquadrar a imagem, enviando sem recorte:', err.message);
        return media;
    }
}

async function cmdSticker({ msg, quotedMsg }) {
    if (!quotedMsg) {
        await msg.reply("Syntax: Faça um 'reply' utilizando /sticker");
        return;
    }

    // 1. Mídia real do WhatsApp
    if (quotedMsg.hasMedia) {
        const media = await enquadrarSticker(await quotedMsg.downloadMedia());
        await msg.reply(media, null, { sendMediaAsSticker: true, ...stickerMeta() });
        return;
    }

    // 2. Link com thumbnail / preview
    if (!quotedMsg.links?.length) {
        await msg.reply('A mensagem respondida não tem mídia nem link.');
        return;
    }

    const link = quotedMsg.links[0].link;
    let media = null;

    // Primeiro tenta o thumbnail interno do próprio WhatsApp
    const thumbnail =
        quotedMsg._data?.thumbnail ||
        quotedMsg._data?.jpegThumbnail ||
        quotedMsg._data?.body?.jpegThumbnail ||
        null;

    if (thumbnail) {
        let base64;

        if (Buffer.isBuffer(thumbnail)) {
            base64 = thumbnail.toString('base64');
        } else if (Array.isArray(thumbnail)) {
            base64 = Buffer.from(thumbnail).toString('base64');
        } else if (typeof thumbnail === 'string') {
            base64 = thumbnail.replace(/^data:image\/[^;]+;base64,/, '');
        }

        if (base64) {
            media = new MessageMedia('image/jpeg', base64, 'thumbnail.jpg');
        }
    }

    // Depois tenta o thumbnail externo
    if (!media) {
        const thumbnailUrl = quotedMsg._data?.thumbnailUrl || quotedMsg._data?.thumbnailDirectPath || null;

        if (thumbnailUrl?.startsWith('http')) {
            try {
                media = await MessageMedia.fromUrl(thumbnailUrl, { unsafeMime: true });
            } catch (err) {
                printError('Erro baixando thumbnail:', err.message);
            }
        }
    }

    if (!media) {
        await msg.reply(`Não encontrei thumbnail baixável para:\n${link}`);
        return;
    }

    await msg.reply(await enquadrarSticker(media), null, { sendMediaAsSticker: true, ...stickerMeta() });
}

let getEmAndamento = 0;

async function cmdGet({ msg, opts, quotedMsg, senderName }) {
    // Liberado para qualquer um: sem limite, vários /get seguidos esgotam CPU e disco
    if (getEmAndamento >= GET_MAX_CONCURRENT) {
        await msg.reply(`⏳ Já existem ${GET_MAX_CONCURRENT} downloads em andamento. Tente de novo em instantes.`);
        return;
    }

    getEmAndamento++;

    try {
        await executarGet({ msg, opts, quotedMsg, senderName });
    } finally {
        getEmAndamento--;
    }
}

async function executarGet({ msg, opts, quotedMsg, senderName }) {
    // Aleatório: com Date.now() dois /get no mesmo milissegundo usariam os mesmos arquivos
    const id = crypto.randomUUID();
    let originalFile = null;
    let outputFile = null;
    let logCmdFile = null;
    let logCmd = null;

    try {
        let urlInput;

        if (quotedMsg) {
            urlInput = quotedMsg.links?.length ? quotedMsg.links[0].link : extractFirstUrl(quotedMsg.body);
        } else {
            urlInput = opts.argv[0];
        }

        if (!urlInput) {
            await msg.reply('Syntax: /get <opções> http://www.instagram.com/ajsh12j\n```' + getCommandSyntax('/get') + '```');
            return;
        }

        const { audio: isAudio, sticker: isSticker, verbose: isVerbose } = opts.opt;

        if (isDebugMode()) {
            printDebug(`urlInput=${urlInput} opts=`, opts);
        }

        if (!isValidHttpUrl(urlInput)) {
            throw new Error(`A URL '${urlInput}' é inválida. Ignorando`);
        }

        if (!(await isUrlPublica(urlInput))) {
            printInfo(`/get: URL recusada (host privado ou não resolvido) de '${senderName}': ${urlInput}`);
            throw new Error(`A URL '${urlInput}' aponta para um endereço não permitido. Ignorando`);
        }

        await msg.reply(`💡 Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.mp4`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        // Baixar vídeo
        // --no-playlist: um link de playlist baixaria tudo; --max-filesize: não enche o disco
        const cmdYtArgs = [
            '-f', 'mp4', '--merge-output-format', 'mp4',
            '--no-playlist',
            '--max-filesize', `${getSetting('get.maxDownloadMB')}M`,
            '-o', originalFile,
            '--', urlInput
        ];
        const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdYt}`);
            fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
            await runCommand(BIN_YT, cmdYtArgs, logCmd);
        } catch (inner) {
            throw new Error(`Problemas para baixar com '${BIN_YT}'`, { cause: { inner, cmd: cmdYt } });
        }

        // Acima do --max-filesize o yt-dlp aborta sem erro e sem gerar o arquivo
        if (!fs.existsSync(originalFile)) {
            throw new Error(`Nada foi baixado (acima de ${getSetting('get.maxDownloadMB')} MB? veja o setting get.maxDownloadMB)`);
        }

        // Converter
        const ffmpegArgs = GetOptFromCommandForFfmpeg(opts, originalFile, outputFile);
        const cmdFfmpeg = [BIN_FFMPEG, ...ffmpegArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdFfmpeg}`);
            fs.writeSync(logCmd, `\n\n# Executando: ${cmdFfmpeg}\n`);
            await runCommand(BIN_FFMPEG, ffmpegArgs, logCmd);
        } catch (inner) {
            throw new Error(`Problemas para decodificar com '${BIN_FFMPEG}'`, { cause: { inner, cmd: cmdFfmpeg } });
        }

        const maxSizeMB = getSetting('get.maxSizeMB');
        if (fs.statSync(outputFile).size > maxSizeMB * 1024 * 1024) {
            throw new Error(`Arquivo muito grande para WhatsApp Web (máx. ${maxSizeMB} MB)`);
        }

        try {
            const media = MessageMedia.fromFilePath(outputFile);

            if (isVerbose) {
                let textMsg = '🛠️ *Verbose Mode*\n\n';
                textMsg += `💾 *yt-dlp*: _${cmdYt}_\n\n`;
                textMsg += `🔗 *ffmpeg*: _${cmdFfmpeg}_\n\n`;
                textMsg += '🧩 *cmdArgs*:```\n' + JSON.stringify(opts, null, 4) + '\n```';

                await msg.reply(textMsg, null, { linkPreview: false });
            }

            const msgOpts = { linkPreview: false, ...stickerMeta() };

            if (isSticker) {
                msgOpts.sendMediaAsSticker = true;
                printInfo(`> Enviando a mídia como sticker para '${senderName}'`);
            } else {
                msgOpts.caption = '📥 Aqui está a mídia para download.';
                msgOpts.sendMediaAsDocument = true;
                printInfo(`> Enviando a mídia ${outputFile} para '${senderName}'`);
            }

            await msg.reply(media, null, msgOpts);
        } catch (inner) {
            throw new Error(`Problemas para enviar com 'MessageMedia.fromFilePath(${outputFile})'`, { cause: { inner } });
        }
    } catch (e) {
        printError(e.message);
        await msg.reply(formatarErroComando(e), null, { linkPreview: false });
    } finally {
        if (logCmd !== null) {
            try { fs.closeSync(logCmd); } catch { /* já fechado */ }
        }

        for (const tmp of [originalFile, outputFile, logCmdFile]) {
            if (!tmp) continue;
            try { fs.unlinkSync(tmp); } catch { /* arquivo pode não existir */ }
        }
    }
}

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.clean && opts.opt.force) {
            // Limpeza geral: mensagens, apagadas, mídias, temporários
            const r = await limparTudo();

            textMsg =
                '🧹 *Limpeza geral concluída* (force)\n\n' +
                `🗄️ Mensagens removidas: *${r.total}* _(${r.apagadas} apagada${r.apagadas === 1 ? '' : 's'})_\n` +
                `✏️ Edições removidas: *${r.editadas}*\n` +
                `💾 Espaço liberado: *${humanSize(r.liberado)}*`;
        } else if (opts.opt.clean) {
            // Limpeza normal: só o que passou das janelas de retenção
            await limparCacheAntigo();
            await limparArquivosAntigos();
            await limparWatchAntigo();
            await limparEditadasAntigas();
            await limparStatsAntigas();

            textMsg = '🧹 Cache limpo (itens fora da janela de retenção).\n';
        } else {
            const { total, apagadas } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
            );
            const { editadas } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');

            textMsg = `🗂️ Exibindo conteúdo de ${CACHE_DIR}/*`;
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += `🗄️ Existem ${total} mensagens no cache (${apagadas} apagadas) e ${editadas} edições.`;
        }

        await msg.reply(textMsg, null, { linkPreview: false });
    } catch (e) {
        printError(e.message);
        await msg.reply(formatarErroComando(e), null, { linkPreview: false });
    }
}

/*
 * /show e /edit: reexibem as mensagens APAGADAS (/show) e EDITADAS (/edit)
 * guardadas no cache, no mesmo formato dos alertas.
 *   /show        → a última apagada deste chat      (/edit: a última editada)
 *   /show -3     → as 3 últimas (máx. setting 'show.max')
 *   /show -3 -pv → envia no SEU privado em vez de expor no chat atual
 *   /show -list  → apagadas e editadas do cache, por chat (o -l dos dois é o mesmo)
 *   /show -flush → remove as apagadas deste chat (no seu privado: de todos os chats)
 *   /show -2 -c 1       → as 2 últimas do chat nº 1 da lista de apagadas do -l
 *   /edit -2 -c zapbot  → as 2 últimas editadas do chat cujo nome contém "zapbot"
 *   /edit -f -c 1       → flush só das editadas do chat nº 1
 * Envia em ordem cronológica: a última enviada é a mais recente.
 */
// Em conversas privadas o mesmo chat pode aparecer como @lid ou @c.us
async function idsDoChatAtual(chatId) {
    const ids = [chatId];

    if (chatId.endsWith('@lid')) {
        const telefone = await resolveLidToPhone(chatId);
        if (telefone) ids.push(telefone);
    }

    return ids;
}

// O que muda entre as apagadas (/show) e as editadas (/edit)
const TIPOS_CACHE = {
    apagadas: {
        cmd: '/show',
        tabela: 'messages',
        filtro: 'revoked = 1',
        quando: 'revoked_at',
        ordem: 'revoked_at DESC, timestamp DESC',
        retencao: 'cache.revokedRetentionDays',
        comMidia: true,
        icone: '♻️',
        rotulo: 'Deletadas',
        iconeLista: '🗑️',
        singular: 'apagada',
        plural: 'apagadas'
    },
    editadas: {
        cmd: '/edit',
        tabela: 'message_edits',
        filtro: '1 = 1',
        quando: 'edited_at',
        ordem: 'edited_at DESC, id DESC',
        retencao: 'cache.editedRetentionDays',
        comMidia: false,
        icone: '✏️',
        rotulo: 'Editadas',
        iconeLista: '✏️',
        singular: 'editada',
        plural: 'editadas'
    }
};

/*
 * Numeração do último -l (índice → chat_id), uma por tipo.
 * Guardamos o snapshot porque a ordem da lista muda a cada nova mensagem
 * apagada/editada: sem ele, "chat 2" poderia apontar para outro chat entre o -l e o -c.
 */
const ultimaListaDeChats = { apagadas: [], editadas: [] };

// Chats com mensagens do tipo, na mesma ordem do -l
function consultarChatsDoCache(tipo) {
    const t = TIPOS_CACHE[tipo];

    return dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total,
                MAX(${t.quando}) AS ultima
           FROM ${t.tabela}
          WHERE ${t.filtro}
          GROUP BY chat_id
          ORDER BY total DESC, ultima DESC`
    );
}

const nomeDoChat = (c) => c.chat_name || c.chat_id.split('@')[0];

/**
 * Resolve o valor do -c para um chat:
 *   número → posição na lista do tipo no último -l
 *   texto  → busca pelo nome (sem diferenciar maiúsculas)
 * @returns {Promise<{ids: string[], nome: string} | {erro: string}>}
 */
async function resolverChatAlvo(tipo, valor) {
    const t = TIPOS_CACHE[tipo];
    const chats = await consultarChatsDoCache(tipo);

    if (!chats.length) {
        return { erro: `${t.icone} Nenhuma mensagem ${t.singular} no cache.` };
    }

    // Por número
    if (/^\d+$/.test(valor)) {
        const indice = Number(valor);
        const lista = ultimaListaDeChats[tipo].length ? ultimaListaDeChats[tipo] : chats.map(c => c.chat_id);
        const chatId = lista[indice - 1];
        const chat = chats.find(c => c.chat_id === chatId);

        if (!chat) {
            return { erro: `❌ Chat nº ${indice} não existe (ou não tem mais ${t.plural}). Rode ${t.cmd} -l para ver a lista atual.` };
        }

        return { ids: [chat.chat_id], nome: nomeDoChat(chat) };
    }

    // Por nome
    const busca = valor.toLowerCase();
    const encontrados = chats.filter(c => nomeDoChat(c).toLowerCase().includes(busca));
    const exato = encontrados.find(c => nomeDoChat(c).toLowerCase() === busca);

    if (exato || encontrados.length === 1) {
        const chat = exato || encontrados[0];
        return { ids: [chat.chat_id], nome: nomeDoChat(chat) };
    }

    if (!encontrados.length) {
        return { erro: `❌ Nenhum chat com ${t.plural} contém "${valor}". Rode ${t.cmd} -l para ver a lista.` };
    }

    return {
        erro: `🔎 "${valor}" corresponde a ${encontrados.length} chats. Seja mais específico ou use o número:\n` +
              encontrados.map(c => `• ${nomeDoChat(c)}`).join('\n')
    };
}

/*
 * /show -list e /edit -list (a mesma lista nos dois)
 * Apagadas e editadas guardadas no cache, de todos os chats, cada tipo com a
 * sua numeração (a do /show -c e a do /edit -c). O chat onde o comando foi
 * executado vem marcado. Use -pv para receber no privado.
 */
async function listarCache({ msg, opts, chatId }) {
    await dbPronto;

    const meuId = client.info.wid._serialized;
    const idsDoChat = await idsDoChatAtual(chatId);
    const noPrivadoDoDono = idsDoChat.includes(meuId);
    const LIMITE = 10;

    const linha = (c, i) => {
        const icone = c.is_group ? '👥' : '👤';
        const atual = idsDoChat.includes(c.chat_id) ? ' ← _este chat_' : '';
        return `${i + 1}. ${icone} ${nomeDoChat(c)} — *${c.total}* _(última ${formatarData(c.ultima)})_${atual}\n`;
    };

    let texto = '🗄️ *Mensagens no cache*\n';
    let algum = false;

    for (const [tipo, t] of Object.entries(TIPOS_CACHE)) {
        const resumo = await dbGet(
            `SELECT COUNT(*) AS total,
                    ${t.comMidia ? 'COALESCE(SUM(has_media), 0)' : '0'} AS com_midia,
                    MIN(${t.quando}) AS mais_antiga
               FROM ${t.tabela}
              WHERE ${t.filtro}`
        );

        const detalhes = [];
        if (resumo.com_midia > 0) detalhes.push(`${resumo.com_midia} com mídia`);

        if (resumo.total > 0 && resumo.mais_antiga) {
            const expiraEm = paraMs(resumo.mais_antiga) + getSetting(t.retencao) * DAY_MS;
            const dias = Math.max(0, Math.ceil((expiraEm - Date.now()) / DAY_MS));
            detalhes.push(`a mais antiga expira em ${dias} dia${dias === 1 ? '' : 's'}`);
        }

        texto += `\n${t.iconeLista} *${t.rotulo}:* ${resumo.total}`;
        texto += detalhes.length ? ` _(${detalhes.join(' · ')})_\n` : '\n';

        if (!resumo.total) {
            ultimaListaDeChats[tipo] = [];
            continue;
        }

        algum = true;

        const porChat = await consultarChatsDoCache(tipo);
        ultimaListaDeChats[tipo] = porChat.map(c => c.chat_id);

        porChat.slice(0, LIMITE).forEach((c, i) => { texto += linha(c, i); });

        if (porChat.length > LIMITE) {
            texto += `_+${porChat.length - LIMITE} chat(s)_\n`;

            // O chat atual fora do top: aparece mesmo assim, com o nº para o -c
            const i = porChat.findIndex(c => idsDoChat.includes(c.chat_id));
            if (i >= LIMITE) texto += linha(porChat[i], i);
        }
    }

    texto += `\n💡 _/show -N reexibe as deletadas e /edit -N as editadas deste chat (máx. ${getSetting('show.max')})._`;

    if (algum) {
        texto += '\n💡 _Junte -c <nº ou nome> para outro chat: o nº é o da lista do tipo (/show -c 2, /edit -c 1)._' +
                 '\n💡 _-pv envia no seu privado; -f remove do cache as deste chat (no seu privado: de todos)._';
    }

    if (opts.opt.pv && !noPrivadoDoDono) {
        await msg.reply('🗄️ Resumo enviado no seu privado.');
        await client.sendMessage(meuId, texto);
    } else {
        await msg.reply(texto);
    }
}

/*
 * /show -flush e /edit -flush
 * Remove do cache as mensagens do tipo (as apagadas levam junto os arquivos de mídia):
 *   - num chat qualquer      → só as DESTE chat;
 *   - no seu próprio privado → as de TODOS os chats.
 * Destrutivo: só o dono do bot executa, mesmo que o comando seja liberado no config.
 */
async function limparDoCache({ msg, chatId, tipo, alvo = null }) {
    const t = TIPOS_CACHE[tipo];

    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot pode usar ${t.cmd} -flush.`);
        return;
    }

    await dbPronto;

    const meuId = client.info.wid._serialized;
    // Com -c, o alvo é o chat escolhido; sem ele, o chat atual
    const idsDoChat = alvo ? alvo.ids : await idsDoChatAtual(chatId);
    const geral = !alvo && idsDoChat.includes(meuId);

    // Filtro: todas do tipo (privado do dono) ou só as do chat alvo
    const filtro = geral
        ? t.filtro
        : `${t.filtro} AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})`;
    const params = geral ? [] : idsDoChat;

    // Levanta o que vai sair ANTES de apagar, para a mensagem de resumo
    const porChat = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total
           FROM ${t.tabela}
          WHERE ${filtro}
          GROUP BY chat_id
          ORDER BY total DESC`,
        params
    );

    const total = porChat.reduce((soma, c) => soma + c.total, 0);

    if (!total) {
        await msg.reply(geral
            ? `${t.icone} Nenhuma mensagem ${t.singular} no cache.`
            : `${t.icone} Nenhuma mensagem ${t.singular} registrada neste chat.`);
        return;
    }

    // Apaga as mídias do disco
    let arquivos = 0;
    let bytes = 0;

    if (t.comMidia) {
        const midias = await dbAll(`SELECT media_path FROM ${t.tabela} WHERE ${filtro} AND media_path IS NOT NULL`, params);

        for (const { media_path } of midias) {
            if (!isCaminhoDeMidia(media_path)) continue;

            try {
                bytes += fs.statSync(media_path).size;
                fs.unlinkSync(media_path);
                arquivos++;
            } catch {
                // arquivo já não existe
            }
        }
    }

    // Apaga as linhas do banco
    const res = await dbRun(`DELETE FROM ${t.tabela} WHERE ${filtro}`, params);

    printInfo(`${t.cmd} -flush (${geral ? 'geral' : chatId}): ${res.changes} mensagens ${t.plural}${t.comMidia ? ` e ${arquivos} arquivos` : ''} removidos`);

    let texto = geral
        ? `🧹 *Flush geral das mensagens ${t.plural}*\n\n`
        : alvo
            ? `🧹 *Flush das mensagens ${t.plural} de:* ${alvo.nome}\n\n`
            : `🧹 *Flush das mensagens ${t.plural} deste chat*\n\n`;

    texto += `🗄️ Removidas: *${plural(res.changes, 'mensagem', 'mensagens')}*`;
    texto += geral ? ` de *${plural(porChat.length, 'chat', 'chats')}*\n` : '\n';

    if (t.comMidia) {
        texto += `📎 Mídias apagadas do disco: *${arquivos}*${arquivos ? ` _(${humanSize(bytes)})_` : ''}\n`;
    }

    if (geral) {
        const LIMITE = 10;

        texto += '\n*Por chat:*\n';
        porChat.slice(0, LIMITE).forEach((c, i) => {
            const icone = c.is_group ? '👥' : '👤';
            texto += `${i + 1}. ${icone} ${nomeDoChat(c)} — *${c.total}*\n`;
        });

        if (porChat.length > LIMITE) {
            texto += `_+${porChat.length - LIMITE} chat(s)_\n`;
        }
    } else if (!alvo) {
        texto += `\n💡 _Para limpar as ${t.plural} de todos os chats, use ${t.cmd} -f no seu privado._`;
    }

    await msg.reply(texto);
}

// Reenvio de um item do /show ou do /edit
const REENVIO_CACHE = {
    apagadas: async (destino, row, i, total) => {
        const info = await resolverAutorApagada(row);

        await enviarMensagemApagada(destino, row, info, {
            titulo: `${isStatus(row) ? '📸 *STATUS APAGADO*' : '❌ *MENSAGEM APAGADA*'} (${i + 1}/${total})`,
            extras: [`🗑️ *Apagada em:* ${formatarData(row.revoked_at)}`]
        });
    },
    editadas: async (destino, row, i, total) => {
        await enviarMensagemEditada(destino, row, {
            nomeChat: row.chat_name || 'Conversa desconhecida',
            nomeRemetente: row.sender_name || 'Desconhecido',
            numeroRemetente: row.sender_number || null
        }, { titulo: `✏️ *MENSAGEM EDITADA* (${i + 1}/${total})` });
    }
};

// Parte comum do /show e do /edit
async function reexibirDoCache(tipo, { msg, opts, chatId }) {
    const t = TIPOS_CACHE[tipo];

    // -c <nº|nome>: escolhe outro chat (vale em qualquer chat; use -pv para não expor aqui)
    let alvo = null;

    if (opts.opt.chat) {
        await dbPronto;
        alvo = await resolverChatAlvo(tipo, String(opts.opt.chat));

        if (alvo.erro) {
            await msg.reply(alvo.erro);
            return;
        }
    }

    if (opts.opt.flush) {
        await limparDoCache({ msg, chatId, tipo, alvo });
        return;
    }

    if (opts.opt.list) {
        await listarCache({ msg, opts, chatId });
        return;
    }

    // "-3" não é uma opção declarada, então o parser o coloca em argv (assim como "3")
    const extras = opts.argv.filter(Boolean);
    let n = 1;

    if (extras.length > 1) {
        await msg.reply('```' + getCommandSyntax(t.cmd) + '```');
        return;
    }

    if (extras.length === 1) {
        const m = extras[0].match(/^-?(\d+)$/);

        if (!m || Number(m[1]) < 1) {
            await msg.reply('```' + getCommandSyntax(t.cmd) + '```');
            return;
        }

        n = Number(m[1]);
    }

    let aviso = '';
    const max = getSetting('show.max');
    if (n > max) {
        aviso = `\n_(limitado a ${max} por vez)_`;
        n = max;
    }

    const idsDoChat = alvo ? alvo.ids : await idsDoChatAtual(chatId);

    await dbPronto;

    const rows = await dbAll(
        `SELECT *
           FROM ${t.tabela}
          WHERE ${t.filtro}
            AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})
          ORDER BY ${t.ordem}
          LIMIT ?`,
        [...idsDoChat, n]
    );

    if (!rows.length) {
        // No privado, sem -c, quase sempre a intenção era ver outro chat
        const noMeuPrivado = !alvo && idsDoChat.includes(client.info.wid._serialized);

        await msg.reply(noMeuPrivado
            ? `${t.icone} Nenhuma mensagem ${t.singular} neste chat.\n💡 _Para ver as de outro chat: ${t.cmd} -l e depois ${t.cmd} -N -c <nº ou nome>._`
            : `${t.icone} Nenhuma mensagem ${t.singular} registrada neste chat.`);
        return;
    }

    // Busca as mais recentes, exibe da mais antiga para a mais recente
    rows.reverse();

    const destino = opts.opt.pv ? client.info.wid._serialized : chatId;
    const faltaram = n > rows.length ? ` (pedidas ${n}, encontradas ${rows.length})` : '';
    let resumo = `${t.icone} *${rows.length} mensage${rows.length === 1 ? `m ${t.singular}` : `ns ${t.plural}`}*${faltaram}${aviso}`;

    if (alvo) {
        resumo += `\n💬 *Chat:* ${alvo.nome}`;
    }

    if (opts.opt.pv) {
        // O resumo (com o nome do chat) vai só para o privado
        await msg.reply(`${t.icone} Enviado no seu privado.`);
        await client.sendMessage(destino, alvo ? resumo : `${resumo}\n💬 *Chat:* ${rows[0].chat_name || chatId}`);
    } else {
        await msg.reply(resumo);
    }

    for (const [i, row] of rows.entries()) {
        try {
            await REENVIO_CACHE[tipo](destino, row, i, rows.length);
        } catch (err) {
            printError(`${t.cmd}: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(destino, `⚠️ Não consegui reenviar a mensagem ${i + 1}/${rows.length}: ${err.message}`);
        }

        if (i < rows.length - 1) await esperar(getSetting('show.delayMs'));
    }
}

async function cmdUndo(ctx) {
    await reexibirDoCache('apagadas', ctx);
}

async function cmdEdit(ctx) {
    await reexibirDoCache('editadas', ctx);
}

/*
 * /stats [-N] [-me] [-c <nome>] [-pv]
 * Estatísticas dos últimos N dias (padrão 7), vindas dos contadores da tabela stats:
 *   sem -me → ranking DESTE chat (ou do -c): quem mais fala, quem mais apaga e edita;
 *   com -me → as SUAS mensagens, somadas em todos os chats (ou só no -c): onde você mais fala.
 * Nos dois: mensagens por faixa de horário, horário e dia de pico.
 */
const MEDALHAS = ['🥇', '🥈', '🥉'];

const fmtNum = (n) => Number(n).toLocaleString('pt-BR');

// As suas mensagens contam para o seu número (em qualquer chat)
const meuIdStats = () => client.info?.wid?.user;

// 8 faixas de 3 horas com barra proporcional, horário e dia de pico
async function textoHorariosStats(filtro, params) {
    const porHora = await dbAll(`SELECT hour, SUM(msgs) AS msgs FROM stats WHERE ${filtro} GROUP BY hour`, params);
    const [porDia] = await dbAll(
        `SELECT day, SUM(msgs) AS msgs FROM stats WHERE ${filtro} GROUP BY day ORDER BY msgs DESC, day DESC LIMIT 1`,
        params
    );

    const faixas = Array.from({ length: 8 }, (_, i) => ({ ini: i * 3, msgs: 0 }));
    for (const h of porHora) faixas[Math.floor(h.hour / 3)].msgs += h.msgs;

    const maior = Math.max(...faixas.map(f => f.msgs));
    if (!maior) return '';

    const pico = porHora.reduce((a, b) => (b.msgs > a.msgs ? b : a));

    let texto = '\n🕐 *Por horário*\n```\n';
    for (const f of faixas) {
        const barra = '█'.repeat(Math.round((f.msgs / maior) * 10)) || (f.msgs ? '▏' : '');
        texto += `${String(f.ini).padStart(2, '0')}–${String(f.ini + 3).padStart(2, '0')}h ${barra.padEnd(10)} ${f.msgs}\n`;
    }
    texto += '```\n';
    texto += `⏰ *Horário de pico:* ${pico.hour}h–${(pico.hour + 1) % 24}h _(${fmtNum(pico.msgs)} ${pico.msgs === 1 ? 'msg' : 'msgs'})_\n`;

    if (porDia?.msgs) {
        const [a, m, d] = porDia.day.split('-');
        texto += `📅 *Dia mais movimentado:* ${d}/${m}/${a} _(${fmtNum(porDia.msgs)} ${porDia.msgs === 1 ? 'msg' : 'msgs'})_\n`;
    }

    return texto;
}

// Ranking de um chat: quem mais fala, apaga e edita
async function textoStatsDoChat(filtro, params, dias) {
    const pessoas = await dbAll(
        `SELECT sender_id,
                MAX(sender_name) AS nome,
                SUM(msgs) AS msgs,
                SUM(media) AS media,
                SUM(deleted) AS deleted,
                SUM(edited) AS edited
           FROM stats
          WHERE ${filtro}
          GROUP BY sender_id`,
        params
    );

    const total = pessoas.reduce((s, p) => s + p.msgs, 0);
    if (!total && !pessoas.some(p => p.deleted || p.edited)) return null;

    const { nome: nomeChat } = await dbGet(`SELECT MAX(chat_name) AS nome FROM stats WHERE ${filtro}`, params);
    const falantes = pessoas.filter(p => p.msgs > 0).sort((a, b) => b.msgs - a.msgs);
    const midia = pessoas.reduce((s, p) => s + p.media, 0);

    let texto = `📊 *Estatísticas${nomeChat ? ` de ${nomeChat}` : ''}*\n` +
                `_Últimos ${plural(dias, 'dia', 'dias')}_\n\n` +
                `💬 *Mensagens:* ${fmtNum(total)} _(média ${fmtNum(Math.round(total / dias))}/dia)_\n` +
                `📎 *Com mídia:* ${fmtNum(midia)}\n` +
                `👥 *Participantes ativos:* ${falantes.length}\n`;

    if (falantes.length) {
        texto += '\n🏆 *Quem mais fala*\n';
        falantes.slice(0, 10).forEach((p, i) => {
            const pct = Math.round((p.msgs / total) * 100);
            texto += `${MEDALHAS[i] || `${i + 1}.`} ${p.nome || p.sender_id} — *${fmtNum(p.msgs)}* _(${pct}%)_\n`;
        });
        if (falantes.length > 10) texto += `_+${falantes.length - 10} pessoa(s)_\n`;
    }

    // Quem mais apaga / edita (só aparece se alguém apagou/editou)
    for (const [campo, titulo] of [['deleted', '🗑️ *Quem mais apaga*'], ['edited', '✏️ *Quem mais edita*']]) {
        const lista = pessoas.filter(p => p[campo] > 0).sort((a, b) => b[campo] - a[campo]).slice(0, 5);
        if (!lista.length) continue;

        texto += `\n${titulo}\n`;
        lista.forEach((p, i) => { texto += `${i + 1}. ${p.nome || p.sender_id} — *${fmtNum(p[campo])}*\n`; });
    }

    return texto + await textoHorariosStats(filtro, params);
}

// As suas mensagens: em quais chats você mais fala (ou num chat só, com -c)
async function textoStatsMeu(filtro, params, dias, umChat) {
    const chats = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS nome,
                MAX(is_group) AS is_group,
                SUM(msgs) AS msgs,
                SUM(media) AS media,
                SUM(deleted) AS deleted
           FROM stats
          WHERE ${filtro}
          GROUP BY chat_id`,
        params
    );

    const total = chats.reduce((s, c) => s + c.msgs, 0);
    const apagadas = chats.reduce((s, c) => s + c.deleted, 0);
    if (!total && !apagadas) return null;

    const midia = chats.reduce((s, c) => s + c.media, 0);
    const ativos = chats.filter(c => c.msgs > 0).sort((a, b) => b.msgs - a.msgs);

    let texto = `📊 *Suas estatísticas${umChat && chats[0]?.nome ? ` em ${chats[0].nome}` : ''}*\n` +
                `_Últimos ${plural(dias, 'dia', 'dias')}${umChat ? '' : ', todos os chats'}_\n\n` +
                `💬 *Mensagens:* ${fmtNum(total)} _(média ${fmtNum(Math.round(total / dias))}/dia)_\n` +
                `📎 *Com mídia:* ${fmtNum(midia)}\n`;

    if (apagadas) texto += `🗑️ *Apagadas por você:* ${fmtNum(apagadas)}\n`;

    if (!umChat && ativos.length) {
        texto += `👥 *Chats em que você falou:* ${ativos.length}\n`;
        texto += '\n🏆 *Onde você mais fala*\n';
        ativos.slice(0, 10).forEach((c, i) => {
            const pct = Math.round((c.msgs / total) * 100);
            const icone = c.is_group ? '👥' : '👤';
            texto += `${MEDALHAS[i] || `${i + 1}.`} ${icone} ${c.nome || c.chat_id.split('@')[0]} — *${fmtNum(c.msgs)}* _(${pct}%)_\n`;
        });
        if (ativos.length > 10) texto += `_+${ativos.length - 10} chat(s)_\n`;
    }

    return texto + await textoHorariosStats(filtro, params);
}

async function cmdStats({ msg, opts, chatId }) {
    await dbPronto;

    const extras = opts.argv.filter(Boolean);
    const maxDias = getSetting('stats.retentionDays');
    let dias = 7;

    if (extras.length > 1) {
        await msg.reply('```' + getCommandSyntax('/stats') + '```');
        return;
    }

    if (extras.length === 1) {
        const m = extras[0].match(/^-?(\d+)$/);

        if (!m || Number(m[1]) < 1) {
            await msg.reply('```' + getCommandSyntax('/stats') + '```');
            return;
        }

        dias = Math.min(Number(m[1]), maxDias);
    }

    /*
     * Chats considerados:
     *   -c <nome> → o chat buscado pelo nome, entre os que têm estatísticas;
     *   -me       → todos (null);
     *   senão     → o chat atual.
     */
    let ids = opts.opt.me ? null : await idsDoChatAtual(chatId);

    if (opts.opt.chat) {
        const busca = String(opts.opt.chat).toLowerCase();
        const chats = await dbAll('SELECT chat_id, MAX(chat_name) AS chat_name FROM stats GROUP BY chat_id');
        const encontrados = chats.filter(c => (c.chat_name || '').toLowerCase().includes(busca));
        const exato = encontrados.find(c => c.chat_name.toLowerCase() === busca);

        if (!exato && encontrados.length !== 1) {
            await msg.reply(encontrados.length
                ? `🔎 "${opts.opt.chat}" corresponde a ${encontrados.length} chats. Seja mais específico:\n` +
                  encontrados.slice(0, 10).map(c => `• ${c.chat_name}`).join('\n')
                : `❌ Nenhum chat com estatísticas contém "${opts.opt.chat}".`);
            return;
        }

        ids = [(exato || encontrados[0]).chat_id];
    }

    const { day: desde } = diaEHora(Date.now() - (dias - 1) * DAY_MS);
    const condicoes = ['day >= ?'];
    const params = [desde];

    if (ids) {
        condicoes.push(`chat_id IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
    }

    if (opts.opt.me) {
        condicoes.push('sender_id = ?');
        params.push(meuIdStats());
    }

    const filtro = condicoes.join(' AND ');
    let texto = opts.opt.me
        ? await textoStatsMeu(filtro, params, dias, Boolean(opts.opt.chat))
        : await textoStatsDoChat(filtro, params, dias);

    if (!texto) {
        const onde = opts.opt.me ? (opts.opt.chat ? 'suas neste chat' : 'suas') : 'deste chat';
        await msg.reply(`📊 Sem estatísticas ${onde} nos últimos ${plural(dias, 'dia', 'dias')}.` +
            (getSetting('stats.enabled') ? '' : '\n💡 _A contagem está desligada: /set stats.enabled on_'));
        return;
    }

    texto += `\n💡 _/stats -N para outro período (máx. ${maxDias} dias)${opts.opt.me ? '' : '; /stats -me para as suas'}._`;

    if (opts.opt.pv) {
        await msg.reply('📊 Estatísticas enviadas no seu privado.');
        await client.sendMessage(client.info.wid._serialized, texto);
    } else {
        await msg.reply(texto);
    }
}

/*
 * /set
 *   /set                  → lista todos os settings e seus valores
 *   /set <chave>          → mostra valor, padrão e descrição
 *   /set <chave> <valor>  → altera (lista: itens separados por vírgula ou espaço)
 *   /set -reset <chave>   → volta ao padrão
 */
function formatarValorSetting(value, sep = ', ', secret = false) {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return '(vazio)';
    // Segredo: mostra só os 4 últimos caracteres
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

async function cmdSet({ msg, opts, args }) {
    await dbPronto;

    if (opts.opt.reset !== null) {
        const key = opts.opt.reset;
        const schema = SETTINGS_SCHEMA[key];

        if (!schema) {
            await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
            return;
        }

        await setSetting(key, schema.default);
        await msg.reply(`♻️ *${key}* = ${formatarValorSetting(getSetting(key), ', ', schema.secret)} _(padrão)_`);
        return;
    }

    const [key, ...resto] = opts.argv;

    if (!key) {
        const width = Math.max(...Object.keys(SETTINGS_SCHEMA).map(k => k.length));
        const lista = Object.entries(SETTINGS_SCHEMA)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, s]) => `${k.padEnd(width)}  ${formatarValorSetting(getSetting(k), s.separator ? ' | ' : ', ', s.secret)}`)
            .join('\n');

        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + lista + '\n```\n💡 _/set <chave> para detalhes_');
        return;
    }

    const schema = SETTINGS_SCHEMA[key];

    if (!schema) {
        await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
        return;
    }

    if (!resto.length) {
        const limites = schema.type === 'number' ? ` (${schema.min}..${schema.max})` : '';
        const valor = getSetting(key);
        // Lista "uma por linha": um item por linha também na exibição
        const valorTexto = schema.separator && valor.length
            ? '\n' + valor.map((v, i) => `${i + 1}. ${v}`).join('\n')
            : formatarValorSetting(valor, ', ', schema.secret);

        await msg.reply(
            `⚙️ *${key}*\n${schema.desc}\n\n` +
            `*Valor:* ${valorTexto}\n` +
            `*Padrão:* ${formatarValorSetting(schema.default)}\n` +
            `*Tipo:* ${schema.type}${limites}`
        );
        return;
    }

    // Com separator (ex.: watch.rules, uma por linha) usa o texto cru: o tokenizador
    // perderia as quebras de linha e as aspas de dentro das regras
    const bruto = schema.separator
        ? args.slice(args.indexOf(key) + key.length).trim().replace(/^(["'])([\s\S]*)\1$/, '$2')
        : resto.join(' ');

    try {
        const valor = await setSetting(key, bruto);
        printInfo(`Setting '${key}' alterado para ${schema.secret ? formatarValorSetting(valor, ', ', true) : JSON.stringify(valor)}`);
        await msg.reply(`✅ *${key}* = ${formatarValorSetting(valor, schema.separator ? ' | ' : ', ', schema.secret)}`);
    } catch (e) {
        await msg.reply(`❌ Valor inválido para *${key}*: ${e.message}`);
    }
}

/*
 * /watch (alias /w)
 *   /watch                     → o mesmo que /watch -s (ocorrências de todas as regras)
 *   /watch -l                  → lista as regras (nº, regra, ocorrências)
 *   /watch -s [-N]             → resumo das mensagens que casaram com a regra N (sem N: todas)
 *   /watch -a <texto|/regex/>  → adiciona regra
 *   /watch -d -N               → remove a regra N e as ocorrências dela
 *   /watch -f [-N]             → apaga as ocorrências da regra N (sem N: de todas); mantém as regras
 * As regras ficam no setting 'watch.rules'; as ocorrências na tabela watch_hits.
 * -l e -s mostram conversas de terceiros: fora do seu privado, a resposta vai para lá.
 */
const resumirTexto = (texto, max = 100) => {
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

async function responderNoPrivado({ msg, chatId }, texto) {
    const meuId = client.info.wid._serialized;

    if ((await idsDoChatAtual(chatId)).includes(meuId)) {
        await msg.reply(texto);
        return;
    }

    await msg.reply('👀 Enviado no seu privado.');
    await client.sendMessage(meuId, texto);
}

// "-2" ou "2" em argv → 2; senão null
function numeroDaRegra(argv) {
    const m = String(argv.filter(Boolean)[0] ?? '').match(/^-?(\d+)$/);
    return m ? Number(m[1]) : null;
}

async function cmdWatch({ msg, opts, args, chatId }) {
    await dbPronto;

    const regras = getSetting('watch.rules');
    const ajuda = () => msg.reply('```' + getCommandSyntax('/watch') + '```');

    // -add usa o texto cru: a regra pode ter espaços, aspas ou começar com "-"
    const add = args.match(/^-(?:add|a)(?:\s+([\s\S]*))?$/);

    if (add) {
        const regra = (add[1] ?? '').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();

        if (!regra) {
            await ajuda();
            return;
        }

        if (regras.includes(regra)) {
            await msg.reply(`ℹ️ A regra #${regras.indexOf(regra) + 1} já existe: ${regra}`);
            return;
        }

        const max = getSetting('watch.max');
        if (regras.length >= max) {
            await msg.reply(`❌ Limite de ${max} regras atingido (setting watch.max).\n💡 _Remova uma com /watch -d -N_`);
            return;
        }

        try {
            await setSetting('watch.rules', [...regras, regra]);
        } catch (e) {
            await msg.reply(`❌ Regra inválida: ${e.message}`);
            return;
        }

        const tipo = REGRA_REGEX.test(regra) ? 'regex' : 'texto';
        printInfo(`/watch: regra #${regras.length + 1} adicionada: ${regra}`);
        await msg.reply(`✅ Regra *#${regras.length + 1}* adicionada _(${tipo})_: ${regra}\n💡 _Avisos chegam no seu privado._`);
        return;
    }

    if (opts.opt.list) {
        if (!regras.length) {
            await msg.reply('👀 Nenhuma regra cadastrada.\n💡 _Adicione com /watch -a <texto|/regex/>_');
            return;
        }

        const contagem = new Map(
            (await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
                .map(r => [r.rule, r.total])
        );

        const width = String(regras.length).length + 1;
        const lista = regras
            .map((r, i) => `${`#${i + 1}`.padEnd(width)}  ${r}  (${contagem.get(r) ?? 0})`)
            .join('\n');

        await responderNoPrivado({ msg, chatId },
            `👀 *WATCH: REGRAS* (${regras.length}/${getSetting('watch.max')})\n\n` +
            '```\n' + lista + '\n```\n' +
            '_(entre parênteses: ocorrências guardadas)_\n' +
            '💡 _/watch -s -N para ver as mensagens da regra N._');
        return;
    }

    // Sem nada: o mesmo que /watch -s (ocorrências de todas as regras)
    if (opts.opt.show || !args.trim()) {
        let regra = null;

        if (opts.argv.filter(Boolean).length) {
            const n = numeroDaRegra(opts.argv);

            if (!n || n > regras.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            regra = regras[n - 1];
        }

        const filtro = regra === null ? '' : 'WHERE rule = ?';
        const params = regra === null ? [] : [regra];
        const max = getSetting('watch.showMax');

        const { total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filtro}`, params);
        const rows = await dbAll(
            `SELECT * FROM watch_hits ${filtro} ORDER BY timestamp DESC LIMIT ?`,
            [...params, max]
        );

        let texto = '👀 *WATCH: OCORRÊNCIAS*\n';
        texto += regra === null
            ? '🔎 *Regras:* todas\n'
            : `🔎 *Regra #${regras.indexOf(regra) + 1}:* ${regra}\n`;
        texto += `📦 *Total:* ${total}${total > rows.length ? ` _(exibindo as ${rows.length} mais recentes)_` : ''}\n`;

        if (!rows.length) {
            texto += '\n_Nenhuma mensagem casou ainda._';
        }

        for (const [i, h] of rows.entries()) {
            // Nome do grupo atual (o gravado pode ser o fallback "Grupo <id>" ou estar desatualizado)
            const grupo = h.is_group ? (await resolverNomeDoGrupo(h.chat_id)) || h.chat_name : null;
            const onde = h.is_group ? `👥 ${grupo} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
            const n = regras.indexOf(h.rule) + 1;
            const qual = regra === null ? ` · 🔎 ${n ? `#${n}` : '(removida)'}` : '';

            texto += `\n${i + 1}. 📅 ${formatarData(h.timestamp)}${qual}\n`;
            texto += `    ${onde}\n`;
            texto += `    💬 "${resumirTexto(await resolverMencoes(h.body))}"\n`;
        }

        await responderNoPrivado({ msg, chatId }, texto);
        return;
    }

    if (opts.opt.del) {
        const n = numeroDaRegra(opts.argv);

        if (!n) {
            await ajuda();
            return;
        }

        if (n > regras.length) {
            await msg.reply(`❌ A regra #${n} não existe. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
            return;
        }

        const regra = regras[n - 1];

        await setSetting('watch.rules', regras.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);

        printInfo(`/watch: regra #${n} removida: ${regra}`);
        await msg.reply(
            `🗑️ Regra *#${n}* removida: ${regra}\n` +
            `🗄️ Ocorrências apagadas: *${res.changes}*` +
            (n <= regras.length - 1 ? '\n💡 _As regras seguintes foram renumeradas: veja /watch -l_' : '')
        );
        return;
    }

    if (opts.opt.flush) {
        let regra = null;

        if (opts.argv.filter(Boolean).length) {
            const n = numeroDaRegra(opts.argv);

            if (!n || n > regras.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            regra = regras[n - 1];
        }

        // Sem -N apaga tudo, inclusive ocorrências de regras já removidas
        const res = regra === null
            ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);

        printInfo(`/watch -flush (${regra === null ? 'todas' : regra}): ${res.changes} ocorrências removidas`);
        await msg.reply(
            (regra === null
                ? '🧹 *Flush das ocorrências de todas as regras*\n'
                : `🧹 *Flush das ocorrências da regra #${regras.indexOf(regra) + 1}:* ${regra}\n`) +
            `🗄️ Ocorrências apagadas: *${res.changes}*\n` +
            '💡 _As regras continuam ativas: veja /watch -l_'
        );
        return;
    }

    await ajuda();
}

// /kernel: versões atuais publicadas em kernel.org
async function cmdKernel({ msg }) {
    try {
        const { data } = await axios.get('https://www.kernel.org/releases.json', { timeout: 15000 });

        const linhas = data.releases
            .filter(r => ['mainline', 'stable', 'longterm'].includes(r.moniker))
            .slice(0, 6)
            .map(r => `${r.moniker.padEnd(9)} ${r.version.padEnd(12)} ${r.released?.isodate ?? ''}`);

        await msg.reply(
            `🐧 *Linux ${data.latest_stable.version}* _(latest stable)_\n\n` +
            '```\n' + linhas.join('\n') + '\n```'
        );
    } catch (err) {
        printError('/kernel:', err.message);
        await msg.reply('❌ Não consegui consultar o kernel.org agora.');
    }
}

/*
 * /boletos: sorteio de membros do grupo
 */
// Sorteia `n` participantes diferentes (fora o próprio bot)
function sortearParticipantes(participantes, n) {
    const meuUser = client.info?.wid?.user;
    const pool = participantes.filter(p => p.id.user !== meuUser);

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, n);
}

async function enviarSorteio(msg, chat, sorteados, montarTexto) {
    const mentions = sorteados.map(p => p.id._serialized.split(':')[0]);
    const tags = sorteados.map(p => `@${p.id.user}`);

    await client.sendMessage(chat.id._serialized, montarTexto(tags), {
        mentions,
        quotedMessageId: msg.id._serialized
    });
}

async function cmdBoletos({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const sorteados = sortearParticipantes(chat.participants, 2);

    if (sorteados.length < 2) {
        await msg.reply('Membros insuficientes no grupo.');
        return;
    }

    await enviarSorteio(msg, chat, sorteados, ([a, b]) =>
        `🥳 Parabéns ${a} e ${b} 🎉\n` +
        'Vocês foram sorteados para pagar um boleto! 💸✨\n' +
        'Anote o número: 📝 001 9 337370000000100 05009 401448 16060680935031\n' +
        'Boa sorte pagando! 😉💰'
    );
}

// /meme [busca]: template aleatório do imgflip
async function cmdMeme({ msg, args }) {
    try {
        const { data } = await axios.get('https://api.imgflip.com/get_memes', { timeout: 15000 });
        const busca = args.trim().toLowerCase();
        const memes = data.data.memes.filter(m => !busca || m.name.toLowerCase().includes(busca));

        if (!memes.length) {
            await msg.reply(`❌ Nenhum meme com "${args.trim()}".`);
            return;
        }

        const meme = memes[Math.floor(Math.random() * memes.length)];
        const { data: imagem, headers } = await axios.get(meme.url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
        const media = new MessageMedia(headers['content-type'] || 'image/jpeg', Buffer.from(imagem).toString('base64'), 'meme.jpg');

        await msg.reply(media, null, { caption: `🖼️ ${meme.name}` });
    } catch (err) {
        printError('/meme:', err.message);
        await msg.reply('❌ Não consegui buscar um meme agora.');
    }
}

// /listageral: membros do grupo (número, nome, admins)
async function cmdListaGeral({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const linhas = [];

    for (const p of chat.participants) {
        const jid = removeDeviceSuffix(p.id._serialized);
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : jid;
        const contato = await client.getContactById(phoneJid || jid).catch(() => null);
        const nome = contato?.name || contato?.pushname || 'Desconhecido';
        const numero = phoneJid?.endsWith('@c.us') ? `+${phoneJid.split('@')[0]}` : '(número oculto)';
        const admin = p.isSuperAdmin ? ' 👑' : p.isAdmin ? ' ⭐' : '';

        linhas.push(`${numero} - ${nome}${admin}`);
    }

    await msg.reply(`👥 *Membros de ${chat.name}* (${linhas.length})\n\n${linhas.join('\n')}`);
}

// /gif [tag]: GIF aleatório do GIPHY, enviado como MP4 em loop.
// Chave: GIPHY_API_KEY no config/.env ou, na falta dela, o setting 'gif.giphy.api.key'
async function cmdGif({ msg, args }) {
    const apiKey = envOuSetting('GIPHY_API_KEY', 'gif.giphy.api.key');

    if (!apiKey) {
        await msg.reply('⚠️ Chave do GIPHY não configurada: defina GIPHY_API_KEY no config/.env ou use /set gif.giphy.api.key <chave>.');
        return;
    }

    try {
        const { data } = await axios.get('https://api.giphy.com/v1/gifs/random', {
            timeout: 15000,
            params: { api_key: apiKey, tag: args.trim() || getSetting('gif.tag'), rating: 'pg-13' }
        });

        const mp4 = data.data?.images?.original?.mp4;

        if (!mp4) {
            await msg.reply('❌ Nenhum GIF encontrado.');
            return;
        }

        const { data: video } = await axios.get(mp4, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
        const media = new MessageMedia('video/mp4', Buffer.from(video).toString('base64'), 'gif.mp4');

        await msg.reply(media, null, { sendVideoAsGif: true });
    } catch (err) {
        printError('/gif:', err.message);
        await msg.reply('❌ Não consegui buscar um GIF agora.');
    }
}

// /joke: JokeAPI em português (safe-mode)
async function cmdJoke({ msg }) {
    try {
        const { data } = await axios.get('https://v2.jokeapi.dev/joke/Any', { timeout: 15000, params: { lang: 'pt', 'safe-mode': '' } });

        if (data.error) throw new Error(data.message || 'erro da JokeAPI');

        await msg.reply(data.type === 'twopart' ? `${data.setup}\n\n... ${data.delivery} 🥁` : data.joke);
    } catch (err) {
        printError('/joke:', err.message);
        await msg.reply('❌ Não consegui buscar uma piada agora.');
    }
}

/*
 * /cve [max] [-highscore|-high [max]]: CVEs publicadas no NVD (nvd.nist.gov).
 *   /cve [N]         → as N mais recentes dos últimos CVE_DIAS_RECENTES dias
 *   /cve -high [N]   → as N críticas (CVSS v3 CRITICAL, ≥ 9) mais recentes dos
 *                      últimos 'cve.maxDays' dias
 * Sem N usa o setting 'cve.max'.
 *
 * A API do cve.circl.lu que o zapzap usava mudou de formato e quase nunca traz a
 * nota CVSS. Sem chave o NVD aceita ~5 consultas a cada 30s.
 */
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CVE_DIAS_RECENTES = 2;

// O NVD quer ISO-8601 sem o 'Z'
const nvdData = (d) => d.toISOString().replace('Z', '');

const periodoDias = (dias) => dias === 1 ? 'último dia' : `últimos ${dias} dias`;

// Nota preferida: CVSS v3.1 > v4.0 > v3.0 > v2 (métrica Primary, senão a primeira)
function notaCvss(cve) {
    const m = cve.metrics ?? {};

    for (const chave of ['cvssMetricV31', 'cvssMetricV40', 'cvssMetricV30', 'cvssMetricV2']) {
        const metrica = m[chave]?.find(x => x.type === 'Primary') ?? m[chave]?.[0];
        if (metrica?.cvssData?.baseScore != null) {
            return { score: metrica.cvssData.baseScore, severity: metrica.cvssData.baseSeverity ?? metrica.baseSeverity ?? '' };
        }
    }

    return null;
}

/*
 * As `max` CVEs publicadas mais recentemente nos últimos `dias`, da mais nova
 * para a mais antiga. O NVD ordena da mais antiga para a mais nova e não tem
 * ordenação reversa: uma consulta conta o total e a outra busca só o final.
 */
async function buscarCvesRecentes({ dias, max, critical = false }) {
    const fim = new Date();
    const filtro = {
        pubStartDate: nvdData(new Date(fim.getTime() - dias * DAY_MS)),
        pubEndDate: nvdData(fim),
        noRejected: '',
        ...(critical && { cvssV3Severity: 'CRITICAL' })
    };

    const consultar = async (params) =>
        (await axios.get(NVD_URL, { params: { ...filtro, ...params }, timeout: 30000 })).data;

    const { totalResults } = await consultar({ resultsPerPage: 1 });
    if (!totalResults) return [];

    const { vulnerabilities } = await consultar({ resultsPerPage: max, startIndex: Math.max(0, totalResults - max) });

    return vulnerabilities.map(v => v.cve).reverse();
}

function formatarCve(cve) {
    const nota = notaCvss(cve);
    const descricao = cve.descriptions?.find(d => d.lang === 'en')?.value ?? '';

    return `🛡️ *${cve.id}*${nota ? ` — ${nota.score} ${nota.severity}` : ''}\n` +
           `${resumirTexto(descricao, 220)}\n` +
           `https://nvd.nist.gov/vuln/detail/${cve.id}`;
}

async function cmdCve({ msg, opts }) {
    const critical = opts.given.has('highscore');
    const dias = critical ? getSetting('cve.maxDays') : CVE_DIAS_RECENTES;

    // <max> informado (/cve 5 ou /cve -high 5) sobrepõe o setting cve.max
    const { max: limite } = SETTINGS_SCHEMA['cve.max'];
    const valor = opts.opt.highscore ?? opts.argv[0] ?? getSetting('cve.max');
    const max = Number(valor);

    if (!Number.isInteger(max) || max < 1 || max > limite) {
        await msg.reply(`❌ Quantidade inválida: ${valor}. Use de 1 a ${limite}.\n💡 _/cve 5 ou /cve -high 5_`);
        return;
    }

    try {
        const cves = await buscarCvesRecentes({ dias, max, critical });

        if (!cves.length) {
            await msg.reply(`🛡️ Nenhuma CVE${critical ? ' crítica' : ''} publicada no ${periodoDias(dias)}.`);
            return;
        }

        const titulo = critical
            ? `🔥 *${cves.length} CVEs críticas mais recentes* _(CVSS ≥ 9, ${periodoDias(dias)})_`
            : `🛡️ *Últimas ${cves.length} CVEs publicadas* _(${periodoDias(dias)})_`;

        await msg.reply(`${titulo}\n\n${cves.map(formatarCve).join('\n\n')}`, null, { linkPreview: false });
    } catch (err) {
        printError('/cve:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora (limite de consultas? tente em 30s).');
    }
}

// /tempo [cidade]: Open-Meteo (sem chave de API)
const CLIMA_WMO = {
    0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Predominantemente limpo'], 2: ['⛅', 'Parcialmente nublado'],
    3: ['☁️', 'Nublado'], 45: ['🌫️', 'Neblina'], 48: ['🌫️', 'Neblina com geada'],
    51: ['🌦️', 'Garoa fraca'], 53: ['🌦️', 'Garoa'], 55: ['🌦️', 'Garoa forte'],
    56: ['🌧️', 'Garoa congelante'], 57: ['🌧️', 'Garoa congelante forte'],
    61: ['🌧️', 'Chuva fraca'], 63: ['🌧️', 'Chuva'], 65: ['🌧️', 'Chuva forte'],
    66: ['🌧️', 'Chuva congelante'], 67: ['🌧️', 'Chuva congelante forte'],
    71: ['🌨️', 'Neve fraca'], 73: ['🌨️', 'Neve'], 75: ['❄️', 'Neve forte'], 77: ['🌨️', 'Grãos de neve'],
    80: ['🌦️', 'Pancadas de chuva'], 81: ['🌧️', 'Pancadas de chuva fortes'], 82: ['⛈️', 'Pancadas violentas'],
    85: ['🌨️', 'Pancadas de neve'], 86: ['❄️', 'Pancadas de neve fortes'],
    95: ['⛈️', 'Trovoada'], 96: ['⛈️', 'Trovoada com granizo'], 99: ['⛈️', 'Trovoada com granizo forte']
};

const OPEN_METEO_GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const TEMPO_FRIO = 5;   // °C: "Tá congelando!"
const TEMPO_CALOR = 30; // °C: "Que calor!"

// Geocodificação guardada em memória: coordenada de cidade não muda e a cidade
// padrão (tempo.city) é consultada o tempo todo
const geoCache = new Map();
const GEO_CACHE_MAX = 100;

/*
 * Resolve "cidade[, estado][, país]" para { name, admin1, country, latitude, longitude }
 * ou null. A Open-Meteo entende o texto inteiro e escolhe o resultado mais
 * relevante (normalmente o mais populoso).
 */
async function geocodificarCidade(cidade) {
    const chave = cidade.toLowerCase();
    if (geoCache.has(chave)) return geoCache.get(chave);

    const { data } = await axios.get(OPEN_METEO_GEO_URL, {
        timeout: 15000,
        params: { name: cidade, count: 1, language: 'pt' }
    });
    const local = data.results?.[0] ?? null;

    // Só guarda acertos: "não encontrada" pode ser erro de digitação corrigido depois
    if (local) {
        if (geoCache.size >= GEO_CACHE_MAX) geoCache.delete(geoCache.keys().next().value);
        geoCache.set(chave, local);
    }

    return local;
}

async function consultarTempo({ latitude, longitude }) {
    const { data } = await axios.get(OPEN_METEO_URL, {
        timeout: 15000,
        params: {
            latitude,
            longitude,
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
            daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
            forecast_days: 1,
            timezone: 'auto'
        }
    });

    return data;
}

// Valor ausente (a Open-Meteo às vezes manda null) vira '-'
const medida = (valor, unidade) => valor == null ? '-' : `${Math.round(valor)}${unidade}`;

function formatarTempo(local, { current: c, daily: d }) {
    const [icone, descricao] = CLIMA_WMO[c.weather_code] ?? ['🌡️', `Código ${c.weather_code}`];
    const onde = [local.name, local.admin1, local.country].filter(Boolean).join(', ');
    const temp = Math.round(c.temperature_2m);

    let texto =
        `${icone} *Tempo em ${onde}*\n\n` +
        `${descricao}\n` +
        `🌡️ *Agora:* ${medida(c.temperature_2m, '°C')} _(sensação ${medida(c.apparent_temperature, '°C')})_\n` +
        `📈 *Máx:* ${medida(d.temperature_2m_max?.[0], '°C')}  📉 *Mín:* ${medida(d.temperature_2m_min?.[0], '°C')}\n` +
        `💧 *Umidade:* ${medida(c.relative_humidity_2m, '%')}  🌬️ *Vento:* ${medida(c.wind_speed_10m, ' km/h')}\n` +
        `☔ *Chance de chuva:* ${medida(d.precipitation_probability_max?.[0], '%')}`;

    if (temp <= TEMPO_FRIO) texto += '\n\n🥶 Tá congelando!';
    if (temp >= TEMPO_CALOR) texto += '\n\n🔥 Que calor da porra!';

    return texto;
}

async function cmdTempo({ msg, args }) {
    // Sem cidade usa o setting tempo.city
    const cidade = args.trim() || getSetting('tempo.city');

    try {
        const local = await geocodificarCidade(cidade);

        if (!local) {
            await msg.reply(`❌ Cidade não encontrada: ${cidade}\n💡 _Tente com estado e país: /tempo Niteroi, Rio de Janeiro, Brazil_`);
            return;
        }

        await msg.reply(formatarTempo(local, await consultarTempo(local)));
    } catch (err) {
        printError('/tempo:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o tempo agora.');
    }
}

// /ualisu: Walissu CVE BOT (usa o sorteio do /boletos e as CVEs do /cve)
async function cmdUalisu({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const sorteados = sortearParticipantes(chat.participants, 2);

    if (sorteados.length < 2) {
        await msg.reply('Membros insuficientes no grupo.');
        return;
    }

    try {
        const cves = await buscarCvesRecentes({ dias: 2, max: 50 });
        const cve = cves[Math.floor(Math.random() * cves.length)];

        if (!cve) {
            await msg.reply('🛡️ Nenhuma CVE publicada nos últimos 2 dias.');
            return;
        }

        await enviarSorteio(msg, chat, sorteados, ([a, b]) =>
            `Hey ${a} e ${b}, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊\n\n` +
            `${formatarCve(cve)}\n\n` +
            'Cadê o exploit? Preciso sair de Brasília!'
        );
    } catch (err) {
        printError('/ualisu:', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora.');
    }
}

/*
 * /bot: estado do bot (settings 'bot.paused' e 'bot.adminMode', sobrevivem a reinícios)
 *   /bot        → mostra o estado
 *   /bot -on    → ativa
 *   /bot -off   → desliga: TODOS os comandos são ignorados, inclusive os seus, exceto o /bot
 *   /bot +admin → modo admin: só o dono usa comandos (os dos outros são ignorados em silêncio)
 *   /bot -admin → desliga o modo admin (cada comando volta a seguir o seu onlyAdmin)
 * Opções combinam: /bot -on +admin. A recuperação de apagadas e o /watch continuam funcionando.
 * O parser só reconhece opções com '-', então o '+admin' chega em opts.argv.
 */
function estadoBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        (getSetting('bot.adminMode')
            ? '🔒 *Modo admin:* ligado (só o dono usa comandos)'
            : '🔓 *Modo admin:* desligado');
}

async function cmdBot({ msg, opts }) {
    const { on, off, admin: adminOff } = opts.opt;
    const adminOn = opts.argv.includes('+admin');
    const desconhecidos = opts.argv.filter(a => a !== '+admin');

    if (desconhecidos.length || (on && off) || (adminOn && adminOff)) {
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]\n💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    if (adminOn || adminOff) await setSetting('bot.adminMode', adminOn);

    await msg.reply(estadoBot());
}

/*
 * /news <-categoria> [quantidade]: manchetes dos feeds RSS da categoria.
 *   Categorias em NEWS_CATEGORIAS, cada uma com os feeds no setting 'news.<categoria>';
 *   várias juntas somam os feeds (/news -g1 -gazeta). Sem categoria mostra a ajuda.
 *   quantidade → 1 a 10 (padrão: setting 'news.max')
 */
const NEWS_CATEGORIAS = {
    hack: '🏴‍☠️ *Hacking News*',
    g1: '📰 *g1*',
    gazeta: '📰 *Gazeta do Povo*',
    brasil: '🇧🇷 *Brasil*'
};

const ENTIDADES_XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Uma passada só: "&amp;lt;" vira "&lt;" (e não "<"), como deve ser
const decodificarEntidades = (s) => String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (ent, dec, hex, nome) => {
        if (nome) return ENTIDADES_XML[nome.toLowerCase()] ?? ent;
        const codigo = dec ? Number(dec) : parseInt(hex, 16);
        return codigo <= 0x10FFFF ? String.fromCodePoint(codigo) : ent;
    })
    .trim();

// Conteúdo decodificado da primeira <tag> do trecho de XML
const tagXml = (xml, tag) => decodificarEntidades(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]);

async function lerFeed(url) {
    // Alguns sites (ex.: BleepingComputer) recusam o User-Agent padrão do axios com 403
    const { data: xml } = await axios.get(url, { responseType: 'text', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (ZapBot RSS reader)' } });
    const fonte = tagXml(xml.match(/<channel>[\s\S]*?<\/title>/)?.[0] ?? '', 'title') || new URL(url).hostname;

    return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)]
        .map(([item]) => ({
            fonte,
            titulo: tagXml(item, 'title'),
            link: tagXml(item, 'link'),
            data: Date.parse(tagXml(item, 'pubDate')) || 0
        }))
        .filter(i => i.titulo)
        .sort((a, b) => b.data - a.data);
}

async function cmdNews({ msg, opts }) {
    const categorias = Object.keys(NEWS_CATEGORIAS).filter(c => opts.opt[c]);

    if (!categorias.length) {
        await msg.reply('```' + getCommandSyntax('/news') + '```');
        return;
    }

    const { max: limite } = SETTINGS_SCHEMA['news.max'];
    const valor = opts.argv[0] ?? getSetting('news.max');
    const max = Number(valor);

    if (!Number.isInteger(max) || max < 1 || max > limite) {
        await msg.reply(`❌ Quantidade inválida: ${valor}. Use de 1 a ${limite}.\n💡 _/news -g1 5_`);
        return;
    }

    const feeds = categorias.flatMap(c => getSetting(`news.${c}`));

    if (!feeds.length) {
        await msg.reply(`ℹ️ Nenhum feed configurado.\n💡 _Adicione com /set news.${categorias[0]} <url1> <url2>_`);
        return;
    }

    const resultados = await Promise.allSettled(feeds.map(lerFeed));
    const porFonte = [];

    resultados.forEach((r, i) => {
        if (r.status === 'fulfilled') porFonte.push(r.value);
        else printError(`/news: feed ${feeds[i]} falhou:`, r.reason?.message);
    });

    // Cada fonte ocupa no máximo a sua fatia: senão a que publica mais toma a lista toda
    const fatia = Math.ceil(max / Math.max(1, porFonte.length));
    const itens = porFonte
        .flatMap(lista => lista.slice(0, fatia))
        .sort((a, b) => b.data - a.data)
        .slice(0, max);

    if (!itens.length) {
        await msg.reply('❌ Não consegui buscar as manchetes agora.');
        return;
    }

    const linhas = itens.map((i, n) =>
        `${n + 1}. *${i.titulo}*\n_${i.fonte}${i.data ? ` · ${formatarData(i.data)}` : ''}_${i.link ? `\n${i.link}` : ''}`);

    const titulo = categorias.length === 1 ? NEWS_CATEGORIAS[categorias[0]] : '📰 *News*';

    await msg.reply(`${titulo}\n\n${linhas.join('\n\n')}`, null, { linkPreview: false });
}

/*
 * /gpt: pergunta ao ChatGPT. Chave e timeout vêm do config/.env (OPENAI_API_KEY,
 * OPENAI_TIMEOUT_MS) ou, na falta deles, dos settings 'openai.api.key' e
 * 'openai.timeout.ms'. A chave nunca é logada nem ecoada: o erro devolvido é só
 * a mensagem da API.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL_PADRAO = 'gpt-4o-mini';
const GPT_INSTRUCOES = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

// Erro da OpenAI → mensagem para o chat (nunca contém a chave)
function erroOpenAi(err, timeout) {
    if (err.code === 'ECONNABORTED') return `⏱️ A OpenAI não respondeu em ${timeout / 1000}s. Tente de novo ou aumente o openai.timeout.ms.`;
    if (err.response?.status === 401) return '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.';
    if (err.response?.status === 429) return '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.';
    return `❌ Erro no /gpt: ${err.response?.data?.error?.message || err.message}`;
}

async function cmdGpt({ msg, args, quotedMsg }) {
    const apiKey = envOuSetting('OPENAI_API_KEY', 'openai.api.key');

    if (!apiKey) {
        await msg.reply('⚠️ API key da OpenAI não encontrada: o /gpt está desativado.\n💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_');
        return;
    }

    // Respondendo uma mensagem, o texto dela entra antes da pergunta
    const pergunta = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    if (!pergunta) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    try {
        // "digitando..." enquanto a OpenAI responde (pode levar alguns segundos)
        msg.getChat().then(chat => chat.sendStateTyping()).catch(() => {});

        const { data } = await axios.post(OPENAI_URL, {
            model: process.env.OPENAI_MODEL?.trim() || OPENAI_MODEL_PADRAO,
            messages: [
                { role: 'system', content: GPT_INSTRUCOES },
                { role: 'user', content: pergunta }
            ]
        }, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout
        });

        let resposta = data.choices?.[0]?.message?.content?.trim() || '(resposta vazia)';

        // A resposta nunca começa com "/": não pode ser lida como comando (ver marcarEnviadaPeloBot)
        if (resposta.startsWith('/')) resposta = `🤖 ${resposta}`;

        await msg.reply(resposta);
    } catch (err) {
        // No 401 a mensagem da OpenAI traz um pedaço da chave: não vai para o log
        const status = err.response?.status;
        printError('/gpt:', status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        await msg.reply(erroOpenAi(err, timeout));
    }
}

// cmd do bot-config.json -> handler
const HANDLERS = {
    '/boletos': cmdBoletos,
    '/bot': cmdBot,
    '/cache': cmdCache,
    '/cotacao': cmdCotacao,
    '/crypto': cmdCrypto,
    '/cve': cmdCve,
    '/debug': cmdDebug,
    '/edit': cmdEdit,
    '/enquete': cmdEnquete,
    '/everyone': cmdEveryone,
    '/get': cmdGet,
    '/gif': cmdGif,
    '/gpt': cmdGpt,
    '/help': cmdHelp,
    '/joke': cmdJoke,
    '/kernel': cmdKernel,
    '/listageral': cmdListaGeral,
    '/meme': cmdMeme,
    '/monitor': cmdMonitor,
    '/news': cmdNews,
    '/noffa': cmdNoffa,
    '/ping': cmdPing,
    '/set': cmdSet,
    '/show': cmdUndo,
    '/stats': cmdStats,
    '/sticker': cmdSticker,
    '/tempo': cmdTempo,
    '/ualisu': cmdUalisu,
    '/uptime': cmdUptime,
    '/version': cmdUptime,
    '/watch': cmdWatch
};

// Avisa no boot se o bot-config tiver comando sem handler (ou vice-versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no bot-config.json mas não tem handler.`);
}

/*
 * Mensagens
 */
client.on('message_create', async (msg) => {
    try {
        const timestamp = Date.now();
        const msgIdPure = msg?.id?.id || `fallback_${timestamp}`;
        const msgType = msg?.type || 'unknown';

        // msg.getChat() quebra para alguns chats/@lid; usamos os dados crus.
        const chatId = msg?.id?.remote || msg?.from || msg?.to || 'UNKNOWN';
        const isGroup = chatId.endsWith('@g.us') ? 1 : 0;

        // Grupo: nome buscado pelo chatId (o _data.chat pode trazer o nome errado)
        const chatName =
            (isGroup ? await resolverNomeDoGrupo(chatId) : null) ||
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            // notifyName é o nome de quem ENVIOU: só serve de nome do chat em conversa privada
            (isGroup ? null : msg?._data?.notifyName) ||
            (isGroup ? `Grupo ${chatId.split('@')[0]}` : chatId.split('@')[0]);

        /*
         * Remetente real:
         *   grupo   -> msg.author (participante)
         *   privado -> msg.from (ou msg.to se fui eu)
         */
        let rawSenderId = isGroup
            ? (msg?.author || msg?._data?.participant?._serialized || msg?._data?.participant || null)
            : (msg?.fromMe ? (msg?.to || msg?.from) : msg?.from);

        // 111780869222483:93@lid -> 111780869222483@lid (não converte @lid para @c.us)
        rawSenderId = removeDeviceSuffix(rawSenderId);

        const originalSenderJid = rawSenderId;
        let resolvedSenderJid = rawSenderId;

        if (rawSenderId?.endsWith('@lid')) {
            const phoneJid = await resolveLidToPhone(rawSenderId);
            if (phoneJid) resolvedSenderJid = phoneJid;
        }

        // Contato, preferencialmente pelo telefone real; senão pelo LID
        let contact = null;

        if (resolvedSenderJid && !resolvedSenderJid.endsWith('@g.us')) {
            contact = await client.getContactById(resolvedSenderJid).catch(() => null);
        }

        if (!contact && originalSenderJid?.endsWith('@lid')) {
            contact = await client.getContactById(originalSenderJid).catch(() => null);
        }

        // Prioriza o telefone real; se não resolver, mantém o LID (não inventa número)
        const senderJid = resolvedSenderJid || originalSenderJid || 'UNKNOWN';
        const senderNumber = senderJid.endsWith('@c.us') ? senderJid.split('@')[0] : null;

        const senderName =
            contact?.name ||
            contact?.pushname ||
            msg?._data?.notifyName ||
            senderNumber ||
            originalSenderJid ||
            'Desconhecido';

        const senderContact = contact || {
            id: { _serialized: senderJid, user: senderJid.split('@')[0] },
            number: senderNumber || senderJid.split('@')[0],
            name: senderName,
            pushname: msg?._data?.notifyName || senderName
        };

        if (isDebugMode()) {
            printDebug(`msgIdPure=${msgIdPure} senderName=${senderName} senderJid=${senderJid} senderNumber=${senderNumber} chatId=${chatId} chatName=${chatName}`);
            printDebug({
                author: msg?.author,
                from: msg?.from,
                to: msg?.to,
                remote: msg?.id?.remote,
                contact_id: contact?.id?._serialized || null,
                number: contact?.number || null,
                pushname: contact?.pushname || null,
                name: contact?.name || null
            });
        }

        /*
         * Persistência (para recuperar mensagens apagadas)
         */
        let hasMedia = msg.hasMedia ? 1 : 0;
        let localMediaPath = null;
        let lat = null;
        let lng = null;

        if (msgType === 'location' && msg.location) {
            lat = msg.location.latitude;
            lng = msg.location.longitude;
        }

        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();

                if (media?.data) {
                    const extension = nomeSeguro(media.mimetype?.split('/')[1]?.split(';')[0], 'bin');
                    const arquivo = path.join(obterPastaMidia(), `${nomeSeguro(msgIdPure, `fallback_${timestamp}`)}.${extension}`);

                    if (!isCaminhoDeMidia(arquivo)) throw new Error(`caminho de mídia inválido: ${arquivo}`);

                    fs.writeFileSync(arquivo, Buffer.from(media.data, 'base64'));
                    localMediaPath = arquivo;
                }
            } catch (error) {
                printError('Falha ao baixar mídia:', error.message);
                hasMedia = 0;
            }
        }

        /*
         * UPSERT em vez de INSERT OR REPLACE: o REPLACE apaga e recria a linha,
         * o que zeraria revoked/revoked_at se o WhatsApp reenviar o mesmo id
         * (sincronização, reconexão). Linha já marcada como apagada não é tocada,
         * e um media_path existente não é trocado por null.
         */
        await dbPronto;

        /*
         * /stats: só mensagens novas (o WhatsApp pode reenviar o mesmo id numa
         * reconexão) e nunca as respostas do próprio bot.
         */
        const jaGravada = await dbGet('SELECT 1 AS ok FROM messages WHERE id = ?', [msgIdPure]).catch(() => null);

        if (!jaGravada && !(msg.fromMe && consumirEnvioDoBot(chatId))) {
            // No privado, senderJid das suas mensagens é o do OUTRO participante (ver rawSenderId)
            await contarStats({
                chatId, chatName, isGroup,
                senderId: msg.fromMe ? meuIdStats() : (senderNumber || senderJid),
                senderName: msg.fromMe ? (client.info?.pushname || 'Você') : senderName,
                quando: paraMs(msg.timestamp) || timestamp,
                campos: { msgs: 1, media: hasMedia }
            });
        }

        await dbRun(
            `INSERT INTO messages
                (id, sender_name, sender_jid, sender_number,
                 chat_id, chat_name, is_group,
                 body, type, timestamp,
                 has_media, media_path,
                 location_lat, location_lng,
                 raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                sender_name   = excluded.sender_name,
                sender_jid    = excluded.sender_jid,
                sender_number = excluded.sender_number,
                chat_id       = excluded.chat_id,
                chat_name     = excluded.chat_name,
                is_group      = excluded.is_group,
                body          = excluded.body,
                type          = excluded.type,
                has_media     = excluded.has_media,
                media_path    = COALESCE(excluded.media_path, messages.media_path),
                location_lat  = excluded.location_lat,
                location_lng  = excluded.location_lng,
                raw_json      = excluded.raw_json
             WHERE messages.revoked = 0`,
            [
                msgIdPure, senderName, senderJid, senderNumber,
                chatId, chatName, isGroup,
                msg.body || '', msgType, timestamp,
                hasMedia, localMediaPath,
                lat, lng,
                'desativado'
            ]
        ).catch(err => printError('Erro ao salvar mensagem:', err.message));

        const body = (msg.body || '').trim();
        // Resposta do próprio bot nunca é comando, mesmo começando com "/" (ver marcarEnviadaPeloBot)
        const enviadaPeloBot = msg.fromMe && body.startsWith('/') && foiEnviadaPeloBot(body);
        const caller = body.startsWith('/') && !enviadaPeloBot ? body.split(/\s+/, 1)[0] : null;

        if (enviadaPeloBot) printInfo(`Mensagem do próprio bot começando com '/' ignorada como comando: ${body.slice(0, 60)}`);
        const command = caller ? findCommand(caller) : null;

        /*
         * Watch: mensagens que não são comandos passam pelas regras do /watch
         */
        if (!command) {
            await verificarWatch({
                msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp
            }).catch(err => printError('/watch: erro ao verificar regras:', err.message));
        }

        /*
         * Comandos
         */
        if (!caller) return;

        const args = body.slice(caller.length).trim();

        if (!command) {
            if (isDebugMode()) printDebug(`Comando '${caller}' não encontrado`);
            return;
        }

        // Bot desligado: tudo ignorado (inclusive os seus comandos) até o /bot -on
        if (getSetting('bot.paused') && command.cmd !== '/bot') {
            printInfo(`Comando '${command.cmd}' ignorado: bot desligado (/bot -on para ativar)`);
            return;
        }

        // Modo admin (/bot +admin): comandos dos outros são ignorados em silêncio
        if (getSetting('bot.adminMode') && !msg.fromMe) {
            printDebug(`Comando '${command.cmd}' de ${senderName} ignorado: modo admin`);
            return;
        }

        /*
         * Comando restrito ao dono do bot: ignora em silêncio no chat e só avisa
         * no seu privado. Evita que, com vários zapbots no mesmo grupo, o comando
         * de uma pessoa seja executado por todos.
         */
        if (!msg.fromMe && command.onlyAdmin) {
            if (isDebugMode()) {
                messageToSelf(`⚠️ ${senderName} tentou executar ${command.cmd} dentro de ${chatName}, mas sem permissão`);
            }
            return;
        }

        printDebug(isGroup
            ? `Executando comando '${body}' de '${senderName}' no grupo '${chatName}'`
            : `Executando comando '${body}' em '${chatName}'`);

        const opts = GetOptFromCommand(args, command);

        if (isDebugMode()) {
            printDebug('GetOptFromCommand():', command.cmd, opts);
        }

        // foo -help
        if (opts.opt.help) {
            await msg.reply('```' + getCommandSyntax(command.cmd) + '```');
            return;
        }

        printCall(senderContact, body);

        const handler = HANDLERS[command.cmd];

        if (!handler) {
            await msg.reply(`⚠️ O comando ${command.cmd} ainda não foi implementado.`);
            return;
        }

        const quotedMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage().catch(() => null) : null;

        await handler({ msg, opts, args, quotedMsg, senderContact, senderName, isGroup, chatId, chatName });
    } catch (error) {
        printError('[message_create] Erro geral controlado:', {
            error: error?.message || String(error),
            stack: error?.stack,
            from: msg?.from,
            to: msg?.to,
            remote: msg?.id?.remote,
            fromMe: msg?.fromMe,
            type: msg?.type
        });
    }
});
