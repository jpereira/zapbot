/*
 * Comando /set.
 */

const { client } = require('../client');
const { chatCurrentIds } = require('../contacts');
const { dbReady } = require('../db');
const { printInfo } = require('../log');
const { SETTINGS_SCHEMA, getSetting, setSetting } = require('../settings');

/*
 * /set
 * /set                  → lists all the settings and their values
 * /set <key>          → shows value, default and description
 * /set <snippet|/regex/> → lists the keys that match (e.g.: /set alerta)
 * /set <key> <value>  → changes (list: items separated by comma or space)
 * /set -reset <key>   → back to default
 *
 * The config/.env variables the bot reads show up too, read-only
 * (they change in the file, with the container recreated), and only in your private chat: in the
 * other chats, a notice in their place. The secret ones go masked.
 */
const ENV_VARIABLES = [
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

const SO_IN_PRIVATE = '🔒 _As variáveis do config/.env (somente leitura) aparecem só no seu privado._';

const inMyPrivate = async (chatId) => (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);

// Block of the .env variables (only in your private chat)
function envText() {
    const widthAlt = Math.max(...ENV_VARIABLES.map(v => v.nome.length));
    const linesAlt = ENV_VARIABLES
        .map(v => `${v.nome.padEnd(widthAlt)}  ${formatValueSetting(process.env[v.nome] ?? '', ', ', v.secret)}`)
        .join('\n');
    return '🔒 *config/.env* _(somente leitura: mude no arquivo e recrie o container)_\n\n```\n' + linesAlt + '\n```';
}
// "key  value" aligned, in alphabetical order
function settingsList(keys) {
    const width = Math.max(...keys.map(k => k.length));
    return [...keys]
        .sort((a, b) => a.localeCompare(b))
        .map(k => {
            const s = SETTINGS_SCHEMA[k];
            return `${k.padEnd(width)}  ${formatValueSetting(getSetting(k), s.separator ? ' | ' : ', ', s.secret)}`;
        })
        .join('\n');
}

/**
 * Keys that match the filter: /regex/flags or a snippet (case-insensitive).
 * @returns {string[]|null} null if the regex is invalid
 */
function filterKeys(filter) {
    const regex = filter.match(/^\/(.+)\/([a-z]*)$/);
    let test;

    if (regex) {
        try {
            const re = new RegExp(regex[1], regex[2].replace(/[gy]/g, '') || 'i');
            test = (k) => re.test(k);
        } catch {
            return null;
        }
    } else {
        test = (k) => k.toLowerCase().includes(filter.toLowerCase());
    }

    return Object.keys(SETTINGS_SCHEMA).filter(test);
}

function formatValueSetting(value, sep = ', ', secret = false) {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return '(vazio)';
    // Secret: shows only the last 4 characters
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

async function cmdSet({ msg, opts, args, chatId }) {
    await dbReady;

    if (opts.opt.reset !== null) {
        const key = opts.opt.reset;
        const schema = SETTINGS_SCHEMA[key];

        if (!schema) {
            await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
            return;
        }

        await setSetting(key, schema.default);
        await msg.reply(`♻️ *${key}* = ${formatValueSetting(getSetting(key), ', ', schema.secret)} _(padrão)_`);
        return;
    }

    const [key, ...rest] = opts.argv;

    if (!key) {
        const env = await inMyPrivate(chatId) ? envText() : SO_IN_PRIVATE;
        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + settingsList(Object.keys(SETTINGS_SCHEMA)) + '\n```\n💡 _/set <chave> para detalhes_\n\n' + env);
        return;
    }

    // A .env variable: read-only, and only in your private chat
    const variable = ENV_VARIABLES.find(v => v.nome === key);

    if (variable) {
        if (rest.length) {
            await msg.reply(`❌ ${key} é do config/.env (somente leitura): mude no arquivo e recrie o container.`);
        } else if (!(await inMyPrivate(chatId))) {
            await msg.reply(SO_IN_PRIVATE);
        } else {
            await msg.reply(`🔒 *${key}* = ${formatValueSetting(process.env[key] ?? '', ', ', variable.secret)}\n_config/.env, somente leitura_`);
        }
        return;
    }

    const schema = SETTINGS_SCHEMA[key];

    // It is not a key: without a value, filters the keys by the snippet (or /regex/)
    if (!schema && !rest.length) {
        const keys = filterKeys(key);

        if (keys === null) {
            await msg.reply(`❌ Regex inválida: ${key}`);
        } else if (!keys.length) {
            await msg.reply(`❌ Nenhum setting com "${key}".\n💡 _Veja todos com /set_`);
        } else {
            await msg.reply(`⚙️ *SETTINGS* com "${key}" (${keys.length})\n\n\`\`\`\n${settingsList(keys)}\n\`\`\`\n💡 _/set <chave> para detalhes_`);
        }
        return;
    }

    if (!schema) {
        await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
        return;
    }

    if (!rest.length) {
        const limits = schema.type === 'number' ? ` (${schema.min}..${schema.max})` : '';
        const valueAlt = getSetting(key);
        // "One per line" list: one item per line in the display too
        const valueText = schema.separator && valueAlt.length
            ? '\n' + valueAlt.map((v, i) => `${i + 1}. ${v}`).join('\n')
            : formatValueSetting(valueAlt, ', ', schema.secret);

        await msg.reply(
            `⚙️ *${key}*\n${schema.desc}\n\n` +
            `*Valor:* ${valueText}\n` +
            `*Padrão:* ${formatValueSetting(schema.default)}\n` +
            `*Tipo:* ${schema.type}${limits}`
        );
        return;
    }

    // With separator (e.g.: watch.rules, one per line) uses the raw text: the tokenizer
    // would lose the line breaks and the quotes inside the rules
    const raw = schema.separator
        ? args.slice(args.indexOf(key) + key.length).trim().replace(/^(["'])([\s\S]*)\1$/, '$2')
        : rest.join(' ');

    try {
        const valueAlt = await setSetting(key, raw);
        printInfo(`Setting '${key}' alterado para ${schema.secret ? formatValueSetting(valueAlt, ', ', true) : JSON.stringify(valueAlt)}`);
        await msg.reply(`✅ *${key}* = ${formatValueSetting(valueAlt, schema.separator ? ' | ' : ', ', schema.secret)}`);
    } catch (e) {
        await msg.reply(`❌ Valor inválido para *${key}*: ${e.message}`);
    }
}

module.exports = {
    cmdSet
};
