/*
 * /forward command: forwards messages (text, media, location...) to the recipients.
 * /forward /Fulano de Tal/ @Maria Beltrano   → the replied message, to contacts and groups
 * /forward -to fulano@example.com            → email (several -to work)
 * /forward -1 /Fulano/                       → without a reply: the message right above (-1)
 * /forward -1 -4 -6 /Fulano/                 → the messages at positions -1, -4 and -6 (also -1,-4,-6)
 * /forward -3..-1 /Fulano/                   → from -3 to -1, in sequence
 * /forward -dry /Fulano/                     → only validates the recipients, without sending
 * /forward #list ...                        → the saved lists (see forwardLists.js: -add, -l, -rm...)
 * Only sends if all recipients are found. The "forwarded by ZapBot" header (setting
 * forward.header) and the status (the notice and the list of who received it, setting forward.status) come on; -quiet|-q
 * removes both (only the failures) and -status|-s forces both. With several messages, the header goes only once.
 * /forward /Fulano/ #group Text for everyone   → the typed text goes at the start; with a reply, its message below
 */

const { commandUsage } = require('./base');
const { textPeople, withoutDelimiters } = require('./block');
const { client, completeNotice, sentByBot } = require('../client');
const { describeDestination, extractDestinations, resolverDestinations } = require('../destinations');
const { sendEmail } = require('../email');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { expandLists, manage } = require('../forwardLists');
const { wait } = require('../util/format');

// What to send from a message: { text, media, type } or { error }
async function content(m) {
    const type = m.type;
    let textAlt = String(m.body ?? '').trim();
    let mediaAlt = null;

    if (m.hasMedia) {
        mediaAlt = await m.downloadMedia().catch(() => null);
        if (!mediaAlt?.data) return { error: t('forward.download') };
    } else if (type === 'location' && m.location) {
        const { latitude, longitude, description } = m.location;
        textAlt = [description, `https://maps.google.com/?q=${latitude},${longitude}`].filter(Boolean).join('\n');
    } else if (m.pollName) {
        textAlt = `📊 ${m.pollName}\n${(m.pollOptions ?? []).map(o => `• ${o.name ?? o}`).join('\n')}`;
    }

    if (!textAlt && !mediaAlt) return { error: t('forward.empty') };
    return { text: textAlt, media: mediaAlt, type };
}

// Audio, voice note and sticker do not accept a caption: the text goes before, in another message
const WITHOUT_CAPTION = new Set(['audio', 'ptt', 'sticker']);

async function sendOnChat(id, { text: textAlt, media: mediaAlt, type }) {
    if (!mediaAlt) {
        await client.sendMessage(id, textAlt);
    } else if (WITHOUT_CAPTION.has(type)) {
        if (textAlt) await client.sendMessage(id, textAlt);
        await client.sendMessage(id, mediaAlt, { sendAudioAsVoice: type === 'ptt', sendMediaAsSticker: type === 'sticker' });
    } else {
        await client.sendMessage(id, mediaAlt, textAlt ? { caption: textAlt } : {});
    }
}

// A single email, with the header (if any), the texts in sequence and all the media attached
async function sendPerEmail(email, contents, header) {
    const attachments = contents.filter(c => c.media).map(({ media: mediaAlt }, i) => {
        const extension = String(mediaAlt.mimetype ?? '').split(';')[0].split('/')[1] || 'bin';
        return { filename: mediaAlt.filename || `anexo${i ? `-${i + 1}` : ''}.${extension}`, content: Buffer.from(mediaAlt.data, 'base64'), contentType: mediaAlt.mimetype };
    });
    await sendEmail({
        para: email.split(/\s*,\s*/),
        subject: t('forward.subject'),
        text: [header, ...contents.map(c => c.text)].filter(Boolean).join('\n\n') || t('forward.noText'),
        attachments
    });
}

/*
 * The positions right at the start of the command: -1, -1 -4 -6, -1,-4,-6, -3..-1 (and mixes). Returns the positions
 * (1 = the message right above) and the rest of the text.
 */
const SELECTION = /^(?:-\d+(?:\.\.-?\d+)?(?:\s*,\s*|\s+|$))+/;

function readPositions(textAlt) {
    const m = textAlt.match(SELECTION);
    if (!m) return { positions: [], rest: textAlt };

    const positions = new Set();
    for (const [, de, until] of m[0].matchAll(/-(\d+)(?:\.\.-?(\d+))?/g)) {
        const [a, b] = [Number(de), Number(until ?? de)];
        for (let p = Math.min(a, b); p <= Math.max(a, b); p++) positions.add(p);
    }
    return { positions: [...positions].sort((x, y) => x - y), rest: textAlt.slice(m[0].length).trim() };
}

// They are not people's messages: WhatsApp notices (joined, left...), calls, deleted ones
const SYSTEM_TYPES = new Set(['gp2', 'notification', 'notification_template', 'e2e_notification', 'call_log', 'protocol', 'ciphertext', 'revoked']);

/**
 * The messages at the requested positions (1 = the one right above the command), oldest to newest.
 * Skips WhatsApp notices and what the bot itself sent (replies, status).
 * @returns {Promise<{ messages: object[] } | { error: string }>}
 */
async function messagesAbove(msg, positions) {
    const greater = positions.at(-1);
    let searched;
    try {
        const chat = await msg.getChat();
        searched = await chat.fetchMessages({ limit: Math.min(greater + 50, 300) });
    } catch (err) {
        printError('/forward: could not read the chat messages:', err.message);
        return { error: t('forward.fetchFailed', { error: err.message }) };
    }

    // Only what came before the command
    const idCommand = msg.id?._serialized;
    const beforeAlt = searched.findIndex(m => m.id?._serialized === idCommand);
    const candidates = (beforeAlt >= 0 ? searched.slice(0, beforeAlt) : searched)
        .filter(m => !SYSTEM_TYPES.has(m.type) && !sentByBot(m));

    const chosen = [];
    for (const p of positions) {
        const m = candidates[candidates.length - p];
        if (!m) return { error: t('forward.notEnough', { n: candidates.length, pos: p }) };
        chosen.push({ pos: p, m });
    }
    // From oldest (larger position) to newest
    return { messages: chosen.reverse() };
}

// The resolved loose ones plus those from the lists, without repeats; over forward.maxRecipients, it does not send.
// Whoever in a #list is the command's own chat (the conversation the message came from) stays out:
// .ignored says who. The loose ones you typed always count.
async function recipients(msg, texts, listsAlt) {
    const standalone = texts.length ? await resolverDestinations(msg, texts, { acceptsEmail: true }) : [];
    if (!standalone) return null;

    const chatCurrent = String(msg.id?.remote ?? msg.from ?? '').split('@')[0];
    const isOChat = (d) => Boolean(chatCurrent) && d.id?.split('@')[0] === chatCurrent;
    const ignored = listsAlt.filter(d => isOChat(d) && !standalone.some(a => a.id === d.id));

    const allAlt2 = listsAlt.filter(d => !ignored.includes(d));
    for (const d of standalone) if (!allAlt2.some(x => (x.email ?? x.id) === (d.email ?? d.id))) allAlt2.push(d);

    if (!allAlt2.length && ignored.length) {
        await msg.reply(t('forward.onlyThisChat', { list: ignored.map(describeDestination).join(', ') }));
        return null;
    }

    const max = getSetting('forward.maxRecipients');
    if (allAlt2.length > max) {
        await msg.reply(t('forward.tooManyRecipients', { n: allAlt2.length, max }));
        return null;
    }
    allAlt2.ignored = ignored;
    return allAlt2;
}

/*
 * Separates the text to send from the recipients: the explicit recipients at the start (/Name/, "Name", @mention, +number,
 * email) and, after them, the text. Only counts if there was already an explicit recipient (here or before: #list or -to);
 * without any, the loose words are a name, as always (/forward Fulano Silva).
 */
const DESTINATION_EXPLICIT = /^(?:\/(?:[^/\\]|\\.)+\/|"[^"]*"|'[^']*'|@\S+|\+\d[\d()-]*|\S+@\S+\.\S+)(?=\s|$)/;

function separateText(rest, jaHasDestination) {
    let s = String(rest ?? '').trim();
    const items = [];
    for (let m = s.match(DESTINATION_EXPLICIT); m; m = s.match(DESTINATION_EXPLICIT)) {
        items.push(m[0]);
        s = s.slice(m[0].length).trimStart();
    }
    if (items.length || jaHasDestination) return { recipients: items.join(' '), text: s };
    return { recipients: String(rest ?? '').trim(), text: '' };
}

async function cmdForward({ msg, args: typed, opts, quotedMsg }) {
    // Manage the lists: -add, -list, -rm, -move, -desc (the first word)
    if (await manage(msg, typed)) return;

    const silent = Boolean(opts?.given.has('quiet'));
    const forceStatus = Boolean(opts?.given.has('status'));
    const simulation = Boolean(opts?.given.has('dry'));
    const withoutHeader = Boolean(opts?.given.has('nohdr'));
    // -q: no header and no status (only the failures); -s: both, even with the settings off.
    // Without either, the forward.header and forward.status settings apply (-nohdr removes only the header)
    const withHeader = !silent && !withoutHeader && (forceStatus || getSetting('forward.header'));
    const withStatus = !silent && (forceStatus || getSetting('forward.status'));
    const withoutQuiet = typed.replace(/(^|\s)-(?:quiet|q|status|s|dry|d|nohdr)(?=\s|$)/g, ' ').trim();
    const { positions, rest: withoutPositions } = readPositions(withoutQuiet);

    // The -to (emails and also chats) and, in the rest, the recipients: /Name/, "Name", @mention, +number, words
    const { destinations: byTo, rest: withoutTo } = extractDestinations(withoutPositions);

    // The #lists (whole name) become the saved members; the rest are loose recipients
    const lists = await expandLists(withoutTo);
    if (lists.error) {
        await msg.reply(lists.error);
        return;
    }

    // After the explicit recipients (/Name/, "Name", @mention, +number, email, #list, -to) whatever is left is the
    // text to send: goes at the start, and the replied message below. Only loose words remain a name.
    const { recipients: restDestinations, text: textExtra } = separateText(lists.rest, lists.destinations.length > 0 || byTo.length > 0);
    const texts = [...textPeople(restDestinations).map(withoutDelimiters), ...byTo];

    if (!texts.length && !lists.destinations.length) {
        await msg.reply(commandUsage('/forward'));
        return;
    }
    // -dry: only validates the recipients (the error for whoever was not found is already replied), without sending
    if (simulation) {
        const foundAlt6 = await recipients(msg, texts, lists.destinations);
        if (!foundAlt6) return;
        const note = foundAlt6.ignored?.length
            ? `\n\n${t('forward.dryIgnored', { list: foundAlt6.ignored.map(describeDestination).join(', ') })}` : '';
        await msg.reply(t('forward.dry', { n: foundAlt6.length, list: foundAlt6.map(describeDestination).join('\n') }) + note);
        return;
    }
    if (quotedMsg && positions.length) {
        await msg.reply(t('forward.replyAndNumbers'));
        return;
    }
    if (!quotedMsg && !positions.length && !textExtra) {
        await msg.reply(t('forward.needReply'));
        return;
    }
    if (positions[0] === 0) {
        await msg.reply(t('forward.badPosition'));
        return;
    }
    const max = getSetting('forward.max');
    if (positions.length > max) {
        await msg.reply(t('forward.tooMany', { n: positions.length, max }));
        return;
    }

    // Only sends if all are found (the error for whoever failed was already replied)
    const destinations = await recipients(msg, texts, lists.destinations);
    if (!destinations) return;

    // Notifies right away whoever is going (downloading the media and sending may take a while) and, when it ends, that same
    // the notice is edited with each one's status
    const total = positions.length || 1;
    const notice = withStatus ? await msg.reply(t('forward.processing', { n: total })) : null;

    // The messages, oldest to newest (without a reply or positions, only the typed text)
    let origin = quotedMsg || positions.length ? [{ pos: null, m: quotedMsg }] : [];
    if (positions.length) {
        const r = await messagesAbove(msg, positions);
        if (r.error) {
            await completeNotice(msg, notice, r.error);
            return;
        }
        origin = r.messages;
    }

    const contents = origin.length ? [] : [{ text: textExtra, media: null, type: 'chat' }];
    for (const { pos, m } of origin) {
        const c = await content(m);
        if (c.error) {
            await completeNotice(msg, notice, pos ? t('forward.errorAt', { pos, error: c.error }) : c.error);
            return;
        }
        contents.push(c);
    }

    // One message: the header opens the text (or the caption), then the typed text and below, after a line in
    // blank, the replied message's body. Several: the header and the typed text go once, before all of them
    const header = withHeader ? t('forward.header') : '';
    let separateHeader = '';
    if (contents.length === 1) {
        const body = origin.length ? contents[0].text : '';
        const middle = origin.length ? [textExtra, body].filter(Boolean).join('\n\n') : textExtra;
        contents[0].text = [header, middle].filter(Boolean).join('\n\n');
    } else {
        separateHeader = [header, textExtra].filter(Boolean).join('\n\n');
    }
    const pause = getSetting('forward.delayMs');

    const linesAlt = [];
    let failed = 0;
    for (const d of destinations) {
        const nameAlt = d.email ?? d.name;
        const who = describeDestination(d);
        try {
            if (d.email) {
                await sendPerEmail(d.email, contents, separateHeader);
            } else {
                if (separateHeader) await client.sendMessage(d.id, separateHeader);
                for (const [i, c] of contents.entries()) {
                    if (i && pause) await wait(pause);
                    await sendOnChat(d.id, c);
                }
            }
            linesAlt.push(who);
            printInfo(`/forward: ${contents.length} message(s) to ${nameAlt}`);
        } catch (err) {
            failed++;
            printError(`/forward: failed for ${nameAlt}:`, err.message);
            linesAlt.push(`${who} · ❌ ${err.message}`);
        }
    }

    // Without status (-q or forward.status off): nothing when everything was sent; on failure, the bot warns
    if (!withStatus && !failed) return;

    // Success: "✉️ ... com sucesso!" and the list of who received it
    if (!failed) {
        await completeNotice(msg, notice, t('forward.doneList', { n: contents.length, list: linesAlt.join('\n') }));
        return;
    }
    const keyAlt = failed === destinations.length ? 'forward.allFailed' : 'forward.partial';
    await completeNotice(msg, notice, t(keyAlt, { n: destinations.length, ok: destinations.length - failed, list: linesAlt.join('\n') }));
}

module.exports = { cmdForward, readPositions, separateText };
