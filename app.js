const { Client, MessageMedia, LocalAuth, Location } = require('whatsapp-web.js');
const { spawn } = require('child_process');
const util = require('util');
const path = require('path');

const axios = require('axios');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const colors = require('colors');
const fs = require('fs-extra');
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

const CACHE_DIR = path.join(__dirname, 'cache');
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // mídias salvas para recuperar mensagens apagadas
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // arquivos temporários do /get

const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_YT = '/venv/bin/yt-dlp';

const STICKER_META = {
    stickerName: 'ZapBot',
    stickerAuthor: 'https://github.com/jpereira/zapbot/'
};

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

// Comparação sem diferenciar maiúsculas: antes "dev" !== "Dev" e o debug nunca ligava.
let isDebugMode = APP_ENV.toLowerCase() === 'dev';

printInfo(`Running in APP_ENV=${APP_ENV} QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE} isDebugMode=${isDebugMode}`);

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

try {
    db.serialize(() => {
        // Histórico de quando os contatos monitorados ficam online
        db.run(`
            CREATE TABLE IF NOT EXISTS presence_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone_number TEXT,
                display_name TEXT,
                status TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Números monitorados via /monitor
        db.run(`
            CREATE TABLE IF NOT EXISTS monitored_numbers (
                phone_number TEXT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Mensagens recebidas (para recuperar as apagadas)
        db.run(`
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

                raw_json TEXT
            )
        `);
    });

    for (const dir of [MEDIA_DIR, TMP_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printInfo(`Creating ${dir}`);
        }
    }
} catch (e) {
    console.error('Bootstrap Erro:', e);
    process.exit(1);
}

/*
 * Configuração dos comandos
 */
const botConfig = require('./config/bot-config.json');
const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

function findCommand(name) {
    return botConfig.commands.find(c => c.cmd === name || c.aliases?.includes(name));
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
    },
    tls: {
        rejectUnauthorized: false
    }
});

/*
 * Execução de processos externos (yt-dlp / ffmpeg)
 */
function runCommand(bin, args, logFd) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', logFd, logFd] });

        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) return resolve();
            reject(new Error(`${bin} exited with code ${code}`));
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

function GetOptFromCommandForFfmpeg(opts, originalFile, outputFile) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const isAudio   = opts.opt.audio;    // -audio    | -a
    const startSec  = opts.opt.startSec; // -startSec | -ss
    const endSec    = opts.opt.endSec;   // -endSec   | -es
    const args      = ['-y'];

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
        // Sticker animado 512x512
        args.push(
            '-vf',
            'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black',
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
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    // Mesmo array em result.argv e result.opt.argv
    const argv = [];
    const result = { opt: { argv }, argv };

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

// Remove mensagens e mídias mais antigas que a janela de "apagar para todos"
async function limparCacheAntigo(maxDeleteWin = MAX_DELETE_WINDOW) {
    const limiteTempo = Date.now() - maxDeleteWin;

    try {
        const rows = await dbAll(
            'SELECT media_path FROM messages WHERE timestamp < ? AND media_path IS NOT NULL',
            [limiteTempo]
        );

        for (const row of rows) {
            if (fs.existsSync(row.media_path)) {
                printInfo(`Removendo ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }

        const res = await dbRun('DELETE FROM messages WHERE timestamp < ?', [limiteTempo]);
        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} registros antigos limpos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do cache:', err.message);
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

    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html'
    },

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

    if (!isDebugMode) return;

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
        return;
    }

    await restartClient(`disconnected: ${reason}`);
});

client.on('loading_screen', (percent, message) => {
    printInfo(`[WA] loading_screen: ${percent}% - ${message}`);
});

client.on('auth_failure', msg => {
    printError('[WA] auth_failure:', msg);
});

client.on('change_state', state => {
    printInfo(`[WA STATE]=${state}`);
});

client.on('ready', () => {
    isReady = true;
    lastDisconnectReason = null;

    printSuccess(`🤖 ZapBot ${packageJson.version} inicializado! Informando ${process.env.PHONE_NUMBER}`);
    messageToSelf(`🤖 ZapBot ${packageJson.version} inicializado.`);
});

/*
 * Presença dos números monitorados
 */
client.on('presence_update', async (presence) => {
    if (!presence?.id) return;

    const myid = process.env.PHONE_NUMBER;

    try {
        const rawId = presence.id._serialized || presence.id;
        const number = rawId.split('@')[0].split(':')[0];
        const currentStatus = presence.status || (presence.type === 'available' ? 'available' : 'unavailable');

        // Antes isto mandava uma mensagem no WhatsApp para CADA evento de presença.
        if (isDebugMode) {
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
 * Recuperação de mensagens apagadas
 */
client.on('message_revoke_everyone', async (after, before) => {
    const protocolKey = after._data?.protocolMessageKey;
    const targetId = protocolKey?.id || before?.id?.id || after?.id?.id;

    if (!targetId) {
        printError('[Revoke] Não foi possível identificar a mensagem apagada.');
        return;
    }

    let row;
    try {
        row = await dbGet('SELECT * FROM messages WHERE id = ?', [targetId]);
    } catch (err) {
        printError('[Revoke] Erro ao consultar banco:', err.message);
        return;
    }

    if (!row) {
        printError(`[Revoke] Mensagem apagada ID ${targetId} não encontrada no banco.`);
        return;
    }

    try {
        const meuChatId = client.info.wid._serialized;

        // Timestamp em segundos (WhatsApp) ou milissegundos (Date.now())
        const timestampMs = Number(row.timestamp) < 10_000_000_000
            ? Number(row.timestamp) * 1000
            : Number(row.timestamp);

        const dataEnvio = new Date(timestampMs).toLocaleString('pt-BR');

        let nomeChat = row.chat_name || 'Conversa desconhecida';
        let nomeRemetente = row.sender_name || 'Desconhecido';
        let numeroRemetente = row.sender_number || 'Número indisponível';

        // Nome real do chat onde a exclusão aconteceu
        try {
            const chat = await after.getChat();
            if (chat?.name) nomeChat = chat.name;
        } catch (chatError) {
            printError('[Revoke] Não foi possível recuperar o chat:', chatError.message);
        }

        // Remetente pela mensagem original, quando disponível
        if (before) {
            try {
                const contato = await before.getContact();

                nomeRemetente = contato.pushname || contato.name || contato.shortName || row.sender_name || 'Desconhecido';

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

        let alertaTexto = '❌ *MENSAGEM APAGADA DETECTADA*\n\n';

        if (row.is_group === 1) {
            alertaTexto += `👥 *Grupo:* ${nomeChat}\n`;
        }

        alertaTexto +=
            `👤 *Nome:* ${nomeRemetente}\n` +
            `📱 *Número:* +${numeroRemetente}\n` +
            `📅 *Enviada em:* ${dataEnvio}\n`;

        // Localização
        if (row.type === 'location' && row.location_lat !== null && row.location_lng !== null) {
            const latitude = Number(row.location_lat);
            const longitude = Number(row.location_lng);

            alertaTexto +=
                '🗺️ *Tipo:* LOCALIZAÇÃO\n' +
                `🔗 *Link do mapa:* https://www.google.com/maps?q=${latitude},${longitude}`;

            await client.sendMessage(meuChatId, alertaTexto);
            await client.sendMessage(meuChatId, new Location(latitude, longitude, row.body || 'Localização compartilhada'));
            return;
        }

        // Contato / vCard
        if (['vcard', 'contact', 'multi_vcard'].includes(row.type)) {
            alertaTexto +=
                '📇 *Tipo:* CARTÃO DE CONTATO\n' +
                '💡 *Nota:* O contato está anexado abaixo.';

            await client.sendMessage(meuChatId, alertaTexto);

            if (row.body) {
                await client.sendMessage(meuChatId, row.body, { parseVCards: true });
            }
            return;
        }

        // Arquivo físico
        if (row.has_media && row.media_path && fs.existsSync(row.media_path)) {
            const mediaAnexo = MessageMedia.fromFilePath(row.media_path);
            const mimetype = mediaAnexo.mimetype || '';
            const legenda = row.body || 'Sem texto';

            if (row.type === 'audio' || row.type === 'ptt' || mimetype.startsWith('audio/')) {
                alertaTexto += '🎵 *Tipo:* ÁUDIO / NOTA DE VOZ';

                await client.sendMessage(meuChatId, alertaTexto);
                await client.sendMessage(meuChatId, mediaAnexo, { sendAudioAsVoice: true });
                return;
            }

            if (row.type === 'video' || row.type === 'image' || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
                alertaTexto +=
                    `🎬 *Tipo:* ${String(row.type).toUpperCase()}\n` +
                    `💬 *Legenda:* "${legenda}"`;

                await client.sendMessage(meuChatId, mediaAnexo, { caption: alertaTexto });
                return;
            }

            alertaTexto +=
                '📄 *Tipo:* DOCUMENTO\n' +
                `💬 *Legenda:* "${legenda}"`;

            await client.sendMessage(meuChatId, mediaAnexo, { caption: alertaTexto, sendMediaAsDocument: true });
            return;
        }

        // Texto
        alertaTexto += `💬 *Texto:* "${row.body || 'Mensagem sem conteúdo'}"`;

        await client.sendMessage(meuChatId, alertaTexto, { linkPreview: true });
    } catch (sendError) {
        printError('[Revoke] Erro ao reenviar item apagado:', sendError.message);
    }
});

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
        botConfig.commands.map(formatCommandHelp).join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

async function cmdDebug({ msg, opts }) {
    if (opts.opt.on) isDebugMode = true;
    if (opts.opt.off) isDebugMode = false;

    await msg.reply(isDebugMode ? '🪲 Debug Ativado.' : '🪲 Debug Desativado.');
}

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

async function cmdGay({ msg, args, quotedMsg }) {
    const rainbowHearts = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '🧡', '💛', '💚', '💙', '💜'];

    // Antes usava só a primeira palavra (argv[1]) e gerava "undefined" sem argumento.
    const text = [args, quotedMsg?.body].filter(Boolean).join(' ').trim();

    if (!text) {
        await msg.reply('Syntax: /gay <texto> (ou responda uma mensagem)');
        return;
    }

    let index = 0;
    const rainbowText = text.replace(/ /g, () => ` ${rainbowHearts[index++ % rainbowHearts.length]} `);

    await msg.reply(rainbowText);
}

async function cmdCrypto({ msg }) {
    try {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT'];

        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
            params: { symbols: JSON.stringify(symbols) },
            timeout: 10000
        });

        const icon = { BTCUSDT: '₿', ETHUSDT: 'Ξ', SOLUSDT: '◎', DOGEUSDT: 'Ð' };

        const fmtPrice = (value) =>
            Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

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

        const coins = data.map(item => ({
            symbol: item.symbol.replace('USDT', ''),
            icon: icon[item.symbol] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        }));

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
                const rows = await dbAll('SELECT phone_number, timestamp FROM monitored_numbers LIMIT 20');

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
                if (total.n >= 20) {
                    await msg.reply('Limite de 20 números monitorados atingido.');
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

async function cmdSticker({ msg, quotedMsg }) {
    if (!quotedMsg) {
        await msg.reply("Syntax: Faça um 'reply' utilizando /sticker");
        return;
    }

    // 1. Mídia real do WhatsApp
    if (quotedMsg.hasMedia) {
        const media = await quotedMsg.downloadMedia();
        await msg.reply(media, null, { sendMediaAsSticker: true, ...STICKER_META });
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

    await msg.reply(media, null, { sendMediaAsSticker: true, ...STICKER_META });
}

async function cmdShow({ msg, quotedMsg }) {
    if (!quotedMsg?.hasMedia) {
        await msg.reply('Syntax: Responda uma mídia usando /show');
        return;
    }

    if (quotedMsg.isViewOnce) {
        printInfo('/show: AVISO: É view once 👀');
    }

    const media = await quotedMsg.downloadMedia();

    if (!media) {
        printDebug('/show: Mídia bloqueada (provável view once)');
        await msg.reply('Não consegui baixar a mídia (provável view once já aberta).');
        return;
    }

    printDebug('/show: Baixou mídia:', media.mimetype);

    await msg.reply(media, null, { sendMediaAsSticker: false });
    printSuccess('/show responded OK');
}

async function cmdGet({ msg, opts, quotedMsg, senderName }) {
    const id = Date.now();
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

        if (isDebugMode) {
            printDebug(`urlInput=${urlInput} opts=`, opts);
        }

        if (!isValidHttpUrl(urlInput)) {
            throw new Error(`A URL '${urlInput}' é inválida. Ignorando`);
        }

        await msg.reply(`💡 Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.mp4`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        // Baixar vídeo
        const cmdYtArgs = ['-f', 'mp4', '--merge-output-format', 'mp4', '-o', originalFile, urlInput];
        const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdYt}`);
            fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
            await runCommand(BIN_YT, cmdYtArgs, logCmd);
        } catch (inner) {
            throw new Error(`Problemas para baixar com '${BIN_YT}'`, { cause: { inner, cmd: cmdYt } });
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

        if (fs.statSync(outputFile).size > 20 * 1024 * 1024) {
            throw new Error('Arquivo muito grande para WhatsApp Web (máx. 20 MB)');
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

            const msgOpts = { linkPreview: false, ...STICKER_META };

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

        if (opts.opt.clean) {
            const isForce = opts.opt.force;

            await limparCacheAntigo(isForce ? 0 : MAX_DELETE_WINDOW);
            await limparArquivosAntigos(TMP_DIR, isForce ? 0 : 2);

            if (isForce) {
                limparConteudoDiretorio(MEDIA_DIR);
            }

            textMsg = `🧹 Cache limpo. ${isForce ? '(force)' : ''}\n`;
        } else {
            const { total } = await dbGet('SELECT COUNT(*) AS total FROM messages');

            textMsg = `🗂️ Exibindo conteúdo de ${CACHE_DIR}/*`;
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += `🗄️ Existem ${total} mensagens no cache.`;
        }

        await msg.reply(textMsg, null, { linkPreview: false });
    } catch (e) {
        printError(e.message);
        await msg.reply(formatarErroComando(e), null, { linkPreview: false });
    }
}

// cmd do bot-config.json -> handler
const HANDLERS = {
    '/help': cmdHelp,
    '/debug': cmdDebug,
    '/uptime': cmdUptime,
    '/ping': cmdPing,
    '/gay': cmdGay,
    '/everyone': cmdEveryone,
    '/monitor': cmdMonitor,
    '/crypto': cmdCrypto,
    '/sticker': cmdSticker,
    '/show': cmdShow,
    '/get': cmdGet,
    '/cache': cmdCache
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

        const chatName =
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            msg?._data?.notifyName ||
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

        if (isDebugMode) {
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
                    const extension = media.mimetype?.includes('/')
                        ? media.mimetype.split('/').pop().split(';').shift()
                        : 'bin';

                    localMediaPath = path.join(obterPastaMidia(), `${msgIdPure}.${extension}`);
                    fs.writeFileSync(localMediaPath, Buffer.from(media.data, 'base64'));
                }
            } catch (error) {
                printError('Falha ao baixar mídia:', error.message);
                hasMedia = 0;
            }
        }

        await dbRun(
            `INSERT OR REPLACE INTO messages
                (id, sender_name, sender_jid, sender_number,
                 chat_id, chat_name, is_group,
                 body, type, timestamp,
                 has_media, media_path,
                 location_lat, location_lng,
                 raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                msgIdPure, senderName, senderJid, senderNumber,
                chatId, chatName, isGroup,
                msg.body || '', msgType, timestamp,
                hasMedia, localMediaPath,
                lat, lng,
                'desativado'
            ]
        ).catch(err => printError('Erro ao salvar mensagem:', err.message));

        /*
         * Comandos
         */
        const body = (msg.body || '').trim();
        if (!body.startsWith('/')) return;

        const caller = body.split(/\s+/, 1)[0];
        const args = body.slice(caller.length).trim();

        const command = findCommand(caller);

        if (!command) {
            if (isDebugMode) printDebug(`Comando '${caller}' não encontrado`);
            return;
        }

        // Comando restrito ao dono do bot
        if (!msg.fromMe && command.onlyAdmin) {
            const warnMsg = isGroup
                ? `⚠️ Usuário '${senderName}' não pode executar '${command.cmd}' no grupo '${chatName}'`
                : `⚠️ Usuário '${chatName}' não pode executar: ${command.cmd}`;

            messageToSelf(warnMsg);
            return;
        }

        printDebug(isGroup
            ? `Executando comando '${body}' de '${senderName}' no grupo '${chatName}'`
            : `Executando comando '${body}' em '${chatName}'`);

        const opts = GetOptFromCommand(args, command);

        if (isDebugMode) {
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

        await handler({ msg, opts, args, quotedMsg, senderContact, senderName, isGroup, chatName });
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