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
 * /notes | -list | -l                 → lists the notes, with the ID
 * /notes <text>                      → notes (the same as -add, when it does not start with "-")
 *   -add | -a <texto>                   → anota
 * -add <text> -alerta <when> [-to <destination>]...
 * → saves the note and notifies at the date/time (-to works as in the other -alerta)
 * -rem | -r <id...|all>               → removes (-r 1 2 3, -r 1,2,3 or all)
 * -alerta                             → lists only the notes with an alert
 * -alerta <id> <when> [-to ...]     → sets (or swaps) the alert of a note
 * -alerta -rm <id...|all>             → removes the alert, keeping the note
 * The alert fires ONCE, right away; the note stays. Owner only (onlyAdmin).
 */
const MAX_DAYS = 365;
const ALERT = /(^|\s)-alerta(?=\s|$)([\s\S]*)$/;

const noteDestinations = (n) => destinationsSaved(n.recipients, lineDestination(n));
const noticeWhere = (destinations) => (destinations.length ? describeDestinations(destinations) : 'seu privado');
const indent = (textAlt) => textAlt.replace(/\n/g, '\n   ');

const listNotes = () => dbAll('SELECT * FROM notes ORDER BY id');

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

    const ids = [...new Set(partsAlt)].sort((a, b) => a - b);
    const missing = ids.filter(i => !/^\d+$/.test(i) || !notes.some(n => n.id === Number(i)));
    return { ids: ids.map(Number), faltando: missing };
}

async function removeNotes(msg, textIds, soAlert) {
    const notes = await listNotes();
    const { ids, faltando: missing, todos: allAlt2 } = readIds(textIds, notes);
    const cmd = soAlert ? '/notes -alerta -rm' : '/notes -rem';

    if (!allAlt2 && (!ids.length || missing.length)) {
        await msg.reply(missing?.length > 1
            ? `❌ IDs ${missing.join(', ')} não existem. Nada foi mexido; veja a lista com /notes -l`
            : `❌ ID ${missing?.[0] ?? '?'} não existe. Veja a lista com /notes -l\n💡 _Uso: ${cmd} <id...|all>_`);
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
    const textAlt = (m ? withoutDestination.slice(0, m.index) : withoutDestination).trim();

    if (!textAlt) {
        await msg.reply('❌ Use: /notes -add <texto> [-alerta <quando> [-to <destino>]...]');
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
        `INSERT INTO notes (text, created_at, alert_at, dest_id, dest_name, dest_is_group, dest_email, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [textAlt, Date.now(), alert, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinations)]
    );

    await msg.reply(`📝 *Anotação #${r.lastID}*\n${indent(textAlt)}` +
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
            : '🔔 Nenhuma anotação com alerta.\n💡 _Crie com /notes -alerta <id> <quando>_');
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

async function listAlt(msg) {
    const notes = await listNotes();
    await msg.reply(notes.length
        ? `📝 *ANOTAÇÕES* (${notes.length})\n\n${notes.map(noteLine).join('\n\n')}\n\n` +
          '💡 _/notes -a <texto> anota; /notes -r <id...|all> remove; -alerta <quando> avisa._'
        : '📝 Nenhuma anotação.\n💡 _Anote com /notes -a <texto>_');
}

async function cmdNote({ msg, args }) {
    await dbReady;
    const textAlt = String(args ?? '').trim();
    const [optionAlt = '', ...words] = textAlt.split(/\s+/);
    const rest = textAlt.slice(optionAlt.length).trim();
    const nameAlt = optionAlt.toLowerCase();

    if (!textAlt || nameAlt === '-list' || nameAlt === '-l') return listAlt(msg);
    if (nameAlt === '-add' || nameAlt === '-a') return addAlt(msg, rest);
    if (nameAlt === '-rem' || nameAlt === '-rm' || nameAlt === '-r') return removeNotes(msg, words.join(' '), false);
    if (nameAlt === '-alerta') return alertAlt(msg, rest);

    // An option that does not exist: error. Without a "-" in front, the whole text is a new note (the same as -add)
    if (nameAlt.startsWith('-')) {
        return msg.reply('❌ Use: /notes [-list] | -add <texto> [-alerta <quando>] | -rem <id...|all> | -alerta ...');
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
