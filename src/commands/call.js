/*
 * /call command: rejecting voice and video calls (src/calls.js), without going through /set.
 * /call                       → as it is: on or not, the message, who always rings and who is always rejected
 *   /call -on | -off            → liga e desliga a recusa (setting call.reject)
 * /call -msg <text>          → the message sent to whoever had the call rejected (call.message);
 * -msg off: rejects silently · -msg reset: the default text
 * /call -allow <people...>   → whose calls are never rejected (call.allow)
 *   /call -deny <pessoas...> [-msg <texto>]
 * → whose calls are always rejected, even with rejection off, with the
 * message (the default of whoever was denied, if -msg does not come)
 * /call -rm <people...>      → removes from both lists
 */

const { commandUsage } = require('./base');
const { releaseDenied, listDenied, rejectMessage, deniedMessage, deny } = require('../calls');
const { peopleItems, peopleChangeList } = require('./set');
const { t } = require('../i18n');
const { getSetting, setSetting } = require('../settings');

// The /call options, to know where the -msg text ends and where the people begin
const OPTIONS = '(?:on|off|msg|m|allow|a|rm|r|deny|d)';

/**
 * Removes -msg|-m from the text: what comes after it, up to the next option, is the message (with or without quotes).
 * @returns {{ texto: string|null, resto: string }} texto: null if -msg did not come (or came with nothing)
 */
function separateMsg(args) {
    const raw = String(args ?? '');
    const m = raw.match(new RegExp(`(?:^|\\s)-(?:msg|m)(?:\\s+(.+?))?(?=\\s-${OPTIONS}(?:\\s|$)|$)`, 's'));
    if (!m) return { texto: null, resto: raw.trim() };
    const textAlt = (m[1] ?? '').trim().replace(/^(["“'])(.*)(["”'])$/s, '$2').trim();
    return { texto: textAlt || null, resto: `${raw.slice(0, m.index)} ${raw.slice(m.index + m[0].length)}`.trim() };
}

// The text without the /call options: the people are left
const soAsPeople = (textAlt) => textAlt.replace(new RegExp(`(?:^|\\s)-${OPTIONS}(?=\\s|$)`, 'g'), ' ').trim();

const showList = (items) => (items.length ? items.map((n) => `+${n}`).join(', ') : '—');

// How the rejection is
async function statusAlt() {
    const messageAlt = rejectMessage();
    const denied = await listDenied();
    return t('adm.call.status', {
        state: t(getSetting('call.reject') ? 'adm.call.on' : 'adm.call.off'),
        text: messageAlt || t('adm.call.silent'),
        allow: showList(getSetting('call.allow')),
        deny: denied.length
            ? denied.map((n) => `+${n.phone}${n.message ? ` (${deniedMessage(n.message) || t('adm.call.silentShort')})` : ''}`).join(', ')
            : '—'
    });
}

async function cmdCall({ msg, opts, args }) {
    const { given } = opts;
    const turnOn = given.has('on');
    const turnOff = given.has('off');
    const allow = given.has('allow');
    const denyAlt = given.has('deny');
    const remove = given.has('rm');
    const touchInPeople = allow || denyAlt || remove;

    // Only one list change at a time; -msg together only counts with -deny (the denied people's message)
    if ((turnOn && turnOff) || [allow, denyAlt, remove].filter(Boolean).length > 1 || ((allow || remove) && given.has('msg'))) {
        await msg.reply(commandUsage('/call'));
        return;
    }

    const { texto: messageAlt, resto: rest } = separateMsg(args);
    if (given.has('msg') && !messageAlt) {
        await msg.reply(commandUsage('/call'));
        return;
    }

    let changed = false;

    // -msg <text>|off|reset (without -deny: the message for everyone whose call was rejected)
    if (messageAlt && !denyAlt) {
        const lowercase = messageAlt.toLowerCase();
        await setSetting('call.message', lowercase === 'reset' ? '' : lowercase === 'off' ? 'off' : messageAlt);
        changed = true;
    }

    if (turnOn || turnOff) {
        await setSetting('call.reject', turnOn);
        changed = true;
    }

    // -allow|-deny|-rm <pessoas>
    if (touchInPeople) {
        const textAlt = soAsPeople(rest);
        if (!textAlt) {
            await msg.reply(commandUsage('/call'));
            return;
        }
        const raw = await peopleItems(msg, 'call.allow', textAlt);
        if (raw === null) return;
        const phones = raw.split(',').map((n) => n.trim().replace(/\D/g, '')).filter(Boolean);

        if (allow) {
            // Whoever starts ringing always leaves the denied list
            await releaseDenied(phones);
            await peopleChangeList(msg, 'call.allow', raw, true, { itensProntos: true, veja: '/call' });
            if (!changed) return;
        } else if (denyAlt) {
            await setSetting('call.allow', getSetting('call.allow').filter((n) => !phones.includes(n)));
            await deny(phones, messageAlt === null ? '' : messageAlt);
            await msg.reply(t('adm.call.denied', { list: showList(phones), text: deniedMessage(messageAlt) || t('adm.call.silentShort') }));
            if (!changed) return;
        } else {
            // -rm: removes from both lists (the always-ring one and the denied one)
            const wasDenied = await releaseDenied(phones);
            const wasReleased = phones.filter((n) => getSetting('call.allow').includes(n));
            if (!wasDenied.length && !wasReleased.length) {
                await msg.reply(t('adm.call.notInLists', { list: showList(phones) }));
                return;
            }
            await setSetting('call.allow', getSetting('call.allow').filter((n) => !phones.includes(n)));
            await msg.reply(t('adm.call.removed', { list: showList([...new Set([...wasDenied, ...wasReleased])]) }));
            if (!changed) return;
        }
    }

    await msg.reply(await statusAlt());
}

module.exports = { cmdCall, separateMsg };
