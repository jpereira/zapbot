/*
 * Settings: general configuration in the `settings` table, changeable at runtime through /set.
 */

const { OPENAI_MODELS } = require('./openai');
const { compileFilterDebug } = require('./debugOptions');
const { botConfig } = require('./botConfig');
const { APP_ENV } = require('./constants');
const { dbAll, dbGet, dbRun } = require('./db');
const { limitHistoryMonitor } = require('./monitorHistory');
const { printError, printInfo, printSuccess } = require('./log');
const { QUOTE_SUPPORTED, CRYPTO_SUPPORTED } = require('./currencies');
const { isValidHttpUrl } = require('./util/url');
const { compileRuleWatch } = require('./watch/rules');

/*
 * Settings: general configuration persisted in the `settings` table.
 * Loaded at boot into `settings` (memory); getSetting() reads from there and
 * setSetting() validates, saves to the database and to memory. Changeable through /set.
 *
 * Each key declares: default (stored on the first boot, without overwriting the
 * existente), type (boolean | number | string | list), desc e, opcionalmente,
 * min/max (number), item() to normalize/validate each item of a list,
 * separator (list whose items may have spaces/commas: e.g. '\n', one per line),
 * lista() (list: checks the whole list, after the items; item() may
 * return null to make a word disappear, like bot.users' "false"),
 * allowEmpty (string that may be empty), validar() (string: throws Error if
 * invalid) and secret (value masked in /set and in the logs).
 */
// A phone with country code (bot.admins and bot.users): "+55 (21) 99999-9999" → "5521999999999"
function itemPhone(v) {
    const digits = v.replace(/[\s()+-]/g, '');
    if (!/^\d{10,15}$/.test(digits)) throw new Error(`número inválido: ${v} (use DDI + DDD + número, ex.: +5521999999999)`);
    return digits;
}

// A bot.users item: 'all', null (false), a group, a person or a person only in a group
function userItem(v) {
    const s = v.trim().toLowerCase();
    if (['all', 'todos', 'true', 'on', 'sim', 'yes'].includes(s)) return 'all';
    if (['false', 'off', 'nao', 'não', 'no', 'ninguem', 'ninguém'].includes(s)) return null;
    if (/^[\d-]+@g\.us$/.test(s)) return s;
    const soInGroup = s.match(/^(.+):([\d-]+@g\.us)$/);
    if (soInGroup) return `${itemPhone(soInGroup[1])}:${soInGroup[2]}`;
    return itemPhone(v);
}

// "/creptomoeda" or "crypto" → "/crypto"; command that does not exist or admin: error
function userCommand(v) {
    const nameAlt = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
    const command = botConfig.commands.find(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt));
    if (!command) throw new Error(`comando desconhecido: ${nameAlt}`);
    if (command.onlyAdmin) throw new Error(`o ${command.cmd} é só do dono e dos admins`);
    return command.cmd;
}

// item() of the /news feed lists and validar() of the /defi RPCs
function validateUrlFeed(v) {
    if (!isValidHttpUrl(v)) throw new Error(`URL inválida: ${v}`);
    return v;
}

/*
 * Renamed settings: at boot, the value saved under the old name moves to the
 * new one (see migrateSettingsRenamed). In alphabetical order of the old name.
 */
const SETTINGS_RENAMED = {
    'edit.alert': 'show.alert.edited',
    'gif.giphy.api.key': 'giphy.api.key',
    'resumo.maxMsgs': 'tldr.maxMsgs',
    'revoke.status': 'show.alert.status',
    'show.alert.edit': 'show.alert.edited',
    'show.revoke.status': 'show.alert.status',
    'stats.enabled': 'stats.enable'
};

// Renamed commands: a commands.disabled saved with the old name applies to the new one
const COMMANDS_RENAMED = {
    '/agendar': '/cron',
    '/lemb': '/cron'
};

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
    'backup.to': {
        default: '',
        type: 'string',
        allowEmpty: true,
        desc: 'Destino do backup diário, além da cópia local: contato, grupo, número ou e-mail, como no -to do /backup. Vazio: só local. Para vários, use -to <destino> -to <destino>. O envio é automático, sem pedir -sim.'
    },
    'bot.admins': {
        default: [],
        type: 'list',
        desc: 'Outras pessoas (número com DDI, ex.: 5521999999999) que também usam os comandos admin. Só o dono altera; pelo /set vale o nome do contato (/set -a bot.admins /Jorge Pereira/), e o /bot +o|-o é o atalho.',
        item: itemPhone
    },
    'bot.paused': {
        default: false,
        type: 'boolean',
        desc: 'Bot desligado: todos os comandos são ignorados, exceto o /bot (o mesmo do /bot -on|-off).'
    },
    /*
     * Who uses the common (non-admin) commands, besides the owner and bot.admins:
     * [] (false, the default) nobody; ['all'] (true) everyone; or people (the
     * phone), groups (the @g.us id: anyone, but only inside the group) and
     * people only in a group ("phone:id@g.us", /bot +v typed in the group).
     */
    'bot.users': {
        default: [],
        type: 'list',
        desc: 'Quem usa os comandos comuns (os não-admin), além do dono e do bot.admins: false (ninguém, o padrão), true (todos) ou pessoas e grupos (num grupo, todos ali usam, mas só dentro dele); uma pessoa só num grupo fica como telefone:grupo. Só o dono altera; pelo /set vale o nome (/set bot.users /Maria Lucia/ /Grupo Familia/), e o /bot +v|-v é o atalho.',
        item: userItem,
        lista: (items) => {
            if (items.includes('all') && items.length > 1) {
                throw new Error('o true (todos) não se mistura com pessoas e grupos: para liberar só alguns, /set bot.users false antes');
            }
            return items;
        }
    },
    /*
     * Each user's commands (/bot +cmd|-cmd): "item=/a,/b" (only those) or
     * "item=!/a,/b" (all the common ones, except these), where the item is the same as in the
     * bot.users. Without a row: all the common ones. One per line (or separated by spaces).
     */
    'bot.users.cmds': {
        default: [],
        type: 'list',
        separator: /\s+/,
        desc: 'Os comandos de cada usuário (o /bot +cmd|-cmd): item=/a,/b (só esses) ou item=!/a,/b (todos os comuns, menos esses), com o item do bot.users. Sem linha: todos os comuns.',
        item: (v) => {
            const m = v.match(/^(.+)=(!?)(.+)$/);
            if (!m) throw new Error(`use item=/cmd,/cmd (ou item=!/cmd para todos menos esse): ${v}`);
            const target = userItem(m[1]);
            if (!target || target === 'all') throw new Error(`item inválido: ${m[1]}`);
            const commands = [...new Set(m[3].split(',').filter(Boolean).map(userCommand))];
            return `${target}=${m[2]}${commands.join(',')}`;
        }
    },
    'cache.editedRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as mensagens editadas ficam guardadas para o /show -e.'
    },
    'cache.reactionRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as reações removidas ou trocadas ficam guardadas para o /show -r.'
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
            const typed = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
            // Names of earlier versions (stored in the database) that became another command
            const nameAlt = COMMANDS_RENAMED[typed] ?? typed;
            const command = botConfig.commands.find(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt));
            if (!command) throw new Error(`comando desconhecido: ${nameAlt}`);
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
            if (!QUOTE_SUPPORTED[sym]) throw new Error(`moeda não suportada: ${sym}`);
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
        type: 'number', min: 1, max: 120, // 120: maximum window accepted by the NVD
        desc: 'Janela (dias) do /cve -highscore.'
    },
    'debug.copyTo': {
        default: '',
        type: 'string', allowEmpty: true,
        desc: 'Chat que recebe a cópia dos logs; configure pelo /debug -copy-to. Vazio: só console.',
        validar: (v) => {
            if (!/^[\d-]+@(c\.us|g\.us|lid)$/.test(v)) {
                throw new Error('configure o destino pelo /debug -copy-to');
            }
            return v;
        }
    },
    'debug.enabled': {
        default: APP_ENV.toLowerCase() === 'dev',
        type: 'boolean',
        desc: 'Modo debug (o mesmo do /debug -on|-off).'
    },
    'debug.filter': {
        default: '',
        type: 'string', allowEmpty: true,
        desc: 'Filtro /regex/flags dos logs durante o debug. Vazio: sem filtro; /debug -off limpa.',
        validar: (v) => { compileFilterDebug(v); return v; }
    },
    'debug.level': {
        default: 0,
        type: 'number', min: 0, max: 3,
        desc: 'Nível cumulativo do debug: 0 básico, 1 funções e comandos, 2 integrações, 3 desenvolvimento.'
    },
    'defi.aave.chains': {
        default: ['1', '8453'],
        type: 'list',
        desc: 'Redes (chain id) em que o /defi aave procura as posições: 1 (Ethereum), 8453 (Base).',
        item: (v) => {
            if (!['1', '8453'].includes(v)) throw new Error(`rede sem Aave V3 no bot: ${v} (use 1 = Ethereum, 8453 = Base)`);
            return v;
        }
    },
    'defi.aave.wallet': {
        default: '',
        type: 'string',
        allowEmpty: true,
        validar: (v) => {
            if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`carteira EVM é 0x e 40 caracteres hexadecimais: ${v}`);
            return v;
        },
        desc: 'Carteira do /defi aave quando não há carteira cadastrada, usada quando AAVE_WALLET_ADDRESS não está no config/.env.'
    },
    'defi.alerta.intervalMin': {
        default: 10,
        type: 'number', min: 1, max: 1440,
        desc: 'Intervalo (minutos) entre as verificações do /defi -alerta (consulta Solana ou HyperEVM conforme o protocolo).'
    },
    'defi.aptos.apikey': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave da API da Aptos (geomi.dev) para o /defi liquidswap, usada quando APTOS_API_KEY não está no config/.env. Opcional: sem ela, vale o limite anônimo por IP.'
    },
    'defi.aptos.indexer': {
        default: 'https://api.mainnet.aptoslabs.com/v1/graphql',
        type: 'string',
        validar: validateUrlFeed,
        desc: 'Indexador GraphQL da Aptos usado pelo /defi na Liquidswap (acha as posições guardadas como fungible asset).'
    },
    'defi.aptos.rpc': {
        default: 'https://api.mainnet.aptoslabs.com/v1',
        type: 'string',
        secret: true,
        validar: validateUrlFeed,
        desc: 'API REST do fullnode da Aptos usada pelo /defi na Liquidswap (a pública limita as consultas).'
    },
    'defi.base.rpc': {
        default: 'https://mainnet.base.org',
        type: 'string',
        secret: true,
        validar: validateUrlFeed,
        desc: 'RPC da Base usado pelo /defi aave, quando BASE_RPC_URL não está no config/.env (o público limita as consultas).'
    },
    'defi.ethereum.rpc': {
        default: 'https://ethereum-rpc.publicnode.com',
        type: 'string',
        secret: true,
        validar: validateUrlFeed,
        desc: 'RPC da Ethereum usado pelo /defi aave, quando ETHEREUM_RPC_URL não está no config/.env (o público limita as consultas).'
    },
    'defi.hyperevm.rpc': {
        default: 'https://rpc.hyperliquid.xyz/evm',
        type: 'string',
        secret: true,
        validar: validateUrlFeed,
        desc: 'RPC da HyperEVM usado pelo /defi no Project X (o público limita as consultas).'
    },
    'defi.morpho.api': {
        default: 'https://api.morpho.org/graphql',
        type: 'string',
        validar: validateUrlFeed,
        desc: 'API GraphQL oficial do Morpho, usada pelo /defi morpho.'
    },
    'defi.morpho.chains': {
        default: ['8453'],
        type: 'list',
        desc: 'Redes (chain id) em que o /defi morpho procura as posições: 8453 (Base), 1 (Ethereum)...',
        item: (v) => {
            if (!/^\d+$/.test(v)) throw new Error(`chain id é um número (8453 = Base, 1 = Ethereum): ${v}`);
            return v;
        }
    },
    'defi.morpho.wallet': {
        default: '',
        type: 'string',
        allowEmpty: true,
        validar: (v) => {
            if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`carteira EVM é 0x e 40 caracteres hexadecimais: ${v}`);
            return v;
        },
        desc: 'Carteira do /defi morpho quando não há carteira cadastrada, usada quando MORPHO_WALLET_ADDRESS não está no config/.env.'
    },
    'defi.solana.rpc': {
        default: 'https://api.mainnet-beta.solana.com',
        type: 'string',
        secret: true,
        validar: validateUrlFeed,
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
    'flood.intervalCommand': {
        default: 2,
        type: 'number', min: 1, max: 3600,
        desc: 'Proteção contra flood: a janela, em segundos, em que se conta o flood.maxCommandRepeated, e quanto tempo o bot ignora quem passou do limite.'
    },
    'flood.maxCommandRepeated': {
        default: 3,
        type: 'number', min: 0, max: 100,
        desc: 'Proteção contra flood: quantas vezes quem não é admin pode repetir o mesmo comando em flood.intervalCommand segundos; passou, o bot avisa uma vez e ignora a pessoa até o intervalo acabar. 0 desliga.'
    },
    'get.maxDownloadMB': {
        default: 200,
        type: 'number', min: 10, max: 2000,
        desc: 'Tamanho máximo (MB) baixado pelo yt-dlp no /get e no /sticker, antes da conversão.'
    },
    'get.maxSizeMB': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Tamanho máximo (MB) do arquivo convertido pelo ffmpeg no /get e no /sticker.'
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
    'monitor.enabled': {
        default: true,
        type: 'boolean',
        desc: 'Consultas periódicas do /monitor. Desligar pausa sem apagar contatos ou histórico.'
    },
    'monitor.max': {
        default: 5,
        type: 'number', min: 1, max: 5,
        desc: 'Máximo de contatos do /monitor (limite absoluto: 5). Mais contatos aumentam o volume de consultas e o risco de bloqueio pelo WhatsApp. Não há quantidade garantidamente segura.'
    },
    'monitor.maxRecords': {
        default: 30,
        type: 'number', min: 1, max: 1000,
        desc: 'Máximo de horários no banco por contato e nas listas do /monitor. Reduzir apaga os horários mais antigos que excederem o limite.'
    },
    'monitor.pool': {
        default: 300,
        type: 'number', min: 120, max: 86400,
        desc: 'Intervalo mínimo entre verificações de cada contato, em segundos (/monitor). Padrão: 300 s (5 min); mínimo: 120 s (2 min). Intervalos curtos aumentam as consultas e podem contribuir para bloqueio pelo WhatsApp. Nenhum intervalo garante segurança.'
    },
    'news.brasil': {
        // The feeds listed at https://rss.feedspot.com/brazil_rss_feeds/ (the page is HTML, not RSS)
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
        item: validateUrlFeed
    },
    'news.g1': {
        default: ['https://g1.globo.com/dynamo/rss2.xml'],
        type: 'list',
        desc: 'Feeds RSS do /news -g1.',
        item: validateUrlFeed
    },
    'news.gazeta': {
        default: ['https://www.gazetadopovo.com.br/feed/rss/brasil.xml'],
        type: 'list',
        desc: 'Feeds RSS do /news -gazeta (Gazeta do Povo).',
        item: validateUrlFeed
    },
    'news.hack': {
        default: [
            'https://feeds.feedburner.com/TheHackersNews',
            'https://www.bleepingcomputer.com/feed/',
            'https://krebsonsecurity.com/feed/'
        ],
        type: 'list',
        desc: 'Feeds RSS do /news -hack (hacking/segurança).',
        item: validateUrlFeed
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
        opcoes: OPENAI_MODELS,
        desc: 'Modelo do /gpt, usado quando OPENAI_MODEL não está no config/.env (o /gpt -m lista os aceitos).'
    },
    'openai.timeout.ms': {
        default: 60000,
        type: 'number', min: 5000, max: 300000,
        desc: 'Timeout (ms) do /gpt, usado quando OPENAI_TIMEOUT_MS não está no config/.env.'
    },
    'pixelart.maxParts': {
        default: 3,
        type: 'number', min: 1, max: 10,
        desc: 'Máximo de partes enviadas pelo /pixelart quando a arte é mais alta que 4096 px.'
    },
    'pixelart.packs': {
        default: ['chuck-norris-lvl'],
        type: 'list',
        desc: 'Packs do 16colo.rs sorteados pelo /pixelart sem argumentos.',
        item: (v) => {
            if (!/^[A-Za-z0-9._-]{1,100}$/.test(v)) throw new Error(`nome de pack inválido: ${v}`);
            return v;
        }
    },
    'show.alert.deleted': {
        default: true,
        type: 'boolean',
        desc: 'Avisa no seu privado quando alguém apaga uma mensagem; off só guarda para o /show.'
    },
    'show.alert.edited': {
        default: true,
        type: 'boolean',
        desc: 'Avisa no seu privado quando alguém edita uma mensagem; off só guarda para o /show -e.'
    },
    'show.alert.reaction': {
        default: true,
        type: 'boolean',
        desc: 'Avisa no seu privado quando alguém remove ou troca uma reação; off só guarda para o /show -r.'
    },
    'show.alert.status': {
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
        default: 16,
        type: 'number', min: 1, max: 16, // 16: Open-Meteo limit
        desc: 'Máximo de dias do /tempo N (ou Nd), de 1 a 16. Ex.: /tempo 16d Niteroi.'
    },
    'tldr.maxMsgs': {
        default: 500,
        type: 'number', min: 10, max: 2000,
        desc: 'Máximo de mensagens enviadas à OpenAI por /tldr (/resumo).'
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
            compileRuleWatch(v); // throws Error if the rule is invalid
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
 * Validates/normalizes a value for the key. Accepts the already typed value (coming from the
 * database) or text (coming from /set). Throws Error with the message for the user.
 */
function validateSetting(key, value) {
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
            const items = Array.isArray(value)
                ? value.map(String)
                : String(value ?? '').split(schema.separator ?? /[\s,]+/);
            const list = items.map(v => v.trim()).filter(Boolean)
                .map(schema.item ?? (v => v)).filter(v => v !== null);
            return schema.lista ? schema.lista([...new Set(list)]) : [...new Set(list)];
        }
    }

    throw new Error(`tipo inválido no schema: ${schema.type}`);
}

/*
 * A saved list with some item that stopped being valid (e.g.: a removed command
 * in a new version): validates item by item and keeps the valid ones. If it is not a
 * list, null (the default applies).
 */
function listWithoutOsInvalid(key, valueSalvo) {
    if (SETTINGS_SCHEMA[key]?.type !== 'list') return null;

    let items;
    try {
        items = JSON.parse(valueSalvo);
    } catch {
        return null;
    }
    if (!Array.isArray(items)) return null;

    const valid = items.flatMap((item) => {
        try {
            return validateSetting(key, [item]);
        } catch {
            return [];
        }
    });
    return [...new Set(valid)];
}

/*
 * A renamed setting's value goes to the new name and the old one leaves the database.
 * If the new one already exists with a value of yours (different from the default), it stays: the
 * old only fills the new one still at the default (the case of whoever updated
 * to the version that renamed it, creating the new one with the default, without migrating).
 */
async function migrateSettingsRenamed() {
    for (const [oldAlt2, freshAlt] of Object.entries(SETTINGS_RENAMED)) {
        const oldAlt = await dbGet('SELECT value FROM settings WHERE key = ?', [oldAlt2]);
        if (!oldAlt) continue;

        const current = await dbGet('SELECT value FROM settings WHERE key = ?', [freshAlt]);
        if (!current || current.value === JSON.stringify(SETTINGS_SCHEMA[freshAlt].default)) {
            await dbRun(`INSERT INTO settings (key, value) VALUES (?, ?)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, [freshAlt, oldAlt.value]);
            printInfo(`Setting '${oldAlt2}' renomeado para '${freshAlt}': o valor salvo foi mantido`);
        } else {
            printInfo(`Setting '${oldAlt2}' renomeado para '${freshAlt}': o '${freshAlt}' já tinha valor, o antigo foi descartado`);
        }

        await dbRun('DELETE FROM settings WHERE key = ?', [oldAlt2]);
    }
}

/*
 * bot.adminMode (until 2.0.2) became bot.users: admin mode off (everyone
 * used the commands) is bot.users = true; on, the default (only the owner and the
 * admins). An existing bot.users stays as it is.
 */
async function migrateModeAdmin() {
    const mode = await dbGet("SELECT value FROM settings WHERE key = 'bot.adminMode'");
    if (!mode) return;

    const users = await dbGet("SELECT value FROM settings WHERE key = 'bot.users'");
    if (!users && JSON.parse(mode.value) === false) {
        await dbRun("INSERT INTO settings (key, value) VALUES ('bot.users', ?)", [JSON.stringify(['all'])]);
        printInfo("Setting 'bot.adminMode' (desligado) virou 'bot.users' = true: todos usam os comandos comuns");
    } else {
        printInfo("Setting 'bot.adminMode' removido: quem usa os comandos comuns agora é o 'bot.users'");
    }

    await dbRun("DELETE FROM settings WHERE key = 'bot.adminMode'");
}

async function loadSettings() {
    await migrateSettingsRenamed();
    await migrateModeAdmin();

    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        await dbRun('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(schema.default)]);
    }

    for (const row of await dbAll('SELECT key, value FROM settings')) {
        if (!SETTINGS_SCHEMA[row.key]) {
            printInfo(`Setting '${row.key}' desconhecido, ignorado.`);
            continue;
        }

        try {
            settings.set(row.key, validateSetting(row.key, JSON.parse(row.value)));
        } catch (e) {
            const list = listWithoutOsInvalid(row.key, row.value);
            if (list) {
                // E.g.: commands.disabled with a command that no longer exists (/status): the others stay
                settings.set(row.key, list);
                printError(`Setting '${row.key}' com item inválido (${e.message}), ignorado: ${list.join(',') || '(vazio)'}`);
                continue;
            }
            printError(`Setting '${row.key}' inválido (${e.message}), usando o padrão.`);
        }
    }

    await limitHistoryMonitor(getSetting('monitor.maxRecords'));

    printSuccess(`Loaded ${settings.size} settings (${[...settings.keys()].join(',')})`);
    printSuccess(`Loaded ${getSetting('crypto.coins').length} crypto coins (${getSetting('crypto.coins').join(',')})`);
    printInfo(`debug.enabled=${getSetting('debug.enabled')} commands.disabled=${getSetting('commands.disabled').join(',') || '-'}`);
    printInfo(`Loaded ${getSetting('watch.rules').length} watch rules`);
}

function getSetting(key) {
    return settings.has(key) ? settings.get(key) : SETTINGS_SCHEMA[key]?.default;
}

/*
 * Value from config/.env or, if empty, from the setting (e.g.: API keys, timeouts).
 * The .env value goes through the same validation as the setting: invalid is ignored
 * (with a log warning) and the setting applies.
 */
function envOuSetting(env, key) {
    const valueAlt = process.env[env]?.trim();
    if (!valueAlt) return getSetting(key);

    try {
        return validateSetting(key, valueAlt);
    } catch (e) {
        printError(`${env} inválido (${e.message}), usando o setting '${key}'.`);
        return getSetting(key);
    }
}

async function setSetting(key, value) {
    value = validateSetting(key, value);
    if (key === 'monitor.max') {
        const { n } = await dbGet('SELECT COUNT(*) AS n FROM monitor_contacts');
        if (value < n) throw new Error(`há ${n} contatos cadastrados: remova contatos pelo /monitor -rem antes de reduzir o limite`);
    }

    await dbRun(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value)]
    );
    settings.set(key, value);
    if (key === 'monitor.maxRecords') await limitHistoryMonitor(value);

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
    loadSettings,
    userCommand,
    envOuSetting,
    getSetting,
    isDebugMode,
    setSetting,
    validateSetting,
    stickerMeta
};
