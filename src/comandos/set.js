/*
 * Comando /set.
 */

const { dbPronto } = require('../db');
const { printInfo } = require('../log');
const { SETTINGS_SCHEMA, getSetting, setSetting } = require('../settings');

/*
 * /set
 *   /set                  → lista todos os settings e seus valores
 *   /set <chave>          → mostra valor, padrão e descrição
 *   /set <chave> <valor>  → altera (lista: itens separados por vírgula ou espaço)
 *   /set -reset <chave>   → volta ao padrão
 */
function formatarValorSetting(value, sep = ', ', secret = false) {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return '(vazio)';
    // Segredo: mostra só os 4 últimos caracteres
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

async function cmdSet({ msg, opts, args }) {
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

        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + lista + '\n```\n💡 _/set <chave> para detalhes_');
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
