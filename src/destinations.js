/*
 * Destination of a notice or target of a command: a contact, a group or a number.
 * Used by the -to of /cron and of the price alerts (/cotacao and /crypto -alerta),
 * by the /mudo target and by /defi -alerta's -send.
 */

const { client } = require('./client');
const { waitChoice } = require('./choices');
const { withoutAccents } = require('./util/format');

/*
 * Formas aceitas:
 * +5521999999999   → the number's private chat: country code + area code + number (the "+" is optional)
 * /Jorge Pereira/  → first, a contact in your address book with all the words
 * "Jorge Pereira"    in the name; with no contact, a group. In any order, without
 * Jorge              regardless of case or accents; /.../ and quotes
 * allow spaces
 * The same name (whole) beats one that only contains the words. If still
 * more than one fits, the command lists and you reply with the no. (resolverOrChoose).
 */
const DESTINATION = /(^|\s)-to(?=\s|$)(?:\s+("([^"]*)"|'([^']*)'|\/([^/]*)\/|(\S+)))?/;
const EXAMPLE = '/Jorge Pereira/, /Grupo L200/ ou +5521999999999';
const LIMIT = 10;

// The same regex as -to for another option (e.g.: /defi's -send)
const optionRegex = (optionAlt) => (optionAlt === 'to' ? DESTINATION
    : new RegExp(DESTINATION.source.replace('-to', `-${optionAlt}`)));

/**
 * Removes the "-to <destination>" (or another option, like "-send") from the command text.
 * @returns {{ destino: string|null, informado: boolean, resto: string }}
 * given: the option appeared (even without a value, which is an error for the caller)
 */
function extractDestination(textAlt, optionAlt = 'to') {
    const m = String(textAlt ?? '').match(optionRegex(optionAlt));
    if (!m) return { destino: null, informado: false, resto: String(textAlt ?? '') };

    const valueAlt = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    // Only removes the option snippet: the rest (including line breaks) stays as it came
    const rest = (textAlt.slice(0, m.index) + m[1] + textAlt.slice(m.index + m[0].length)).trim();

    return { destino: valueAlt || null, informado: true, resto: rest };
}

const normalize = (s) => withoutAccents(s).trim();

// "+5521999999999", "5521 99999-9999" → only the digits; null if it is not a number
function readNumber(textAlt) {
    if (!/^\+?[\d\s().-]+$/.test(textAlt)) return null;
    return textAlt.replace(/\D/g, '');
}

/*
 * The contacts saved in the address book (with a name). WhatsApp may bring the same
 * person as @c.us and as @lid: with the same name, only the @c.us stays.
 */
async function scheduleContacts() {
    const allAlt2 = (await client.getContacts?.().catch(() => []) ?? [])
        .filter(c => c?.isMyContact && !c.isGroup && !c.isMe && c.name && c.id?._serialized);
    const withPhone = new Set(allAlt2.filter(c => c.id._serialized.endsWith('@c.us')).map(c => normalize(c.name)));

    return allAlt2.filter(c => c.id._serialized.endsWith('@c.us') || !withPhone.has(normalize(c.name)));
}

const contact = (c) => ({ id: c.id._serialized, nome: c.name, grupo: false, numero: c.number ?? null });
const group = (g) => ({ id: g.id._serialized, nome: g.name, grupo: true });

/**
 * Resolves the text to a chat.
 * @param {string} valor  what came in -to (or in the /mudo target, in -send...)
 * @param {object} [o]
 * @param {string} [o.opcao]  what to call the destination in the error messages (default: "-to")
 * @returns {Promise<{ id: string, nome: string, grupo: boolean }
 *   | { erro: string }
 * | { options: Array<{ id, name, group }>, search: string, more: number }>}
 * options: more than one fit; the caller offers the choice (resolverOrChoose)
 */
async function resolverDestination(valueAlt, { opcao: optionAlt = '-to' } = {}) {
    const textAlt = String(valueAlt ?? '').trim();

    if (!textAlt) return { erro: `❌ Informe o destino do ${optionAlt}: um contato, um grupo ou um número (${EXAMPLE}).` };

    // Number: digits only, with + and separators
    const digits = readNumber(textAlt);
    if (digits !== null) {
        if (digits.length < 10 || digits.length > 15) {
            return { erro: `❌ Número inválido: ${textAlt}. Use DDI + DDD + número (ex.: +5521999999999).` };
        }

        const wid = await client.getNumberId(digits).catch(() => null);
        if (!wid) return { erro: `❌ O número +${digits} não está no WhatsApp.` };

        return { id: wid._serialized, nome: await contactName(wid._serialized, digits), grupo: false };
    }

    // Name: all the words, first in the contacts, then in the groups
    const search = normalize(textAlt);
    const words = search.split(/\s+/);
    const home = (nameAlt) => words.every(p => normalize(nameAlt).includes(p));

    const contacts = (await scheduleContacts()).filter(c => home(c.name));
    const groups = (await client.getChats().catch(() => [])).filter(c => c.isGroup && c.name && home(c.name));

    const exact = contacts.find(c => normalize(c.name) === search) ?? null;
    const groupExact = groups.find(g => normalize(g.name) === search) ?? null;

    if (exact && contacts.filter(c => normalize(c.name) === search).length === 1) return contact(exact);
    if (!exact && groupExact && groups.filter(g => normalize(g.name) === search).length === 1) return group(groupExact);

    const candidates = contacts.length ? contacts.map(contact) : groups.map(group);
    if (candidates.length === 1) return candidates[0];

    if (!candidates.length) {
        return { erro: `❌ Nenhum contato ou grupo com "${textAlt}" no nome.\n💡 _Use o nome como está na sua agenda ou o número: ${EXAMPLE}_` };
    }

    return { opcoes: candidates.slice(0, LIMIT), busca: textAlt, mais: Math.max(0, candidates.length - LIMIT) };
}

/**
 * Resolves the destination and, if more than one fits, shows the numbered list and waits
 * you reply with the no. (up to 2 minutes). Errors and the timeout already go
 * answered in the chat.
 * @param {object} msg  the command message
 * @param {string} valor
 * @param {object} [o]  the same as resolverDestination
 * @returns {Promise<{ id: string, nome: string, grupo: boolean } | null>}
 */
async function resolverOrChoose(msg, valueAlt, o = {}) {
    const r = await resolverDestination(valueAlt, o);

    if (r.erro) {
        await msg.reply(r.erro);
        return null;
    }
    if (!r.opcoes) return r;

    const type = r.opcoes[0].grupo ? 'grupos' : 'contatos';
    const linesAlt = r.opcoes.map((d, i) => `${i + 1}. ${describeDestination(d)}${d.numero ? ` · +${d.numero}` : ''}`);
    const more = r.mais ? `\n_+${r.mais} ${type}: use mais palavras do nome para ver os outros_` : '';

    await msg.reply(`🔎 "${r.busca}" corresponde a ${r.opcoes.length + r.mais} ${type}:\n\n${linesAlt.join('\n')}${more}\n\n` +
        '💡 _Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome._');

    const chatId = msg.id?.remote ?? msg.from;
    return waitChoice(chatId, r.opcoes, {
        aoExpirar: () => msg.reply(`⌛ Nenhum nº escolhido para "${r.busca}" em 2 minutos: nada foi feito.`)
    });
}

async function contactName(id, digits) {
    const contactAlt = await client.getContactById(id).catch(() => null);
    return contactAlt?.name || contactAlt?.pushname || `+${digits}`;
}

// "👥 Grupo sobre L200" / "👤 Fulano"
const describeDestination = (d) => `${d.grupo ? '👥' : '👤'} ${d.nome}`;

module.exports = {
    describeDestination,
    extractDestination,
    resolverDestination,
    resolverOrChoose
};
