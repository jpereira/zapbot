/*
 * Destination of a notice (-to): a person by number or a group by name.
 * Used by the price alerts (/cotacao and /crypto -alerta) and by /cron.
 */

const { client } = require('./client');
const { withoutAccents } = require('./util/format');

/*
 * Formas aceitas:
 * -to @5521999999999      → the person's private chat (the "@" is optional; also works
 * mention the contact with @ on WhatsApp)
 * -to /Grupo L200/        → group whose name has all the words, in any
 * -to "Grupo L200"          order and regardless of case or accents
 * -to L200                  ("Grupo sobre L200"); /.../ and quotes allow spaces
 */
const DESTINATION = /(^|\s)-to(?=\s|$)(?:\s+("([^"]*)"|'([^']*)'|\/([^/]*)\/|(\S+)))?/;

/**
 * Removes the "-to <destination>" from the command text.
 * @returns {{ destino: string|null, informado: boolean, resto: string }}
 * given: -to appeared (even without a value, which is an error for the caller)
 */
function extractDestination(textAlt) {
    const m = String(textAlt ?? '').match(DESTINATION);
    if (!m) return { destino: null, informado: false, resto: String(textAlt ?? '') };

    const valueAlt = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    // Only removes the -to snippet: the rest (including line breaks) stays as it came
    const rest = (textAlt.slice(0, m.index) + m[1] + textAlt.slice(m.index + m[0].length)).trim();

    return { destino: valueAlt || null, informado: true, resto: rest };
}

const normalize = (s) => withoutAccents(s).trim();

/**
 * Resolves the destination to a chat.
 * @param {string} valor  what came after -to
 * @param {object} [o]
 * @param {string[]} [o.mencoes]  msg.mentionedIds (mentioning with @ on WhatsApp)
 * @returns {Promise<{ id: string, nome: string, grupo: boolean } | { erro: string }>}
 */
async function resolverDestination(valueAlt, { mencoes: mentions = [] } = {}) {
    const textAlt = String(valueAlt ?? '').trim().replace(/^@/, '');

    if (!textAlt) return { erro: '❌ Informe o destino do -to: @número ou o nome do grupo.' };

    // Person: digits only (with +, spaces or dashes, if they come between quotes)
    const digits = textAlt.replace(/[\s()+-]/g, '');

    if (/^\d+$/.test(digits)) {
        // Mentioned with @: WhatsApp sends the id (sometimes @lid) in mentionedIds
        const mentioned = mentions.find(id => id.split('@')[0] === digits);
        if (mentioned) return { id: mentioned, nome: await contactName(mentioned, digits), grupo: false };

        if (digits.length < 10 || digits.length > 15) {
            return { erro: `❌ Número inválido: ${textAlt}. Use DDI + DDD + número (ex.: @5521999999999).` };
        }

        const wid = await client.getNumberId(digits).catch(() => null);
        if (!wid) return { erro: `❌ O número ${digits} não está no WhatsApp.` };

        return { id: wid._serialized, nome: await contactName(wid._serialized, digits), grupo: false };
    }

    // Group: all the words in the name
    const words = normalize(textAlt).split(/\s+/);
    const groups = (await client.getChats().catch(() => [])).filter(c => c.isGroup);
    const foundAlt6 = groups.filter(g => words.every(p => normalize(g.name).includes(p)));
    const exact = foundAlt6.find(g => normalize(g.name) === normalize(textAlt));

    if (exact || foundAlt6.length === 1) {
        const g = exact || foundAlt6[0];
        return { id: g.id._serialized, nome: g.name, grupo: true };
    }

    if (!foundAlt6.length) {
        return { erro: `❌ Nenhum grupo com "${textAlt}" no nome.\n💡 _Para uma pessoa, use o número: -to @5521999999999_` };
    }

    const LIMIT = 10;
    const names = foundAlt6.slice(0, LIMIT).map(g => `• ${g.name}`).join('\n');
    const more = foundAlt6.length > LIMIT ? `\n_+${foundAlt6.length - LIMIT} grupo(s)_` : '';

    return { erro: `🔎 "${textAlt}" corresponde a ${foundAlt6.length} grupos:\n${names}${more}\n💡 _Use mais palavras do nome, entre /.../ ou aspas: -to /Grupo L200/_` };
}

async function contactName(id, digits) {
    const contactAlt = await client.getContactById(id).catch(() => null);
    return contactAlt?.name || contactAlt?.pushname || digits;
}

// "👥 Grupo sobre L200" / "👤 Fulano"
const describeDestination = (d) => `${d.grupo ? '👥' : '👤'} ${d.nome}`;

module.exports = {
    describeDestination,
    extractDestination,
    resolverDestination
};
