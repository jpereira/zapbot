/*
 * /notes: notes (notes table) and -alerta, which reminds of a note at a date/time.
 */

const { estado: stateAlt } = require('./state');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, sendToDestinations, extractDestinations,
    recipientsDe, resolverDestinations
} = require('./destinations');
const { printError, printInfo } = require('./log');
const { formatData, plural, summarizeText } = require('./util/format');
const { fmtWhen, readWhen } = require('./util/when');

/*
 * /notes
 * /notes | -list | -l [#tag...]       → lists the notes, with the ID, grouped by #tag
 * /notes #tag                         → only those of that tag (the same as -l #tag)
 * /notes [#tag] <text>               → notes (the same as -add, when it does not start with "-")
 *   -add | -a [#tag] <texto>            → anota
 * -add <text> -alerta <when> [-to <destination>]...
 * → saves the note and notifies at the date/time (-to works as in the other -alerta)
 * -rem | -r <id...|#tag...|all>       → removes (-r 1 2 3, -r 1,2,3, -r #casa or all)
 * -alerta                             → lists only the notes with an alert
 * -alerta <id> <when> [-to ...]     → sets (or swaps) the alert of a note
 * -alerta -rm <id...|#tag...|all>     → removes the alert, keeping the note
 * The alert fires ONCE, right away; the note stays. Owner only (onlyAdmin).
 */
const MAX_DAYS = 365;
const ALERT = /(^|\s)-alerta(?=\s|$)([\s\S]*)$/;

const noteDestinations = (n) => destinationsSaved(n.recipients, lineDestination(n));
const noticeWhere = (destinations) => (destinations.length ? describeDestinations(destinations) : 'seu privado');
const indent = (textAlt) => textAlt.replace(/\n/g, '\n   ');

const listNotes = () => dbAll('SELECT * FROM notes ORDER BY id');

const WITHOUT_TAG = 'sem tag';
const WITHOUT_PREVIEW = { linkPreview: false };  // lists do not show a link thumbnail
const readTag = (t) => t.replace(/^#/, '').toLowerCase();

// "#casa Lembrar do pão" → { tag: 'casa', texto: 'Lembrar do pão' } (the tag only counts at the start)
function separateTag(textAlt) {
    const m = textAlt.match(/^#([^\s#]+)(?:\s+([\s\S]*))?$/);
    return m ? { tag: readTag(m[1]), texto: (m[2] ?? '').trim() } : { tag: null, texto: textAlt };
}

// "#casa #duvidas" → ['casa', 'duvidas']; null if anything that is not a tag is left over
function soTags(textAlt) {
    const partsAlt = textAlt.split(/[\s,]+/).filter(Boolean);
    return partsAlt.length && partsAlt.every(p => /^#[^\s#]+$/.test(p)) ? [...new Set(partsAlt.map(readTag))] : null;
}

function noteLine(n) {
    const alert = n.alert_at
        ? `\n   ⏰ ${fmtWhen(n.alert_at)} → ${noticeWhere(noteDestinations(n))}`
        : '';
    return `*#${n.id}* ${indent(n.text)}${alert}\n   _(${formatData(n.created_at)})_`;
}

// The ids of -rem / -alerta -rm: 1 2 3, 1,2,3 or all. Does any not exist? None is touched
function readIds(textAlt, notes) {
    const partsAlt = textAlt.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (partsAlt.includes('all')) return { todos: true, ids: notes.map(n => n.id) };

    const tags = partsAlt.filter(p => p.startsWith('#')).map(readTag);
    const other = [...new Set(partsAlt.filter(p => !p.startsWith('#')))].sort((a, b) => a - b);
    const missing = [
        ...tags.filter(t => !notes.some(n => n.tag === t)).map(t => `#${t}`),
        ...other.filter(i => !/^\d+$/.test(i) || !notes.some(n => n.id === Number(i)))
    ];
    const ids = new Set([...other.filter(i => /^\d+$/.test(i)).map(Number),
        ...notes.filter(n => tags.includes(n.tag)).map(n => n.id)]);
    return { ids: [...ids].sort((a, b) => a - b), faltando: missing };
}

async function removeNotes(msg, textIds, soAlert) {
    const notes = await listNotes();
    const { ids, faltando: missing, todos: allAlt2 } = readIds(textIds, notes);
    const cmd = soAlert ? '/notes -alerta -rm' : '/notes -rem';

    if (!allAlt2 && (!ids.length || missing.length)) {
        const label = missing?.every(f => !f.startsWith('#')) ? 'ID' : '';
        await msg.reply(missing?.length > 1
            ? `❌ ${label}${label ? 's ' : ''}${missing.join(', ')} não existem. Nada foi mexido; veja a lista com /notes -l`
            : `❌ ${label ? 'ID ' : ''}${missing?.[0] ?? '?'} não existe. Veja a lista com /notes -l\n💡 _Uso: ${cmd} <id...|#tag...|all>_`);
        return;
    }

    if (soAlert) {
        const withAlert = notes.filter(n => ids.includes(n.id) && n.alert_at);
        for (const n of withAlert) await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);
        await msg.reply(`🔕 ${plural(withAlert.length, 'alerta removido', 'alertas removidos')}.`);
        return;
    }

    for (const id of ids) await dbRun('DELETE FROM notes WHERE id = ?', [id]);
    await msg.reply(`🗑️ ${plural(ids.length, 'anotação removida', 'anotações removidas')}.`);
}

// whole "<when>" (with no leftover) → ms, or the error to reply with
function alertReadData(textAlt) {
    const words = textAlt.split(/\s+/).filter(Boolean);
    const q = words.length ? readWhen(words) : null;
    const nowAlt = Date.now();

    if (!q || q.usadas !== words.length) {
        return { erro: `❌ Quando inválido: "${textAlt}"\n💡 _Ex.: +2h, 30m, 18h, amanhã 9h, sexta 18:30, 25/12 10h_` };
    }
    if (q.ms <= nowAlt) return { erro: `❌ ${fmtWhen(q.ms)} já passou.` };
    if (q.ms > nowAlt + MAX_DAYS * 86400_000) return { erro: `❌ No máximo ${MAX_DAYS} dias à frente.` };
    return { ms: q.ms };
}

async function commandDestinations(msg, destinationsText, withDestination) {
    if (!withDestination) return [];
    return resolverDestinations(msg, destinationsText, { aceitaEmail: true });
}

async function addAlt(msg, rest) {
    const { destinos: destinationsText, informado: withDestination, resto: withoutDestination } = extractDestinations(rest);
    const m = withoutDestination.match(ALERT);
    const { tag, texto: textAlt } = separateTag((m ? withoutDestination.slice(0, m.index) : withoutDestination).trim());

    if (!textAlt) {
        await msg.reply('❌ Use: /notes -add [#tag] <texto> [-alerta <quando> [-to <destino>]...]');
        return;
    }

    if (withDestination && !m) {
        await msg.reply('❌ O -to só vale com o -alerta: /notes -add <texto> -alerta amanhã 9h -to /Grupo L200/');
        return;
    }

    let alert = null;
    let destinations = [];

    if (m) {
        const when = alertReadData(m[2].trim());
        if (when.erro) {
            await msg.reply(when.erro);
            return;
        }
        alert = when.ms;
        destinations = await commandDestinations(msg, destinationsText, withDestination);
        if (!destinations) return;
    }

    const c = destinationColumns(destinations[0]);
    const r = await dbRun(
        `INSERT INTO notes (text, tag, created_at, alert_at, dest_id, dest_name, dest_is_group, dest_email, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [textAlt, tag, Date.now(), alert, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinations)]
    );

    await msg.reply(`📝 *Anotação #${r.lastID}*${tag ? ` · #${tag}` : ''}\n${indent(textAlt)}` +
        (alert ? `\n⏰ ${fmtWhen(alert)} → ${noticeWhere(destinations)}` : ''));
}

async function alertAlt(msg, rest) {
    const { destinos: destinationsText, informado: withDestination, resto: withoutDestination } = extractDestinations(rest);
    const textAlt = withoutDestination.trim();

    if (/^-(rm|rem|r)(\s|$)/.test(textAlt)) {
        await removeNotes(msg, textAlt.replace(/^-\S+/, ''), true);
        return;
    }

    if (!textAlt) {
        if (withDestination) {
            await msg.reply('❌ O -to só vale ao criar o alerta: /notes -alerta <id> amanhã 9h -to /Grupo L200/');
            return;
        }
        const withAlert = (await listNotes()).filter(n => n.alert_at);
        await msg.reply(withAlert.length
            ? `🔔 *ALERTAS DAS ANOTAÇÕES*\n\n${withAlert.map(noteLine).join('\n\n')}\n\n` +
              '💡 _Tire com /notes -alerta -rm <id...|all>_'
            : '🔔 Nenhuma anotação com alerta.\n💡 _Crie com /notes -alerta <id> <quando>_',
        undefined, WITHOUT_PREVIEW);
        return;
    }

    const m = textAlt.match(/^(\d+)\s+([\s\S]+)$/);
    if (!m) {
        await msg.reply('❌ Use: /notes -alerta <id> <quando> [-to <destino>]...');
        return;
    }

    const note = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
    if (!note) {
        await msg.reply(`❌ ID ${m[1]} não existe. Veja a lista com /notes -l`);
        return;
    }

    const when = alertReadData(m[2].trim());
    if (when.erro) {
        await msg.reply(when.erro);
        return;
    }

    const destinations = await commandDestinations(msg, destinationsText, withDestination);
    if (!destinations) return;

    const c = destinationColumns(destinations[0]);
    await dbRun(
        `UPDATE notes SET alert_at = ?, dest_id = ?, dest_name = ?, dest_is_group = ?, dest_email = ?, recipients = ?
         WHERE id = ?`,
        [when.ms, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinations), note.id]
    );

    await msg.reply(`🔔 *Alerta criado* na anotação #${note.id}\n${indent(summarizeText(note.text, 80))}\n` +
        `⏰ ${fmtWhen(when.ms)} → ${noticeWhere(destinations)}`);
}

// Groups by tag (alphabetical order), with the untagged last
function groupPerTag(notes) {
    const groups = new Map();
    for (const n of notes) groups.set(n.tag ?? '', [...(groups.get(n.tag ?? '') ?? []), n]);

    const keys = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const soWithoutTag = keys.length === 1 && keys[0] === '';
    return keys.map(k => {
        const items = groups.get(k).map(noteLine).join('\n\n');
        return soWithoutTag ? items : `*${k ? `#${k}` : WITHOUT_TAG}* (${groups.get(k).length})\n\n${items}`;
    }).join('\n\n──────────\n\n');
}

async function listAlt(msg, filter = '') {
    const tags = filter ? soTags(filter) : [];
    if (!tags) {
        await msg.reply('❌ Use: /notes -l [#tag...]');
        return;
    }

    const allAlt = await listNotes();
    const notes = tags.length ? allAlt.filter(n => tags.includes(n.tag)) : allAlt;
    const label = tags.length ? ` ${tags.map(t => `#${t}`).join(' ')}` : '';

    await msg.reply(notes.length
        ? `📝 *ANOTAÇÕES${label}* (${notes.length})\n\n${groupPerTag(notes)}\n\n` +
          '💡 _/notes -a [#tag] <texto> anota; /notes -r <id...|#tag...|all> remove; -alerta <quando> avisa._'
        : tags.length
            ? `📝 Nenhuma anotação em${label}.`
            : '📝 Nenhuma anotação.\n💡 _Anote com /notes -a [#tag] <texto>_',
    undefined, WITHOUT_PREVIEW);
}

async function cmdNote({ msg, args }) {
    await dbReady;
    const textAlt = String(args ?? '').trim();
    const [optionAlt = '', ...words] = textAlt.split(/\s+/);
    const rest = textAlt.slice(optionAlt.length).trim();
    const nameAlt = optionAlt.toLowerCase();

    if (!textAlt) return listAlt(msg);
    if (nameAlt === '-list' || nameAlt === '-l') return listAlt(msg, rest);
    if (soTags(textAlt)) return listAlt(msg, textAlt);
    if (nameAlt === '-add' || nameAlt === '-a') return addAlt(msg, rest);
    if (nameAlt === '-rem' || nameAlt === '-rm' || nameAlt === '-r') return removeNotes(msg, words.join(' '), false);
    if (nameAlt === '-alerta') return alertAlt(msg, rest);

    // An option that does not exist: error. Without a "-" in front, the whole text is a new note (the same as -add)
    if (nameAlt.startsWith('-')) {
        return msg.reply('❌ Use: /notes [-list] [#tag] | -add [#tag] <texto> [-alerta <quando>] | -rem <id...|#tag...|all> | -alerta ...');
    }

    return addAlt(msg, textAlt);
}

/*
 * Check: one tick per minute notifies the notes whose alert expired. Clears the alert
 * BEFORE notifying: if the send fails, it does not repeat on every tick.
 */
let checking = false;

async function checkNotes() {
    if (checking || !stateAlt.pronto) return;
    checking = true;

    try {
        await dbReady;
        const expired = await dbAll('SELECT * FROM notes WHERE alert_at IS NOT NULL AND alert_at <= ? ORDER BY alert_at, id',
            [Date.now()]);

        for (const n of expired) {
            await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);

            const destinations = noteDestinations(n);
            await sendToDestinations(destinations,
                `🔔 *ANOTAÇÃO #${n.id}*\n\n${n.text}\n\n📅 Anotada em ${formatData(n.created_at)}`,
                { assunto: `🔔 Anotação #${n.id}: ${summarizeText(n.text, 60)}` }
            ).catch(err => printError('/notes -alerta: falha ao avisar:', err.message));

            printInfo(`/notes -alerta disparado: #${n.id}` +
                (destinations.length ? ` → ${destinations.map(d => d.email ?? d.id).join(', ')}` : ''));
        }
    } catch (err) {
        printError('Erro ao verificar os alertas do /notes:', err.message);
    } finally {
        checking = false;
    }
}

// Called in app.js
function startNotes() {
    setInterval(checkNotes, 60 * 1000);
}

module.exports = {
    cmdNote,
    startNotes,
    checkNotes
};
