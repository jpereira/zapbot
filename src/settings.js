/*
 * Settings: general configuration in the `settings` table, changeable at runtime through /set.
 */

const { OPENAI_MODELS, OPENAI_VOICES } = require('./openai');
const { compileFilterDebug } = require('./debugOptions');
const { botConfig } = require('./botConfig');
const { ROLES } = require('./roles');
const { t } = require('./i18n');
const { createHash } = require('./util/password');
const { parseQuality, parseSize } = require('./imageOptions');
const { dbAll, dbGet, dbRun } = require('./db');
const { limitHistoryMonitor } = require('./monitorHistory');
const { printError, printInfo, printSuccess } = require('./log');
const { normalizeTicker } = require('./actions');
const { CRYPTO_SUPPORTED } = require('./currencies');
const { isValidHttpUrl } = require('./util/url');
const { compileRuleWatch } = require('./watch/rules');

/*
 * Settings: general configuration persisted in the `settings` table.
 * Loaded at boot into `settings` (memory); getSetting() reads from there and
 * setSetting() validates, saves to the database and to memory. Changeable through /set.
 *
 * Each key declares: default (stored on the first boot, without overwriting the
 * existing), type (boolean | number | string | list), desc e, opcionalmente,
 * min/max (number), item() to normalize/validate each item of a list,
 * separator (list whose items may have spaces/commas: e.g. '\n', one per line),
 * list() (list: checks the whole list, after the items; item() may
 * return null to make a word disappear, like bot.users' "false"),
 * allowEmpty (string that may be empty), validate() (string: throws Error if
 * invalid) and secret (value masked in /set and in the logs).
 */
// A phone with country code (bot.admins and bot.users): "+55 (21) 99999-9999" → "5521999999999"
function itemPhone(v) {
    const digits = v.replace(/[\s()+-]/g, '');
    if (!/^\d{10,15}$/.test(digits)) throw new Error(t('adm.settings.badNumber', { v }));
    return digits;
}

// A zapbot.api.sendTo destination: all, a group id (…@g.us) or a phone with country code
function apiDestination(v) {
    const s = v.trim().toLowerCase();
    if (s === 'all') return s;
    if (/^[\d-]+@g\.us$/.test(s)) return s;
    return itemPhone(v);
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
    if (!command) throw new Error(t('adm.settings.unknownCommand', { name: nameAlt }));
    if (command.role !== ROLES.USER && !command.isDelegable) {
        throw new Error(t(command.role === ROLES.OWNER ? 'adm.settings.ownerOnlyCmd' : 'adm.settings.adminOnlyCmd', { cmd: command.cmd }));
    }
    return command.cmd;
}

// item() of the /news feed lists and validate() of the /defi RPCs
function validateUrlFeed(v) {
    if (!isValidHttpUrl(v)) throw new Error(t('adm.settings.badUrl', { v }));
    return v;
}

const SETTINGS_SCHEMA = {
    'alias.examples': {
        default: [],
        type: 'list',
        desc: 'Arquivos de examples/*.zb que o bot já carregou (um por boot novo, uma vez só: alias que você apagou não volta). Apague o nome para carregar de novo, ou use /alias -examples <nome> (mostra o que o arquivo cria) e /alias -yes -examples <nome> (carrega).',
        item: (v) => v.toLowerCase()
    },
    'ascii.defaultChar': {
        default: '#',
        type: 'string',
        desc: 'Caractere do traço das letras do /ascii quando -char não é informado.',
        validate: (v) => {
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
    'bot.denied.enabled': {
        default: true,
        type: 'boolean',
        desc: 'Quem digita um comando que não pode usar recebe a bot.denied.message, em vez do silêncio (sem repetir enquanto a pessoa insistir, veja bot.denied.interval). Desligado: o bot ignora em silêncio. Vem ligado.'
    },
    'bot.denied.interval': {
        default: 10,
        type: 'number', min: 0, max: 1440,
        desc: 'Minutos de calma do aviso de bot.denied.enabled: se a pessoa já foi avisada (ou tentou algum comando) neste chat nos últimos X minutos, o bot fica quieto, e cada nova tentativa renova a espera. 0: avisa a cada tentativa.'
    },
    'bot.denied.message': {
        default: '',
        type: 'string',
        allowEmpty: true,
        desc: 'Texto do aviso de bot.denied.enabled. $cmd é o comando digitado e $admin, o dono do bot (nome e telefone). Vazio: o texto padrão do idioma do bot (zapbot.lang).'
    },
    'bot.flood.intervalCommand': {
        default: 2,
        type: 'number', min: 1, max: 3600,
        desc: 'Proteção contra flood: a janela, em segundos, em que se conta o bot.flood.maxCommandRepeated, e quanto tempo o bot ignora quem passou do limite.'
    },
    'bot.flood.maxCommandRepeated': {
        default: 3,
        type: 'number', min: 0, max: 100,
        desc: 'Proteção contra flood: quantas vezes quem não é admin pode repetir o mesmo comando em bot.flood.intervalCommand segundos; passou, o bot avisa uma vez e ignora a pessoa até o intervalo acabar. 0 desliga.'
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
        list: (items) => {
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
    /*
     * Each user's usage limit per command (/bot +u ... +cmd /gpt +limit 5/day): "item=/gpt:5/day,/tldr:3",
     * where the item is the same as bot.users and the period is day, week, month (without it: total, does not renew).
     */
    'bot.users.limits': {
        default: [],
        type: 'list',
        separator: /\s+/,
        desc: 'O limite de uso de cada usuário por comando (o /bot +cmd /gpt +limit 5/day): item=/gpt:5/day,/tldr:3, com o item do bot.users; o período é day, week ou month (sem ele, 5 no total). Só conta o que deu certo. O dono e os admins não têm limite.',
        item: (v) => {
            const m = v.match(/^(.+)=(.+)$/);
            if (!m) throw new Error(t('usage.settingFormat', { v }));
            const target = userItem(m[1]);
            if (!target || target === 'all') throw new Error(t('adm.settings.badItem', { item: m[1] }));
            const { readLimit, recordLimit } = require('./usageLimit');
            const pairs = m[2].split(',').filter(Boolean).map((pair) => {
                const i = pair.indexOf(':');
                if (i < 1) throw new Error(t('usage.settingFormat', { v }));
                return `${userCommand(pair.slice(0, i))}:${recordLimit(readLimit(pair.slice(i + 1)))}`;
            });
            return `${target}=${pairs.join(',')}`;
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
    'calendar.addEmoji': {
        default: true,
        type: 'boolean',
        desc: 'Começa o título do evento do /calendar com um emoji do tipo dele (🩺 Consulta, 🧗 Escalada, 🏋🏽‍♂️ Treino...). No motor gpt, o ChatGPT escolhe o emoji. Desligue com off.'
    },
    'calendar.duration': {
        default: 60,
        type: 'number', min: 5, max: 1440,
        desc: 'Quantos minutos dura o evento do /calendar quando o texto não diz. O -duration (-du) muda na chamada.'
    },
    'calendar.engine': {
        default: 'local',
        type: 'string',
        options: ['local', 'gpt'],
        normalize: (v) => v.toLowerCase(),
        desc: 'Motor do /calendar: local (lê pelos rótulos e pelo formato das datas, sem chave) ou gpt (o ChatGPT devolve o evento no JSON do Google Calendar). -gpt e -local escolhem na chamada.'
    },
    'calendar.footer': {
        default: true,
        type: 'boolean',
        desc: 'Termina a resposta do /calendar com a dica "💡 Processado por <motor>". O -quiet (-q) esconde na chamada.'
    },
    'calendar.googleLink': {
        default: true,
        type: 'boolean',
        desc: 'O /calendar manda o link "➕ Adicionar ao Google Agenda". O -quiet (-q) já esconde na chamada; este setting desliga sempre. O .ics continua indo (abre no Apple Calendar e no Outlook).'
    },
    'calendar.outputToPrivate': {
        default: true,
        type: 'boolean',
        desc: 'Ao responder uma mensagem com /calendar, envia os avisos e o evento no privado de quem chamou.'
    },
    'calendar.timezone': {
        default: 'America/Sao_Paulo',
        type: 'string',
        validate: (v) => {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: v });
            } catch {
                throw new Error(t('calendar.badTimezone', { value: v }));
            }
            return v;
        },
        desc: 'O fuso horário em que o /calendar entende a data e a hora do texto (nome IANA, ex.: America/Sao_Paulo, Europe/Lisbon).'
    },
    'call.allow': {
        default: [],
        type: 'list',
        desc: 'Números (com DDI, ex.: 5521999999999) cujas ligações nunca são recusadas, mesmo com call.reject ligado. O bot.admins também passa sempre.',
        item: itemPhone
    },
    'call.message': {
        default: '',
        type: 'string',
        allowEmpty: true,
        desc: 'Mensagem enviada a quem teve a ligação recusada (no máximo uma a cada 10 minutos por pessoa). Vazio: o texto padrão do idioma do bot (zapbot.lang). off: recusa em silêncio.'
    },
    'call.reject': {
        default: false,
        type: 'boolean',
        desc: 'Recusa as ligações de voz e de vídeo que chegam (exceto de call.allow e do bot.admins) e responde com a call.message.'
    },
    'commands.disabled': {
        // Off out of the box: three commands that most people do not want (jokes and news from the Linux world).
        // /set -rm commands.disabled kernel cve walissu (or /set commands.disabled "") turns them on
        default: ['/cve', '/kernel', '/walissu'],
        type: 'list',
        desc: 'Comandos desativados em tempo de execução (somem do /help). Já vêm desativados: /cve, /kernel e /walissu (veja /set -rm commands.disabled).',
        item: (v) => {
            const typed = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
            const command = botConfig.commands.find(c => c.cmd === typed || c.aliases?.includes(typed));
            if (!command) throw new Error(t('adm.settings.unknownCommand', { name: typed }));
            if (command.cmd === '/set') throw new Error(t('adm.settings.setNotDisabled'));
            return command.cmd;
        }
    },
    'commands.seen': {
        default: true,
        type: 'boolean',
        desc: 'Marca a conversa como lida (✓✓ azul) quando um comando é digitado nela, antes de responder, como uma pessoa faria. Também aparece o "digitando..." enquanto o comando roda.'
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
    'cron.max': {
        default: 50,
        type: 'number', min: 1, max: 500,
        desc: 'Máximo de itens do /cron, somando lembretes e mensagens.'
    },
    'crypto.alert.intervalMin': {
        default: 5,
        type: 'number', min: 1, max: 60,
        desc: 'Intervalo (minutos) entre as verificações dos alertas do /crypto.'
    },
    'crypto.alert.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de alertas de preço do /crypto.'
    },
    'crypto.brl': {
        default: true,
        type: 'boolean',
        desc: 'O /crypto mostra também o preço de cada moeda em reais (o par direto da Binance, ou o dólar × USDTBRL).'
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
        validate: (v) => {
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
        validate: (v) => { compileFilterDebug(v); return v; }
    },
    'debug.level': {
        default: 0,
        type: 'number', min: 0, max: 3,
        desc: 'Nível do debug: 0 básico, 1 o que o bot está chamando (comandos, banco, requisições, processos, e-mail, WhatsApp), uma linha cada, 2 as mesmas chamadas com os parâmetros e todas as funções dos módulos, 3 resultados e Chromium.'
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
        validate: (v) => {
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
        validate: validateUrlFeed,
        desc: 'Indexador GraphQL da Aptos usado pelo /defi na Liquidswap (acha as posições guardadas como fungible asset).'
    },
    'defi.aptos.rpc': {
        default: 'https://api.mainnet.aptoslabs.com/v1',
        type: 'string',
        secret: true,
        validate: validateUrlFeed,
        desc: 'API REST do fullnode da Aptos usada pelo /defi na Liquidswap (a pública limita as consultas).'
    },
    'defi.base.rpc': {
        default: 'https://mainnet.base.org',
        type: 'string',
        secret: true,
        validate: validateUrlFeed,
        desc: 'RPC da Base usado pelo /defi aave, quando BASE_RPC_URL não está no config/.env (o público limita as consultas).'
    },
    'defi.ethereum.rpc': {
        default: 'https://ethereum-rpc.publicnode.com',
        type: 'string',
        secret: true,
        validate: validateUrlFeed,
        desc: 'RPC da Ethereum usado pelo /defi aave, quando ETHEREUM_RPC_URL não está no config/.env (o público limita as consultas).'
    },
    'defi.hyperevm.rpc': {
        default: 'https://rpc.hyperliquid.xyz/evm',
        type: 'string',
        secret: true,
        validate: validateUrlFeed,
        desc: 'RPC da HyperEVM usado pelo /defi no Project X (o público limita as consultas).'
    },
    'defi.morpho.api': {
        default: 'https://api.morpho.org/graphql',
        type: 'string',
        validate: validateUrlFeed,
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
        validate: (v) => {
            if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(t('adm.settings.badWallet', { v }));
            return v;
        },
        desc: 'Carteira do /defi morpho quando não há carteira cadastrada, usada quando MORPHO_WALLET_ADDRESS não está no config/.env.'
    },
    'defi.solana.rpc': {
        default: 'https://api.mainnet-beta.solana.com',
        type: 'string',
        secret: true,
        validate: validateUrlFeed,
        desc: 'RPC da Solana usado pelo /defi (o público limita as consultas; um RPC próprio costuma ter a chave na URL).'
    },
    'draw.footer': {
        default: true,
        type: 'boolean',
        desc: 'Acrescenta a dica "💡 Desenhado por ChatGPT" no aviso "imagem gerada abaixo" do /draw e do /gpt -img|-gif. O -quiet (-q) esconde na chamada.'
    },
    'forward.delayMs': {
        default: 1000,
        type: 'number', min: 0, max: 10000,
        desc: 'Pausa (ms) entre as mensagens quando o /forward encaminha várias, para não encher o WhatsApp de uma vez.'
    },
    'forward.header': {
        default: true,
        type: 'boolean',
        desc: 'Cabeçalho "Mensagem encaminhada pelo ZapBot!" no começo do que o /forward envia (desligado, vai só a mensagem; o -status|-s força, o -quiet|-q e o -nohdr tiram).'
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
    'forward.status': {
        default: true,
        type: 'boolean',
        desc: 'O /forward mostra o status: o aviso enquanto envia e, no fim, "✉️ ... com sucesso!" com a lista de quem recebeu (desligado, só as falhas aparecem; o -status|-s força, o -quiet|-q tira).'
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
    'giphy.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave do GIPHY (/giphy), usada quando GIPHY_API_KEY não está no config/.env.'
    },
    'giphy.tag': {
        default: 'fail',
        type: 'string',
        desc: 'Tag padrão do /giphy quando nenhuma é informada.'
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
        options: OPENAI_MODELS,
        desc: 'Modelo do /gpt, usado quando OPENAI_MODEL não está no config/.env (o /gpt -m lista os aceitos).'
    },
    'gpt.credit.since': {
        default: '',
        type: 'string',
        allowEmpty: true,
        desc: 'Data (AAAA-MM-DD) da compra dos créditos da OpenAI: o /gpt -usage soma o gasto desde ela para mostrar $usado/$total.',
        validate: (v) => {
            if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) throw new Error(t('adm.settings.dateFormat'));
            return v;
        }
    },
    'gpt.credit.total': {
        default: 0,
        type: 'number', min: 0, max: 100000,
        desc: 'Total de créditos comprados na OpenAI, em dólares (a API não informa o saldo): o /gpt -usage mostra $usado/$total. 0: não mostra.'
    },
    'gpt.footer': {
        default: true,
        type: 'boolean',
        desc: 'Termina as respostas do /gpt com a dica "💡 Respondido por ChatGPT". O -quiet (-q) esconde na chamada.'
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
    'gpt.image.quality': {
        default: 'auto',
        type: 'string',
        validate: (v) => parseQuality(v),
        desc: 'Qualidade da imagem do /draw e do /gpt -img: low, medium, high ou auto (a OpenAI escolhe). Quanto maior, mais caro. O -quality muda na chamada (dono e admins).'
    },
    'gpt.image.size': {
        default: 'auto',
        type: 'string',
        validate: (v) => parseSize(v),
        desc: 'Tamanho da imagem do /draw e do /gpt -img: auto (a OpenAI escolhe), square (1024x1024), landscape (1536x1024), portrait (1024x1536) ou LxA. Maior custa mais. O -size muda na chamada (dono e admins).'
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
    'gpt.tts.speed': {
        default: 100,
        type: 'number', min: 50, max: 200,
        desc: 'A velocidade da voz do ChatGPT no /gpt -voice e no /tts -gpt, em % (100 normal, 150 mais rápido). O -speed (-sp) muda na chamada; a voz local usa o tts.speed.'
    },
    'gpt.tts.voice': {
        default: 'onyx',
        type: 'string',
        options: OPENAI_VOICES,
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
    'notes.lockMinutes': {
        default: 5,
        type: 'number', min: 1, max: 120,
        desc: 'Minutos sem usar uma tag protegida (/notes -lock) até ela travar sozinha.'
    },
    'notes.lockPrivateOnly': {
        default: true,
        type: 'boolean',
        desc: 'Uma tag protegida (/notes -lock) só abre no seu privado (as mensagens com você mesmo). Com off, abre em qualquer chat (nunca com -to, e a senha continua sendo digitada só no seu privado). O que o bot envia com uma nota decifrada nunca é guardado no banco.'
    },
    'ocr.engine': {
        default: 'local',
        type: 'string',
        options: ['local', 'gpt'],
        normalize: (v) => v.toLowerCase(),
        desc: 'Motor do /ocr: local (Tesseract, sem chave) ou gpt (ChatGPT, visão da OpenAI). -gpt e -local escolhem na chamada.'
    },
    'ocr.footer': {
        default: true,
        type: 'boolean',
        desc: 'Termina a resposta do /ocr com a dica "💡 Lido por <motor>". O -quiet (-q) esconde na chamada.'
    },
    'ocr.language': {
        default: 'por+eng',
        type: 'string',
        validate: (v) => {
            if (!/^[a-z_]{3,8}(\+[a-z_]{3,8})*$/i.test(v)) throw new Error('Use códigos do Tesseract separados por +, como por+eng.');
            return v;
        },
        desc: 'Idiomas do /ocr local (Tesseract), separados por +: por+eng, por, eng, spa... O que não está na imagem Docker não lê.'
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
    'screenshot.timeout': {
        default: 30,
        type: 'number', min: 5, max: 120,
        desc: 'Segundos que o /screenshot espera a página carregar antes de tirar a captura (a página que nunca "acalma" sai com o que já carregou).'
    },
    'screenshot.userAgent': {
        default: '',
        type: 'string',
        allowEmpty: true,
        desc: 'O User-Agent do /screenshot. Vazio: o mesmo do Chromium do bot (sem o "Headless", que muitos sites recusam).'
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
    'status.warnAfter': {
        default: 3,
        type: 'number', min: 1, max: 50,
        desc: 'A partir de quantas postagens no Status em 24 horas o /status avisa do risco de banimento (não bloqueia).'
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
    'stocks.alert.intervalMin': {
        default: 5,
        type: 'number', min: 1, max: 60,
        desc: 'Intervalo (minutos) entre as verificações dos alertas do /stocks.'
    },
    'stocks.alert.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de alertas de preço do /stocks.'
    },
    'stocks.symbols': {
        default: ['USD', 'EUR', 'USDT', 'MSTR'],
        type: 'list',
        desc: 'Símbolos exibidos pelo /stocks: moedas contra o real (USD, EUR, GBP, USDT) e tickers do Yahoo Finance (MSTR, NVDA, PETR4.SA, BRK-B, ^GSPC).',
        item: (v) => {
            const ticker = normalizeTicker(v);
            if (!ticker) throw new Error(t('stocks.badTicker', { value: v }));
            return ticker;
        }
    },
    'stt.beam': {
        default: 1,
        type: 'number', min: 1, max: 10,
        desc: 'Tamanho do beam da busca do faster-whisper no /stt (1 é o mais rápido; maior pode acertar um pouco mais e demora mais). O -beam muda na chamada.'
    },
    'stt.engine': {
        default: 'local',
        type: 'string',
        options: ['local', 'gpt'],
        normalize: (v) => v.toLowerCase(),
        desc: 'Motor do /stt e do /get -stt: local (faster-whisper, sem chave) ou gpt (ChatGPT, API da OpenAI). -gpt e -local escolhem na chamada.'
    },
    'stt.footer': {
        default: true,
        type: 'boolean',
        desc: 'Termina a transcrição do /stt e do /get -stt com a dica "💡 Transcrito por <motor>". O -quiet (-q) esconde na chamada.'
    },
    'stt.language': {
        default: 'auto',
        type: 'string',
        desc: 'Idioma da fala no /stt (pt, en, es...). auto: o whisper detecta. O -lang muda na chamada.'
    },
    'stt.maxMinutes': {
        default: 20,
        type: 'number', min: 1, max: 180,
        desc: 'Duração máxima (minutos) do áudio que o /get -stt transcreve. A transcrição usa a CPU do servidor.'
    },
    'stt.model': {
        default: 'small',
        type: 'string',
        desc: 'Modelo do faster-whisper no /stt: tiny, base, small, medium ou large-v3-turbo (maior = melhor e mais lento). O small vem na imagem; outro é baixado na primeira vez. O -model muda na chamada.'
    },
    'stt.vad': {
        default: true,
        type: 'boolean',
        desc: 'Pula o silêncio e a música antes de transcrever no /stt (onde o whisper costuma inventar texto). O -vad on|off muda na chamada.'
    },
    'tldr.footer': {
        default: true,
        type: 'boolean',
        desc: 'Termina o resumo do /tldr com a dica "💡 Resumido por ChatGPT". O -quiet (-q) esconde na chamada.'
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
    'tts.engine': {
        default: 'local',
        type: 'string',
        options: ['local', 'gpt'],
        normalize: (v) => v.toLowerCase(),
        desc: 'Motor do /tts: local (voz Piper, sem chave) ou gpt (ChatGPT, API de voz da OpenAI). -gpt e -local escolhem na chamada.'
    },
    'tts.footer': {
        default: true,
        type: 'boolean',
        desc: 'Acrescenta a dica "💡 Gerado por <motor>" no aviso "áudio gerado abaixo" do /tts e do /gpt -voice. O -quiet (-q) esconde na chamada.'
    },
    'tts.maxChars': {
        default: 32000,
        type: 'number', min: 100, max: 100000,
        desc: 'Máximo de caracteres do texto do /tts e do /gpt -voice. A voz local (Piper) fala tudo de uma vez; a do ChatGPT recebe em partes de 4096 (o limite da API) e junta o áudio (custa mais quanto maior o texto).'
    },
    'tts.pause': {
        default: 300,
        type: 'number', min: 0, max: 3000,
        desc: 'O silêncio, em ms, entre as linhas do /tts com várias linhas (cada linha é um trecho e o áudio sai junto). Uma linha em branco dobra a pausa. O -pause (-pa) muda na chamada.'
    },
    'tts.pitch': {
        default: 0,
        type: 'number', min: -12, max: 12,
        desc: 'O tom da voz do /tts e do /gpt -voice, em semitons (0 normal, 3 mais agudo, -3 mais grave). O -pitch (-pi) muda na chamada.'
    },
    'tts.speed': {
        default: 50,
        type: 'number', min: 50, max: 200,
        desc: 'A velocidade da voz local (Piper) do /tts, em % (100 é a velocidade original do motor; o padrão 50 fala mais devagar, que fica melhor de ouvir). Com -gpt vale o gpt.tts.speed. O -speed (-sp) muda na chamada.'
    },
    'tts.voice.en': {
        default: 'en_US-lessac-medium',
        type: 'string',
        desc: 'Voz local (Piper) do /tts para texto em inglês: en_US-lessac-medium, en_US-amy-medium, en_GB-alan-medium... A que não está na imagem é baixada na primeira vez.'
    },
    'tts.voice.pt': {
        default: 'pt_BR-faber-medium',
        type: 'string',
        desc: 'Voz local (Piper) do /tts para texto em português: pt_BR-faber-medium, pt_BR-edresson-low, pt_PT-tugão-medium... A que não está na imagem é baixada na primeira vez.'
    },
    'tts.volume': {
        default: 100,
        type: 'number', min: 20, max: 300,
        desc: 'O volume da voz do /tts e do /gpt -voice, em % (100 normal, 200 o dobro). O -volume (-vol) muda na chamada.'
    },
    'usage.footer': {
        default: true,
        type: 'boolean',
        desc: 'Depois de um comando com limite de uso (/bot +limit), avisa quantos usos restam ("📊 /gpt: restam 2 de 5 por dia").'
    },
    'usage.logDays': {
        default: 90,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que o histórico de usos com limite (/usage -log) fica guardado. Os usos que ainda contam para um limite nunca são apagados antes do fim do período.'
    },
    'warn.max': {
        default: 3,
        type: 'number', min: 0, max: 20,
        desc: 'Quantos avisos do /warn tiram a pessoa do grupo (o bot precisa ser admin dele). 0: só conta, nunca remove.'
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
            if (!['met', 'cptec'].includes(f)) throw new Error(t('adm.settings.unsupported', { s: v, list: 'met, cptec' }));
            return f;
        }
    },
    'weather.userAgent': {
        default: 'weather-bot/1.0',
        type: 'string',
        desc: 'O User-Agent das consultas às fontes extras do /weather. A MET Norway pede que ele identifique o cliente e dê um contato (ex.: "meubot/1.0 contato@exemplo.com").'
    },
    'zapbot.api.enabled': {
        default: false,
        type: 'boolean',
        desc: 'Liga a API HTTP local (src/api.js): /health, /status, /notes e /send, com a zapbot.api.key. Desligada por padrão; muda só ao reiniciar o bot.'
    },
    'zapbot.api.host': {
        default: '127.0.0.1',
        type: 'string',
        desc: 'Endereço em que a API escuta. O padrão (127.0.0.1) só atende a própria máquina; fora dele, ponha um proxy com HTTPS na frente. Muda só ao reiniciar o bot.'
    },
    'zapbot.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        validate: (v) => {
            const min = 20;
            if (v && v.length < min) throw new Error(t('adm.settings.badApiKey', { min }));
            return v;
        },
        desc: 'A chave da API HTTP (cabeçalho Authorization: Bearer <chave> ou X-API-Key), com pelo menos 20 caracteres. Vazia: a API não inicia. Use uma chave longa e aleatória.'
    },
    'zapbot.api.port': {
        default: 3100,
        type: 'number', min: 1024, max: 65535,
        desc: 'Porta da API HTTP. Muda só ao reiniciar o bot.'
    },
    'zapbot.api.sendTo': {
        default: [],
        type: 'list',
        desc: 'Para onde o POST /send e o send_message do MCP podem mandar além do seu próprio chat: telefones com DDI, ids de grupo (…@g.us) ou all (qualquer destino: use só se confiar em quem tem a chave).',
        item: apiDestination
    },
    'zapbot.email.alerts': {
        default: true,
        type: 'boolean',
        desc: 'Avisa por e-mail (SMTP do QR Code) crash, queda, reconexão e outros eventos do bot.'
    },
    'zapbot.lang': {
        default: 'en_US',
        type: 'string',
        options: ['en_US', 'pt_BR'],
        normalize: (v) => ({ en: 'en_US', en_us: 'en_US', pt: 'pt_BR', pt_br: 'pt_BR' })[v.toLowerCase().replace('-', '_')] ?? v,
        desc: 'Idioma do bot (ajuda, respostas, avisos, datas e números): en_US (padrão) ou pt_BR. Ex.: /set zapbot.lang pt_BR.'
    },
    'zapbot.mcp.enabled': {
        default: false,
        type: 'boolean',
        desc: 'EXPERIMENTAL. Liga o servidor MCP da API (POST /mcp), para um cliente de IA enviar mensagens (para o zapbot.api.sendTo) e ler as notas do /notes. Exige zapbot.api.enabled e zapbot.api.key.'
    },
    'zapbot.web.enabled': {
        default: false,
        type: 'boolean',
        desc: 'Liga a interface web (src/web): o histórico de mensagens do banco, no estilo do WhatsApp Web, só com senha (zapbot.web.password). Desligada por padrão; muda só ao reiniciar o bot.'
    },
    'zapbot.web.host': {
        default: '127.0.0.1',
        type: 'string',
        desc: 'Endereço em que a interface web escuta. O padrão (127.0.0.1) só atende a própria máquina; fora dele, ponha um proxy com HTTPS na frente. Muda só ao reiniciar o bot.'
    },
    'zapbot.web.login': {
        default: '',
        type: 'string',
        allowEmpty: true,
        validate: (v) => {
            if (v && !/^[\w.@-]{3,40}$/.test(v)) throw new Error(t('adm.settings.badWebLogin'));
            return v;
        },
        desc: 'O nome de usuário (login) da interface web, que você escolhe: /set zapbot.web.login <nome>. Vale junto com a zapbot.web.password; vazio: a interface não inicia.'
    },
    'zapbot.web.pageSize': {
        default: 100,
        type: 'number', min: 20, max: 500,
        desc: 'Quantas mensagens a interface web carrega por vez (as mais antigas vêm ao rolar).'
    },
    'zapbot.web.password': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        validate: (v) => {
            if (!v || v.startsWith('scrypt$')) return v;
            if (v.length < 8) throw new Error(t('login.senhaCurta', { min: 8 }));
            return createHash(v);
        },
        desc: 'A senha da interface web. Digite a senha em /set zapbot.web.password <senha> (mínimo 8 caracteres): o bot guarda só o hash (scrypt). Vazia: a interface não inicia.'
    },
    'zapbot.web.port': {
        default: 3200,
        type: 'number', min: 1024, max: 65535,
        desc: 'Porta da interface web. Muda só ao reiniciar o bot.'
    },
    'zapbot.web.refreshSeconds': {
        default: 15,
        type: 'number', min: 0, max: 300,
        desc: 'De quantos em quantos segundos a interface web busca as mensagens novas da conversa aberta (0 desliga).'
    },
    'zapbot.web.sessionHours': {
        default: 12,
        type: 'number', min: 1, max: 720,
        desc: 'Horas que o login da interface web vale (depois pede a senha de novo). Reiniciar o bot encerra todos os logins.'
    },
    'zapbot.web.totp': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        validate: (v) => {
            if (v && !/^[A-Za-z2-7 =-]{16,}$/.test(v)) throw new Error(t('adm.settings.badTotp'));
            return v.replace(/[\s=-]/g, '').toUpperCase();
        },
        desc: 'Segredo (base32) do código de 6 dígitos (TOTP: Google Authenticator, Authy...) pedido além da senha no login da interface web. Vazio: só a senha. Não precisa digitar: no seu privado, /set zapbot.web.totp new cria o segredo e manda o QR code, e o 2FA só liga quando você digita o código do app (/set zapbot.web.totp 123456).'
    },
    'zapbot.web.trustProxy': {
        default: false,
        type: 'boolean',
        desc: 'Lê os cabeçalhos X-Forwarded-For e X-Forwarded-Proto dos proxies listados em ZAPBOT_WEB_TRUSTED_PROXIES.'
    },
    'zapbot.web.url': {
        default: '',
        type: 'string',
        allowEmpty: true,
        validate: (v) => {
            if (v && !/^https?:\/\/[^\s]+$/i.test(v)) throw new Error(t('adm.settings.badUrl', { v }));
            return v.replace(/\/+$/, '');
        },
        desc: 'O endereço pelo qual você abre a interface web (ex.: http://192.168.1.253:3200 ou https://zap.exemplo.com), que o bot mostra ao iniciar. Vazio: o bot descobre o IP da máquina (no Docker, preencha: o container não sabe o IP do servidor).'
    },
    'zapbot.web.warnAccess': {
        default: true,
        type: 'boolean',
        desc: 'Avisa no seu privado (⚠️) quando alguém abre a página de login da interface web e ainda não está logado: um aviso por endereço a cada 10 minutos e no máximo 5 avisos em 10 minutos (o resto é só contado). Desligue com off.'
    },
    'zapbot.web.warnChangedPhone': {
        default: true,
        type: 'boolean',
        desc: 'A interface web mostra os avisos do WhatsApp de que o código de segurança de alguém mudou (troca de aparelho: "🔒 o código de segurança de Fulano mudou"). Desligado, eles somem do histórico e das contagens.'
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
            if (schema.normalize) s = schema.normalize(s);
            if (!s && schema.allowEmpty) return s;
            // API keys go over 100 (OpenAI's sk-proj- ones are ~164)
            const max = schema.secret ? 500 : 100;
            if (!s || s.length > max) throw new Error(t('adm.settings.length', { max }));
            if (schema.options && !schema.options.includes(s)) throw new Error(t('adm.settings.unsupported', { s, list: schema.options.join(', ') }));
            return schema.validate ? schema.validate(s) : s;
        }

        case 'list': {
            const items = Array.isArray(value)
                ? value.map(String)
                : String(value ?? '').split(schema.separator ?? /[\s,]+/);
            const list = items.map(v => v.trim()).filter(Boolean)
                .map(schema.item ?? (v => v)).filter(v => v !== null);
            return schema.list ? schema.list([...new Set(list)]) : [...new Set(list)];
        }
    }

    throw new Error(t('adm.settings.badType', { type: schema.type }));
}

/*
 * A saved list with some item that stopped being valid (e.g.: a removed command
 * in a new version): validates item by item and keeps the valid ones. If it is not a
 * list, null (the default applies).
 */
function listWithoutOsInvalid(key, valueSaved) {
    if (SETTINGS_SCHEMA[key]?.type !== 'list') return null;

    let items;
    try {
        items = JSON.parse(valueSaved);
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

async function loadSettings() {
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
