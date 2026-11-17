/*
 * /forward command: forwards messages (text, media, location...) to the recipients.
 * /forward /Fulano de Tal/ @Maria Beltrano   → the replied message, to contacts and groups
 * /forward -to fulano@exemplo.com            → email (several -to work)
 * /forward -1 /Fulano/                       → without a reply: the message right above (-1)
 * /forward -1 -4 -6 /Fulano/                 → the messages at positions -1, -4 and -6 (also -1,-4,-6)
 * /forward -3..-1 /Fulano/                   → from -3 to -1, in sequence
 * /forward -dry /Fulano/                     → only validates the recipients, without sending
 * /forward #list ...                        → the saved lists (see forwardLists.js: -add, -l, -rm...)
 * Only sends if all recipients are found. The "forwarded by ZapBot" header (setting
 * forward.header) and the status (the notice and the list of who received it, setting forward.status) come on; -quiet|-q
 * removes both (only the failures) and -status|-s forces both. With several messages, the header goes only once.
 * /forward /Fulano/ #grupo Text for everyone   → the typed text goes at the start; with a reply, its message below
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
        if (!mediaAlt?.data) return { erro: t('forward.download') };
    } else if (type === 'location' && m.location) {
        const { latitude, longitude, description } = m.location;
        textAlt = [description, `https://maps.google.com/?q=${latitude},${longitude}`].filter(Boolean).join('\n');
    } else if (m.pollName) {
        textAlt = `📊 ${m.pollName}\n${(m.pollOptions ?? []).map(o => `• ${o.name ?? o}`).join('\n')}`;
    }

    if (!textAlt && !mediaAlt) return { erro: t('forward.empty') };
    return { texto: textAlt, midia: mediaAlt, tipo: type };
}

// Audio, voice note and sticker do not accept a caption: the text goes before, in another message
const WITHOUT_CAPTION = new Set(['audio', 'ptt', 'sticker']);

async function sendOnChat(id, { texto: textAlt, midia: mediaAlt, tipo: type }) {
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
    const attachments = contents.filter(c => c.midia).map(({ midia: mediaAlt }, i) => {
        const extension = String(mediaAlt.mimetype ?? '').split(';')[0].split('/')[1] || 'bin';
        return { filename: mediaAlt.filename || `anexo${i ? `-${i + 1}` : ''}.${extension}`, content: Buffer.from(mediaAlt.data, 'base64'), contentType: mediaAlt.mimetype };
    });
    await sendEmail({
        para: email.split(/\s*,\s*/),
        assunto: t('forward.subject'),
        texto: [header, ...contents.map(c => c.texto)].filter(Boolean).join('\n\n') || t('forward.noText'),
        anexos: attachments
    });
}

/*
 * The positions right at the start of the command: -1, -1 -4 -6, -1,-4,-6, -3..-1 (and mixes). Returns the positions
 * (1 = the message right above) and the rest of the text.
 */
const SELECAO = /^(?:-\d+(?:\.\.-?\d+)?(?:\s*,\s*|\s+|$))+/;

function readPositions(textAlt) {
    const m = textAlt.match(SELECAO);
    if (!m) return { posicoes: [], resto: textAlt };

    const positions = new Set();
    for (const [, de, ate] of m[0].matchAll(/-(\d+)(?:\.\.-?(\d+))?/g)) {
        const [a, b] = [Number(de), Number(ate ?? de)];
        for (let p = Math.min(a, b); p <= Math.max(a, b); p++) positions.add(p);
    }
    return { posicoes: [...positions].sort((x, y) => x - y), resto: textAlt.slice(m[0].length).trim() };
}

// They are not people's messages: WhatsApp notices (joined, left...), calls, deleted ones
const SYSTEM_TYPES = new Set(['gp2', 'notification', 'notification_template', 'e2e_notification', 'call_log', 'protocol', 'ciphertext', 'revoked']);

/**
 * The messages at the requested positions (1 = the one right above the command), oldest to newest.
 * Skips WhatsApp notices and what the bot itself sent (replies, status).
 * @returns {Promise<{ mensagens: object[] } | { erro: string }>}
 */
async function messagesAbove(msg, positions) {
    const greater = positions.at(-1);
    let buscadas;
    try {
        const chat = await msg.getChat();
        buscadas = await chat.fetchMessages({ limit: Math.min(greater + 50, 300) });
    } catch (err) {
        printError('/forward: could not read the chat messages:', err.message);
        return { erro: t('forward.fetchFailed', { error: err.message }) };
    }

    // Only what came before the command
    const idCommand = msg.id?._serialized;
    const beforeAlt = buscadas.findIndex(m => m.id?._serialized === idCommand);
    const candidatas = (beforeAlt >= 0 ? buscadas.slice(0, beforeAlt) : buscadas)
        .filter(m => !SYSTEM_TYPES.has(m.type) && !sentByBot(m));

    const chosen = [];
    for (const p of positions) {
        const m = candidatas[candidatas.length - p];
        if (!m) return { erro: t('forward.notEnough', { n: candidatas.length, pos: p }) };
        chosen.push({ pos: p, m });
    }
    // From oldest (larger position) to newest
    return { mensagens: chosen.reverse() };
}

// The resolved loose ones plus those from the lists, without repeats; over forward.maxRecipients, it does not send.
// Whoever in a #list is the command's own chat (the conversation the message came from) stays out:
// .ignored says who. The loose ones you typed always count.
async function recipients(msg, texts, listsAlt) {
    const avulsos = texts.length ? await resolverDestinations(msg, texts, { aceitaEmail: true }) : [];
    if (!avulsos) return null;

    const chatCurrent = String(msg.id?.remote ?? msg.from ?? '').split('@')[0];
    const isOChat = (d) => Boolean(chatCurrent) && d.id?.split('@')[0] === chatCurrent;
    const ignored = listsAlt.filter(d => isOChat(d) && !avulsos.some(a => a.id === d.id));

    const allAlt2 = listsAlt.filter(d => !ignored.includes(d));
    for (const d of avulsos) if (!allAlt2.some(x => (x.email ?? x.id) === (d.email ?? d.id))) allAlt2.push(d);

    if (!allAlt2.length && ignored.length) {
        await msg.reply(t('forward.onlyThisChat', { list: ignored.map(describeDestination).join(', ') }));
        return null;
    }

    const max = getSetting('forward.maxRecipients');
    if (allAlt2.length > max) {
        await msg.reply(t('forward.tooManyRecipients', { n: allAlt2.length, max }));
        return null;
    }
    allAlt2.ignorados = ignored;
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
    if (items.length || jaHasDestination) return { destinatarios: items.join(' '), texto: s };
    return { destinatarios: String(rest ?? '').trim(), texto: '' };
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
    const { posicoes: positions, resto: withoutPositions } = readPositions(withoutQuiet);

    // The -to (emails and also chats) and, in the rest, the recipients: /Name/, "Name", @mention, +number, words
    const { destinos: porTo, resto: withoutTo } = extractDestinations(withoutPositions);

    // The #lists (whole name) become the saved members; the rest are loose recipients
    const lists = await expandLists(withoutTo);
    if (lists.erro) {
        await msg.reply(lists.erro);
        return;
    }

    // After the explicit recipients (/Name/, "Name", @mention, +number, email, #list, -to) whatever is left is the
    // text to send: goes at the start, and the replied message below. Only loose words remain a name.
    const { destinatarios: restDestinations, texto: textExtra } = separateText(lists.resto, lists.destinos.length > 0 || porTo.length > 0);
    const texts = [...textPeople(restDestinations).map(withoutDelimiters), ...porTo];

    if (!texts.length && !lists.destinos.length) {
        await msg.reply(commandUsage('/forward'));
        return;
    }
    // -dry: only validates the recipients (the error for whoever was not found is already replied), without sending
    if (simulation) {
        const foundAlt6 = await recipients(msg, texts, lists.destinos);
        if (!foundAlt6) return;
        const note = foundAlt6.ignorados?.length
            ? `\n\n${t('forward.dryIgnored', { list: foundAlt6.ignorados.map(describeDestination).join(', ') })}` : '';
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
    const destinations = await recipients(msg, texts, lists.destinos);
    if (!destinations) return;

    // Notifies right away whoever is going (downloading the media and sending may take a while) and, when it ends, that same
    // the notice is edited with each one's status
    const total = positions.length || 1;
    const notice = withStatus ? await msg.reply(t('forward.processing', { n: total })) : null;

    // The messages, oldest to newest (without a reply or positions, only the typed text)
    let origin = quotedMsg || positions.length ? [{ pos: null, m: quotedMsg }] : [];
    if (positions.length) {
        const r = await messagesAbove(msg, positions);
        if (r.erro) {
            await completeNotice(msg, notice, r.erro);
            return;
        }
        origin = r.mensagens;
    }

    const contents = origin.length ? [] : [{ texto: textExtra, midia: null, tipo: 'chat' }];
    for (const { pos, m } of origin) {
        const c = await content(m);
        if (c.erro) {
            await completeNotice(msg, notice, pos ? t('forward.errorAt', { pos, error: c.erro }) : c.erro);
            return;
        }
        contents.push(c);
    }

    // One message: the header opens the text (or the caption), then the typed text and below, after a line in
    // blank, the replied message's body. Several: the header and the typed text go once, before all of them
    const header = withHeader ? t('forward.header') : '';
    let headerAparte = '';
    if (contents.length === 1) {
        const body = origin.length ? contents[0].texto : '';
        const meio = origin.length ? [textExtra, body].filter(Boolean).join('\n\n') : textExtra;
        contents[0].texto = [header, meio].filter(Boolean).join('\n\n');
    } else {
        headerAparte = [header, textExtra].filter(Boolean).join('\n\n');
    }
    const pause = getSetting('forward.delayMs');

    const linesAlt = [];
    let failed = 0;
    for (const d of destinations) {
        const nameAlt = d.email ?? d.nome;
        const who = describeDestination(d);
        try {
            if (d.email) {
                await sendPerEmail(d.email, contents, headerAparte);
            } else {
                if (headerAparte) await client.sendMessage(d.id, headerAparte);
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
