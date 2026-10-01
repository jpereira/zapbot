/*
 * Settings: configurações gerais na tabela `settings`, alteráveis em tempo de execução pelo /set.
 */

const { OPENAI_MODELOS } = require('./openai');
const { botConfig } = require('./botConfig');
const { APP_ENV } = require('./constantes');
const { dbAll, dbRun } = require('./db');
const { printError, printInfo, printSuccess } = require('./log');
const { COTACAO_SUPORTADAS, CRYPTO_SUPPORTED } = require('./moedas');
const { isValidHttpUrl } = require('./util/url');
const { compilarRegraWatch } = require('./watch/regras');

/*
 * Settings: configurações gerais persistidas na tabela `settings`.
 * Carregadas no boot para `settings` (memória); getSetting() lê de lá e
 * setSetting() valida, grava no banco e na memória. Alteráveis pelo /set.
 *
 * Cada chave declara: default (gravado no primeiro boot, sem sobrescrever o
 * existente), type (boolean | number | string | list), desc e, opcionalmente,
 * min/max (number), item() para normalizar/validar cada item de uma list,
 * separator (list cujos itens podem ter espaço/vírgula: ex. '\n', um por linha),
 * allowEmpty (string que pode ficar vazia), validar() (string: lança Error se
 * inválida) e secret (valor mascarado no /set e nos logs).
 */
// item() das listas de feeds do /news e validar() do defi.solana.rpc
function validarUrlFeed(v) {
    if (!isValidHttpUrl(v)) throw new Error(`URL inválida: ${v}`);
    return v;
}

const SETTINGS_SCHEMA = {
    'agenda.max': {
        default: 50,
        type: 'number', min: 1, max: 500,
        desc: 'Máximo de itens do /cron, somando lembretes e mensagens.'
    },
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
    'backup.enabled': {
        default: true,
        type: 'boolean',
        desc: 'Backup automático do banco, uma vez por dia (/backup).'
    },
    'backup.hour': {
        default: 3,
        type: 'number', min: 0, max: 23,
        desc: 'Hora (de Brasília) do backup automático diário.'
    },
    'backup.keep': {
        default: 7,
        type: 'number', min: 1, max: 90,
        desc: 'Quantos backups automáticos (e de antes de restaurar) guardar; os manuais ficam até um /backup -rm.'
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
        desc: 'Dias que as mensagens editadas ficam guardadas para o /show -e.'
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
    'defi.solana.rpc': {
        default: 'https://api.mainnet-beta.solana.com',
        type: 'string',
        secret: true,
        validar: validarUrlFeed,
        desc: 'RPC da Solana usado pelo /defi (o público limita as consultas; um RPC próprio costuma ter a chave na URL).'
    },
    'email.alerts': {
        default: true,
        type: 'boolean',
        desc: 'Avisa por e-mail (SMTP do QR Code) crash, queda, reconexão e outros eventos do bot.'
    },
    'enquete.retentionDays': {
        default: 90,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as enquetes e os votos ficam guardados para o /enquete -r.'
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
    'gif.tag': {
        default: 'fail',
        type: 'string',
        desc: 'Tag padrão do /giphy quando nenhuma é informada.'
    },
    'giphy.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave do GIPHY (/giphy), usada quando GIPHY_API_KEY não está no config/.env.'
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
    'openai.api.model': {
        default: 'gpt-4o-mini',
        type: 'string',
        opcoes: OPENAI_MODELOS,
        desc: 'Modelo do /gpt, usado quando OPENAI_MODEL não está no config/.env (o /gpt -m lista os aceitos).'
    },
    'openai.timeout.ms': {
        default: 60000,
        type: 'number', min: 5000, max: 300000,
        desc: 'Timeout (ms) do /gpt, usado quando OPENAI_TIMEOUT_MS não está no config/.env.'
    },
    'resumo.maxMsgs': {
        default: 500,
        type: 'number', min: 10, max: 2000,
        desc: 'Máximo de mensagens enviadas à OpenAI por /resumo.'
    },
    'show.alert.edit': {
        default: true,
        type: 'boolean',
        desc: 'Avisa no seu privado quando alguém edita uma mensagem; off só guarda para o /show -e.'
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
    'show.revoke.status': {
        default: true,
        type: 'boolean',
        desc: 'Recupera status (stories) apagados; off ignora.'
    },
    'stats.enable': {
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
    'tempo.maxDays': {
        default: 7,
        type: 'number', min: 1, max: 16, // 16: limite da Open-Meteo
        desc: 'Máximo de dias do /tempo N (ou Nd), ex.: /tempo 7d Niteroi.'
    },
    'traduzir.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave do Google Cloud Translation (/traduzir), usada quando GOOGLE_TRANSLATE_API_KEY não está no config/.env.'
    },
    'traduzir.lang': {
        default: 'pt',
        type: 'string',
        desc: 'Idioma de destino padrão do /traduzir (código: pt, en, es...).'
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
            if (schema.opcoes && !schema.opcoes.includes(s)) throw new Error(`não suportado: ${s} (aceitos: ${schema.opcoes.join(', ')})`);
            return schema.validar ? schema.validar(s) : s;
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

async function carregarSettings() {
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

module.exports = {
    SETTINGS_SCHEMA,
    carregarSettings,
    envOuSetting,
    getSetting,
    isDebugMode,
    setSetting,
    stickerMeta
};
