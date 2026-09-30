/*
 * Comando /set.
 */

const { dbReady } = require('../db');
const { printInfo } = require('../log');
const { SETTINGS_SCHEMA, getSetting, setSetting } = require('../settings');

/*
 * /set
 * /set                  → lists all the settings and their values
 * /set <key>          → shows value, default and description
 * /set <key> <value>  → changes (list: items separated by comma or space)
 * /set -reset <key>   → back to default
 */
function formatValueSetting(value, sep = ', ', secret = false) {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return '(vazio)';
    // Secret: shows only the last 4 characters
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

async function cmdSet({ msg, opts, args }) {
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
        const width = Math.max(...Object.keys(SETTINGS_SCHEMA).map(k => k.length));
        const list = Object.entries(SETTINGS_SCHEMA)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, s]) => `${k.padEnd(width)}  ${formatValueSetting(getSetting(k), s.separator ? ' | ' : ', ', s.secret)}`)
            .join('\n');

        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + list + '\n```\n💡 _/set <chave> para detalhes_');
        return;
    }

    const schema = SETTINGS_SCHEMA[key];

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
