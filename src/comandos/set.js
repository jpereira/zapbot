/*
 * Comando /set.
 */

const { client } = require('../cliente');
const { idsDoChatAtual } = require('../contatos');
const { dbPronto } = require('../db');
const { printInfo } = require('../log');
const { SETTINGS_SCHEMA, getSetting, setSetting } = require('../settings');

/*
 * /set
 *   /set                  → lista todos os settings e seus valores
 *   /set <chave>          → mostra valor, padrão e descrição
 *   /set <chave> <valor>  → altera (lista: itens separados por vírgula ou espaço)
 *   /set -reset <chave>   → volta ao padrão
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
function formatarValorSetting(value, sep = ', ', secret = false) {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return '(vazio)';
    // Segredo: mostra só os 4 últimos caracteres
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

async function cmdSet({ msg, opts, args, chatId }) {
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

        const env = await noMeuPrivado(chatId) ? textoDoEnv() : SO_NO_PRIVADO;
        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + lista + '\n```\n💡 _/set <chave> para detalhes_\n\n' + env);
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

module.exports = {
    cmdSet
};
