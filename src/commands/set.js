/*
 * Comando /set.
 */

const { client } = require('../client');
const { chatCurrentIds, contactName, resolveLidToPhone, groupResolverName } = require('../contacts');
const { dbReady } = require('../db');
const { resolverOrChoose } = require('../destinations');
const { printInfo } = require('../log');
const { SETTINGS_SCHEMA, getSetting, setSetting, validateSetting } = require('../settings');
const { regexDangerous } = require('../util/safeRegex');
const { t } = require('../i18n');

/*
 * /set
 * /set                  → lists all the settings and their values
 * /set <key>          → shows value, default and description
 * /set <snippet|/regex/> → lists the keys that match (e.g.: /set alert)
 * /set <key> <value>  → changes (list: items separated by comma or space)
 *   /set -append <chave> <valor> → numa lista, acrescenta itens (-a)
 *   /set -rm <chave> <valor>    → numa lista, tira itens
 * /set -reset <key>   → back to default
 * bot.admins (who else uses the admin commands) and bot.users (who uses the
 * common commands) is changed only by the owner. In them, besides the number, the name of the
 * contact (/Jorge Pereira/) or the mention, looked up as in -to; what is left
 * stored is the phone, and the display shows the name beside it. bot.users accepts
 * also groups (stores the id) and true/false (everyone/nobody).
 *
 * The config/.env variables the bot reads show up too, read-only
 * (they change in the file, with the container recreated), and only in your private chat: in the
 * other chats, a notice in their place. The secret ones go masked.
 */
const ENV_VARIABLES = [
    { nome: 'AAVE_WALLET_ADDRESS' },
    { nome: 'BASE_RPC_URL', secret: true },
    { nome: 'ETHEREUM_RPC_URL', secret: true },
    { nome: 'GIPHY_API_KEY', secret: true },
    { nome: 'MORPHO_WALLET_ADDRESS' },
    { nome: 'OPENAI_ADMIN_KEY', secret: true },
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

const soInPrivate = () => t('adm.set.envOnlyPrivate');

const inMyPrivate = async (chatId) => (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);

// Block of the .env variables (only in your private chat)
function envText() {
    const widthAlt = Math.max(...ENV_VARIABLES.map(v => v.nome.length));
    const linesAlt = ENV_VARIABLES
        .map(v => `${v.nome.padEnd(widthAlt)}  ${formatValueSetting(process.env[v.nome] ?? '', ', ', v.secret)}`)
        .join('\n');
    return t('adm.set.envTitle') + '\n\n```\n' + linesAlt + '\n```';
}
// "key  value" aligned, in alphabetical order, with a blank line between the keys
function settingsList(keys) {
    const width = Math.max(...keys.map(k => k.length));
    return [...keys]
        .sort((a, b) => a.localeCompare(b))
        .map(k => {
            const s = SETTINGS_SCHEMA[k];
            return `${k.padEnd(width)}  ${formatValueSetting(getSetting(k), s.separator ? ' | ' : ', ', s.secret)}`;
        })
        .join('\n\n');
}

/**
 * Keys that match the filter: /regex/flags or a snippet (case-insensitive).
 * @returns {string[]|null} null if the regex is invalid
 */
function filterKeys(filter) {
    const regex = filter.match(/^\/(.+)\/([a-z]*)$/);
    let test;

    if (regex) {
        if (regexDangerous(regex[1])) return null; // ReDoS: ver util/regexSeguro
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
    if (Array.isArray(value)) return value.length ? value.join(sep) : t('adm.set.empty');
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return t('adm.set.empty');
    // Secret: shows only the last 4 characters
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

// The value after the key, as typed (with the line breaks and without the outer quotes)
const valueRaw = (args, key) => args.slice(args.indexOf(key) + key.length).trim().replace(/^(["'])([\s\S]*)\1$/, '$2');

// Keys that only the owner changes, even if an extra admin uses /set
const SO_O_OWNER = ['bot.admins', 'bot.users'];

// People lists: accept the contact name besides the number, and show the name
const PEOPLE = ['bot.admins', 'bot.users'];

// Lists that accept groups (the @g.us id) and the words true/false (these go straight to validation)
const WITH_GROUPS = ['bot.users'];
const WORDS = /^(all|todos|true|on|sim|yes|false|off|n[aã]o|no|ningu[eé]m)$/i;

// The text after the key, without removing anything (quotes and slashes separate the names)
const keyTextAfter = (args, key) => args.slice(args.indexOf(key) + key.length).trim();

// "/Jorge Pereira/ +5521999999999 Fulano" → ['Jorge Pereira', '+5521999999999', 'Fulano']
const textItems = (textAlt) => [...textAlt.matchAll(/\/([^/]+)\/|"([^"]*)"|'([^']*)'|([^\s,]+)/g)]
    .map(m => (m[1] ?? m[2] ?? m[3] ?? m[4]).trim())
    .filter(Boolean);

/**
 * The items of a people list become phones: the number goes as it came
 * (the setting validation checks), the name is looked up in the contacts (several: the
 * list to choose from). Email and a contact with no known phone are refused;
 * group, only in the WITH_GROUPS lists (becomes the id).
 * @returns {Promise<string|null>} the comma-separated items; null: already replied the error
 */
async function peopleItems(msg, key, textAlt) {
    const items = [];
    const withGroups = WITH_GROUPS.includes(key);

    for (const item of textItems(textAlt)) {
        if (/^\+?[\d().-]+$/.test(item) || (withGroups && WORDS.test(item))) {
            items.push(item);
            continue;
        }

        const person = await resolverOrChoose(msg, item, {
            semEmail: t(withGroups ? 'adm.set.semEmailPeopleGroups' : 'adm.set.semEmailPeople', { key })
        });
        if (!person) return null;

        if (person.grupo && withGroups) {
            items.push(person.id);
            continue;
        }

        // Admin group: everyone there would command the bot (/set, /backup -send...). Better not
        if (person.grupo) {
            await msg.reply(t('adm.set.isGroup', { nome: person.nome, key }) +
                (key === 'bot.admins' ? t('adm.set.groupNotAdmin', { nome: person.nome }) : ''));
            return null;
        }

        const phoneAlt = person.id.endsWith('@c.us') ? person.id : await resolveLidToPhone(person.id);
        if (!phoneAlt?.endsWith('@c.us')) {
            await msg.reply(t('adm.set.noPhone', { nome: person.nome }));
            return null;
        }
        items.push(phoneAlt.split('@')[0]);
    }

    return items.join(',');
}

// Is the number yours (the bot account)?
const isOOwner = (numberAlt) => numberAlt === client.info?.wid?.user;

// "5521999999999 (Jorge Pereira)": the saved contact name, if any; a group, "👥 Família";
// o all, "true (todos)"
async function withName(numberAlt) {
    if (numberAlt === 'all') return t('adm.set.allTrue');
    // The person in a single group: "5521999999999 (Maria) only in 👥 Amigos"
    const soInGroup = numberAlt.match(/^(\d+):(.+@g\.us)$/);
    if (soInGroup) return `${await withName(soInGroup[1])}${t('adm.set.onlyIn')}${await withName(soInGroup[2])}`;
    if (numberAlt.endsWith('@g.us')) {
        return `👥 ${await groupResolverName(numberAlt).catch(() => null) || numberAlt}`;
    }

    // You are rarely in your own address book: your profile name counts
    const contactAlt = await client.getContactById(`${numberAlt}@c.us`).catch(() => null);
    const nameAlt = contactName(contactAlt) ||
        (isOOwner(numberAlt) ? client.info.pushname : null);
    return nameAlt ? `${numberAlt} (${nameAlt})` : numberAlt;
}

const showItems = async (key, items) => (PEOPLE.includes(key) ? Promise.all(items.map(withName)) : items);

/*
 * veja: where to see the items (in the "does not have"). /bot swaps the reply (reply:
 * (change, value) → text) and the way of showing the items in the "already has"/"does not have"
 * (show: items → texts), to hide the phone of whoever is not in the group.
 */
async function changeList(msg, optionsAlt) {
    const { key, bruto: raw, acrescentar: append, veja: see = `/set ${key}`, resposta: reply = null } = optionsAlt;
    const showAlt = optionsAlt.mostrar ?? ((items) => showItems(key, items));
    const schema = SETTINGS_SCHEMA[key];
    const optionAlt = append ? '-append' : '-rm';

    if (!schema) {
        await msg.reply(t('adm.set.unknown', { key: key ?? '' }));
        return;
    }
    if (schema.type !== 'list') {
        await msg.reply(t('adm.set.notList', { key, opcao: optionAlt }));
        return;
    }
    if (!raw) {
        await msg.reply(t(append ? 'adm.set.needValueAdd' : 'adm.set.needValueRm', { key, opcao: optionAlt }));
        return;
    }

    let items;
    try {
        items = validateSetting(key, raw);
    } catch (e) {
        await msg.reply(t('adm.set.invalid', { key, erro: e.message }));
        return;
    }

    const current = getSetting(key);
    const change = append ? items.filter(i => !current.includes(i)) : items.filter(i => current.includes(i));

    if (!change.length) {
        const which = (await showAlt(items)).join(', ');
        await msg.reply(append
            ? t('adm.set.alreadyHas', { key, quais: which })
            : t('adm.set.doesNotHave', { key, quais: which, veja: see }));
        return;
    }

    let valueAlt;
    try {
        const freshAlt = append ? [...current, ...change] : current.filter(i => !change.includes(i));
        valueAlt = await setSetting(key, freshAlt);
    } catch (e) {
        await msg.reply(t('adm.set.invalid', { key, erro: e.message }));
        return;
    }
    const sep = schema.separator ? ' | ' : ', ';
    printInfo(`Setting '${key}' ${append ? '+' : '-'} ${schema.secret ? '(segredo)' : JSON.stringify(change)}`);
    if (reply) {
        await msg.reply(await reply(change, valueAlt));
        return;
    }
    await msg.reply(t('adm.set.listChanged', {
        key,
        sinal: append ? '+' : '−',
        mudou: formatValueSetting(await showItems(key, change), sep, schema.secret),
        valor: formatValueSetting(await showItems(key, valueAlt), sep, schema.secret)
    }));
}

async function cmdSet({ msg, opts, args, chatId }) {
    await dbReady;
    // /set key=value (zapbot.lang=pt_BR) counts as /set key value
    const equal = String(args ?? '').match(/^([\w.]+)\s*=\s*(.*)$/s);
    if (equal && SETTINGS_SCHEMA[equal[1]]) {
        args = `${equal[1]} ${equal[2]}`;
        opts = { ...opts, argv: [equal[1], equal[2]] };
    }

    // The option key (-reset, -append, -rm) or the 1st word
    const keyTarget = opts.opt.reset ?? opts.opt.append ?? opts.opt.rm ?? opts.argv[0];
    if (SO_O_OWNER.includes(keyTarget) && !msg.fromMe && (opts.opt.reset || opts.opt.append || opts.opt.rm || opts.argv.length > 1)) {
        await msg.reply(t('adm.set.ownerOnly', { key: keyTarget }));
        return;
    }

    if (opts.given.has('append') || opts.given.has('rm')) {
        const append = opts.given.has('append');
        const key = append ? opts.opt.append : opts.opt.rm;
        let raw = key ? valueRaw(args, key) : '';

        // People list: the names become phones before validation
        if (PEOPLE.includes(key) && raw) {
            raw = await peopleItems(msg, key, keyTextAfter(args, key));
            if (raw === null) return;
        }

        await changeList(msg, { key, bruto: raw, acrescentar: append });
        return;
    }

    if (opts.opt.reset !== null) {
        const key = opts.opt.reset;
        const schema = SETTINGS_SCHEMA[key];

        if (!schema) {
            await msg.reply(t('adm.set.unknown', { key }));
            return;
        }

        await setSetting(key, schema.default);
        await msg.reply(t('adm.set.resetDone', { key, valor: formatValueSetting(getSetting(key), ', ', schema.secret) }));
        return;
    }

    const [key, ...rest] = opts.argv;

    if (!key) {
        const env = await inMyPrivate(chatId) ? envText() : soInPrivate();
        await msg.reply(`${t('adm.set.title')}\n\n\`\`\`\n${settingsList(Object.keys(SETTINGS_SCHEMA))}\n\`\`\`\n${t('adm.set.detailsHint')}\n\n${env}`);
        return;
    }

    // A .env variable: read-only, and only in your private chat
    const variable = ENV_VARIABLES.find(v => v.nome === key);

    if (variable) {
        if (rest.length) {
            await msg.reply(t('adm.set.envReadOnly', { key }));
        } else if (!(await inMyPrivate(chatId))) {
            await msg.reply(soInPrivate());
        } else {
            await msg.reply(t('adm.set.envValue', { key, valor: formatValueSetting(process.env[key] ?? '', ', ', variable.secret) }));
        }
        return;
    }

    const schema = SETTINGS_SCHEMA[key];

    // It is not a key: without a value, filters the keys by the snippet (or /regex/)
    if (!schema && !rest.length) {
        const keys = filterKeys(key);

        if (keys === null) {
            await msg.reply(t('adm.set.badRegex', { key }));
        } else if (!keys.length) {
            await msg.reply(t('adm.set.noMatch', { key }));
        } else {
            await msg.reply(`${t('adm.set.titleFiltered', { key, n: keys.length })}\n\n\`\`\`\n${settingsList(keys)}\n\`\`\`\n${t('adm.set.detailsHint')}`);
        }
        return;
    }

    if (!schema) {
        await msg.reply(t('adm.set.unknown', { key }));
        return;
    }

    if (!rest.length) {
        const limits = schema.type === 'number' ? ` (${schema.min}..${schema.max})` : '';
        const valueAlt = getSetting(key);
        // "One per line" list (and the people one, with the name): one item per line in the display too
        const valueText = (schema.separator || PEOPLE.includes(key)) && valueAlt.length
            ? '\n' + (await showItems(key, valueAlt)).map((v, i) => `${i + 1}. ${v}`).join('\n')
            : formatValueSetting(valueAlt, ', ', schema.secret);

        await msg.reply(t('adm.set.detail', {
            key, desc: schema.desc, valor: valueText, padrao: formatValueSetting(schema.default), tipo: `${schema.type}${limits}`
        }));
        return;
    }

    // With separator (e.g.: watch.rules, one per line) uses the raw text: the tokenizer
    // would lose the line breaks and the quotes inside the rules
    let raw = schema.separator ? valueRaw(args, key) : rest.join(' ');

    // People list: the names become phones ("" still empties it)
    if (PEOPLE.includes(key) && !/^(["'])\1$/.test(keyTextAfter(args, key))) {
        raw = await peopleItems(msg, key, keyTextAfter(args, key));
        if (raw === null) return;
    }

    try {
        const valueAlt = await setSetting(key, raw);
        printInfo(`Setting '${key}' alterado para ${schema.secret ? formatValueSetting(valueAlt, ', ', true) : JSON.stringify(valueAlt)}`);
        const notice = ['monitor.pool', 'monitor.max'].includes(key)
            ? `\n${t('adm.set.pollWarning')}` : '';
        await msg.reply(`✅ *${key}* = ${formatValueSetting(await showItems(key, valueAlt), schema.separator ? ' | ' : ', ', schema.secret)}${notice}`);
    } catch (e) {
        await msg.reply(t('adm.set.invalid', { key, erro: e.message }));
    }
}

/**
 * The -append/-rm of a people list (bot.admins, bot.users) from the
 * text with the names, mentions and numbers: the /bot +a|-a|+u|-u shortcut.
 * With itemsReady, the text is already the items (the phone or the group id of the
 * current chat): does not go through the search.
 */
async function peopleChangeList(msg, key, textAlt, append, optionsAlt = {}) {
    const { itensProntos: itemsReady = false, resposta: reply, mostrar: showAlt, veja: see = '/bot' } = optionsAlt;
    const raw = itemsReady ? textAlt : await peopleItems(msg, key, textAlt);
    if (raw === null) return;
    await changeList(msg, { key, bruto: raw, acrescentar: append, veja: see, resposta: reply, mostrar: showAlt });
}

module.exports = {
    cmdSet,
    isOOwner,
    peopleItems,
    textItems,
    peopleChangeList
};
