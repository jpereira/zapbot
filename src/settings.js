/*
 * Settings: general configuration in the `settings` table, changeable at runtime through /set.
 */

const { OPENAI_MODELS, OPENAI_VOICES } = require('./openai');
const { compileFilterDebug } = require('./debugOptions');
const { botConfig } = require('./botConfig');
const { ROLES } = require('./roles');
const { t } = require('./i18n');
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
    if (!/^\d{10,15}$/.test(digits)) throw new Error(t('adm.settings.badNumber', { v }));
    return digits;
}

// A bot.users item: 'all', null (false), a group, a person or a person only in a group
function userItem(v) {
    const s = v.trim().toLowerCase();
    if (['all', 'true', 'on', 'yes'].includes(s)) return 'all';
    if (['false', 'off', 'no', 'none'].includes(s)) return null;
    if (/^[\d-]+@g\.us$/.test(s)) return s;
    const soInGroup = s.match(/^(.+):([\d-]+@g\.us)$/);
    if (soInGroup) return `${itemPhone(soInGroup[1])}:${soInGroup[2]}`;
    return itemPhone(v);
}

// "crypto" or "/crypto" → "/crypto"; command that does not exist or that the owner does not delegate: error
function userCommand(v) {
    const nameAlt = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
    const command = botConfig.commands.find(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt));
    if (!command) throw new Error(t('adm.settings.unknownCommand', { nome: nameAlt }));
    if (command.role !== ROLES.USER && !command.delegavel) {
        throw new Error(t(command.role === ROLES.OWNER ? 'adm.settings.ownerOnlyCmd' : 'adm.settings.adminOnlyCmd', { cmd: command.cmd }));
    }
    return command.cmd;
}

// item() of the /news feed lists and validar() of the /defi RPCs
function validateUrlFeed(v) {
    if (!isValidHttpUrl(v)) throw new Error(t('adm.settings.badUrl', { v }));
    return v;
}

/*
 * Renamed settings: at boot, the value saved under the old name moves to the
 * new one (see migrateSettingsRenamed). In alphabetical order of the old name.
 */
const SETTINGS_RENAMED = {
    'alerta.intervalMin': 'alert.intervalMin',
    'alerta.max': 'alert.max',
    'cotacao.coins': 'rates.coins',
    'defi.alerta.intervalMin': 'defi.alert.intervalMin',
    'edit.alert': 'show.alert.edited',
    'enquete.retentionDays': 'poll.retentionDays',
    'gif.giphy.api.key': 'giphy.api.key',
    'news.brasil': 'news.brazil',
    'openai.admin.key': 'gpt.admin.key',
    'openai.api.key': 'gpt.api.key',
    'openai.api.model': 'gpt.api.model',
    'openai.credit.since': 'gpt.credit.since',
    'openai.credit.total': 'gpt.credit.total',
    'openai.gif.frameMs': 'gpt.gif.frameMs',
    'openai.gif.frames': 'gpt.gif.frames',
    'openai.image.gifModel': 'gpt.image.gifModel',
    'openai.image.model': 'gpt.image.model',
    'openai.pricing': 'gpt.pricing',
    'openai.pricing.auto': 'gpt.pricing.auto',
    'openai.pricing.updated': 'gpt.pricing.updated',
    'openai.status': 'gpt.status',
    'openai.timeout.ms': 'gpt.timeout.ms',
    'openai.transcribe.model': 'gpt.transcribe.model',
    'openai.tts.instructions': 'gpt.tts.instructions',
    'openai.tts.model': 'gpt.tts.model',
    'openai.tts.voice': 'gpt.tts.voice',
    'resumo.maxMsgs': 'tldr.maxMsgs',
    'revoke.status': 'show.alert.status',
    'show.alert.edit': 'show.alert.edited',
    'show.revoke.status': 'show.alert.status',
    'stats.enabled': 'stats.enable',
    'tempo.city': 'weather.city',
    'tempo.maxDays': 'weather.maxDays',
    'traduzir.lang': 'translate.lang'
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
    'alert.intervalMin': {
        default: 5,
        type: 'number', min: 1, max: 60,
        desc: 'Intervalo (minutos) entre as verificações dos alertas do /rates e do /crypto.'
    },
    'alert.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de alertas de preço (somando /rates e /crypto).'
    },
    'ascii.defaultChar': {
        default: '#',
        type: 'string',
        desc: 'Caractere do traço das letras do /ascii quando -char não é informado.',
        validar: (v) => {
            if ([...v].length !== 1) throw new Error(t('adm.settings.oneChar'));
            return v;
        }
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
        desc: 'Destino do backup diário, além da cópia local: contato, grupo, número ou e-mail, como no -to do /backup. Vazio: só local. Para vários, use -to <destino> -to <destino>. O envio é automático, sem pedir -yes.'
    },
    'bot.admins': {
        default: [],
        type: 'list',
        desc: 'Outras pessoas (número com DDI, ex.: 5521999999999) que também usam os comandos admin. Só o dono altera; pelo /set vale o nome do contato (/set -a bot.admins /Jorge Pereira/), e o /bot +a|-a é o atalho.',
        item: itemPhone
    },
    'bot.login': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Hash (scrypt) da senha do /bot -login, que faz quem é de fora virar admin. Vazio: login desligado. Defina pelo /bot -passwd <senha>, não pelo /set.'
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
     * people only in a group ("phone:id@g.us", /bot +u typed in the group).
     */
    'bot.users': {
        default: [],
        type: 'list',
        desc: 'Quem usa os comandos comuns (os não-admin), além do dono e do bot.admins: false (ninguém, o padrão), true (todos) ou pessoas e grupos (num grupo, todos ali usam, mas só dentro dele); uma pessoa só num grupo fica como telefone:grupo. Só o dono altera; pelo /set vale o nome (/set bot.users /Maria Lucia/ /Grupo Familia/), e o /bot +u|-u é o atalho.',
        item: userItem,
        lista: (items) => {
            if (items.includes('all') && items.length > 1) {
                throw new Error(t('adm.settings.trueMixed'));
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
        desc: 'Os comandos de cada usuário (o /bot +cmd|-cmd): item=/a,/b (só esses) ou item=!/a,/b (todos os comuns, menos esses), com o item do bot.users. Um comando admin (/gpt...) só vale na lista "só esses". Sem linha: todos os comuns.',
        item: (v) => {
            const m = v.match(/^(.+)=(!?)(.+)$/);
            if (!m) throw new Error(t('adm.settings.cmdsFormat', { v }));
            const target = userItem(m[1]);
            if (!target || target === 'all') throw new Error(t('adm.settings.badItem', { item: m[1] }));
            const commands = [...new Set(m[3].split(',').filter(Boolean).map(userCommand))];
            return `${target}=${m[2]}${commands.join(',')}`;
        }
    },
    'cache.editedRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as mensagens editadas ficam guardadas para o /show -e.'
    },
    'cache.messageMediaRetentionHours': {
        default: 68,
        type: 'number', min: 68, max: 2160,
        desc: 'Horas que as mídias das mensagens comuns (fotos, vídeos, áudios, documentos) ficam no disco (68, o padrão; até 2160 = 90 dias). Nunca passam do cache.messageRetentionHours: a mídia sai junto com a mensagem. Ocupa espaço em cache/media; /cache -media libera só elas.'
    },
    'cache.messageRetentionHours': {
        default: 68,
        type: 'number', min: 68, max: 2160,
        desc: 'Horas que o texto das mensagens comuns fica no banco (68, o padrão, é a janela de apagar para todos; até 2160 = 90 dias): quanto mais, mais o /tldr alcança. As mídias têm o seu prazo, o cache.messageMediaRetentionHours.'
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
            if (!command) throw new Error(t('adm.settings.unknownCommand', { nome: nameAlt }));
            if (command.cmd === '/set') throw new Error(t('adm.settings.setNotDisabled'));
            return command.cmd;
        }
    },
    'contacts.cache': {
        default: true,
        type: 'boolean',
        desc: 'Guarda as fotos de perfil baixadas pelo /contacts em cache/contacts (entram no backup). Desligado: baixa a cada exportação e não guarda nada.'
    },
    'contacts.cacheDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Por quantos dias uma foto em cache/contacts vale antes de ser baixada de novo (/contacts -refresh força).'
    },
    'contacts.delayMs': {
        default: 300,
        type: 'number', min: 0, max: 5000,
        desc: 'Pausa, em milissegundos, entre uma foto e outra no /contacts, para não consultar o WhatsApp em rajada.'
    },
    'crypto.coins': {
        default: ['BTC', 'ETH', 'SOL', 'HYPE'],
        type: 'list',
        desc: 'Moedas exibidas pelo /crypto.',
        item: (v) => {
            const sym = v.toUpperCase().replace(/USDT$/, '');
            if (!CRYPTO_SUPPORTED[sym]) throw new Error(t('adm.settings.unsupportedCoin', { sym }));
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
                throw new Error(t('adm.settings.copyToHint'));
            }
            return v;
        }
    },
    'debug.enabled': {
        default: false,
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
            if (!['1', '8453'].includes(v)) throw new Error(t('adm.settings.aaveNetwork', { v }));
            return v;
        }
    },
    'defi.aave.wallet': {
        default: '',
        type: 'string',
        allowEmpty: true,
        validar: (v) => {
            if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(t('adm.settings.badWallet', { v }));
            return v;
        },
        desc: 'Carteira do /defi aave quando não há carteira cadastrada, usada quando AAVE_WALLET_ADDRESS não está no config/.env.'
    },
    'defi.alert.intervalMin': {
        default: 10,
        type: 'number', min: 1, max: 1440,
        desc: 'Intervalo (minutos) entre as verificações do /defi -alert (consulta Solana ou HyperEVM conforme o protocolo).'
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
            if (!/^\d+$/.test(v)) throw new Error(t('adm.settings.badChainId', { v }));
            return v;
        }
    },
    'defi.morpho.wallet': {
        default: '',
        type: 'string',
        allowEmpty: true,
        validar: (v) => {
            if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(t('adm.settings.badWallet', { v }));
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
    'forward.delayMs': {
        default: 1000,
        type: 'number', min: 0, max: 10000,
        desc: 'Pausa (ms) entre as mensagens quando o /forward encaminha várias, para não encher o WhatsApp de uma vez.'
    },
    'forward.header': {
        default: true,
        type: 'boolean',
        desc: 'Cabeçalho "Mensagem encaminhada pelo ZapBot!" no começo do que o /forward envia e a lista de quem recebeu no resultado (desligado, vai só a mensagem e o "✉️ ... com sucesso!").'
    },
    'forward.max': {
        default: 10,
        type: 'number', min: 1, max: 50,
        desc: 'Máximo de mensagens que o /forward -N encaminha de uma vez.'
    },
    'forward.maxRecipients': {
        default: 30,
        type: 'number', min: 1, max: 200,
        desc: 'Máximo de destinatários do /forward de uma vez (somando as listas #lista e os avulsos) e de cada lista.'
    },
    'get.cache.maxDays': {
        default: 2,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que os downloads em cache (get.cache.tmp) ficam em cache/tmp antes de serem apagados.'
    },
    'get.cache.tmp': {
        default: true,
        type: 'boolean',
        desc: 'Guarda em cache/tmp o que o yt-dlp baixa no /get e no /sticker (o mesmo link, e o mesmo trecho, não baixa de novo). Desligado, o arquivo baixado é apagado a cada execução.'
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
    'gpt.admin.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave de admin da OpenAI (sk-admin-...), do /gpt -usage; usada quando OPENAI_ADMIN_KEY não está no config/.env.'
    },
    'gpt.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave da OpenAI (/gpt), usada quando OPENAI_API_KEY não está no config/.env.'
    },
    'gpt.api.model': {
        default: 'gpt-4o-mini',
        type: 'string',
        opcoes: OPENAI_MODELS,
        desc: 'Modelo do /gpt, usado quando OPENAI_MODEL não está no config/.env (o /gpt -m lista os aceitos).'
    },
    'gpt.credit.since': {
        default: '',
        type: 'string',
        allowEmpty: true,
        desc: 'Data (AAAA-MM-DD) da compra dos créditos da OpenAI: o /gpt -usage soma o gasto desde ela para mostrar $usado/$total.',
        validar: (v) => {
            if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) throw new Error(t('adm.settings.dateFormat'));
            return v;
        }
    },
    'gpt.credit.total': {
        default: 0,
        type: 'number', min: 0, max: 100000,
        desc: 'Total de créditos comprados na OpenAI, em dólares (a API não informa o saldo): o /gpt -usage mostra $usado/$total. 0: não mostra.'
    },
    'gpt.gif.frameMs': {
        default: 200,
        type: 'number', min: 20, max: 2000,
        desc: 'Quanto dura cada quadro do GIF do /draw -gif e do /gpt -gif, em ms (20 a 2000; o total é quadros x ms).'
    },
    'gpt.gif.frames': {
        default: 9,
        type: 'number', min: 2, max: 16,
        desc: 'Quantos quadros tem o GIF do /draw -gif e do /gpt -gif (2 a 16; quanto mais quadros, mais caro).'
    },
    'gpt.image.gifModel': {
        default: 'gpt-image-2.6-flare',
        type: 'string',
        desc: 'Modelo que gera o GIF do /draw -gif e do /gpt -gif (só os gpt-image-2.6-* fazem GIF e pedem acesso à prévia): o id que a sua conta tem (se não existir, o bot lista os que a chave vê).'
    },
    'gpt.image.model': {
        default: 'gpt-image-2',
        type: 'string',
        desc: 'Modelo que gera e edita a imagem do /draw e do /gpt -img: o id que a sua conta tem (se não existir, o bot lista os que a chave vê). O GIF tem o seu, o gpt.image.gifModel.'
    },
    'gpt.pricing': {
        default: [],
        type: 'list',
        desc: 'Preço por 1M de tokens em dólares, modelo=entrada/saída, para o custo estimado do rodapé de status do /gpt e do /tldr (modelo sem preço: custo n/d). Vem vazio: o /gpt -prices ou a atualização automática (gpt.pricing.auto) preenche. Vale o nome exato ou o prefixo mais longo.',
        item: (v) => {
            if (!/^[^=\s]+=\d+(\.\d+)?\/\d+(\.\d+)?$/.test(v)) throw new Error(t('adm.settings.priceFormat', { v }));
            return v;
        }
    },
    'gpt.pricing.auto': {
        default: true,
        type: 'boolean',
        desc: 'Atualiza o gpt.pricing sozinho a cada 15 dias, lendo a tabela de preços do site da OpenAI (o mesmo do /gpt -prices). Só roda com a chave da OpenAI configurada. false: só atualiza à mão.'
    },
    'gpt.pricing.updated': {
        default: '',
        type: 'string',
        allowEmpty: true,
        desc: 'Data (AAAA-MM-DD) da última atualização do gpt.pricing, gravada pelo /gpt -prices e pela atualização automática. Vazio: ainda não atualizou.'
    },
    'gpt.status': {
        default: true,
        type: 'boolean',
        desc: 'Rodapé de status nas respostas do /gpt e do /tldr: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo (o -status|-s liga só naquela vez, se estiver desligado).'
    },
    'gpt.timeout.ms': {
        default: 60000,
        type: 'number', min: 5000, max: 300000,
        desc: 'Timeout (ms) do /gpt, usado quando OPENAI_TIMEOUT_MS não está no config/.env.'
    },
    'gpt.transcribe.model': {
        default: 'gpt-transcribe',
        type: 'string',
        desc: 'Modelo que transcreve o áudio respondido com o /gpt: o id que a sua conta da OpenAI tem (o whisper-1 sai do ar em fev/2027).'
    },
    'gpt.tts.instructions': {
        default: 'Fale como um robô: voz metálica, monótona e pausada, sem emoção.',
        type: 'string',
        desc: 'O estilo da voz do /gpt -voice (só o gpt-4o-mini-tts usa). O padrão é a voz de robô.'
    },
    'gpt.tts.model': {
        default: 'gpt-4o-mini-tts',
        type: 'string',
        desc: 'Modelo que gera a voz do /gpt -voice: o id que a sua conta da OpenAI tem. Só os gpt-4o-* seguem o estilo do gpt.tts.instructions.'
    },
    'gpt.tts.voice': {
        default: 'onyx',
        type: 'string',
        opcoes: OPENAI_VOICES,
        desc: 'A voz do /gpt -voice: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer ou verse.'
    },
    'me.maxRepeat': {
        default: 500,
        type: 'number', min: 1, max: 1000,
        desc: 'Máximo de repetições do /me -repeat|-r <n>.'
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
    'news.brazil': {
        // The feeds listed at https://rss.feedspot.com/brazil_rss_feeds/ (the page is HTML, not RSS)
        default: [
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
        desc: 'Feeds RSS do /news -brazil (blogs sobre o Brasil, do feedspot).',
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
            if (!/^[A-Za-z0-9._-]{1,100}$/.test(v)) throw new Error(t('adm.settings.badPack', { v }));
            return v;
        }
    },
    'poll.retentionDays': {
        default: 90,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as enquetes e os votos ficam guardados para o /poll -r.'
    },
    'rates.coins': {
        default: ['EUR', 'USDT'],
        type: 'list',
        desc: 'Moedas exibidas pelo /rates (contra o real).',
        item: (v) => {
            const sym = v.toUpperCase();
            if (!QUOTE_SUPPORTED[sym]) throw new Error(t('adm.settings.unsupportedCoin', { sym }));
            return sym;
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
    'tldr.maxMsgs': {
        default: 500,
        type: 'number', min: 10, max: 2000,
        desc: 'Máximo de mensagens enviadas à OpenAI por /tldr.'
    },
    'translate.lang': {
        default: 'pt',
        type: 'string',
        desc: 'Idioma de destino padrão do /translate (código: pt, en, es...).'
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
    },
    'weather.city': {
        default: 'Niteroi, Rio de Janeiro, Brazil',
        type: 'string',
        desc: 'Cidade padrão do /weather (ex.: "Niteroi, Rio de Janeiro, Brazil").'
    },
    'weather.maxDays': {
        default: 16,
        type: 'number', min: 1, max: 16, // 16: Open-Meteo limit
        desc: 'Máximo de dias do /weather N (ou Nd), de 1 a 16. Ex.: /weather 16d Niteroi.'
    },
    'weather.sources': {
        default: ['met', 'cptec'],
        type: 'list',
        desc: 'Fontes extras do /weather, além da Open-Meteo (a principal): met (MET Norway) e cptec (CPTEC/INPE, só Brasil). Vazio: só a Open-Meteo.',
        item: (v) => {
            const f = v.toLowerCase();
            if (!['met', 'cptec'].includes(f)) throw new Error(t('adm.settings.unsupported', { s: v, lista: 'met, cptec' }));
            return f;
        }
    },
    'weather.userAgent': {
        default: 'weather-bot/1.0',
        type: 'string',
        desc: 'O User-Agent das consultas às fontes extras do /weather. A MET Norway pede que ele identifique o cliente e dê um contato (ex.: "meubot/1.0 contato@exemplo.com").'
    },
    'zapbot.lang': {
        default: 'en_US',
        type: 'string',
        opcoes: ['en_US', 'pt_BR'],
        normalizar: (v) => ({ en: 'en_US', en_us: 'en_US', pt: 'pt_BR', pt_br: 'pt_BR' })[v.toLowerCase().replace('-', '_')] ?? v,
        desc: 'Idioma do bot (ajuda, respostas, avisos, datas e números): en_US (padrão) ou pt_BR. Ex.: /set zapbot.lang pt_BR.'
    }
};

const settings = new Map();

/*
 * Validates/normalizes a value for the key. Accepts the already typed value (coming from the
 * database) or text (coming from /set). Throws Error with the message for the user.
 */
function validateSetting(key, value) {
    const schema = SETTINGS_SCHEMA[key];
    if (!schema) throw new Error(t('adm.settings.unknown', { key }));

    switch (schema.type) {
        case 'boolean': {
            if (typeof value === 'boolean') return value;
            const v = String(value).trim().toLowerCase();
            if (['on', 'true', '1', 'yes'].includes(v)) return true;
            if (['off', 'false', '0', 'no'].includes(v)) return false;
            throw new Error(t('adm.settings.onOff'));
        }

        case 'number': {
            const n = Number(value);
            if (String(value).trim() === '' || !Number.isInteger(n)) throw new Error(t('adm.settings.integer'));
            if (n < schema.min || n > schema.max) throw new Error(t('adm.settings.range', { min: schema.min, max: schema.max }));
            return n;
        }

        case 'string': {
            let s = String(value ?? '').trim();
            if (schema.normalizar) s = schema.normalizar(s);
            if (!s && schema.allowEmpty) return s;
            // API keys go over 100 (OpenAI's sk-proj- ones are ~164)
            const max = schema.secret ? 500 : 100;
            if (!s || s.length > max) throw new Error(t('adm.settings.length', { max }));
            if (schema.opcoes && !schema.opcoes.includes(s)) throw new Error(t('adm.settings.unsupported', { s, lista: schema.opcoes.join(', ') }));
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

    throw new Error(t('adm.settings.badType', { tipo: schema.type }));
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
            printInfo(`Setting '${oldAlt2}' renamed to '${freshAlt}': the saved value was kept`);
        } else {
            printInfo(`Setting '${oldAlt2}' renamed to '${freshAlt}': '${freshAlt}' already had a value, the old one was discarded`);
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
        printInfo("Setting 'bot.adminMode' (off) became 'bot.users' = true: everyone uses the common commands");
    } else {
        printInfo("Setting 'bot.adminMode' removed: who uses the common commands is now 'bot.users'");
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
            printInfo(`Setting '${row.key}' unknown, ignored.`);
            continue;
        }

        try {
            settings.set(row.key, validateSetting(row.key, JSON.parse(row.value)));
        } catch (e) {
            const list = listWithoutOsInvalid(row.key, row.value);
            if (list) {
                // E.g.: commands.disabled with a command that no longer exists (/status): the others stay
                settings.set(row.key, list);
                printError(`Setting '${row.key}' with an invalid item (${e.message}), ignored: ${list.join(',') || '(empty)'}`);
                continue;
            }
            printError(`Setting '${row.key}' invalid (${e.message}), using the default.`);
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
        printError(`${env} invalid (${e.message}), using the setting '${key}'.`);
        return getSetting(key);
    }
}

async function setSetting(key, value) {
    value = validateSetting(key, value);
    if (key === 'monitor.max') {
        const { n } = await dbGet('SELECT COUNT(*) AS n FROM monitor_contacts');
        if (value < n) throw new Error(t('adm.settings.monitorMax', { n }));
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
