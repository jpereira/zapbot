/*
 * Settings: configurações gerais na tabela `settings`, alteráveis em tempo de execução pelo /set.
 */

const { OPENAI_MODELOS } = require('./openai');
const { botConfig } = require('./botConfig');
const { APP_ENV } = require('./constantes');
const { dbAll, dbGet, dbRun } = require('./db');
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
 * lista() (list: confere a lista inteira, depois dos itens; o item() pode
 * devolver null para sumir com uma palavra, como o "false" do bot.users),
 * allowEmpty (string que pode ficar vazia), validar() (string: lança Error se
 * inválida) e secret (valor mascarado no /set e nos logs).
 */
// Um telefone com DDI (bot.admins e bot.users): "+55 (21) 99999-9999" → "5521999999999"
function telefoneDoItem(v) {
    const digitos = v.replace(/[\s()+-]/g, '');
    if (!/^\d{10,15}$/.test(digitos)) throw new Error(`número inválido: ${v} (use DDI + DDD + número, ex.: +5521999999999)`);
    return digitos;
}

// Um item do bot.users: 'all', null (false), um grupo, uma pessoa ou uma pessoa só num grupo
function itemDeUsuario(v) {
    const s = v.trim().toLowerCase();
    if (['all', 'todos', 'true', 'on', 'sim', 'yes'].includes(s)) return 'all';
    if (['false', 'off', 'nao', 'não', 'no', 'ninguem', 'ninguém'].includes(s)) return null;
    if (/^[\d-]+@g\.us$/.test(s)) return s;
    const soNoGrupo = s.match(/^(.+):([\d-]+@g\.us)$/);
    if (soNoGrupo) return `${telefoneDoItem(soNoGrupo[1])}:${soNoGrupo[2]}`;
    return telefoneDoItem(v);
}

// "/creptomoeda" ou "crypto" → "/crypto"; comando que não existe ou admin: erro
function comandoDeUsuario(v) {
    const nome = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
    const command = botConfig.commands.find(c => c.cmd === nome || c.aliases?.includes(nome));
    if (!command) throw new Error(`comando desconhecido: ${nome}`);
    if (command.onlyAdmin) throw new Error(`o ${command.cmd} é só do dono e dos admins`);
    return command.cmd;
}

// item() das listas de feeds do /news e validar() dos RPCs do /defi
function validarUrlFeed(v) {
    if (!isValidHttpUrl(v)) throw new Error(`URL inválida: ${v}`);
    return v;
}

/*
 * Settings renomeados: no boot, o valor salvo com o nome antigo passa para o
 * novo (veja migrarSettingsRenomeados). Em ordem alfabética do nome antigo.
 */
const SETTINGS_RENOMEADOS = {
    'edit.alert': 'show.alert.edited',
    'gif.giphy.api.key': 'giphy.api.key',
    'resumo.maxMsgs': 'tldr.maxMsgs',
    'revoke.status': 'show.alert.status',
    'show.alert.edit': 'show.alert.edited',
    'show.revoke.status': 'show.alert.status',
    'stats.enabled': 'stats.enable'
};

// Comandos renomeados: um commands.disabled salvo com o nome antigo vale para o novo
const COMANDOS_RENOMEADOS = {
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
    'bot.admins': {
        default: [],
        type: 'list',
        desc: 'Outras pessoas (número com DDI, ex.: 5521999999999) que também usam os comandos admin. Só o dono altera; pelo /set vale o nome do contato (/set -a bot.admins /Jorge Pereira/), e o /bot +o|-o é o atalho.',
        item: telefoneDoItem
    },
    'bot.paused': {
        default: false,
        type: 'boolean',
        desc: 'Bot desligado: todos os comandos são ignorados, exceto o /bot (o mesmo do /bot -on|-off).'
    },
    /*
     * Quem usa os comandos comuns (os não-admin), além do dono e do bot.admins:
     * [] (false, o padrão) ninguém; ['all'] (true) todos; ou pessoas (o
     * telefone), grupos (o id @g.us: qualquer um, mas só dentro do grupo) e
     * pessoas só num grupo ("telefone:id@g.us", o /bot +v digitado no grupo).
     */
    'bot.users': {
        default: [],
        type: 'list',
        desc: 'Quem usa os comandos comuns (os não-admin), além do dono e do bot.admins: false (ninguém, o padrão), true (todos) ou pessoas e grupos (num grupo, todos ali usam, mas só dentro dele); uma pessoa só num grupo fica como telefone:grupo. Só o dono altera; pelo /set vale o nome (/set bot.users /Camila Gama/ /Grupo Familia/), e o /bot +v|-v é o atalho.',
        item: itemDeUsuario,
        lista: (itens) => {
            if (itens.includes('all') && itens.length > 1) {
                throw new Error('o true (todos) não se mistura com pessoas e grupos: para liberar só alguns, /set bot.users false antes');
            }
            return itens;
        }
    },
    /*
     * Os comandos de cada usuário (o /bot +cmd|-cmd): "item=/a,/b" (só esses) ou
     * "item=!/a,/b" (todos os comuns, menos esses), em que o item é o mesmo do
     * bot.users. Sem linha: todos os comuns. Um por linha (ou separados por espaço).
     */
    'bot.users.cmds': {
        default: [],
        type: 'list',
        separator: /\s+/,
        desc: 'Os comandos de cada usuário (o /bot +cmd|-cmd): item=/a,/b (só esses) ou item=!/a,/b (todos os comuns, menos esses), com o item do bot.users. Sem linha: todos os comuns.',
        item: (v) => {
            const m = v.match(/^(.+)=(!?)(.+)$/);
            if (!m) throw new Error(`use item=/cmd,/cmd (ou item=!/cmd para todos menos esse): ${v}`);
            const alvo = itemDeUsuario(m[1]);
            if (!alvo || alvo === 'all') throw new Error(`item inválido: ${m[1]}`);
            const comandos = [...new Set(m[3].split(',').filter(Boolean).map(comandoDeUsuario))];
            return `${alvo}=${m[2]}${comandos.join(',')}`;
        }
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
            const digitado = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
            // Nomes de versões anteriores (salvos no banco) que viraram outro comando
            const nome = COMANDOS_RENOMEADOS[digitado] ?? digitado;
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
    'defi.alerta.intervalMin': {
        default: 10,
        type: 'number', min: 1, max: 1440,
        desc: 'Intervalo (minutos) entre as verificações do /defi -alerta (cada uma lê as posições no RPC da Solana).'
    },
    'defi.hyperevm.rpc': {
        default: 'https://rpc.hyperliquid.xyz/evm',
        type: 'string',
        secret: true,
        validar: validarUrlFeed,
        desc: 'RPC da HyperEVM usado pelo /defi no Project X (o público limita as consultas).'
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
        default: 7,
        type: 'number', min: 1, max: 16, // 16: limite da Open-Meteo
        desc: 'Máximo de dias do /tempo N (ou Nd), ex.: /tempo 7d Niteroi.'
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
            const lista = itens.map(v => v.trim()).filter(Boolean)
                .map(schema.item ?? (v => v)).filter(v => v !== null);
            return schema.lista ? schema.lista([...new Set(lista)]) : [...new Set(lista)];
        }
    }

    throw new Error(`tipo inválido no schema: ${schema.type}`);
}

/*
 * Uma lista salva com algum item que deixou de valer (ex.: um comando removido
 * numa versão nova): valida item por item e fica com os válidos. Não sendo uma
 * lista, null (vale o padrão).
 */
function listaSemOsInvalidos(key, valorSalvo) {
    if (SETTINGS_SCHEMA[key]?.type !== 'list') return null;

    let itens;
    try {
        itens = JSON.parse(valorSalvo);
    } catch {
        return null;
    }
    if (!Array.isArray(itens)) return null;

    const validos = itens.flatMap((item) => {
        try {
            return validarSetting(key, [item]);
        } catch {
            return [];
        }
    });
    return [...new Set(validos)];
}

/*
 * O valor de um setting renomeado vai para o nome novo e o antigo sai do banco.
 * Se o novo já existe com um valor seu (diferente do padrão), ele fica: o
 * antigo só preenche o novo que ainda está no padrão (o caso de quem atualizou
 * para a versão que renomeou, criando o novo com o padrão, sem migrar).
 */
async function migrarSettingsRenomeados() {
    for (const [antigo, novo] of Object.entries(SETTINGS_RENOMEADOS)) {
        const velho = await dbGet('SELECT value FROM settings WHERE key = ?', [antigo]);
        if (!velho) continue;

        const atual = await dbGet('SELECT value FROM settings WHERE key = ?', [novo]);
        if (!atual || atual.value === JSON.stringify(SETTINGS_SCHEMA[novo].default)) {
            await dbRun(`INSERT INTO settings (key, value) VALUES (?, ?)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, [novo, velho.value]);
            printInfo(`Setting '${antigo}' renomeado para '${novo}': o valor salvo foi mantido`);
        } else {
            printInfo(`Setting '${antigo}' renomeado para '${novo}': o '${novo}' já tinha valor, o antigo foi descartado`);
        }

        await dbRun('DELETE FROM settings WHERE key = ?', [antigo]);
    }
}

/*
 * O bot.adminMode (até a 2.2) virou o bot.users: o modo admin desligado (todos
 * usavam os comandos) é o bot.users = true; ligado, o padrão (só o dono e os
 * admins). Um bot.users que já existe fica como está.
 */
async function migrarModoAdmin() {
    const modo = await dbGet("SELECT value FROM settings WHERE key = 'bot.adminMode'");
    if (!modo) return;

    const users = await dbGet("SELECT value FROM settings WHERE key = 'bot.users'");
    if (!users && JSON.parse(modo.value) === false) {
        await dbRun("INSERT INTO settings (key, value) VALUES ('bot.users', ?)", [JSON.stringify(['all'])]);
        printInfo("Setting 'bot.adminMode' (desligado) virou 'bot.users' = true: todos usam os comandos comuns");
    } else {
        printInfo("Setting 'bot.adminMode' removido: quem usa os comandos comuns agora é o 'bot.users'");
    }

    await dbRun("DELETE FROM settings WHERE key = 'bot.adminMode'");
}

async function carregarSettings() {
    await migrarSettingsRenomeados();
    await migrarModoAdmin();

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
            const lista = listaSemOsInvalidos(row.key, row.value);
            if (lista) {
                // Ex.: commands.disabled com um comando que não existe mais (/status): ficam os outros
                settings.set(row.key, lista);
                printError(`Setting '${row.key}' com item inválido (${e.message}), ignorado: ${lista.join(',') || '(vazio)'}`);
                continue;
            }
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
    comandoDeUsuario,
    envOuSetting,
    getSetting,
    isDebugMode,
    setSetting,
    validarSetting,
    stickerMeta
};
