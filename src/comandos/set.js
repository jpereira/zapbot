/*
 * Comando /set.
 */

const { client } = require('../cliente');
const { idsDoChatAtual, resolveLidToPhone, resolverNomeDoGrupo } = require('../contatos');
const { dbPronto } = require('../db');
const { resolverOuEscolher } = require('../destinos');
const { printInfo } = require('../log');
const { SETTINGS_SCHEMA, getSetting, setSetting, validarSetting } = require('../settings');

/*
 * /set
 *   /set                  → lista todos os settings e seus valores
 *   /set <chave>          → mostra valor, padrão e descrição
 *   /set <trecho|/regex/> → lista as chaves que casam (ex.: /set alerta)
 *   /set <chave> <valor>  → altera (lista: itens separados por vírgula ou espaço)
 *   /set -append <chave> <valor> → numa lista, acrescenta itens (-a)
 *   /set -rem <chave> <valor>    → numa lista, tira itens
 *   /set -reset <chave>   → volta ao padrão
 * O bot.admins (quem mais usa os comandos admin) e o bot.users (quem usa os
 * comandos comuns) só o dono altera. Neles, além do número, vale o nome do
 * contato (/Jorge Pereira/) ou a menção, buscados como no -to; o que fica
 * guardado é o telefone, e a exibição mostra o nome ao lado. O bot.users aceita
 * também grupos (guarda o id) e true/false (todos/ninguém).
 *
 * As variáveis do config/.env que o bot lê aparecem junto, só para leitura
 * (mudam no arquivo, com o container recriado), e só no seu privado: nos
 * outros chats, um aviso no lugar delas. As secretas vão mascaradas.
 */
const VARIAVEIS_DO_ENV = [
    { nome: 'APP_ENV' },
    { nome: 'GIPHY_API_KEY', secret: true },
    { nome: 'GOOGLE_TRANSLATE_API_KEY', secret: true },
    { nome: 'OPENAI_API_KEY', secret: true },
    { nome: 'OPENAI_MODEL' },
    { nome: 'OPENAI_TIMEOUT_MS' },
    { nome: 'PHONE_NUMBER' },
    { nome: 'QRCODE_EMAIL_ENABLE' },
    { nome: 'QRCODE_EMAIL_SMTP_ANTIPHISHING', secret: true },
    { nome: 'QRCODE_EMAIL_SMTP_FROM' },
    { nome: 'QRCODE_EMAIL_SMTP_HOST' },
    { nome: 'QRCODE_EMAIL_SMTP_PASS', secret: true },
    { nome: 'QRCODE_EMAIL_SMTP_PORT' },
    { nome: 'QRCODE_EMAIL_SMTP_TO' },
    { nome: 'QRCODE_EMAIL_SMTP_USER' },
    { nome: 'ZAPBOT_CACHE_DIR' },
    { nome: 'ZAPBOT_HEARTBEAT_FILE' },
    { nome: 'ZAPBOT_HEARTBEAT_MAX_AGE_S' }
];

const SO_NO_PRIVADO = '🔒 _As variáveis do config/.env (somente leitura) aparecem só no seu privado._';

const noMeuPrivado = async (chatId) => (await idsDoChatAtual(chatId)).includes(client.info.wid._serialized);

// Bloco das variáveis do .env (só no seu privado)
function textoDoEnv() {
    const largura = Math.max(...VARIAVEIS_DO_ENV.map(v => v.nome.length));
    const linhas = VARIAVEIS_DO_ENV
        .map(v => `${v.nome.padEnd(largura)}  ${formatarValorSetting(process.env[v.nome] ?? '', ', ', v.secret)}`)
        .join('\n');
    return '🔒 *config/.env* _(somente leitura: mude no arquivo e recrie o container)_\n\n```\n' + linhas + '\n```';
}
// "chave  valor" alinhados, em ordem alfabética
function listaDeSettings(chaves) {
    const width = Math.max(...chaves.map(k => k.length));
    return [...chaves]
        .sort((a, b) => a.localeCompare(b))
        .map(k => {
            const s = SETTINGS_SCHEMA[k];
            return `${k.padEnd(width)}  ${formatarValorSetting(getSetting(k), s.separator ? ' | ' : ', ', s.secret)}`;
        })
        .join('\n');
}

/**
 * Chaves que casam com o filtro: /regex/flags ou um trecho (sem diferenciar maiúsculas).
 * @returns {string[]|null} null se a regex é inválida
 */
function filtrarChaves(filtro) {
    const regex = filtro.match(/^\/(.+)\/([a-z]*)$/);
    let testar;

    if (regex) {
        try {
            const re = new RegExp(regex[1], regex[2].replace(/[gy]/g, '') || 'i');
            testar = (k) => re.test(k);
        } catch {
            return null;
        }
    } else {
        testar = (k) => k.toLowerCase().includes(filtro.toLowerCase());
    }

    return Object.keys(SETTINGS_SCHEMA).filter(testar);
}

function formatarValorSetting(value, sep = ', ', secret = false) {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return '(vazio)';
    // Segredo: mostra só os 4 últimos caracteres
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

// O valor depois da chave, como foi digitado (com as quebras de linha e sem as aspas de fora)
const valorCru = (args, key) => args.slice(args.indexOf(key) + key.length).trim().replace(/^(["'])([\s\S]*)\1$/, '$2');

// Chaves que só o dono altera, mesmo que um admin extra use o /set
const SO_O_DONO = ['bot.admins', 'bot.users'];

// Listas de pessoas: aceitam o nome do contato além do número, e mostram o nome
const DE_PESSOAS = ['bot.admins', 'bot.users'];

// Listas que aceitam grupos (o id @g.us) e as palavras true/false (essas vão direto para a validação)
const COM_GRUPOS = ['bot.users'];
const PALAVRAS = /^(all|todos|true|on|sim|yes|false|off|n[aã]o|no|ningu[eé]m)$/i;

// O texto depois da chave, sem tirar nada (as aspas e as barras separam os nomes)
const textoDepoisDaChave = (args, key) => args.slice(args.indexOf(key) + key.length).trim();

// "/Jorge Pereira/ +5521999999999 Fulano" → ['Jorge Pereira', '+5521999999999', 'Fulano']
const itensDoTexto = (texto) => [...texto.matchAll(/\/([^/]+)\/|"([^"]*)"|'([^']*)'|([^\s,]+)/g)]
    .map(m => (m[1] ?? m[2] ?? m[3] ?? m[4]).trim())
    .filter(Boolean);

/**
 * Os itens de uma lista de pessoas viram telefones: o número passa como veio
 * (a validação do setting confere), o nome é buscado nos contatos (vários: a
 * lista para escolher). E-mail e contato sem telefone conhecido são recusados;
 * grupo, só nas listas COM_GRUPOS (vira o id).
 * @returns {Promise<string|null>} os itens separados por vírgula; null: já respondeu o erro
 */
async function itensDasPessoas(msg, key, texto) {
    const itens = [];
    const comGrupos = COM_GRUPOS.includes(key);

    for (const item of itensDoTexto(texto)) {
        if (/^\+?[\d().-]+$/.test(item) || (comGrupos && PALAVRAS.test(item))) {
            itens.push(item);
            continue;
        }

        const pessoa = await resolverOuEscolher(msg, item, {
            semEmail: comGrupos
                ? `❌ O *${key}* é de pessoas e grupos: informe um contato, um grupo ou um número, não um e-mail.`
                : `❌ O *${key}* é de pessoas: informe um contato ou um número, não um e-mail.`
        });
        if (!pessoa) return null;

        if (pessoa.grupo && comGrupos) {
            itens.push(pessoa.id);
            continue;
        }

        // Grupo admin: todo mundo ali mandaria no bot (/set, /backup -send...). Melhor não
        if (pessoa.grupo) {
            await msg.reply(`❌ ${pessoa.nome} é um grupo: o *${key}* é de pessoas (um contato ou um número).` +
                (key === 'bot.admins'
                    ? `\n💡 _Um grupo não pode ser admin (todos ali mandariam no bot). Para liberar os comandos comuns dentro dele: /bot +v /${pessoa.nome}/_`
                    : ''));
            return null;
        }

        const telefone = pessoa.id.endsWith('@c.us') ? pessoa.id : await resolveLidToPhone(pessoa.id);
        if (!telefone?.endsWith('@c.us')) {
            await msg.reply(`❌ Não sei o telefone de ${pessoa.nome} (o WhatsApp só informou o id interno): use o número, ex.: +5521999999999.`);
            return null;
        }
        itens.push(telefone.split('@')[0]);
    }

    return itens.join(',');
}

// "5521999999999 (Jorge Pereira)": o nome salvo do contato, se houver; um grupo, "👥 Família";
// o all, "true (todos)"
async function comNome(numero) {
    if (numero === 'all') return 'true (todos)';
    if (numero.endsWith('@g.us')) {
        return `👥 ${await resolverNomeDoGrupo(numero).catch(() => null) || numero}`;
    }

    const contato = await client.getContactById(`${numero}@c.us`).catch(() => null);
    const nome = contato?.name || contato?.pushname;
    return nome ? `${numero} (${nome})` : numero;
}

const mostrarItens = async (key, itens) => (DE_PESSOAS.includes(key) ? Promise.all(itens.map(comNome)) : itens);

/*
 * -append / -rem <chave> <valor>: acrescenta ou tira itens de uma lista. Os
 * itens passam pela mesma validação do /set (ex.: um número vira só dígitos),
 * então "+55 21 9..." tira o "5521...".
 */
async function mudarLista(msg, { key, bruto, acrescentar }) {
    const schema = SETTINGS_SCHEMA[key];
    const opcao = acrescentar ? '-append' : '-rem';

    if (!schema) {
        await msg.reply(`❌ Setting desconhecido: ${key ?? ''}\n💡 _Veja todos com /set_`);
        return;
    }
    if (schema.type !== 'list') {
        await msg.reply(`❌ *${key}* não é uma lista: o ${opcao} vale só para chaves com várias entradas.\n` +
            `💡 _Troque o valor com /set ${key} <valor> ou volte ao padrão com /set -reset ${key} (-r)._`);
        return;
    }
    if (!bruto) {
        await msg.reply(`❌ Informe o que ${acrescentar ? 'acrescentar a' : 'tirar de'} *${key}*: /set ${opcao} ${key} <valor>`);
        return;
    }

    let itens;
    try {
        itens = validarSetting(key, bruto);
    } catch (e) {
        await msg.reply(`❌ Valor inválido para *${key}*: ${e.message}`);
        return;
    }

    const atual = getSetting(key);
    const mudam = acrescentar ? itens.filter(i => !atual.includes(i)) : itens.filter(i => atual.includes(i));

    if (!mudam.length) {
        await msg.reply(acrescentar
            ? `ℹ️ *${key}* já tem ${itens.join(', ')}.`
            : `❌ *${key}* não tem ${itens.join(', ')}.\n💡 _Veja os itens com /set ${key}_`);
        return;
    }

    let valor;
    try {
        const novo = acrescentar ? [...atual, ...mudam] : atual.filter(i => !mudam.includes(i));
        valor = await setSetting(key, novo);
    } catch (e) {
        await msg.reply(`❌ Valor inválido para *${key}*: ${e.message}`);
        return;
    }
    const sep = schema.separator ? ' | ' : ', ';
    printInfo(`Setting '${key}' ${acrescentar ? '+' : '-'} ${schema.secret ? '(segredo)' : JSON.stringify(mudam)}`);
    await msg.reply(`✅ *${key}* ${acrescentar ? '+' : '−'} ${formatarValorSetting(await mostrarItens(key, mudam), sep, schema.secret)}\n` +
        `= ${formatarValorSetting(await mostrarItens(key, valor), sep, schema.secret)}`);
}

async function cmdSet({ msg, opts, args, chatId }) {
    await dbPronto;

    // A chave da opção (-reset, -append, -rem) ou a 1ª palavra
    const chaveAlvo = opts.opt.reset ?? opts.opt.append ?? opts.opt.rem ?? opts.argv[0];
    if (SO_O_DONO.includes(chaveAlvo) && !msg.fromMe && (opts.opt.reset || opts.opt.append || opts.opt.rem || opts.argv.length > 1)) {
        await msg.reply(`⛔ Só o dono do bot altera o *${chaveAlvo}*.`);
        return;
    }

    if (opts.given.has('append') || opts.given.has('rem')) {
        const acrescentar = opts.given.has('append');
        const key = acrescentar ? opts.opt.append : opts.opt.rem;
        let bruto = key ? valorCru(args, key) : '';

        // Lista de pessoas: os nomes viram telefones antes da validação
        if (DE_PESSOAS.includes(key) && bruto) {
            bruto = await itensDasPessoas(msg, key, textoDepoisDaChave(args, key));
            if (bruto === null) return;
        }

        await mudarLista(msg, { key, bruto, acrescentar });
        return;
    }

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
        const env = await noMeuPrivado(chatId) ? textoDoEnv() : SO_NO_PRIVADO;
        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + listaDeSettings(Object.keys(SETTINGS_SCHEMA)) + '\n```\n💡 _/set <chave> para detalhes_\n\n' + env);
        return;
    }

    // Uma variável do .env: só leitura, e só no seu privado
    const variavel = VARIAVEIS_DO_ENV.find(v => v.nome === key);

    if (variavel) {
        if (resto.length) {
            await msg.reply(`❌ ${key} é do config/.env (somente leitura): mude no arquivo e recrie o container.`);
        } else if (!(await noMeuPrivado(chatId))) {
            await msg.reply(SO_NO_PRIVADO);
        } else {
            await msg.reply(`🔒 *${key}* = ${formatarValorSetting(process.env[key] ?? '', ', ', variavel.secret)}\n_config/.env, somente leitura_`);
        }
        return;
    }

    const schema = SETTINGS_SCHEMA[key];

    // Não é uma chave: sem valor, filtra as chaves pelo trecho (ou /regex/)
    if (!schema && !resto.length) {
        const chaves = filtrarChaves(key);

        if (chaves === null) {
            await msg.reply(`❌ Regex inválida: ${key}`);
        } else if (!chaves.length) {
            await msg.reply(`❌ Nenhum setting com "${key}".\n💡 _Veja todos com /set_`);
        } else {
            await msg.reply(`⚙️ *SETTINGS* com "${key}" (${chaves.length})\n\n\`\`\`\n${listaDeSettings(chaves)}\n\`\`\`\n💡 _/set <chave> para detalhes_`);
        }
        return;
    }

    if (!schema) {
        await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
        return;
    }

    if (!resto.length) {
        const limites = schema.type === 'number' ? ` (${schema.min}..${schema.max})` : '';
        const valor = getSetting(key);
        // Lista "uma por linha" (e a de pessoas, com o nome): um item por linha também na exibição
        const valorTexto = (schema.separator || DE_PESSOAS.includes(key)) && valor.length
            ? '\n' + (await mostrarItens(key, valor)).map((v, i) => `${i + 1}. ${v}`).join('\n')
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
    let bruto = schema.separator ? valorCru(args, key) : resto.join(' ');

    // Lista de pessoas: os nomes viram telefones ("" continua esvaziando)
    if (DE_PESSOAS.includes(key) && !/^(["'])\1$/.test(textoDepoisDaChave(args, key))) {
        bruto = await itensDasPessoas(msg, key, textoDepoisDaChave(args, key));
        if (bruto === null) return;
    }

    try {
        const valor = await setSetting(key, bruto);
        printInfo(`Setting '${key}' alterado para ${schema.secret ? formatarValorSetting(valor, ', ', true) : JSON.stringify(valor)}`);
        await msg.reply(`✅ *${key}* = ${formatarValorSetting(await mostrarItens(key, valor), schema.separator ? ' | ' : ', ', schema.secret)}`);
    } catch (e) {
        await msg.reply(`❌ Valor inválido para *${key}*: ${e.message}`);
    }
}

/**
 * O -append/-rem de uma lista de pessoas (bot.admins, bot.users) a partir do
 * texto com os nomes, as menções e os números: o atalho do /bot +o|-o|+v|-v.
 */
async function mudarListaDePessoas(msg, key, texto, acrescentar) {
    const bruto = await itensDasPessoas(msg, key, texto);
    if (bruto === null) return;
    await mudarLista(msg, { key, bruto, acrescentar });
}

module.exports = {
    cmdSet,
    mostrarItens,
    mudarListaDePessoas
};
