/*
 * /notes: notes (notes table) and -alerta, which reminds of a note at a date/time.
 */

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
const { MessageMedia } = require('whatsapp-web.js');
const { client } = require('./client');
const { NOTES_DIR } = require('./constants');
const { estado: stateAlt } = require('./state');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, sendToDestinations, extractDestinations,
    recipientsDe, resolverDestinations
} = require('./destinations');
const { sendEmail } = require('./email');
const { printError, printInfo } = require('./log');
const { formatData, plural, summarizeText } = require('./util/format');
const { generatePdf } = require('./util/pdf');
const { compileSearch } = require('./watch/rules');
const { fmtWhen, readWhen } = require('./util/when');
const packageJson = require('../package.json');

/*
 * /notes
 * /notes | -list | -l [#tag...]       → lists the notes, with the ID, grouped by #tag
 * /notes #tag                         → only those of that tag (the same as -l #tag)
 *   -search | -s [#tag...] <texto|/regex/flags>
 * → only those that match (text case and accent insensitive;
 * the same -q as /show and /watch); also matches the #tag
 * -update | -u <id> [#tag] <text>    → replaces the text (and the tag, if one comes) of the note
 * -tags | -t                          → the tags and how many notes each one has
 * -move | -m #tag #new               → renames the tag (if #new already exists, merges the two)
 * -desc | -d #tag [<text>]           → tag description (without text, shows it; -d #tag -rm, deletes it)
 * -view | -v <id...|#tag...> [-to ...] → shows the note with the image (text, if it has none)
 * -export | -e [#tag...]              → sends the notes (or only those of the tags) in a PDF, with the images
 *   -list | #tag | -export ... -to <destino>...
 * → the list (or the PDF) goes to the destinations, as in the other commands
 * /notes [#tag] <text>               → notes (the same as -add, when it does not start with "-")
 * (with an image, or in reply to one) /notes [#tag] [<text>] → saves the image in NOTES_DIR
 * (in reply to a message) /notes [#tag] | -add [#tag] [-alerta ...]
 * → saves the replied message's text, with the ↩️ in front
 *   -add | -a [#tag] <texto>            → anota
 * -add <text> -alerta <when> [-to <destination>]...
 * → saves the note and notifies at the date/time (-to works as in the other -alerta)
 * -rm | -r <id...|#tag...|all>       → removes (-r 1 2 3, -r 1,2,3, -r #casa or all)
 * -alerta                             → lists only the notes with an alert
 * -alerta <id|#tag...> <when> [-to ...]
 * → sets (or swaps) the alert of a note (or of all those in the tag)
 * -alerta #tag...                     → lists only the alerts of those tags
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

// A partial tag works: #idei finds #ideias (the exact one wins; otherwise starts with; otherwise contains).
// Only to read (list, search, PDF): removing and alerting ask for the whole tag
function resolverTags(tags, notes) {
    const existingAlt = [...new Set(notes.map(n => n.tag).filter(Boolean))];
    const find = (t) => {
        if (existingAlt.includes(t)) return [t];
        const starts = existingAlt.filter(e => e.startsWith(t));
        return starts.length ? starts : existingAlt.filter(e => e.includes(t));
    };
    return [...new Set(tags.flatMap(t => { const r = find(t); return r.length ? r : [t]; }))];
}

// "#casa #duvidas" → ['casa', 'duvidas']; null if anything that is not a tag is left over
function soTags(textAlt) {
    const partsAlt = textAlt.split(/[\s,]+/).filter(Boolean);
    return partsAlt.length && partsAlt.every(p => /^#[^\s#]+$/.test(p)) ? [...new Set(partsAlt.map(readTag))] : null;
}

function noteLine(n, plan = false) {
    const alert = n.alert_at
        ? `\n   ⏰ ${fmtWhen(n.alert_at)} → ${noticeWhere(noteDestinations(n))}`
        : '';
    const body = [n.text, n.media_path && (plan ? '🖼️ imagem' : '🖼️ _imagem_')].filter(Boolean).join('\n');
    // plain: inside the ``` block the *bold* and _italic_ appear as they are
    return plan ? `#${n.id} ${indent(body)}${alert}\n   🕐 ${formatData(n.created_at)}`
        : `*#${n.id}* ${indent(body)}${alert}\n   🕐 _${formatData(n.created_at)}_`;
}

// The ids of -rm / -alerta -rm: 1 2 3, 1,2,3 or all. Does any not exist? None is touched
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
    const cmd = soAlert ? '/notes -alerta -rm' : '/notes -rm';

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

    for (const n of notes.filter(x => ids.includes(x.id))) {
        await dbRun('DELETE FROM notes WHERE id = ?', [n.id]);
        if (n.media_path) await fs.remove(n.media_path).catch(err => printError('/notes: imagem não apagada:', err.message));
    }
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

const MARK_REPLY = '↩️';

// The first 35 characters (on a single line), with … if there was more
function textStart(textAlt) {
    const t = textAlt.replace(/\s+/g, ' ').trim();
    return t.length > 35 ? `${t.slice(0, 35).trimEnd()}…` : t;
}
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// The message's own image or, in reply, the replied message's
const imageOrigin = (msg, quotedMsg) => [msg, quotedMsg].find(m => m?.hasMedia);

// Downloads and stores the image in NOTES_DIR: { path, mime }, or { error } to reply with
async function saveImage(origin) {
    const media = await origin.downloadMedia().catch(() => null);
    if (!media?.data) return { erro: '❌ Não consegui baixar a mídia.' };
    if (!String(media.mimetype).startsWith('image/')) return { erro: '❌ O /notes guarda só imagens.' };

    const ext = EXTENSIONS[media.mimetype] ?? media.mimetype.split('/')[1].replace(/[^a-z0-9]/gi, '') ?? 'img';
    const fileAlt = path.join(NOTES_DIR, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
    await fs.outputFile(fileAlt, Buffer.from(media.data, 'base64'));
    return { path: fileAlt, mime: media.mimetype };
}

// a typed "\n" becomes a line break ("\\n" stays as text)
const withBreaks = (t) => t.replace(/(?<!\\)\\n/g, '\n').replace(/\\\\n/g, '\\n');

async function addAlt(msg, textTyped, quotedMsg) {
    const rest = withBreaks(textTyped);
    const { destinos: destinationsText, informado: withDestination, resto: withoutDestination } = extractDestinations(rest);
    const m = withoutDestination.match(ALERT);
    const separated = separateTag((m ? withoutDestination.slice(0, m.index) : withoutDestination).trim());
    const { tag } = separated;
    let { texto: textAlt } = separated;

    // Without text, but replying to a message: saves its text (if any; the image counts alone)
    const origin = imageOrigin(msg, quotedMsg);
    if (!textAlt && quotedMsg) {
        const quoted = String(quotedMsg.body ?? '').trim();
        if (!quoted && !origin) {
            await msg.reply('❌ A mensagem respondida não tem texto.');
            return;
        }
        if (quoted) textAlt = `${MARK_REPLY} ${quoted}`;
    }

    if (!textAlt && !origin) {
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

    let image = null;
    if (origin) {
        image = await saveImage(origin);
        if (image.erro) {
            await msg.reply(image.erro);
            return;
        }
    }

    const c = destinationColumns(destinations[0]);
    const r = await dbRun(
        `INSERT INTO notes (text, tag, media_path, media_mime, created_at, alert_at, dest_id, dest_name, dest_is_group,
                            dest_email, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [textAlt, tag, image?.path ?? null, image?.mime ?? null, Date.now(), alert, c.dest_id, c.dest_name,
            c.dest_is_group, c.dest_email, recipientsDe(destinations)]
    );

    // Only the notice that it saved (no., #tag, the start of the text): you already sent the body
    const summary = [`📝 *#${r.lastID}*`, tag && `#${tag}`, image && '🖼️', textAlt && textStart(textAlt)]
        .filter(Boolean).join(' · ');
    await msg.reply(summary + (alert ? `\n⏰ ${fmtWhen(alert)} → ${noticeWhere(destinations)}` : ''),
        undefined, WITHOUT_PREVIEW);
}

async function update(msg, rest, quotedMsg) {
    const m = rest.match(/^#?(\d+)(?:\s+([\s\S]*))?$/);
    if (!m) {
        await msg.reply('❌ Use: /notes -update <id> [#tag] <novo texto>');
        return;
    }

    const note = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
    if (!note) {
        await msg.reply(`❌ ID ${m[1]} não existe. Veja a lista com /notes -l`);
        return;
    }

    let { tag, texto: textAlt } = separateTag(withBreaks(m[2] ?? '').trim());
    if (!textAlt && quotedMsg?.body?.trim()) textAlt = `${MARK_REPLY} ${quotedMsg.body.trim()}`;
    if (!textAlt) {
        await msg.reply('❌ Use: /notes -update <id> [#tag] <novo texto>');
        return;
    }

    tag ??= note.tag;
    await dbRun('UPDATE notes SET text = ?, tag = ? WHERE id = ?', [textAlt, tag, note.id]);
    await msg.reply(`✏️ *#${note.id}*${tag ? ` · #${tag}` : ''} · ${textStart(textAlt)}`, undefined, WITHOUT_PREVIEW);
}

async function alertAlt(msg, rest) {
    const { destinos: destinationsText, informado: withDestination, resto: withoutDestination } = extractDestinations(rest);
    const textAlt = withoutDestination.trim();

    if (/^-(rm|r)(\s|$)/.test(textAlt)) {
        await removeNotes(msg, textAlt.replace(/^-\S+/, ''), true);
        return;
    }

    // "#tag [#tag...] [<when>]" targets the notes of those tags; "<id> <when>", just one
    const byTag = textAlt.match(/^(#[^\s#,]+(?:[\s,]+#[^\s#,]+)*)(?:\s+([\s\S]+))?$/);
    const tags = byTag ? [...new Set(byTag[1].split(/[\s,]+/).map(readTag))] : [];
    const whenText = byTag ? (byTag[2] ?? '').trim() : '';

    if (!textAlt || (byTag && !whenText)) {
        if (withDestination) {
            await msg.reply('❌ O -to só vale ao criar o alerta: /notes -alerta <id|#tag> amanhã 9h -to /Grupo L200/');
            return;
        }
        const allNotes = await listNotes();
        const tagsFound = resolverTags(tags, allNotes);
        const withAlert = allNotes.filter(n => n.alert_at && (!tags.length || tagsFound.includes(n.tag)));
        const label = tags.length ? ` ${tagsFound.map(t => `#${t}`).join(' ')}` : '';
        await msg.reply(withAlert.length
            ? `🔔 *ALERTAS DAS ANOTAÇÕES${label}*\n\n${withAlert.map(noteLine).join('\n\n')}\n\n` +
              '💡 _Tire com /notes -alerta -rm <id...|#tag...|all>_'
            : `🔔 Nenhuma anotação${label ? ` em${label}` : ''} com alerta.\n💡 _Crie com /notes -alerta <id|#tag> <quando>_`,
        undefined, WITHOUT_PREVIEW);
        return;
    }

    const m = byTag ? null : textAlt.match(/^(\d+)\s+([\s\S]+)$/);
    if (!byTag && !m) {
        await msg.reply('❌ Use: /notes -alerta <id|#tag> <quando> [-to <destino>]...');
        return;
    }

    let targets;
    if (byTag) {
        const allAlt = await listNotes();
        const withoutNotes = tags.filter(t => !allAlt.some(n => n.tag === t));
        if (withoutNotes.length) {
            await msg.reply(`❌ Nenhuma anotação em ${withoutNotes.map(t => `#${t}`).join(' ')}. Veja as tags com /notes -tags`);
            return;
        }
        targets = allAlt.filter(n => tags.includes(n.tag));
    } else {
        const note = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
        if (!note) {
            await msg.reply(`❌ ID ${m[1]} não existe. Veja a lista com /notes -l`);
            return;
        }
        targets = [note];
    }

    const when = alertReadData((byTag ? whenText : m[2]).trim());
    if (when.erro) {
        await msg.reply(when.erro);
        return;
    }

    const destinations = await commandDestinations(msg, destinationsText, withDestination);
    if (!destinations) return;

    const c = destinationColumns(destinations[0]);
    for (const n of targets) {
        await dbRun(
            `UPDATE notes SET alert_at = ?, dest_id = ?, dest_name = ?, dest_is_group = ?, dest_email = ?, recipients = ?
             WHERE id = ?`,
            [when.ms, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinations), n.id]
        );
    }

    const whereAlt = `⏰ ${fmtWhen(when.ms)} → ${noticeWhere(destinations)}`;
    await msg.reply(targets.length === 1 && !byTag
        ? `🔔 *Alerta criado* na anotação #${targets[0].id}\n${summarizeText(targets[0].text, 80)}\n${whereAlt}`
        : `🔔 *Alerta criado* em ${plural(targets.length, 'anotação', 'anotações')} de ` +
          `${tags.map(t => `#${t}`).join(' ')} (${targets.map(n => `#${n.id}`).join(', ')})\n${whereAlt}`,
    undefined, WITHOUT_PREVIEW);
}

// Groups by tag (alphabetical order), with the untagged last
const tagsDescriptions = async () => new Map((await dbAll('SELECT tag, description FROM note_tags'))
    .map(r => [r.tag, r.description]));

// One text per tag (each goes in a message)
function groupPerTag(notes, descriptions = new Map(), plan = true) {
    const groups = new Map();
    for (const n of notes) groups.set(n.tag ?? '', [...(groups.get(n.tag ?? '') ?? []), n]);

    const keys = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const soWithoutTag = keys.length === 1 && keys[0] === '';
    return keys.map(k => {
        const items = groups.get(k).map(n => noteLine(n, plan)).join('\n\n');
        const desc = descriptions.get(k);
        return soWithoutTag ? items
            : `🏷️ ${k ? `#${k}` : WITHOUT_TAG} (${groups.get(k).length})${desc ? `\n${desc}` : ''}\n\n${items}`;
    });
}

// The -to destinations of a list/export: undefined without -to, null if it did not resolve (already replied)
async function sendingDestinations(msg, destinationsText, withDestination) {
    if (!withDestination) return undefined;
    return resolverDestinations(msg, destinationsText, { aceitaEmail: true });
}

const TIPS = '\n\n💡 *Dicas*\n' +
    '/notes -a [#tag] <texto> anota\n' +
    '/notes -v <id...|#tag...> mostra com a imagem\n' +
    '/notes -r <id...|#tag...|all> remove\n' +
    '-alerta <quando> avisa.';

// Replies in the chat or, with -to, sends to the destinations (and replies that it sent).
// `texto` may be a list: each item goes in a message, and the tip only after the last
async function deliverText(msg, destinations, textAlt, subject, tip = '') {
    // Each listing goes in a ``` block (monospaced); the tip stays outside
    const partsAlt = [].concat(textAlt).map(t => '```\n' + t + '\n```');
    if (!destinations) {
        for (const [i, part] of partsAlt.entries()) {
            await msg.reply(i === partsAlt.length - 1 ? `${part}${tip}` : part, undefined, WITHOUT_PREVIEW);
        }
        return;
    }
    try {
        for (const part of partsAlt) await sendToDestinations(destinations, part, { assunto: subject, opcoes: WITHOUT_PREVIEW });
        await msg.reply(`📝 Anotações enviadas em ${describeDestinations(destinations)}.`);
    } catch (err) {
        await msg.reply(`❌ Não consegui enviar as anotações: ${err.message}`);
    }
}

// "[#tag...] <text|/regex/flags>" of -search → { tags, search }
function readSearch(textAlt) {
    const m = textAlt.trim().match(/^((?:#[^\s#]+\s+)*)([\s\S]*)$/);
    return {
        tags: m[1].split(/\s+/).filter(Boolean).map(readTag),
        busca: m[2].trim().replace(/^"([\s\S]*)"$/, '$1')
    };
}

async function listAlt(msg, filter = '', withSearch = false) {
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(filter);
    let tags = rest.trim() ? soTags(rest) : [];
    let search = '';
    let test = null;

    if (withSearch) {
        ({ tags, busca: search } = readSearch(rest));
        if (!search) {
            await msg.reply('❌ Use: /notes -search [#tag...] <texto|/regex/flags> [-to <destino>]...');
            return;
        }
        try {
            test = compileSearch(search);
        } catch (err) {
            await msg.reply(`❌ ${err.message}`);
            return;
        }
    } else if (!tags) {
        await msg.reply('❌ Use: /notes -l [#tag...] [-to <destino>]...');
        return;
    }

    const destinations = await sendingDestinations(msg, destinationsText, withDestination);
    if (destinations === null) return;

    // The search looks at the text and also the #tag (/notes -s casa finds those of #casa)
    const allAlt = await listNotes();
    tags = resolverTags(tags, allAlt);
    const notes = allAlt.filter(n => (!tags.length || tags.includes(n.tag)) &&
        (!test || test(n.text) || (n.tag && test(`#${n.tag}`))));
    const label = tags.length ? ` ${tags.map(t => `#${t}`).join(' ')}` : '';
    const foundAlt2 = search ? ` 🔎 ${summarizeText(search, 40)}` : '';

    if (!notes.length) {
        await msg.reply(tags.length || search
            ? `📝 Nenhuma anotação${label ? ` em${label}` : ''}${search ? ` com 🔎 ${summarizeText(search, 40)}` : ''}.`
            : '📝 Nenhuma anotação.\n💡 _Anote com /notes -a [#tag] <texto>_', undefined, WITHOUT_PREVIEW);
        return;
    }

    // One message per tag; the title (with the total) goes at the start of the first
    const partsAlt = groupPerTag(notes, await tagsDescriptions());
    partsAlt[0] = `📝 ANOTAÇÕES${label}${foundAlt2} (${notes.length})\n\n${partsAlt[0]}`;
    await deliverText(msg, destinations, partsAlt, `📝 Anotações${label}${foundAlt2}`, TIPS);
}

// -move: renames the tag in all notes (if the new one already exists, they merge)
async function moverTag(msg, textAlt) {
    const m = textAlt.trim().match(/^#([^\s#]+)\s+#([^\s#]+)$/);
    if (!m) {
        await msg.reply('❌ Use: /notes -move #tag #novatag');
        return;
    }

    const [de, para] = [readTag(m[1]), readTag(m[2])];
    if (de === para) {
        await msg.reply('❌ A tag nova é igual à atual.');
        return;
    }

    const r = await dbRun('UPDATE notes SET tag = ? WHERE tag = ?', [para, de]);
    if (!r.changes) {
        await msg.reply(`❌ #${de} não existe. Veja as tags com /notes -tags`);
        return;
    }
    // The description goes along (if the new one already had one, its own stays)
    await dbRun('INSERT OR IGNORE INTO note_tags (tag, description) SELECT ?, description FROM note_tags WHERE tag = ?', [para, de]);
    await dbRun('DELETE FROM note_tags WHERE tag = ?', [de]);

    await msg.reply(`🏷️ #${de} → #${para} · ${plural(r.changes, 'anotação', 'anotações')}`);
}

// -desc: tag description. "-d #tag text" saves, "-d #tag" shows, "-d #tag -rm" deletes
async function describeTag(msg, textAlt) {
    const m = textAlt.trim().match(/^#([^\s#]+)(?:\s+([\s\S]+))?$/);
    if (!m) {
        await msg.reply('❌ Use: /notes -desc #tag [<descrição>] (ou /notes -desc #tag -rm para apagar)');
        return;
    }

    const notes = await listNotes();
    const requested = readTag(m[1]);
    const foundAlt3 = resolverTags([requested], notes);
    const tag = foundAlt3.length === 1 ? foundAlt3[0] : requested; // partial only counts if it is a single tag
    const desc = (m[2] ?? '').trim();
    const current = (await dbGet('SELECT description FROM note_tags WHERE tag = ?', [tag]))?.description;

    if (!desc) {
        await msg.reply(current ? `🏷️ *#${tag}*\n${current}` : `🏷️ #${tag} não tem descrição.\n💡 _Crie com /notes -desc #${tag} <texto>_`,
            undefined, WITHOUT_PREVIEW);
        return;
    }

    if (/^-rm$/i.test(desc)) {
        if (!current) {
            await msg.reply(`❌ #${tag} não tem descrição.`);
            return;
        }
        await dbRun('DELETE FROM note_tags WHERE tag = ?', [tag]);
        await msg.reply(`🗑️ Descrição da #${tag} apagada.`);
        return;
    }

    await dbRun('INSERT INTO note_tags (tag, description) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET description = excluded.description',
        [tag, desc]);
    await msg.reply(`🏷️ *#${tag}* · ${current ? 'descrição trocada' : 'descrição salva'}`, undefined, WITHOUT_PREVIEW);
}

// -view: sends each note (the image with the text as the caption; without an image, just the text)
async function seeNotes(msg, filter) {
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(filter);
    if (!rest.trim()) {
        await msg.reply('❌ Use: /notes -view <id...|#tag...> [-to <destino>]...');
        return;
    }

    const allAlt = await listNotes();
    const partsAlt = rest.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const requestedAlt = partsAlt.filter(p => p.startsWith('#')).map(readTag);
    const tags = resolverTags(requestedAlt, allAlt);
    const ids = partsAlt.filter(p => !p.startsWith('#'));
    const missing = [...ids.filter(i => !/^\d+$/.test(i) || !allAlt.some(n => n.id === Number(i))),
        ...requestedAlt.filter(t => !resolverTags([t], allAlt).some(x => allAlt.some(n => n.tag === x))).map(t => `#${t}`)];
    if (missing.length) {
        await msg.reply(`❌ ${missing.join(', ')} não ${missing.length > 1 ? 'existem' : 'existe'}. Veja a lista com /notes -l`);
        return;
    }

    const targets = allAlt.filter(n => ids.map(Number).includes(n.id) || tags.includes(n.tag));
    const destinations = await sendingDestinations(msg, destinationsText, withDestination);
    if (destinations === null) return;

    const header = (n) => [`📝 *#${n.id}*`, n.tag && `#${n.tag}`, `_${formatData(n.created_at)}_`].filter(Boolean).join(' · ');
    const failures = [];

    for (const n of targets) {
        const textAlt = [header(n), n.text].filter(Boolean).join('\n');
        let media = null;
        if (n.media_path) {
            media = await Promise.resolve().then(() => MessageMedia.fromFilePath(n.media_path)).catch(() => null);
            if (!media) failures.push(`#${n.id}: arquivo da imagem não encontrado`);
        }

        if (!destinations) {
            if (media) await msg.reply(media, undefined, { caption: textAlt });
            else await msg.reply(textAlt, undefined, WITHOUT_PREVIEW);
            continue;
        }

        for (const d of destinations.filter(x => x.id)) {
            await (media ? client.sendMessage(d.id, media, { caption: textAlt }) : client.sendMessage(d.id, textAlt, WITHOUT_PREVIEW))
                .catch(err => failures.push(`${describeDestinations([d])}: ${err.message}`));
        }
        const emails = [...new Set(destinations.filter(d => d.email).flatMap(d => d.email.split(/\s*,\s*/)))];
        if (emails.length) {
            await sendEmail({
                para: emails, assunto: `📝 Anotação #${n.id}`, texto: textAlt.replace(/[*_]/g, ''),
                anexos: media ? [{ filename: path.basename(n.media_path), path: n.media_path, contentType: n.media_mime }] : []
            }).catch(err => failures.push(`e-mail: ${err.message}`));
        }
    }

    if (destinations && targets.length && !failures.length) {
        await msg.reply(`📝 ${plural(targets.length, 'anotação enviada', 'anotações enviadas')} em ${describeDestinations(destinations)}.`);
    }
    if (failures.length) await msg.reply(`❌ ${failures.join('; ')}`);
}

// -tags: each tag with its number of notes (the untagged last)
async function listTags(msg, filter = '') {
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(filter);
    if (rest.trim()) {
        await msg.reply('❌ Use: /notes -tags [-to <destino>]...');
        return;
    }

    const destinations = await sendingDestinations(msg, destinationsText, withDestination);
    if (destinations === null) return;

    const notes = await listNotes();
    if (!notes.length) {
        await msg.reply('📝 Nenhuma anotação.\n💡 _Anote com /notes -a [#tag] <texto>_');
        return;
    }

    const count = new Map();
    for (const n of notes) count.set(n.tag ?? '', (count.get(n.tag ?? '') ?? 0) + 1);
    const keys = [...count.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const descriptions = await tagsDescriptions();
    const linesAlt = keys.map(k => `${k ? `#${k}` : WITHOUT_TAG}: ${count.get(k)}${descriptions.has(k) ? ` · ${descriptions.get(k)}` : ''}`);

    await deliverText(msg, destinations,
        `🏷️ TAGS (${keys.filter(Boolean).length})\n\n${linesAlt.join('\n')}\n\n📝 ${plural(notes.length, 'anotação', 'anotações')}`,
        '🏷️ Tags das anotações', '\n\n💡 _/notes #tag lista as anotações de uma tag_');
}

// 20261027_1530, in Brasília time (the same as formatData)
function fileStamp(ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(ms).map(x => [x.type, x.value]));
    return `${p.year}${p.month}${p.day}_${p.hour}${p.minute}`;
}

// The note image as an RGB JPEG on a white background, at the size the PDF uses
async function imageForPdf(fileAlt) {
    try {
        const { data, info } = await sharp(fileAlt).rotate().resize({ width: 900, withoutEnlargement: true })
            .flatten({ background: '#ffffff' }).toColourspace('srgb').jpeg({ quality: 80 })
            .toBuffer({ resolveWithObject: true });
        return { jpeg: data, largura: info.width, altura: info.height };
    } catch (err) {
        printError('/notes: imagem fora do PDF:', err.message);
        return null;
    }
}

async function exportar(msg, filter = '') {
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(filter);
    let tags = rest.trim() ? soTags(rest) : [];
    if (!tags) {
        await msg.reply('❌ Use: /notes -export [#tag...] [-to <destino>]...');
        return;
    }

    const destinations = await sendingDestinations(msg, destinationsText, withDestination);
    if (destinations === null) return;

    const allAlt = await listNotes();
    tags = resolverTags(tags, allAlt);
    const notes = tags.length ? allAlt.filter(n => tags.includes(n.tag)) : allAlt;
    if (!notes.length) {
        await msg.reply(tags.length ? `📝 Nenhuma anotação em ${tags.map(t => `#${t}`).join(' ')}.` : '📝 Nenhuma anotação.');
        return;
    }

    const nowAlt = Date.now();
    const label = tags.length ? ` ${tags.map(t => `#${t}`).join(' ')}` : '';
    const groups = new Map();
    for (const n of notes) groups.set(n.tag ?? '', [...(groups.get(n.tag ?? '') ?? []), n]);
    const keys = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));

    const blocks = [{
        tipo: 'texto',
        texto: `${plural(notes.length, 'anotação', 'anotações')}${label ? ` em${label}` : ''}`
    }];

    // The description of the PDF tags (those that have one) comes right at the start of the document
    const descriptions = await tagsDescriptions();
    const withDescription = keys.filter(k => k && descriptions.has(k));
    if (withDescription.length) {
        blocks.push({ tipo: 'espaco', altura: 6 });
        for (const k of withDescription) blocks.push({ tipo: 'texto', texto: `#${k}: ${descriptions.get(k)}` });
    }

    for (const k of keys) {
        const items = groups.get(k);
        if (!(keys.length === 1 && k === '')) {
            blocks.push({ tipo: 'titulo', texto: `${k ? `#${k}` : WITHOUT_TAG} (${items.length})` });
        }
        for (const n of items) {
            // The image comes on top and the note text is the caption
            const image = n.media_path ? await imageForPdf(n.media_path) : null;
            if (image) blocks.push({ tipo: 'imagem', ...image });
            const alert = (n.media_path && !image ? ' · imagem não incluída' : '') + (n.alert_at ? ` · alerta ${fmtWhen(n.alert_at)}` : '');
            blocks.push({ tipo: 'texto', texto: `#${n.id}  ${n.text.replace(MARK_REPLY, '[resp.]')}`, recuo: 0 });
            blocks.push({ tipo: 'meta', texto: `Anotada em ${formatData(n.created_at)}${alert}` });
            blocks.push({ tipo: 'espaco', altura: 8 });
        }
    }

    const pdf = generatePdf({
        titulo: `ZapBot · Anotações${label}`,
        direita: formatData(nowAlt),
        rodape: `ZapBot ${packageJson.version} · ${os.hostname()} · gerado em ${formatData(nowAlt)}`,
        blocos: blocks
    });
    const suffix = tags.length ? `tag-${tags.map(t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/gi, '_')).join('-')}_` : '';
    const nameAlt = `ZapBot_notes_${suffix}${fileStamp(nowAlt)}.pdf`;

    const caption = `📝 *ANOTAÇÕES${label}* (${notes.length}) em PDF`;
    const media = new MessageMedia('application/pdf', pdf.toString('base64'), nameAlt);

    if (!destinations) {
        await msg.reply(media, undefined, { sendMediaAsDocument: true, caption });
        return;
    }

    // The emails of all the -to in a single email; the chats, one by one (one that fails does not hold up the others)
    const emails = [...new Set(destinations.filter(d => d.email).flatMap(d => d.email.split(/\s*,\s*/)))];
    const failures = [];
    const sentAlt3 = [];

    if (emails.length) {
        await sendEmail({
            para: emails, assunto: `📝 Anotações${label}`, texto: caption.replace(/\*/g, ''),
            anexos: [{ filename: nameAlt, content: pdf, contentType: 'application/pdf' }]
        }).then(() => sentAlt3.push(...destinations.filter(d => d.email)))
            .catch(err => failures.push(`e-mail: ${err.message}`));
    }
    for (const d of destinations.filter(x => x.id)) {
        await client.sendMessage(d.id, media, { sendMediaAsDocument: true, caption })
            .then(() => sentAlt3.push(d))
            .catch(err => failures.push(`${describeDestinations([d])}: ${err.message}`));
    }

    if (sentAlt3.length) await msg.reply(`📝 PDF das anotações enviado em ${describeDestinations(sentAlt3)}.`);
    if (failures.length) await msg.reply(`❌ Não consegui enviar o PDF: ${failures.join('; ')}`);
}

async function cmdNote({ msg, args, quotedMsg }) {
    await dbReady;
    const textAlt = String(args ?? '').trim();
    const [optionAlt = '', ...words] = textAlt.split(/\s+/);
    const rest = textAlt.slice(optionAlt.length).trim();
    const nameAlt = optionAlt.toLowerCase();

    // The -to of the lists/PDF: "/notes -to X", "/notes #casa -to X", "-l ... -to X", "-e ... -to X"
    const { informado: withDestination, resto: withoutDestination } = extractDestinations(textAlt);
    const textTags = soTags(withoutDestination);

    if (!textAlt) return quotedMsg || msg.hasMedia ? addAlt(msg, '', quotedMsg) : listTags(msg);
    if (nameAlt === '-list' || nameAlt === '-l') return listAlt(msg, rest);
    if (nameAlt === '-update' || nameAlt === '-u') return update(msg, rest, quotedMsg);
    if (nameAlt === '-search' || nameAlt === '-s') return listAlt(msg, rest, true);
    if (nameAlt === '-tags' || nameAlt === '-t') return listTags(msg, rest);
    if (nameAlt === '-view' || nameAlt === '-v') return seeNotes(msg, rest);
    if (nameAlt === '-desc' || nameAlt === '-d') return describeTag(msg, rest);
    if (nameAlt === '-move' || nameAlt === '-m') return moverTag(msg, rest);
    if (nameAlt === '-export' || nameAlt === '-e') return exportar(msg, rest);
    if (withDestination && !withoutDestination.trim()) return listAlt(msg, textAlt);
    // Replying to a message, "/notes #tag" saves its text under that tag instead of filtering
    if (textTags) return (quotedMsg || msg.hasMedia) && textTags.length === 1 ? addAlt(msg, textAlt, quotedMsg) : listAlt(msg, textAlt);
    if (nameAlt === '-add' || nameAlt === '-a') return addAlt(msg, rest, quotedMsg);
    if (withDestination && (nameAlt === '-rm' || nameAlt === '-rm' || nameAlt === '-r')) {
        return msg.reply('❌ O -to não vale ao remover. Ele serve para -list, #tag e -export (e, no -add, para o -alerta).');
    }
    if (nameAlt === '-rm' || nameAlt === '-rm' || nameAlt === '-r') return removeNotes(msg, words.join(' '), false);
    if (nameAlt === '-alerta') return alertAlt(msg, rest);

    // An option that does not exist: error. Without a "-" in front, the whole text is a new note (the same as -add)
    if (nameAlt.startsWith('-')) {
        return msg.reply('❌ Use: /notes [-list] [#tag] [-to ...] | -search <texto|/regex/> | -tags | -view <id...|#tag...> | -move #tag #nova | -desc #tag <texto> | -update <id> <texto> | -export [#tag] [-to ...] | -add [#tag] <texto> [-alerta <quando>] | -rm <id...|#tag...|all> | -alerta ...');
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
                { assunto: `🔔 Anotação #${n.id}: ${summarizeText(n.text, 60)}`, opcoes: WITHOUT_PREVIEW }
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
