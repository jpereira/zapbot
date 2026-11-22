/*
 * /calendar command: an appointment in a text becomes a calendar event.
 * /calendar <text>       → an .ics file (Google Calendar, Apple, Outlook) and the "add to Google Calendar" link
 * /calendar, replying    → the text of the replied message
 * -gpt asks ChatGPT for the Google Calendar JSON; the default reads it locally (labels, dates, times). -json also
 * sends the event as the Google Calendar API's JSON. -quiet: only the .ics file.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { commandUsage } = require('./base');
const { completeNotice } = require('../client');
const { describeAlarms, fromGoogleJson, gptInstructions, parseLocal, toGoogleJson, toGoogleLink, toIcs } = require('../calendar');
const { CHATGPT, engineProcessing, gptAllowed, pickEngine, withEngineTip } = require('../engines');
const { t } = require('../i18n');
const { printError } = require('../log');
const { WITHOUT_KEY, askOnChat, consumptionFooter, errorOpenAi, keyOpenAi, measureConsumption } = require('../openaiChat');
const { getSetting } = require('../settings');

const MAX_CHARS = 6000;

const slug = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'event';

function describe(event) {
    const zone = event.timeZone;
    const day = (ms) => new Intl.DateTimeFormat(t('calendar.locale'), { timeZone: zone, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));
    const hour = (ms) => new Intl.DateTimeFormat(t('calendar.locale'), { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
    const when = event.allDay
        ? `${event.startDate.split('-').reverse().join('/')} (${t('calendar.allDay')})`
        : `${day(event.start)} · ${hour(event.start)} → ${hour(event.end)}`;
    return [
        `📅 *${event.summary}*`,
        `🗓️ ${when}`,
        event.location && `📍 ${event.location}`,
        event.alarms.length && `⏰ ${t('calendar.reminders', { list: describeAlarms(event.alarms) })}`
    ].filter(Boolean).join('\n');
}

async function build({ msg, args, opts, quotedMsg, admin, chatId, isGroup, senderNumber }) {
    let engine;
    try {
        engine = pickEngine(opts, 'calendar.engine');
    } catch (err) {
        await msg.reply(err.message);
        return;
    }
    const duration = Number(getSetting('calendar.duration'));
    if (!gptAllowed({ engine, admin, cmd: '/calendar', senderNumber, chatId, isGroup })) {
        await msg.reply(t('calendar.gptNeedsLimit'));
        return;
    }
    if (engine === 'gpt' && !keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/calendar'));
        return;
    }

    // What was typed wins; without it, the replied message
    const typed = String(args ?? '').replace(/(^|\s)-(?:quiet|q|gpt|g|local|l|json|j|status|s)(?=\s|$)/g, ' ').trim();
    const text = (typed || String(quotedMsg?.body ?? '')).trim();
    if (!text) {
        await msg.reply(commandUsage('/calendar'));
        return;
    }
    if (text.length > MAX_CHARS) {
        await msg.reply(t('calendar.tooLong', { n: text.length, max: MAX_CHARS }));
        return;
    }

    const timeZone = getSetting('calendar.timezone');
    const emoji = Boolean(getSetting('calendar.addEmoji'));
    const quiet = Boolean(opts.opt.quiet);
    const name = engine === 'gpt' ? CHATGPT : t('calendar.localEngine');
    const notice = quiet ? null : await msg.reply(engineProcessing('calendar', name), null, { linkPreview: false });
    try {
        const now = Date.now();
        let event;
        if (engine === 'gpt') {
            const answer = await askOnChat({ cmd: '/calendar', system: gptInstructions({ timeZone, duration, now, emoji }), text });
            event = fromGoogleJson(answer, { timeZone, duration, now });
        } else {
            event = parseLocal(text, { now, timeZone, duration, emoji });
        }
        if (!event) {
            await completeNotice(msg, notice, t('calendar.noDate'));
            return;
        }

        const ics = toIcs(event, { now });
        const media = new MessageMedia('text/calendar', Buffer.from(ics, 'utf8').toString('base64'), `${slug(event.summary)}.ics`);
        if (quiet) {
            await msg.reply(media, null, { sendMediaAsDocument: true });
        } else {
            const tip = withEngineTip('', 'calendar', name, { sep: '', quiet });
            const link = getSetting('calendar.googleLink') ? `\n\n➕ ${t('calendar.google')}: ${toGoogleLink(event)}` : '';
            const caption = `${describe(event)}${link}${tip ? `\n\n${tip.trim()}` : ''}${engine === 'gpt' ? await consumptionFooter() : ''}`;
            await completeNotice(msg, notice, t('calendar.below'), { linkPreview: false });
            await msg.reply(media, null, { sendMediaAsDocument: true, caption });
        }
        if (opts.opt.json) await msg.reply(`\`\`\`${JSON.stringify(toGoogleJson(event), null, 2)}\`\`\``, null, { linkPreview: false });
    } catch (err) {
        if (engine === 'gpt' && err.response) {
            await completeNotice(msg, notice, errorOpenAi(err, '/calendar'));
            return;
        }
        printError('/calendar:', err.message);
        await completeNotice(msg, notice, t('calendar.failed', { error: err.message }));
    }
}

const cmdCalendar = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => build(ctx));

module.exports = { cmdCalendar };
