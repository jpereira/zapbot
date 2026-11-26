/*
 * Schedule: the reminders (/cron -reminder) and the scheduled messages (/cron), with the periodic check.
 */

const { loopGuard } = require('./util/loopGuard');
const { sendMedia, commandsError, assembleText, breakLines } = require('./textCommands');
const { state: stateAlt } = require('./state');
const { client } = require('./client');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const {
    describeDestination, sendToDestinations, extractDestinations, resolveOrChoose
} = require('./destinations');
const { printError, printInfo } = require('./log');
const { statusDestinations, statusText } = require('./status');
const { STATUS_ID, register: registerPost } = require('./commands/status');
const { getSetting } = require('./settings');
const { summarizeText, withoutAccents } = require('./util/format');
const { t } = require('./i18n');
const { REPETITIONS, fmtWhen, readWhen, readRepetition, partsInBrasilia, nextRepetition } = require('./util/when');

/*
 * /cron has two modes, in the same table
 * `schedules` and in the same timer:
 * agendar  → (message mode) the plain text, as if you typed it, in the current chat or in the -to one;
 * reminder → "⏰ Lembrete" in the chat where it was created (replying to the message of
 * command, or the message it replied to), or in your private chat with
 * -private. It is the mode of -reminder.
 * Both accept -repeat (-r) daily|weekly|monthly. The message mode accepts
 * several -to (a single item, with all the destinations). In the list, -edit <no.> changes the time, the text
 * or an item's repetition, and -pause/-resume <no....|all> hold and release it.
 * A {/command} in the text runs at send time and the reply goes in its place
 * (see textCommands.js); -test <no.> shows now how the message would come out.
 * It comes out of your account: owner only.
 */
const TYPES = {
    lembrete: {
        cmd: '/cron -reminder',
        icon: '⏰',
        created: 'adm.agenda.createdReminder',
        example: 'adm.agenda.exReminder',
        acceptsTo: false,
        acceptsPv: true
    },
    agendar: {
        cmd: '/cron',
        icon: '📅',
        created: 'adm.agenda.createdMessage',
        example: 'adm.agenda.exMessage',
        acceptsTo: true,
        acceptsPv: false
    }
};
const examples = () => t('adm.agenda.examples', { a: t(TYPES.agendar.example), b: t(TYPES.lembrete.example) });

const MAX_DAYS = 366;
const DELAY_TOLERATED_MS = 5 * 60_000;

/**
 * Reads "<when> [options] <text>": the options and the "when" come at the start, in
 * any order; the text is the rest, as typed (with the line breaks,
 * and the typed \n becomes one).
 * @returns {{ opt: {list?, lembrete?, rm?, repetir?, pv?, edit?, pause?, resume?, test?}, when: {ms}|null,
 *            text: string, destinations: Array<string|null>, withDestination: boolean }}
 */
function readScheduling(args) {
    const { destinations, given: withDestination, rest } = extractDestinations(args);
    const words = [...rest.matchAll(/\S+/g)];
    const opt = {};
    let when = null;
    let i = 0;

    for (; i < words.length; i++) {
        const p = words[i][0];
        const nameAlt = p.startsWith('-') ? p.slice(1).toLowerCase() : null;

        if (nameAlt === 'list' || nameAlt === 'l') opt.list = true;
        else if (nameAlt === 'private') opt.private = true;
        else if (nameAlt === 'status') opt.status = true;
        else if (nameAlt === 'reminder' || nameAlt === 'rem') opt.reminder = true;
        else if (['rm', 'pause', 'resume'].includes(nameAlt)) {
            // One or several numbers (-rm 2, -rm 1 3 5, -rm 1,3,5) or all
            const nums = [];
            while (/^\d+(?:,\d+)*,?$|^all$/i.test(words[i + 1]?.[0] ?? '')) nums.push(words[++i][0]);
            opt[nameAlt] = nums.join(' ');
        } else if (['edit', 'test'].includes(nameAlt)) opt[nameAlt] = words[++i]?.[0] ?? '';
        else if (nameAlt === 'repeat' || nameAlt === 'r') opt.repeat = words[++i]?.[0] ?? '';
        else if (!when && (when = readWhen(words.slice(i).map(m => m[0])))) i += when.used - 1;
        else break;
    }

    const textAlt = i < words.length ? breakLines(rest.slice(words[i].index)).trim() : '';
    return { opt, when, text: textAlt, destinations, withDestination };
}

// Reminders and messages together, in the order they go out (the -rm numbers). The daily status (/bot -status) is left out
const listAlt = () => dbAll("SELECT * FROM schedules WHERE kind != 'status' ORDER BY due_at, id");

// An item's destinations: the several -to (recipients) or its chat
const itemDestinations = (s) => (s.recipients
    ? JSON.parse(s.recipients)
    : [{ id: s.chat_id, name: s.chat_name, group: Boolean(s.is_group) }]);

// Where it goes: "👥 Grupo", "👤 Contato" or "your private chat"
const destinationWhere = (d) => (d.id === client.info.wid._serialized ? t('adm.agenda.myPrivate') : `${d.group ? '👥' : '👤'} ${d.name}`);
const itemWhere = (s) => itemDestinations(s).map(destinationWhere).join(', ');

// The same, with the id (group) or the number (person), for the log
function whereInLog(d) {
    const whereAlt = destinationWhere(d);
    if (d.id === client.info.wid._serialized) return whereAlt;
    const numberAlt = !d.group && d.id.endsWith('@c.us') ? `+${d.id.split('@')[0]}` : d.id;
    return `${whereAlt} (${numberAlt})`;
}

function listLine(s, i) {
    const repeat = s.repeat ? ` 🔁 ${REPETITIONS[s.repeat].label}` : '';
    const paused = s.paused ? t('adm.agenda.paused') : '';
    // The whole text, as registered; the following lines indented, like the destination's
    const prepend = getSetting('cron.msgPrepend');
    const textAlt = `${prepend}${s.text}`.replace(/\n/g, '\n   ');
    const destinations = itemDestinations(s).map(d => `\n   → ${destinationWhere(d)}`).join('');
    return `${i + 1}. ${TYPES[s.kind]?.icon ?? '📅'} *${fmtWhen(s.due_at)}*${repeat}${paused} — ${textAlt}${destinations}`;
}

// "2" → [item 2]; "all" → all; otherwise null
function numberItems(items, valueAlt) {
    const target = withoutAccents(valueAlt).trim();
    if (target === 'all') return items;
    const item = /^\d+$/.test(target) ? items[Number(target) - 1] : null;
    return item ? [item] : null;
}

/*
 * "1 3,5" → items 1, 3 and 5 (the list numbers, in order; a repeat counts
 * once); "all" → all. If any does not exist: { missing }, and the caller does not
 * touches none.
 * @returns {{ targets: object[] } | { missing: string[] }}
 */
function numbersItems(items, valueAlt) {
    const partsAlt = withoutAccents(valueAlt ?? '').split(/[\s,]+/).filter(Boolean);
    if (partsAlt.includes('all')) return { targets: items };

    const numbers = [...new Set(partsAlt.map(Number))].sort((a, b) => a - b);
    const missing = numbers.filter(n => !items[n - 1]);
    if (!numbers.length || missing.length) return { missing: missing.length ? missing.map(String) : ['?'] };
    return { targets: numbers.map(n => items[n - 1]) };
}

// "❌ Nº 7, 9 não existem. Nada foi <done>; ..."
const numbersError = (missing, done, usage) =>
    t('adm.agenda.noItem', { n: missing.length, list: missing.join(', '), done, usage });

// The "when" of a new or edited item: in the future and up to MAX_DAYS
function whenError(ms, nowAlt = Date.now()) {
    if (ms <= nowAlt) return t('adm.agenda.pastErr', { when: fmtWhen(ms) });
    if (ms > nowAlt + MAX_DAYS * 86400_000) return t('adm.agenda.maxDays', { n: MAX_DAYS });
    return null;
}

/*
 * -pause / -resume <no....|all>. When resuming, a repeated item that expired while
 * was paused jumps to the next time; a one-off goes out on the next check.
 */
async function pauseOrResume(msg, items, pause, valueAlt) {
    const optionAlt = pause ? '-pause' : '-resume';
    const { targets, missing } = numbersItems(items, valueAlt);

    if (missing) {
        await msg.reply(numbersError(missing, t(pause ? 'adm.agenda.donePaused' : 'adm.agenda.doneResumed'), t('adm.agenda.usePause', { option: optionAlt })));
        return;
    }

    const nowAlt = Date.now();
    const linesAlt = [];
    for (const s of targets.filter(s => Boolean(s.paused) !== pause)) {
        let dueAt = s.due_at;
        if (!pause && s.repeat) while (dueAt <= nowAlt) dueAt = nextRepetition(dueAt, s.repeat, s.day_of_month);

        await dbRun('UPDATE schedules SET paused = ?, due_at = ? WHERE id = ?', [pause ? 1 : 0, dueAt, s.id]);
        const expired = !pause && dueAt <= nowAlt ? t('adm.agenda.overdue') : '';
        linesAlt.push(`• *${fmtWhen(dueAt)}* — ${summarizeText(s.text, 60)}${expired}`);
    }

    if (!linesAlt.length) {
        await msg.reply(t(pause ? 'adm.agenda.wasPaused' : 'adm.agenda.wasNotPaused'));
        return;
    }

    await msg.reply(`${t(pause ? 'adm.agenda.pausedTitle' : 'adm.agenda.resumedTitle')} (${linesAlt.length})\n${linesAlt.join('\n')}` +
        (pause ? t('adm.agenda.resumeHint') : ''));
}

/*
 * -edit <no.> [when] [-repeat ...] [text]: replaces whatever comes. The destination and the
 * mode do not change (for that, remove and create again).
 */
async function edit(msg, items, { opt, when, text: textAlt }) {
    const [s] = numberItems(items, opt.edit ?? '') ?? [];

    if (!s || withoutAccents(opt.edit).trim() === 'all') {
        await msg.reply(t('adm.agenda.editNotFound', { n: opt.edit || '?' }));
        return;
    }
    if (!when && !textAlt && opt.repeat === undefined) {
        await msg.reply(t('adm.agenda.editNothing'));
        return;
    }

    let repeatAlt = s.repeat;
    if (opt.repeat !== undefined) {
        const typed = withoutAccents(opt.repeat).trim().toLowerCase();
        repeatAlt = readRepetition(typed);
        if (['nao', 'off', 'no'].includes(typed)) repeatAlt = null;
        else if (!repeatAlt) {
            await msg.reply(t('adm.agenda.useRepeatOff'));
            return;
        }
    }

    const errorCommand = textAlt ? await commandsError(textAlt, '/cron', msg.fromMe) : null;
    if (errorCommand) {
        await msg.reply(errorCommand);
        return;
    }

    const dueAt = when?.ms ?? s.due_at;
    if (when) {
        const errorAlt = whenError(dueAt);
        if (errorAlt) {
            await msg.reply(errorAlt);
            return;
        }
    }

    await dbRun('UPDATE schedules SET due_at = ?, day_of_month = ?, text = ?, repeat = ? WHERE id = ?',
        [dueAt, when ? partsInBrasilia(dueAt).day : s.day_of_month, textAlt || s.text, repeatAlt, s.id]);

    await msg.reply(t('adm.agenda.edited', { icon: TYPES[s.kind]?.icon ?? '📅', when: fmtWhen(dueAt) }) +
        (repeatAlt ? ` 🔁 ${REPETITIONS[repeatAlt].label}` : '') + (s.paused ? t('adm.agenda.paused') : '') +
        `\n📝 ${summarizeText(textAlt || s.text, 100)}`);
}

async function handleSchedule({ msg, args, chatId, chatName, isGroup, quotedMsg }) {
    await dbReady;

    const { opt, when, text: typed, destinations: destinationsText, withDestination } = readScheduling(args);

    // Reminder mode: with -reminder
    const kind = opt.reminder ? 'lembrete' : 'agendar';
    const type = TYPES[kind];
    const syntax = t('adm.agenda.syntax', { ex: t(type.example) });
    const items = await listAlt();

    // -status: the text goes to the WhatsApp Status (message only; without -to or -private)
    if (opt.status && (opt.reminder || opt.private || withDestination)) {
        await msg.reply(t('adm.agenda.statusConflict'));
        return;
    }

    if (opt.private && !type.acceptsPv) {
        await msg.reply(t('adm.agenda.pvOnlyReminder'));
        return;
    }

    if (withDestination && !type.acceptsTo) {
        await msg.reply(t('adm.agenda.reminderNoTo'));
        return;
    }

    // -rm <no....|all>: the numbers are those of the list, all read before removing
    if (opt.rm !== undefined) {
        if (/\ball\b/i.test(opt.rm)) {
            await dbRun("DELETE FROM schedules WHERE kind != 'status'");
            await msg.reply(t('adm.agenda.allRemoved', { n: items.length === 1 ? 1 : 2, total: items.length }));
            return;
        }

        // If any does not exist: none is removed (the list stays as it was)
        const { targets: removed, missing } = numbersItems(items, opt.rm);
        if (missing) {
            await msg.reply(numbersError(missing, t('adm.agenda.doneRemoved'), t('adm.agenda.useRm')));
            return;
        }

        for (const s of removed) await dbRun('DELETE FROM schedules WHERE id = ?', [s.id]);

        const line = (s) => `*${fmtWhen(s.due_at)}* — ${summarizeText(s.text, 60)}`;
        await msg.reply(removed.length === 1
            ? t('adm.agenda.removedOne', { line: line(removed[0]) })
            : `${t('adm.agenda.removedMany', { n: removed.length })}\n${removed.map(s => `• ${line(s)}`).join('\n')}`);
        return;
    }

    // -pause / -resume <nº|all>
    if (opt.pause !== undefined || opt.resume !== undefined) {
        await pauseOrResume(msg, items, opt.pause !== undefined, opt.pause ?? opt.resume);
        return;
    }

    // -edit <no.> [when] [-repeat ...] [text]
    if (opt.edit !== undefined) {
        if (withDestination || opt.private || opt.reminder) {
            await msg.reply(t('adm.agenda.editLimits'));
            return;
        }
        await edit(msg, items, { opt, when, text: typed });
        return;
    }

    // -test <no.>: builds now (running the {/command}s) and shows here, without sending to the destination
    if (opt.test !== undefined) {
        await test(msg, items, opt.test);
        return;
    }

    // -l, or nothing: the list (reminders and messages)
    if (opt.list || (!when && !typed && !quotedMsg)) {
        if (!items.length) {
            await msg.reply(t('adm.agenda.nothing', { examples: examples() }));
            return;
        }

        await msg.reply(`${t('adm.agenda.listTitle', { n: items.length })}\n\n${items.map(listLine).join('\n')}\n\n` +
            t('adm.agenda.listHints'));
        return;
    }

    if (!when) {
        await msg.reply(t('adm.agenda.badWhen', { syntax }));
        return;
    }

    // Reminder replying to a message: its text, if no other comes
    const textAlt = typed || (kind === 'lembrete' ? quotedMsg?.body?.trim() : '') || '';

    if (!textAlt) {
        await msg.reply(t('adm.agenda.noText', { syntax }));
        return;
    }

    // {/command} in the text: it exists and can run in /cron (the error shows now, not at send time)
    const errorCommand = await commandsError(textAlt, '/cron', msg.fromMe);
    if (errorCommand) {
        await msg.reply(errorCommand);
        return;
    }

    const nowAlt = Date.now();
    const errorWhen = whenError(when.ms, nowAlt);
    if (errorWhen) {
        await msg.reply(errorWhen);
        return;
    }

    let repeatAlt = null;
    if (opt.repeat !== undefined) {
        repeatAlt = readRepetition(opt.repeat);
        if (!repeatAlt) {
            await msg.reply(t('adm.agenda.useRepeat'));
            return;
        }
    }

    const max = getSetting('cron.max');
    const { n: total } = await dbGet("SELECT COUNT(*) AS n FROM schedules WHERE kind != 'status'");
    if (total + 1 > max) {
        await msg.reply(t('adm.agenda.limit', { max }));
        return;
    }

    // Where it goes: -to (message; several -to, one item with all), -private (reminder) or the current chat
    const myId = client.info.wid._serialized;
    let destinations = [{ id: chatId, name: chatName, group: Boolean(isGroup) }];

    if (opt.status) {
        destinations = [{ id: STATUS_ID, name: t('adm.agenda.statusName'), group: false }];
    } else if (withDestination) {
        destinations = [];
        for (const destinationText of destinationsText) {
            // Several contacts or groups with the name: waits for you to choose from the list
            const destination = await resolveOrChoose(msg, destinationText, {
                noEmail: t('adm.agenda.semEmail')
            });
            if (!destination) return;
            if (!destinations.some(d => d.id === destination.id)) destinations.push(destination);
        }
    } else if (opt.private) {
        destinations = [{ id: myId, name: 'seu privado', group: false }];
    }

    // The reminder replies to the message replied by the command, or the command itself (only in the same chat)
    const [first] = destinations;
    const quoted = kind === 'lembrete' && first.id === chatId
        ? (quotedMsg?.id?._serialized ?? msg.id?._serialized ?? null)
        : null;
    const recipients = destinations.length > 1
        ? JSON.stringify(destinations.map(d => ({ id: d.id, name: d.name, group: Boolean(d.group) })))
        : null;

    await dbRun(
        `INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month, quoted_id, created_at, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [kind, first.id, first.name, first.group ? 1 : 0, textAlt, when.ms, repeatAlt,
            partsInBrasilia(when.ms).day, quoted, nowAlt, recipients]
    );

    const whereAlt = (d) => (d.id === myId ? t('adm.agenda.inPrivate') : d.id === chatId ? t('adm.agenda.inThisChat') : t('adm.agenda.inDest', { destination: describeDestination(d) }));
    await msg.reply(t('adm.agenda.created', {
        icon: type.icon,
        created: t(type.created),
        when: fmtWhen(when.ms),
        repeats: repeatAlt ? ` 🔁 ${REPETITIONS[repeatAlt].label}` : '',
        where: destinations.length > 1
            ? t('adm.agenda.inChats', { n: destinations.length, list: destinations.map(d => `• ${describeDestination(d)}`).join('\n') })
            : ` ${whereAlt(destinations[0])}.\n`,
        text: summarizeText(textAlt, 100)
    }) + (opt.status ? `\n${t('adm.agenda.statusRisk')}` : ''));
}

// What goes out in the chat: the plain text (message mode) or the ⏰ Reminder
function itemText(s, textAlt, late = false) {
    if (s.kind === 'agendar') return textAlt;
    return `${t('adm.agenda.reminderTitle')}\n\n${textAlt}` + (late ? t('adm.agenda.late', { when: fmtWhen(s.due_at) }) : '');
}

/*
 * -test <no.>: builds the item now, running the {/command}s as in the destination chat,
 * and shows here how it would come out. Does not send to the destination nor touch the schedule.
 */
async function test(msg, items, valueAlt) {
    const [s] = numberItems(items, valueAlt ?? '') ?? [];

    if (!s || withoutAccents(valueAlt).trim() === 'all') {
        await msg.reply(t('adm.agenda.testNotFound', { n: valueAlt || '?' }));
        return;
    }

    // The {/command}s run as in the first destination
    const { text: textAlt, mediaItems: mediaAltAlt } = await assembleText(s.text, s);

    await msg.reply(t('adm.agenda.testTitle', {
        n: valueAlt.trim(),
        when: fmtWhen(s.due_at),
        where: itemWhere(s),
        text: textAlt ? itemText(s, textAlt) : t('adm.agenda.onlyMedia')
    }));
    for (const { content, options } of mediaAltAlt) await msg.reply(content, undefined, { caption: options?.caption });
}

// Sends an expired item; with repetition, schedules the next one
async function triggerItem(s, nowAlt) {
    const late = nowAlt - s.due_at > DELAY_TOLERATED_MS;

    if (s.repeat) {
        let next = s.due_at;
        while (next <= nowAlt) next = nextRepetition(next, s.repeat, s.day_of_month);
        await dbRun('UPDATE schedules SET due_at = ? WHERE id = ?', [next, s.id]);
    } else {
        // Goes out BEFORE sending: if the send fails, it does not repeat on every check
        await dbRun('DELETE FROM schedules WHERE id = ?', [s.id]);
    }

    if (s.kind === 'status') {
        // The /bot -status report, built on the spot, in the -to destinations (without them, the private chat)
        const destinations = statusDestinations(s);
        const textAlt = await statusText(nowAlt);
        await sendToDestinations(destinations, textAlt, { subject: t('adm.agenda.statusSubject') })
            .catch(err => printError('/bot -status: failed to send:', err.message));
        printInfo(`/bot -status: sent to ${destinations.length ? destinations.map(d => d.email ?? d.id).join(', ') : 'your private chat'}` +
            (late ? ' (late)' : ''));
        return;
    }

    // A destination that fails does not hold up the others
    for (const d of itemDestinations(s)) {
        await itemSendOnDestination(s, d, late)
            .catch(err => printError(`${TYPES[s.kind]?.cmd}: failed to send ${s.id} to ${whereInLog(d)}:`, err.message));
    }
}

/*
 * An item destination: the {/command}s run in the context of its chat (/stats
 * of a group is the group's) and the media goes out after the message.
 */
async function itemSendOnDestination(s, d, late) {
    const inChat = { ...s, chat_id: d.id, chat_name: d.name, is_group: d.group ? 1 : 0 };
    const { text: assembled, mediaItems: mediaAltAlt, commands } = await assembleText(s.text, inChat);
    const prepend = s.kind === 'lembrete' ? getSetting('cron.msgPrepend') : '';
    const textAlt = assembled
        ? `${prepend}${itemText(s, assembled, late)}`
        : '';

    // Media only (e.g.: "{/meme}"): there is no text to send
    if (textAlt && s.kind === 'agendar') {
        await client.sendMessage(d.id, textAlt);
    } else if (textAlt) {
        // The quoted message may be gone: without it, it goes without quoting
        await client.sendMessage(d.id, textAlt, s.quoted_id ? { quotedMessageId: s.quoted_id } : {})
            .catch(() => client.sendMessage(d.id, textAlt));
    }
    await sendMedia(d.id, mediaAltAlt);
    if (d.id === STATUS_ID) await registerPost(null).catch(() => {});

    printInfo(`${TYPES[s.kind]?.cmd}: sent to ${whereInLog(d)}` +
        (commands.length ? `, with ${commands.map(c => `{${c}}`).join(', ')}` : '') +
        `${late ? ' (late)' : ''}${s.repeat ? ` (${s.repeat})` : ''}`);
}

/*
 * Periodic check (every 30 s): sends what expired. Disconnected, waits;
 * on return, sends what expired in the meantime (reminders warn about the delay).
 */
const guard = loopGuard('/cron');

async function checkSchedule() {
    if (guard.busy() || !stateAlt.ready) return;
    guard.start();

    try {
        await dbReady;
        const nowAlt = Date.now();
        const expiredAlt3 = await dbAll('SELECT * FROM schedules WHERE due_at <= ? AND paused = 0 ORDER BY due_at, id', [nowAlt]);

        for (const s of expiredAlt3) {
            await triggerItem(s, nowAlt).catch(err => printError(`${TYPES[s.kind]?.cmd ?? s.kind}: failed to send ${s.id}:`, err.message));
        }
    } catch (err) {
        printError('Error checking the schedule:', err.message);
    } finally {
        guard.end();
    }
}

// Called in app.js
function startSchedule() {
    setInterval(checkSchedule, 30 * 1000);
}

module.exports = {
    startSchedule,
    readScheduling,
    handleSchedule,
    checkSchedule
};
