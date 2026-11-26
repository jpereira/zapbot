/*
 * /notes: notes (notes table) and -alert, which reminds of a note at a date/time.
 */

const { loopGuard } = require('./util/loopGuard');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
const { MessageMedia } = require('whatsapp-web.js');
const { client } = require('./client');
const { NOTES_DIR } = require('./constants');
const { state: stateAlt } = require('./state');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, sendToDestinations, extractDestinations,
    recipientsDe, resolveDestinations
} = require('./destinations');
const { sendEmail } = require('./email');
const { printError, printInfo } = require('./log');
const { unescape, formatData, toMillis, summarizeText } = require('./util/format');
const { language, t } = require('./i18n');
const { generatePdf } = require('./util/pdf');
const lock = require('./notesLock');
const { extractPassword, normalizeLock } = require('./util/lockPassword');
const { matchingRows } = require('./util/regexRunner');
const { compileSearch } = require('./watch/rules');
const { fmtWhen, readWhen } = require('./util/when');
const packageJson = require('../package.json');

/*
 * /notes
 * /notes | -list | -l [#tag...]       → lists the notes, with the ID, grouped by #tag
 * /notes #tag                         → only those of that tag (the same as -l #tag)
 *   -search | -s [#tag...] <text|/regex/flags>
 * → only those that match (text case and accent insensitive;
 * the same -q as /show and /watch); also matches the #tag
 * -update | -u <id> [#tag] <text>    → replaces the text (and the tag, if one comes) of the note
 * -move | -m #tag #new               → renames the tag (if #new already exists, merges the two)
 * -desc | -d #tag [<text>]           → tag description (without text, shows it; -d #tag -rm, deletes it)
 * -view | -v <id...|#tag...> [-to ...] → shows the note with the image (text, if it has none)
 * -export | -e [#tag...]              → sends the notes (or only those of the tags) in a PDF, with the images
 *   -list | #tag | -export ... -to <destination>...
 * → the list (or the PDF) goes to the destinations, as in the other commands
 * /notes #tag <text>                 → notes (the same as -add, when it does not start with "-"); the #tag is required
 * (with an image, or in reply to one) /notes #tag [<text>] → saves the media in NOTES_DIR
 * (in reply to a message) /notes #tag | -add #tag [-alert ...]
 * → saves the replied message's text, with the ↩️ in front
 *   -add | -a #tag <text>            → anota
 * -add <text> -alert <when> [-to <destination>]...
 * → saves the note and notifies at the date/time (-to works as in the other -alert)
 * -rm | -r <id...|#tag...|all>       → removes (-r 1 2 3, -r 1,2,3, -r #casa or all). With a #tag, the numbers are
 *                                     the positions in that tag's list (-r #casa 1 = the 1st of #casa);
 *                                     a whole tag or all asks for -yes (-r #casa -yes)
 * -alert                             → lists only the notes with an alert
 * -alert <id|#tag...> <when> [-to ...]
 * → sets (or swaps) the alert of a note (or of all those in the tag)
 * -alert #tag...                     → lists only the alerts of those tags
 * -alert -rm <id...|#tag...|all>     → removes the alert, keeping the note
 * The alert fires ONCE, right away; the note stays. Owner only (role owner).
 */
const MAX_DAYS = 365;
const ALERT = /(^|\s)-alert(?=\s|$)([\s\S]*)$/;

const noteDestinations = (n) => destinationsSaved(n.recipients, lineDestination(n));
const noticeWhere = (destinations) => (destinations.length ? describeDestinations(destinations) : t('notes.yourPrivate'));
// Plural by n === 1 (pt's Intl treats 0 as singular): {count} is the number shown
const countAlt = (keyAlt, n, vars = {}) => t(keyAlt, { ...vars, n: n === 1 ? 1 : 2, count: n });
const indent = (textAlt) => textAlt.replace(/\n(?=[^\n])/g, '\n   ');

// The notes as the code sees them: those of a protected tag decrypted (unlocked) or just the lock (locked), see notesLock
const listNotes = async () => {
    await lock.refresh();
    return (await dbAll('SELECT * FROM notes ORDER BY id')).map(lock.open);
};

const withoutTag = () => t('notes.noTag');
const WITHOUT_PREVIEW = { linkPreview: false };  // lists do not show a link thumbnail
const readTag = (t) => t.replace(/^#/, '').toLowerCase();

// "#casa Lembrar do pão" → { tag: 'casa', text: 'Lembrar do pão' } (the tag only counts at the start)
function separateTag(textAlt) {
    const m = textAlt.match(/^#([^\s#]+)(?:\s+([\s\S]*))?$/);
    return m ? { tag: readTag(m[1]), text: (m[2] ?? '').trim() } : { tag: null, text: textAlt };
}

// A partial tag works: #idei finds #ideias (the exact one wins; otherwise starts with; otherwise contains).
// Only to read (list, search, PDF): removing and alerting ask for the whole tag
function resolveTags(tags, notes) {
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

/*
 * The note text in parts: the title (the first line), the rest and the links. Every link
 * http(s) leaves where it was (and the dangling "Leia mais em:") and goes to the end.
 */
function textParts(textAlt) {
    const links = [];
    const linesAlt = String(textAlt ?? '').split('\n').map(line => {
        if (!/https?:\/\//i.test(line)) return line.trimEnd();
        const without = line.replace(/\(?(https?:\/\/\S+)/gi, (_, foundAlt2) => {
            let url = foundAlt2;
            // Punctuation stuck to the end is not part of the link (the ")" is, if a "(" opened in the URL itself)
            while (/[.,;:!?)”"'’]$/.test(url) && !(url.endsWith(')') && url.includes('('))) url = url.slice(0, -1);
            links.push(url);
            return '';
        });
        return without.replace(/\s*(?:[-–—.…]+\s*)*(?:veja mais|leia mais|leia a mat[eé]ria completa)[^\n]*$/i, '')
            .replace(/[\s:]+$/, '').replace(/ {2,}/g, ' ');
    });
    const body = linesAlt.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const [title = '', ...rest] = body.split('\n');
    return {
        // A *bold* that already came in the text does not double
        title: title.trim().replace(/^\*(.+)\*$/, '$1'),
        body: rest.join('\n').trim(),
        links: [...new Set(links)]
    };
}

/*
 * The first line becomes the bold title (the only one), the rest comes as it was and the links
 * stay at the end, under "🔗 Links". plain: without the *bold* (``` block and email).
 */
function formatText(textAlt, plan = false) {
    const { title, body, links } = textParts(textAlt);
    return [title && (plan ? title : `*${title}*`), body, links.length && `🔗 Links\n${links.map(l => `• ${l}`).join('\n')}`]
        .filter(Boolean).join('\n\n');
}

// 10:30 04/11/2026 (time, then day/month/year, without the seconds)
function dateShort(valueAlt) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(toMillis(valueAlt)).map(x => [x.type, x.value]));
    const day = language() === 'pt_BR' ? `${p.day}/${p.month}/${p.year}` : `${p.month}/${p.day}/${p.year}`;
    return `${p.hour}:${p.minute} ${day}`;
}

function noteLine(n, plan = false, position = 0) {
    const alert = n.alert_at
        ? `\n   ⏰ ${fmtWhen(n.alert_at)} → ${noticeWhere(noteDestinations(n))}`
        : '';
    const body = [formatText(n.text, plan), n.media_path && mediaLabel(n, plan)].filter(Boolean).join('\n');
    // plain: inside the ``` block the *bold* and _italic_ appear as they are
    // With position (list): "1. ..." at the start and the id in the footer, "🕐 date, #id"
    const marker = position ? `${position}.` : `#${n.id}`;
    const end = position ? `${dateShort(n.created_at)}, #${n.id}` : dateShort(n.created_at);
    return plan ? `${marker} ${indent(body)}${alert}\n   🕐 ${end}`
        : `${marker} ${body}${alert.replace(/\n {3}/, '\n')}\n🕐 _${end}_`;
}

// "1 4 #tag", "1,2,5 #tag" or "#tag 1 4": positions in that tag's list (1 = the first of /notes #tag). null: another
// shape (only one #tag, and numbers). bad: the positions out of the list
function readPositions(textAlt, notes) {
    const partsAlt = textAlt.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const tags = partsAlt.filter(p => p.startsWith('#'));
    const numbers = partsAlt.filter(p => !p.startsWith('#'));
    if (tags.length !== 1 || !numbers.length || !numbers.every(p => /^\d+$/.test(p))) return null;
    const found = resolveTags([readTag(tags[0])], notes);
    const tag = found.length === 1 ? found[0] : readTag(tags[0]);
    const inTag = notes.filter(n => n.tag === tag);
    const positions = [...new Set(numbers.map(Number))].sort((a, b) => a - b);
    const bad = positions.filter(p => p < 1 || p > inTag.length);
    return { tag, total: inTag.length, bad, picked: bad.length ? [] : positions.map(p => ({ note: inTag[p - 1], position: p })) };
}

// The ids of -rm / -alert -rm: 1 2 3, 1,2,3 or all. Does any not exist? None is touched.
// With a #tag, the numbers are positions in that tag's list (-rm #casa 1 or -rm 1 #casa: the 1st of #casa)
function readIds(textAlt, notes) {
    const partsAlt = textAlt.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (partsAlt.includes('all')) return { all: true, ids: notes.map(n => n.id) };

    const tags = partsAlt.filter(p => p.startsWith('#')).map(readTag);
    const other = [...new Set(partsAlt.filter(p => !p.startsWith('#')))].sort((a, b) => a - b);
    if (tags.length && other.length) {
        if (new Set(tags).size > 1) return { ids: [], missing: [], manyTags: true };
        const inTag = notes.filter(n => n.tag === tags[0]);
        if (!inTag.length) return { ids: [], missing: [`#${tags[0]}`] };
        const bad = other.filter(i => !/^\d+$/.test(i) || Number(i) < 1 || Number(i) > inTag.length);
        return {
            ids: bad.length ? [] : [...new Set(other.map(i => inTag[Number(i) - 1].id))].sort((a, b) => a - b),
            missing: [], missingPositions: bad.map(i => `${i} (#${tags[0]}: ${inTag.length})`), tag: tags[0]
        };
    }
    const missing = [
        ...tags.filter(t => !notes.some(n => n.tag === t)).map(t => `#${t}`),
        ...other.filter(i => !/^\d+$/.test(i) || !notes.some(n => n.id === Number(i)))
    ];
    const ids = new Set([...other.filter(i => /^\d+$/.test(i)).map(Number),
        ...notes.filter(n => tags.includes(n.tag)).map(n => n.id)]);
    return { ids: [...ids].sort((a, b) => a - b), missing };
}

async function removeNotes(msg, textIdsTyped, soAlert) {
    const notes = await listNotes();
    // -yes (-y) confirms the removal of a whole tag or of all of them
    const yes = /(^|\s)-(?:yes|y)(?=\s|$)/i.test(textIdsTyped);
    const textIds = textIdsTyped.replace(/(^|\s)-(?:yes|y)(?=\s|$)/gi, ' ').trim();
    const { ids, missing, all: allAlt2, manyTags, missingPositions } = readIds(textIds, notes);
    const cmd = soAlert ? '/notes -alert -rm' : '/notes -rm';

    if (manyTags) {
        await msg.reply(t('notes.rm.manyTags'));
        return;
    }
    if (missingPositions?.length) {
        await msg.reply(t('notes.rm.missingPos', { list: missingPositions.join(', '), cmd }));
        return;
    }

    if (!allAlt2 && (!ids.length || missing.length)) {
        const label = missing?.every(f => !f.startsWith('#')) ? 'ID' : '';
        await msg.reply(missing?.length > 1
            ? t('notes.rm.missingMany', { what: label ? t('notes.idsLabel', { list: missing.join(', ') }) : missing.join(', ') })
            : t('notes.rm.missingOne', { what: label ? t('notes.idLabel', { id: missing?.[0] ?? '?' }) : (missing?.[0] ?? '?'), cmd }));
        return;
    }

    // All of them or a whole tag (#tag with no position): only with -yes, saying how many would go
    const wholeTag = !soAlert && !allAlt2 && /(^|[\s,])#/.test(textIds) && !/(^|[\s,])\d/.test(textIds);
    if (!soAlert && (allAlt2 || wholeTag) && !yes) {
        await msg.reply(countAlt('notes.rm.confirm', ids.length, { what: allAlt2 ? t('notes.rm.whatAll') : textIds.trim(), cmd: `${cmd} ${textIds} -yes` }));
        return;
    }

    const targets = notes.filter(n => ids.includes(n.id) && (!soAlert || n.alert_at));
    const locked = targets.find(n => n.locked);
    if (locked) {
        await msg.reply(lock.lockedNotice(locked.tag));
        return;
    }

    if (soAlert) {
        const withAlert = targets;
        for (const n of withAlert) await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);
        await msg.reply(countAlt('notes.rm.alertsRemoved', withAlert.length));
        return;
    }

    for (const n of targets) {
        await dbRun('DELETE FROM notes WHERE id = ?', [n.id]);
        if (n.media_file) await fs.remove(n.media_file).catch(err => printError('/notes: image not deleted:', err.message));
        if (n.plain) await fs.remove(n.media_path).catch(() => {});
    }
    await msg.reply(countAlt('notes.rm.removed', ids.length));
}

// whole "<when>" (with no leftover) → ms, or the error to reply with
function alertReadData(textAlt) {
    const words = textAlt.split(/\s+/).filter(Boolean);
    const q = words.length ? readWhen(words) : null;
    const nowAlt = Date.now();

    if (!q || q.used !== words.length) {
        return { error: t('notes.when.invalid', { text: textAlt }) };
    }
    if (q.ms <= nowAlt) return { error: t('notes.when.past', { when: fmtWhen(q.ms) }) };
    if (q.ms > nowAlt + MAX_DAYS * 86400_000) return { error: t('notes.when.tooFar', { days: MAX_DAYS }) };
    return { ms: q.ms };
}

async function commandDestinations(msg, destinationsText, withDestination) {
    if (!withDestination) return [];
    return resolveDestinations(msg, destinationsText, { acceptsEmail: true });
}

const MARK_REPLY = '↩️';

// The first 35 characters (on a single line), with … if there was more
function textStart(textAlt) {
    const t = textAlt.replace(/\s+/g, ' ').trim();
    return t.length > 35 ? `${t.slice(0, 35).trimEnd()}…` : t;
}
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// Any media of the message itself or, in reply, the replied message's
const mediaOrigin = (msg, quotedMsg) => [msg, quotedMsg].find(m => m?.hasMedia);

const isImage = (mime) => String(mime ?? '').startsWith('image/');

// The stored file is "<time>_<draw>_<name>": the original name comes back on send
const nameOriginal = (fileAlt) => path.basename(fileAlt).replace(/\.enc$/, '').replace(/^\d+_[a-z0-9]+_/, '');

// 🖼️ image, 🎬 video, 🎵 audio or 📎 file name (document and the rest)
function mediaLabel(n, plan = false) {
    const mime = String(n.media_mime ?? '');
    const italic = (t) => (plan ? t : `_${t}_`);
    if (isImage(mime)) return `🖼️ ${italic(t('notes.media.image'))}`;
    if (mime.startsWith('video/')) return `🎬 ${italic(t('notes.media.video'))}`;
    if (mime.startsWith('audio/')) return `🎵 ${italic(t('notes.media.audio'))}`;
    return `📎 ${italic(nameOriginal(n.media_path))}`;
}

// Downloads and stores the media in NOTES_DIR: { path, mime }, or { error } to reply with
async function saveMedia(origin) {
    const media = await origin.downloadMedia().catch(() => null);
    if (!media?.data) return { error: t('notes.media.downloadFail') };

    const mime = String(media.mimetype ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
    // The document name, if it came (without a path and without odd characters); otherwise, "file.<ext>"
    const ext = EXTENSIONS[mime] ?? ((mime.split('/')[1] ?? '').replace(/[^a-z0-9]/g, '') || 'bin');
    const nameAlt = path.basename(String(media.filename ?? '')).replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
    const fileAlt = path.join(NOTES_DIR,
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${nameAlt || `arquivo.${ext}`}`);
    await fs.outputFile(fileAlt, Buffer.from(media.data, 'base64'));
    return { path: fileAlt, mime };
}

// a typed "\n" becomes a line break ("\\n" stays as text)
const withBreaks = (t) => t.replace(/(?<!\\)\\n/g, '\n').replace(/\\\\n/g, '\\n');

async function addAlt(msg, textTyped, quotedMsg) {
    const rest = withBreaks(textTyped);
    const { destinations: destinationsText, given: withDestination, rest: withoutDestination } = extractDestinations(rest);
    const m = withoutDestination.match(ALERT);
    const separated = separateTag((m ? withoutDestination.slice(0, m.index) : withoutDestination).trim());
    const { tag } = separated;
    let textAlt = unescape(separated.text);

    // "/notes #stash -rm 2": an option after the tag is not a note (it would save "-rm 2"); the options come first
    if (tag && /^-(?:rm|r|list|l|compact|c|search|s|update|u|view|v|move|m|desc|d|export|e|add|a|yes|y)(?=\s|$)/i.test(textAlt.trim())) {
        await msg.reply(t('notes.add.optionAfterTag', { option: textAlt.trim().split(/\s+/)[0], tag }));
        return;
    }

    // The syntax is always /notes #tag <text>: without a tag it does not save
    if (!tag) {
        await msg.reply(`${t('notes.add.syntax')}\n${t('notes.add.missingTag')}`, undefined, WITHOUT_PREVIEW);
        return;
    }

    // Without text, but replying to a message: saves its text (if any; the media counts alone)
    const origin = mediaOrigin(msg, quotedMsg);
    const typedAlong = Boolean(textAlt);
    if (!textAlt && quotedMsg) {
        const quoted = String(quotedMsg.body ?? '').trim();
        if (!quoted && !origin) {
            await msg.reply(t('notes.add.quotedNoText'));
            return;
        }
        if (quoted) textAlt = `${MARK_REPLY} ${quoted}`;
    }

    // Text typed along with a reply: it comes first and the replied message follows, with ↩️ (its media is saved too)
    if (typedAlong && quotedMsg) {
        const quoted = String(quotedMsg.body ?? '').trim();
        if (quoted) textAlt = `${textAlt}\n\n${MARK_REPLY} ${quoted}`;
    }

    if (!textAlt && !origin) {
        await msg.reply(t('notes.add.noText'), undefined, WITHOUT_PREVIEW);
        return;
    }

    // A protected tag only takes notes while unlocked (/notes -lock #tag); what is saved goes encrypted
    await lock.refresh();
    const protectedTag = lock.isProtected(tag.toLowerCase());
    const ownerCapture = msg.fromMe && quotedMsg && origin !== msg && !typedAlong && !m && !withDestination;
    if (protectedTag && !(lock.isUnlocked(tag.toLowerCase()) && (lock.allowedHere() || ownerCapture))) {
        await lock.purgeCopies(msg, `/notes #${tag} ***`);
        await msg.reply(lock.lockedNotice(tag.toLowerCase()));
        return 'locked';
    }

    if (withDestination && !m) {
        await msg.reply(t('notes.add.toNeedsAlert'));
        return;
    }

    let alert = null;
    let destinations = [];

    if (m) {
        const when = alertReadData(m[2].trim());
        if (when.error) {
            await msg.reply(when.error);
            return;
        }
        alert = when.ms;
        destinations = await commandDestinations(msg, destinationsText, withDestination);
        if (!destinations) return;
    }

    let image = null;
    if (origin) {
        image = await saveMedia(origin);
        if (image.error) {
            await msg.reply(image.error);
            return;
        }
    }

    if (protectedTag && image) image.path = await lock.sealFile(tag.toLowerCase(), image.path);
    const c = destinationColumns(destinations[0]);
    const r = await dbRun(
        `INSERT INTO notes (text, tag, media_path, media_mime, created_at, alert_at, dest_id, dest_name, dest_is_group,
                            dest_email, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [protectedTag ? lock.sealText(tag.toLowerCase(), textAlt) : textAlt, tag, image?.path ?? null, image?.mime ?? null, Date.now(), alert, c.dest_id, c.dest_name,
            c.dest_is_group, c.dest_email, recipientsDe(destinations)]
    );

    // What you sent stays out of the history (the command and the media that came with it)
    if (protectedTag) await lock.purgeCopies(msg, `/notes #${tag} ***`);

    // Only the notice that it saved (no., #tag, the start of the text): you already sent the body
    const summary = [`📝 *#${r.lastID}*`, tag && `#${tag}`, image && mediaLabel({ media_mime: image.mime, media_path: image.path }, true).split(' ')[0], textAlt && (protectedTag ? '🔒' : textStart(textAlt))]
        .filter(Boolean).join(' · ');
    await msg.reply(summary + (alert ? `\n⏰ ${fmtWhen(alert)} → ${noticeWhere(destinations)}` : ''),
        undefined, WITHOUT_PREVIEW);
    return 'added';
}

async function update(msg, rest, quotedMsg) {
    const m = rest.match(/^#?(\d+)(?:\s+([\s\S]*))?$/);
    if (!m) {
        await msg.reply(t('notes.update.usage'));
        return;
    }

    await lock.refresh();
    const found = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
    const note = lock.open(found);
    if (!note) {
        await msg.reply(t('notes.idNotFound', { id: m[1] }));
        return;
    }

    let { tag, text: textAlt } = separateTag(withBreaks(m[2] ?? '').trim());
    textAlt = unescape(textAlt);
    if (!textAlt && quotedMsg?.body?.trim()) textAlt = `${MARK_REPLY} ${quotedMsg.body.trim()}`;
    if (!textAlt) {
        await msg.reply(t('notes.update.usage'));
        return;
    }

    tag ??= note.tag;
    // The note of a protected tag stays in it (the key is of the tag) and needs it unlocked; nothing goes into one
    const toProtected = lock.isProtected(String(tag ?? '').toLowerCase());
    const moves = String(tag ?? '').toLowerCase() !== String(note.tag ?? '').toLowerCase();
    if (note.locked || (moves && (toProtected || lock.isProtected(note.tag)))) {
        await lock.purgeCopies(msg, `/notes -u ${note.id} ***`);
        await msg.reply(note.locked ? lock.lockedNotice(note.tag) : t('notes.lock.noMoveTag', { tag: note.tag ?? tag }));
        return;
    }
    await dbRun('UPDATE notes SET text = ?, tag = ? WHERE id = ?',
        [toProtected ? lock.sealText(String(tag).toLowerCase(), textAlt) : textAlt, tag, note.id]);
    if (toProtected) await lock.purgeCopies(msg, `/notes -u ${note.id} ***`);
    await msg.reply(`✏️ *#${note.id}*${tag ? ` · #${tag}` : ''} · ${toProtected ? '🔒' : textStart(textAlt)}`, undefined, WITHOUT_PREVIEW);
}

async function alertAlt(msg, rest) {
    const { destinations: destinationsText, given: withDestination, rest: withoutDestination } = extractDestinations(rest);
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
            await msg.reply(t('notes.alert.toOnlyCreate'));
            return;
        }
        const allNotes = await listNotes();
        const tagsFound = resolveTags(tags, allNotes);
        const withAlert = allNotes.filter(n => n.alert_at && (!tags.length || tagsFound.includes(n.tag)));
        const label = tags.length ? ` ${tagsFound.map(t => `#${t}`).join(' ')}` : '';
        if (!withAlert.length) {
            await msg.reply(`${label ? t('notes.alert.noneIn', { tags: label }) : t('notes.alert.none')}\n${t('notes.alert.createHint')}`,
                undefined, WITHOUT_PREVIEW);
            return;
        }
        // Each note in its own message (1/N), with the alert on top
        for (const [i, n] of withAlert.entries()) {
            const head = [`🔔 *${i + 1}/${withAlert.length}*`, n.tag && `#${n.tag}`, `#${n.id}`].filter(Boolean).join(' · ');
            const alertLine = `⏰ ${fmtWhen(n.alert_at)} → ${noticeWhere(noteDestinations(n))}`;
            await msg.reply([head, alertLine, n.text && formatText(n.text), n.media_path && mediaLabel(n)].filter(Boolean).join('\n'),
                undefined, WITHOUT_PREVIEW);
        }
        return;
    }

    const m = byTag ? null : textAlt.match(/^(\d+)\s+([\s\S]+)$/);
    if (!byTag && !m) {
        await msg.reply(t('notes.alert.usage'));
        return;
    }

    let targets;
    if (byTag) {
        const allAlt = await listNotes();
        const withoutNotes = tags.filter(t => !allAlt.some(n => n.tag === t));
        if (withoutNotes.length) {
            await msg.reply(t('notes.alert.noNotesInTags', { tags: withoutNotes.map(x => `#${x}`).join(' ') }));
            return;
        }
        targets = allAlt.filter(n => tags.includes(n.tag));
    } else {
        const note = lock.open(await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]));
        if (!note) {
            await msg.reply(t('notes.idNotFound', { id: m[1] }));
            return;
        }
        targets = [note];
    }

    const when = alertReadData((byTag ? whenText : m[2]).trim());
    if (when.error) {
        await msg.reply(when.error);
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
        ? t('notes.alert.createdOne', { id: targets[0].id, text: summarizeText(targets[0].text, 80), where: whereAlt })
        : t('notes.alert.createdMany', { notes: countAlt('notes.countNotes', targets.length), tags: tags.map(x => `#${x}`).join(' '),
            ids: targets.map(n => `#${n.id}`).join(', '), where: whereAlt }),
    undefined, WITHOUT_PREVIEW);
}

// Groups by tag (alphabetical order), with the untagged last
const tagsDescriptions = async () => new Map((await dbAll('SELECT tag, description FROM note_tags'))
    .map(r => [r.tag, r.description]));

// How many have 🖼️ media, ⏰ alert and 🔗 link: "· 🖼️ 2 · ⏰ 1 · 🔗 98" (only what has)
function notesSummary(notes) {
    const account = [['🖼️', n => n.media_path], ['⏰', n => n.alert_at], ['🔗', n => textParts(n.text).links.length]]
        .map(([iconAlt, has]) => [iconAlt, notes.filter(has).length]).filter(([, qty]) => qty);
    return account.map(([iconAlt, qty]) => ` · ${iconAlt} ${qty}`).join('');
}

// One line per note, per day: "#5 Title 🔗 · 19:15" (the media, the alert and the links become icons)
function linesCompact(notes) {
    const outputAlt = [];
    let dayCurrent = '';
    for (const n of notes) {
        const [hour, data] = dateShort(n.created_at).split(' ');
        if (data !== dayCurrent) {
            dayCurrent = data;
            outputAlt.push(`${outputAlt.length ? '\n' : ''}📆 ${data}`);
        }
        const { title, links } = textParts(n.text);
        const base = title || links[0]?.replace(/^https?:\/\/(www\.)?/, '') || (n.media_path ? mediaLabel(n, true).replace(/^\S+ /, '') : '');
        const marks = [n.media_path && '🖼️', n.alert_at && '⏰', links.length && '🔗'].filter(Boolean).join(' ');
        outputAlt.push(`#${n.id} ${summarizeText(base, 60)}${marks && ` ${marks}`} · ${hour}`);
    }
    return outputAlt.join('\n');
}

/*
 * One text per tag (each goes in a message). plain: inside the ``` block; clean: without the block,
 * with the summary (🖼️ ⏰ 🔗) in the tag header; compact: one line per note, grouped by day.
 */
function groupPerTag(notes, descriptions = new Map(), { plain: plan = true, clean: cleanAlt = false, compact = false } = {}) {
    const groups = new Map();
    for (const n of notes) groups.set(n.tag ?? '', [...(groups.get(n.tag ?? '') ?? []), n]);

    const keys = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const soWithoutTag = keys.length === 1 && keys[0] === '';
    return keys.map(k => {
        const group = groups.get(k);
        const items = compact ? linesCompact(group) : group.map((n, i) => noteLine(n, plan, i + 1)).join('\n\n');
        const desc = descriptions.get(k);
        if (soWithoutTag && !cleanAlt) return items;
        const summary = cleanAlt || compact ? notesSummary(group) : '';
        return `🏷️ ${k ? (cleanAlt || compact ? k : `#${k}`) : withoutTag()} (${group.length})${summary}` +
            `${desc ? `\n${cleanAlt || compact ? '👉 ' : ''}${desc}` : ''}\n\n${items}`;
    });
}

// The -to destinations of a list/export: undefined without -to, null if it did not resolve (already replied)
async function sendingDestinations(msg, destinationsText, withDestination) {
    if (!withDestination) return undefined;
    return resolveDestinations(msg, destinationsText, { acceptsEmail: true });
}


// Replies in the chat or, with -to, sends to the destinations (and replies that it sent).
// `text` may be a list: each item goes in a message, and the tip only after the last
async function deliverText(msg, destinations, textAlt, subject, tip = '', withoutBlock = false) {
    // Each listing goes in a ``` block (monospaced), except the clean one; the tip stays outside
    const partsAlt = [].concat(textAlt).map(t => (withoutBlock ? t : '```\n' + t + '\n```'));
    if (!destinations) {
        for (const [i, part] of partsAlt.entries()) {
            await msg.reply(i === partsAlt.length - 1 ? `${part}${tip}` : part, undefined, WITHOUT_PREVIEW);
        }
        return;
    }
    try {
        for (const part of partsAlt) await sendToDestinations(destinations, part, { subject, options: WITHOUT_PREVIEW });
        await msg.reply(t('notes.sentTo', { where: describeDestinations(destinations) }));
    } catch (err) {
        await msg.reply(t('notes.sendFail', { error: err.message }));
    }
}

// "[#tag...] <text|/regex/flags>" of -search → { tags, search }
function readSearch(textAlt) {
    const m = textAlt.trim().match(/^((?:#[^\s#]+\s+)*)([\s\S]*)$/);
    return {
        tags: m[1].split(/\s+/).filter(Boolean).map(readTag),
        search: m[2].trim().replace(/^"([\s\S]*)"$/, '$1')
    };
}

// "#pt -c" → { text: '#pt', compact: true }
function removeCompact(textAlt) {
    const m = String(textAlt).match(/^([\s\S]*?)\s*-(?:c|compact)\s*$/i);
    return m ? { text: m[1], compact: true } : { text: textAlt, compact: false };
}

async function listAlt(msg, filter = '', withSearch = false, compact = false) {
    const { destinations: destinationsText, given: withDestination, rest: restWithC } = extractDestinations(filter);
    // -c|-compact at the end: one line per note
    const { text: rest, compact: askedCompact } = removeCompact(restWithC);
    compact ||= askedCompact;
    let tags = rest.trim() ? soTags(rest) : [];
    let search = '';
    let test = null;

    if (withSearch) {
        ({ tags, search } = readSearch(rest));
        if (!search) {
            await msg.reply(t('notes.list.searchUsage'));
            return;
        }
        try {
            test = compileSearch(search);
        } catch (err) {
            await msg.reply(`❌ ${err.message}`);
            return;
        }
    } else if (!tags) {
        await msg.reply(t('notes.list.usage'));
        return;
    }

    const destinations = await sendingDestinations(msg, destinationsText, withDestination);
    if (destinations === null) return;

    // The search looks at the text and also the #tag (/notes -s casa finds those of #casa)
    const allAlt = await listNotes();
    tags = resolveTags(tags, allAlt);
    const tagged = allAlt.filter(n => !tags.length || tags.includes(n.tag));
    const notes = test
        ? await matchingRows(test, tagged, n => n.tag ? [n.text, `#${n.tag}`] : [n.text])
        : tagged;
    const label = tags.length ? ` ${tags.map(x => `#${x}`).join(' ')}` : '';
    const foundAlt2 = search ? ` 🔎 ${summarizeText(search, 40)}` : '';

    if (!notes.length) {
        await msg.reply(tags.length || search
            ? t('notes.list.none', {
                inTags: label ? t('notes.inTags', { tags: label }) : '',
                withSearch: search ? t('notes.withSearch', { search: summarizeText(search, 40) }) : ''
            })
            : `${t('notes.none')}\n${t('notes.addHint')}`, undefined, WITHOUT_PREVIEW);
        return;
    }

    // One message per tag; the title (with the total) goes at the start of the first
    const clean = tags.length === 1 || compact;
    const partsAlt = groupPerTag(notes, await tagsDescriptions(),
        { plain: !clean, clean: tags.length === 1, compact });
    partsAlt[0] = clean ? `${t('notes.list.titleClean', { found: foundAlt2, count: tags.length === 1 ? '' : ` (${notes.length})` })}\n\n${partsAlt[0]}`
        : `${t('notes.list.titleFull', { tags: label, found: foundAlt2, total: notes.length })}\n\n${partsAlt[0]}`;
    await deliverText(msg, destinations, partsAlt, t('notes.subject.list', { tags: label, found: foundAlt2 }),
        t(compact ? 'notes.tipsCompact' : 'notes.tips'), clean);
}

// -move: renames the tag in all notes (if the new one already exists, they merge)
async function moveTag(msg, textAlt) {
    const m = textAlt.trim().match(/^#([^\s#]+)\s+#([^\s#]+)$/);
    if (!m) {
        await msg.reply(t('notes.move.usage'));
        return;
    }

    const [fromTag, toTag] = [readTag(m[1]), readTag(m[2])];
    if (fromTag === toTag) {
        await msg.reply(t('notes.move.same'));
        return;
    }
    await lock.refresh();
    if (lock.isProtected(fromTag) || lock.isProtected(toTag)) {
        await msg.reply(t('notes.lock.noMoveTag', { tag: lock.isProtected(fromTag) ? fromTag : toTag }));
        return;
    }

    const r = await dbRun('UPDATE notes SET tag = ? WHERE tag = ?', [toTag, fromTag]);
    if (!r.changes) {
        await msg.reply(t('notes.move.notFound', { tag: fromTag }));
        return;
    }
    // The description goes along (if the new one already had one, its own stays)
    await dbRun('INSERT OR IGNORE INTO note_tags (tag, description) SELECT ?, description FROM note_tags WHERE tag = ?', [toTag, fromTag]);
    await dbRun('DELETE FROM note_tags WHERE tag = ?', [fromTag]);

    await msg.reply(countAlt('notes.move.done', r.changes, { from: fromTag, to: toTag }));
}

// -desc: tag description. "-d #tag text" saves, "-d #tag" shows, "-d #tag -rm" deletes
async function describeTag(msg, textAlt) {
    const m = textAlt.trim().match(/^#([^\s#]+)(?:\s+([\s\S]+))?$/);
    if (!m) {
        await msg.reply(t('notes.desc.usage'));
        return;
    }

    const notes = await listNotes();
    const requested = readTag(m[1]);
    const foundAlt3 = resolveTags([requested], notes);
    const tag = foundAlt3.length === 1 ? foundAlt3[0] : requested; // partial only counts if it is a single tag
    const desc = (m[2] ?? '').trim();
    const current = (await dbGet('SELECT description FROM note_tags WHERE tag = ?', [tag]))?.description;

    if (!desc) {
        await msg.reply(current ? t('notes.desc.shown', { tag, desc: current })
            : `${t('notes.desc.none', { tag })}\n${t('notes.desc.createHint', { tag })}`,
            undefined, WITHOUT_PREVIEW);
        return;
    }

    if (/^-rm$/i.test(desc)) {
        if (!current) {
            await msg.reply(t('notes.desc.noneToRemove', { tag }));
            return;
        }
        await dbRun('DELETE FROM note_tags WHERE tag = ?', [tag]);
        await msg.reply(t('notes.desc.removed', { tag }));
        return;
    }

    await dbRun('INSERT INTO note_tags (tag, description) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET description = excluded.description',
        [tag, desc]);
    await msg.reply(t(current ? 'notes.desc.replaced' : 'notes.desc.saved', { tag }), undefined, WITHOUT_PREVIEW);
}

// -view: sends each note (the image with the text as the caption; without an image, just the text)
async function seeNotes(msg, filter, { quiet = false } = {}) {
    const { destinations: destinationsText, given: withDestination, rest } = extractDestinations(filter);
    if (!rest.trim()) {
        await msg.reply(t('notes.view.usage'));
        return;
    }

    const allAlt = await listNotes();
    const byPosition = readPositions(rest, allAlt);
    if (byPosition?.bad.length || byPosition?.total === 0) {
        await msg.reply(positionsError(byPosition, '/notes -v'));
        return;
    }
    const partsAlt = rest.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const requestedAlt = partsAlt.filter(p => p.startsWith('#')).map(readTag);
    const tags = resolveTags(requestedAlt, allAlt);
    const ids = partsAlt.filter(p => !p.startsWith('#'));
    const missing = byPosition ? [] : [...ids.filter(i => !/^\d+$/.test(i) || !allAlt.some(n => n.id === Number(i))),
        ...requestedAlt.filter(t => !resolveTags([t], allAlt).some(x => allAlt.some(n => n.tag === x))).map(t => `#${t}`)];
    if (missing.length) {
        await msg.reply(t(missing.length > 1 ? 'notes.view.missingMany' : 'notes.view.missingOne', { list: missing.join(', ') }));
        return;
    }

    const targets = byPosition ? byPosition.picked.map(p => p.note)
        : allAlt.filter(n => ids.map(Number).includes(n.id) || tags.includes(n.tag));
    const destinations = await sendingDestinations(msg, destinationsText, withDestination);
    if (destinations === null) return;

    // In a tag the header carries the position in its list (2/5); a note asked by its id, the id
    const place = (n) => {
        const inTag = allAlt.filter(x => x.tag && x.tag === n.tag);
        return n.tag && (byPosition || tags.includes(n.tag)) ? `${inTag.indexOf(n) + 1}/${inTag.length}` : `#${n.id}`;
    };
    const header = (n) => (quiet ? '' : [`📝 *${place(n)}*`, n.tag && `#${n.tag}`, `_${formatData(n.created_at)}_`].filter(Boolean).join(' · '));
    const withoutMarks = (t) => t.replace(/[*_]/g, '');
    const failures = [];

    for (const n of targets) {
        const textAlt = [header(n), n.text && formatText(n.text)].filter(Boolean).join('\n');
        let media = null;
        let withBorder = null;
        if (n.media_path && !n.locked) {
            await lock.ensurePlain(n);
            withBorder = await imageWithBorder(n.media_path, n.media_mime);
            media = await Promise.resolve().then(() => {
                const m = withBorder ? new MessageMedia(n.media_mime, withBorder.toString('base64'))
                    : MessageMedia.fromFilePath(n.media_path);
                m.filename = nameOriginal(n.media_path);
                return m;
            }).catch(() => null);
            if (!media) failures.push(t('notes.view.fileNotFound', { id: n.id }));
        }

        // Audio has no caption: the text goes in another message
        const withoutCaption = media && String(n.media_mime).startsWith('audio/');

        if (!destinations) {
            if (media) await msg.reply(media, undefined, withoutCaption ? {} : { caption: textAlt });
            if (!media || withoutCaption) await msg.reply(textAlt, undefined, WITHOUT_PREVIEW);
            continue;
        }

        for (const d of destinations.filter(x => x.id)) {
            await (async () => {
                if (media) await client.sendMessage(d.id, media, withoutCaption ? {} : { caption: textAlt });
                if (!media || withoutCaption) await client.sendMessage(d.id, textAlt, WITHOUT_PREVIEW);
            })().catch(err => failures.push(`${describeDestinations([d])}: ${err.message}`));
        }
        const emails = [...new Set(destinations.filter(d => d.email).flatMap(d => d.email.split(/\s*,\s*/)))];
        if (emails.length) {
            await sendEmail({
                to: emails, subject: t('notes.subject.note', { id: n.id }),
                text: [withoutMarks(header(n)), n.text && formatText(n.text, true)].filter(Boolean).join('\n'),
                attachments: media ? [{ filename: nameOriginal(n.media_path), contentType: n.media_mime,
                    ...(withBorder ? { content: withBorder } : { path: n.media_path }) }] : []
            }).catch(err => failures.push(t('notes.failEmail', { error: err.message })));
        }
    }

    if (destinations && targets.length && !failures.length) {
        await msg.reply(countAlt('notes.view.sent', targets.length, { where: describeDestinations(destinations) }));
    }
    if (failures.length) await msg.reply(`❌ ${failures.join('; ')}`);
}

function positionsError(byPosition, cmd) {
    if (!byPosition.total) return t('notes.view.missingOne', { list: `#${byPosition.tag}` });
    return t('notes.rm.missingPos', { list: byPosition.bad.map(p => `${p} (#${byPosition.tag}: ${byPosition.total})`).join(', '), cmd });
}

// /notes 1 4 #tag: those positions of the list, as /notes #tag shows them (the text; -v brings the media)
async function listPositions(msg, textAlt, { quiet = false } = {}) {
    const byPosition = readPositions(textAlt, await listNotes());
    if (byPosition.bad.length || !byPosition.total) {
        await msg.reply(positionsError(byPosition, '/notes'));
        return;
    }
    const lines = byPosition.picked.map(({ note, position }) => (quiet ? formatText(note.text) : noteLine(note, false, position)));
    const head = quiet ? '' : `🏷️ ${byPosition.tag} (${byPosition.picked.length}/${byPosition.total})\n\n`;
    await msg.reply(`${head}${lines.join('\n\n')}`, undefined, WITHOUT_PREVIEW);
}

// /notes alone: each tag with its number of notes (the untagged last)
async function listTags(msg) {
    const notes = await listNotes();
    if (!notes.length) {
        await msg.reply(`${t('notes.none')}\n${t('notes.addHint')}`);
        return;
    }

    const count = new Map();
    for (const n of notes) count.set(n.tag ?? '', (count.get(n.tag ?? '') ?? 0) + 1);
    const keys = [...count.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const descriptions = await tagsDescriptions();
    const linesAlt = keys.map(k => `${k ? `#${k}` : withoutTag()}: ${count.get(k)}${descriptions.has(k) ? ` · ${descriptions.get(k)}` : ''}`);

    await deliverText(msg, undefined,
        t('notes.tags.title', { total: notes.length, tags: keys.filter(Boolean).length, lines: linesAlt.join('\n') }),
        t('notes.subject.tags'), t('notes.tipsTags'));
}

// 20261027_1530, in Brasília time (the same as formatData)
function fileStamp(ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(ms).map(x => [x.type, x.value]));
    return `${p.year}${p.month}${p.day}_${p.hour}${p.minute}`;
}

/*
 * The image with a thin black border, so you can tell it is an image (jpeg, png and webp; in the
 * of the source). Returns null if not possible (gif, error): the file as it is counts.
 */
async function imageWithBorder(fileAlt, mime) {
    if (!/^image\/(jpeg|png|webp)$/.test(String(mime))) return null;
    try {
        const { data, info } = await sharp(fileAlt).rotate().toBuffer({ resolveWithObject: true });
        const border = Math.max(2, Math.round(Math.max(info.width, info.height) / 300));
        return await sharp(data).extend({ top: border, bottom: border, left: border, right: border, background: '#000000' })
            .toBuffer();
    } catch (err) {
        printError('/notes: image border:', err.message);
        return null;
    }
}

// The note image as an RGB JPEG on a white background, at the size the PDF uses
async function imageForPdf(fileAlt) {
    try {
        const { data, info } = await sharp(fileAlt).rotate().resize({ width: 900, withoutEnlargement: true })
            .flatten({ background: '#ffffff' }).extend({ top: 2, bottom: 2, left: 2, right: 2, background: '#000000' })
            .toColourspace('srgb').jpeg({ quality: 80 })
            .toBuffer({ resolveWithObject: true });
        return { jpeg: data, width: info.width, height: info.height };
    } catch (err) {
        printError('/notes: image left out of the PDF:', err.message);
        return null;
    }
}

/**
 * The PDF of the notes (already opened: see notesLock.open): the blocks by tag, with the images.
 * @param {object[]} notes
 * @param {string[]} tags  the tags asked for ([]: all)
 * @returns {Promise<{ pdf: Buffer, name: string, label: string }>}
 */
async function renderNotesPdf(notes, tags) {
    const nowAlt = Date.now();
    const label = tags.length ? ` ${tags.map(x => `#${x}`).join(' ')}` : '';
    const groups = new Map();
    for (const n of notes) groups.set(n.tag ?? '', [...(groups.get(n.tag ?? '') ?? []), n]);
    const keys = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));

    const blocks = [{
        type: 'text', icon: 'note',
        text: `${countAlt('notes.countNotes', notes.length)}${label ? t('notes.inTags', { tags: label }) : ''}`
    }];

    const descriptions = await tagsDescriptions();

    for (const k of keys) {
        const items = groups.get(k);
        if (!(keys.length === 1 && k === '')) {
            // "#tag (n)" with the summary as text (the PDF has no emoji) and the tag description below
            const summary = [[items.filter(n => n.media_path).length, t('notes.pdf.withMedia')], [items.filter(n => n.alert_at).length, t('notes.pdf.withAlert')],
                [items.filter(n => textParts(n.text).links.length).length, t('notes.pdf.withLink')]]
                .filter(([qty]) => qty).map(([qty, labelItem]) => `${qty} ${labelItem}`).join(', ');
            blocks.push({ type: 'title', icon: 'tag', text: `${k ? `#${k}` : withoutTag()} (${items.length})${summary ? ` · ${summary}` : ''}` });
            if (descriptions.get(k)) blocks.push({ type: 'text', text: descriptions.get(k) });
            blocks.push({ type: 'space', height: 6 });
        }
        for (const [pos, n] of items.entries()) {
            if (!n.locked) await lock.ensurePlain(n);
            const image = n.media_path && !n.locked && isImage(n.media_mime) ? await imageForPdf(n.media_path) : null;
            const alert = (n.media_path && !image
                ? (isImage(n.media_mime) ? t('notes.pdf.imageNotIncluded') : t('notes.pdf.fileNotIncluded', { name: nameOriginal(n.media_path) })) : '') +
                (n.alert_at ? t('notes.pdf.alert', { when: fmtWhen(n.alert_at) }) : '');
            const { title, body, links } = textParts(n.text.replace(MARK_REPLY, t('notes.pdf.replyMark')));
            blocks.push({ type: title ? 'bold' : 'text', text: `${pos + 1}.  ${title}`, indent: 0 });
            // The title comes first and the image after it, with a line break before
            if (image) {
                blocks.push({ type: 'space', height: 6 });
                blocks.push({ type: 'image', ...image });
            }
            if (body) {
                blocks.push({ type: 'space', height: 6 });
                blocks.push({ type: 'text', text: body });
            }
            if (links.length) {
                blocks.push({ type: 'space', height: 6 });
                blocks.push({ type: 'bold', icon: 'link', text: 'Links' });
                blocks.push({ type: 'text', text: links.map(l => `• ${l}`).join('\n') });
            }
            blocks.push({ type: 'space', height: 3 });
            blocks.push({ type: 'meta', icon: 'clock', text: `${dateShort(n.created_at)}, #${n.id}${alert}` });
            blocks.push({ type: 'space', height: 8 });
        }
    }

    const pdf = generatePdf({
        title: t('notes.pdf.title', { tags: label }),
        right: formatData(nowAlt),
        footer: t('notes.pdf.footer', { version: packageJson.version, host: os.hostname(), date: formatData(nowAlt) }),
        blocks
    });
    const suffix = tags.length ? `tag-${tags.map(t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/gi, '_')).join('-')}_` : '';
    const nameAlt = `ZapBot_notes_${suffix}${fileStamp(nowAlt)}.pdf`;
    return { pdf, name: nameAlt, label };
}

async function exportNotes(msg, filter = '') {
    const { destinations: destinationsText, given: withDestination, rest } = extractDestinations(filter);
    let tags = rest.trim() ? soTags(rest) : [];
    if (!tags) {
        await msg.reply(t('notes.export.usage'));
        return;
    }

    const destinations = await sendingDestinations(msg, destinationsText, withDestination);
    if (destinations === null) return;

    const allAlt = await listNotes();
    tags = resolveTags(tags, allAlt);
    const notes = tags.length ? allAlt.filter(n => tags.includes(n.tag)) : allAlt;
    if (!notes.length) {
        await msg.reply(tags.length ? t('notes.list.none', { inTags: t('notes.inTags', { tags: ` ${tags.map(x => `#${x}`).join(' ')}` }), withSearch: '' })
            : t('notes.none'));
        return;
    }

    const { pdf, name: nameAlt, label } = await renderNotesPdf(notes, tags);

    const caption = t('notes.export.caption', { tags: label, total: notes.length });
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
            to: emails, subject: t('notes.subject.export', { tags: label }), text: caption.replace(/\*/g, ''),
            attachments: [{ filename: nameAlt, content: pdf, contentType: 'application/pdf' }]
        }).then(() => sentAlt3.push(...destinations.filter(d => d.email)))
            .catch(err => failures.push(t('notes.failEmail', { error: err.message })));
    }
    for (const d of destinations.filter(x => x.id)) {
        await client.sendMessage(d.id, media, { sendMediaAsDocument: true, caption })
            .then(() => sentAlt3.push(d))
            .catch(err => failures.push(`${describeDestinations([d])}: ${err.message}`));
    }

    if (sentAlt3.length) await msg.reply(t('notes.export.sent', { where: describeDestinations(sentAlt3) }));
    if (failures.length) await msg.reply(t('notes.export.fail', { list: failures.join('; ') }));
}

/*
 * -lock #tag: asks the password (first time: creates the protection); -lock #tag -now|-no|-n: locks at once;
 * -lock #tag -clean -yes: deletes the old commands of that tag from the history.
 */
async function lockTag(msg, rest, chatId, password = null) {
    const now = /(^|\s)-(?:now|no|n)(?=\s|$)/i.test(rest);
    const clean = /(^|\s)-clean(?=\s|$)/i.test(rest);
    const yes = /(^|\s)-(?:yes|y)(?=\s|$)/i.test(rest);
    const tags = rest.match(/(^|\s)#[^\s#]+/g)?.map(x => readTag(x.trim())) ?? [];
    if (tags.length !== 1) {
        if (password) await lock.eraseMessage(msg, { mask: false });
        await (password ? client.sendMessage(chatId, t('notes.lock.usage')) : msg.reply(t('notes.lock.usage')));
        return;
    }
    const tag = tags[0];

    // The password only opens (-lock <password> #tag): with -now or -clean it is not needed; it leaves the chat anyway
    if (password && (now || clean)) {
        await lock.eraseMessage(msg, { mask: false });
        await client.sendMessage(chatId, t('notes.lock.passwordNotNeeded'));
        return 'asked';
    }
    if (password) {
        await lock.tryInline({ msg, chatId, tag, password });
        return 'asked';
    }

    if (now) return msg.reply(await lock.stop(tag));
    if (clean) {
        await lock.refresh();
        if (!lock.isProtected(tag)) return msg.reply(t('notes.lock.notProtected', { tag }));
        const n = (await lock.oldCopies(tag)).length;
        if (!yes) return msg.reply(t('notes.lock.cleanAsk', { n, tag }));
        return msg.reply(t('notes.lock.cleaned', { n: await lock.cleanCopies(tag) }));
    }
    await msg.reply(await lock.start({ chatId, tag }));
}

/*
 * What shows notes (view, PDF, lists, search and a lone #tag) of a protected tag that is locked says it is locked:
 * the placeholders alone would not say how to open it.
 */
async function hintLocked(msg, args) {
    const text = String(args ?? '').trim();
    const first = text.split(/\s+/)[0].toLowerCase();
    const shows = ['-view', '-v', '-export', '-e', '-list', '-l', '-compact', '-c', '-search', '-s'].includes(first) || first.startsWith('#');
    if (!shows) return;

    await lock.refresh();
    const tags = new Set((text.match(/(^|\s)#[^\s#]+/g) ?? []).map(x => readTag(x.trim())));
    const ids = ['-view', '-v'].includes(first) ? (text.match(/(^|[\s,])\d+(?=[\s,]|$)/g) ?? []).map(x => Number(x.replace(/\D/g, ''))) : [];
    if (ids.length) {
        for (const n of await dbAll(`SELECT tag FROM notes WHERE id IN (${ids.map(() => '?').join(',')})`, ids)) if (n.tag) tags.add(n.tag);
    }
    for (const tag of tags) {
        if (lock.isProtected(tag) && !(lock.isUnlocked(tag) && lock.canRead())) await msg.reply(lock.lockedNotice(tag));
    }
}

// The protected tags a command names (#tags and the tags of the numbers it asks to see)
async function protectedNamed(args) {
    const text = String(args ?? '').trim();
    const first = text.split(/\s+/)[0].toLowerCase();
    await lock.refresh();
    const tags = new Set((text.match(/(^|\s)#[^\s#]+/g) ?? []).map(x => readTag(x.trim())));
    if (['-view', '-v'].includes(first)) {
        const ids = (text.match(/(^|[\s,])\d+(?=[\s,]|$)/g) ?? []).map(x => Number(x.replace(/\D/g, '')));
        if (ids.length) for (const n of await dbAll(`SELECT tag FROM notes WHERE id IN (${ids.map(() => '?').join(',')})`, ids)) if (n.tag) tags.add(n.tag);
    }
    return [...tags].filter(tag => lock.isProtected(tag));
}

/*
 * The command runs knowing where it is: the notes of a protected tag only open in your own private chat and are
 * never sent to other destinations (-to): there, the command that names one is refused.
 */
async function cmdNote(ctx) {
    const sending = Boolean(extractDestinations(String(ctx.args ?? '')).given);
    const privateChat = await lock.isOwnPrivate(ctx.chatId).catch(() => false);
    return lock.runIn({ privateChat, sending }, async () => {
        if (sending && /^(?:-view|-v|-export|-e|-list|-l|-compact|-c|-search|-s|#)/i.test(String(ctx.args ?? '').trim())) {
            const named = await protectedNamed(ctx.args);
            if (named.length) {
                await ctx.msg.reply(t('notes.lock.noSend', { tag: named[0] }));
                return;
            }
        }
        if (!['locked', 'asked', 'added'].includes(await cmdNoteRun(ctx))) await hintLocked(ctx.msg, ctx.args);
    });
}

// What shows notes: with -lock beside it (/notes -v -lock #tag) it asks the password first and then shows
const VIEWING = ['-view', '-v', '-export', '-e', '-list', '-l', '-compact', '-c', '-search', '-s'];
const LOCK_TOKEN = /(^|\s)-(?:lock|lo)(?=\s|$)/i;

async function viewWithLock({ msg, args, quotedMsg, chatId }, textAlt, password) {
    const withoutLock = textAlt.replace(LOCK_TOKEN, '$1').replace(/\s+/g, ' ').trim();
    const tags = [...new Set((withoutLock.match(/(^|\s)#[^\s#]+/g) ?? []).map(x => readTag(x.trim())))];
    if (tags.length !== 1) {
        // With a password in it, the message leaves anyway: it carries it
        if (password) await lock.eraseMessage(msg, { mask: false });
        await (password ? client.sendMessage(chatId, t('notes.lock.viewUsage')) : msg.reply(t('notes.lock.viewUsage')));
        return;
    }
    const [tag] = tags;
    const show = () => cmdNote({ msg, args: withoutLock, quotedMsg, chatId });
    if (!password && !lock.isProtected(tag)) {
        await msg.reply(t('notes.lock.notProtected', { tag }));
        return;
    }
    if (password) {
        await lock.tryInline({ msg, chatId, tag, password, then: show });
        return 'asked';
    }
    if (lock.isUnlocked(tag)) await show();
    else await msg.reply(await lock.start({ chatId, tag, then: show }));
    return 'asked'; // The nested command or password prompt already handled the reply.
}

async function cmdNoteRun({ msg, args, quotedMsg, chatId }) {
    await dbReady;
    await lock.refresh();
    // "/notes -v -l #tag": a -l beside another way of seeing is not "list" (two at once mean nothing): it is -lock
    let textAlt = normalizeLock(String(args ?? '').trim());
    // The password typed in the command (-lock <password> #tag): it leaves the text, the command message is deleted
    const typed = extractPassword(textAlt);
    const password = typed?.password ?? null;
    if (typed) textAlt = typed.rest;
    // -quiet (-q) among the options at the start: only the text (and the media), no header and no footer
    let quiet = false;
    const leadingWords = textAlt.split(/\s+/);
    let start = 0;
    while (start < leadingWords.length && leadingWords[start].startsWith('-')) start++;
    const kept = leadingWords.slice(0, start).filter(word => !(/^-(?:quiet|q)$/i.test(word) && (quiet = true)));
    if (quiet) textAlt = [...kept, ...leadingWords.slice(start)].join(' ');
    const [optionAlt = '', ...words] = textAlt.split(/\s+/);
    const rest = textAlt.slice(optionAlt.length).trim();
    const nameAlt = optionAlt.toLowerCase();

    // The -now (-n, -no) among the options at the start locks the tag, in any order: -n -lock #tag, -lock -n #tag,
    // -n #tag, even -l -n #tag (-n means nothing else here; a "-n" inside the text of a note does not count)
    const leading = [];
    for (const word of textAlt.split(/\s+/)) {
        if (!word.startsWith('-')) break;
        leading.push(word.toLowerCase());
    }
    const STARTS = ['-now', '-n', '-no', '-lock', '-lo', '-list', '-l', '-view', '-v', '-search', '-s', '-compact', '-c'];
    if (STARTS.includes(leading[0]) && leading.some(x => ['-now', '-n', '-no'].includes(x))) {
        await lockTag(msg, textAlt, chatId, password);
        return 'locked'; // it was not asking to see anything: no "locked" hint after it
    }

    // "/notes -v -lock #tag": the password first, then it shows (no -now: that is another thing). With positions the
    // -lock goes at the end (/notes 2 #tag -lock): right after the options it would be read as the password
    const positionsLocked = /^\d/.test(textAlt) && LOCK_TOKEN.test(textAlt) && readPositions(textAlt.replace(LOCK_TOKEN, ' '), await listNotes());
    if ((VIEWING.includes(nameAlt) || positionsLocked) && LOCK_TOKEN.test(textAlt) && !/(^|\s)-(?:now|no|n)(?=\s|$)/i.test(textAlt)) {
        return viewWithLock({ msg, args, quotedMsg, chatId }, quiet ? `-q ${textAlt}` : textAlt, password);
    }

    // The -to of the lists/PDF: "/notes -to X", "/notes #casa -to X", "-l ... -to X", "-e ... -to X"
    const { given: withDestination, rest: withoutDestination } = extractDestinations(textAlt);
    const textTags = soTags(removeCompact(withoutDestination).text);

    // With nothing: the tags (in a reply or with media, it is a note with no tag: error)
    if (!textAlt) return quotedMsg || msg.hasMedia ? addAlt(msg, '', quotedMsg) : listTags(msg);
    if (nameAlt === '-list' || nameAlt === '-l') return listAlt(msg, rest);
    if (nameAlt === '-compact' || nameAlt === '-c') return listAlt(msg, rest, false, true);
    if (nameAlt === '-update' || nameAlt === '-u') return update(msg, rest, quotedMsg);
    if (nameAlt === '-search' || nameAlt === '-s') return listAlt(msg, rest, true);
    if (nameAlt === '-view' || nameAlt === '-v') return seeNotes(msg, rest, { quiet });
    // 1 4 #tag (or 1,2,5 #tag): those positions of the tag's list. Only with the numbers first: /notes #tag 1234 is a note
    if (/^\d/.test(textAlt) && !withDestination && readPositions(textAlt, await listNotes())) return listPositions(msg, textAlt, { quiet });
    if (nameAlt === '-desc' || nameAlt === '-d') return describeTag(msg, rest);
    if (nameAlt === '-move' || nameAlt === '-m') return moveTag(msg, rest);
    if (nameAlt === '-export' || nameAlt === '-e') return exportNotes(msg, rest);
    if (nameAlt === '-lock' || nameAlt === '-lo') return lockTag(msg, rest, chatId, password);
    if (withDestination && !withoutDestination.trim()) return listAlt(msg, textAlt);
    if (textTags && removeCompact(withoutDestination).compact) return listAlt(msg, textAlt);
    // Just #tag, without text: lists its own. In a reply or with media, saves what came under that tag
    if (textTags) return (quotedMsg || msg.hasMedia) && textTags.length === 1 ? addAlt(msg, textAlt, quotedMsg) : listAlt(msg, textAlt);
    if (nameAlt === '-add' || nameAlt === '-a') return addAlt(msg, rest, quotedMsg);
    if (withDestination && (nameAlt === '-rm' || nameAlt === '-rm' || nameAlt === '-r')) {
        return msg.reply(t('notes.rm.noTo'));
    }
    if (nameAlt === '-rm' || nameAlt === '-rm' || nameAlt === '-r') return removeNotes(msg, words.join(' '), false);
    if (nameAlt === '-alert') return alertAlt(msg, rest);

    // An option that does not exist: error. Without a "-" in front, the whole text is a new note (the same as -add)
    if (nameAlt.startsWith('-')) {
        return msg.reply(t('notes.usage'));
    }

    return addAlt(msg, textAlt, quotedMsg);
}

/*
 * Check: one tick per minute notifies the notes whose alert expired. Clears the alert
 * BEFORE notifying: if the send fails, it does not repeat on every tick.
 */
const guard = loopGuard('/notes alerts');

async function checkNotes() {
    if (guard.busy() || !stateAlt.ready) return;
    guard.start();

    try {
        await dbReady;
        const expired = await dbAll('SELECT * FROM notes WHERE alert_at IS NOT NULL AND alert_at <= ? ORDER BY alert_at, id',
            [Date.now()]);

        await lock.refresh();
        for (const raw of expired) {
            const n = lock.open(raw);
            await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);

            // A protected tag does not put its text in an alert (WhatsApp, email): only that there is a note
            const hidden = lock.isProtected(n.tag);
            const textAlert = hidden ? t('notes.lock.alertText', { tag: n.tag }) : n.text;
            const destinations = noteDestinations(n);
            await sendToDestinations(destinations,
                t('notes.alert.fired', { id: n.id, text: textAlert, date: formatData(n.created_at) }),
                { subject: t('notes.subject.alert', { id: n.id, text: summarizeText(textAlert, 60) }), options: WITHOUT_PREVIEW }
            ).catch(err => printError('/notes -alert: failed to notify:', err.message));

            printInfo(`/notes -alert triggered: #${n.id}` +
                (destinations.length ? ` → ${destinations.map(d => d.email ?? d.id).join(', ')}` : ''));
        }
    } catch (err) {
        printError('Error checking the /notes alerts:', err.message);
    } finally {
        guard.end();
    }
}

// Called in app.js
function startNotes() {
    lock.cleanLeftovers();
    setInterval(checkNotes, 60 * 1000);
}

module.exports = {
    cmdNote,
    renderNotesPdf,
    startNotes,
    checkNotes
};
