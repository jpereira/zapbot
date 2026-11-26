/*
 * The web interface warns the owner in WhatsApp (the chat with yourself) when someone gets a password wrong: the
 * login or the password of a protected tag. A burst from the same address is joined into one notice (the first one
 * goes at once; the next ones inside the window are counted and told in the following notice).
 *
 * It also warns when someone opens the login page at all ('access'): one notice per address every 10 minutes, and no
 * more than 5 notices in 10 minutes in total (the rest is only counted and told in the next one), so a scan or a
 * flood of requests does not flood your WhatsApp.
 */

const { pushNotice } = require('../webPush');
const { messageToSelf } = require('../client');
const { printInfo } = require('../log');
const { t } = require('../i18n');

const WINDOW_MS = 15_000;
const last = new Map(); // "kind:address" → { at, skipped }

const ACCESS_ADDRESS_MS = 10 * 60_000; // the same address is told once in this time
const ACCESS_TOTAL_MS = 10 * 60_000;
const ACCESS_TOTAL_MAX = 5;            // notices of access in the window, from any address
const MAX_TRACKED = 500;               // addresses kept (a scan from many addresses does not grow the memory)
let total = { since: 0, sent: 0 };
let hidden = 0;                        // accesses not told because of the limit above

/**
 * @param {'wrong'|'blocked'|'wrongTag'|'blockedTag'|'access'} kind
 * @param {object} vars  address, attempt, max, minutes, tag
 * @returns {Promise<boolean>} true if a message went out
 */
async function notifyWeb(kind, vars) {
    const key = `${kind}:${vars.address}`;
    const now = Date.now();
    const entry = last.get(key);
    if (kind === 'access') return notifyAccess(key, entry, now, vars);
    // A block always tells; the wrong ones of a burst are only counted
    if (kind.startsWith('wrong') && entry && now - entry.at < WINDOW_MS) {
        entry.skipped += 1;
        return false;
    }
    const more = entry?.skipped ? t('web.alert.more', { n: entry.skipped }) : '';
    remember(key, now);
    const text = `${t(`web.alert.${kind}`, vars)}${more}`;
    printInfo(`Web: ${text.replace(/\n/g, ' ')}`);
    pushNotice('web', { title: '🌐 ZapBot web', body: text.replace(/[*_~`]/g, ''), url: '/', urgent: true });
    await messageToSelf(text);
    return true;
}

function remember(key, now) {
    last.delete(key);
    last.set(key, { at: now, skipped: 0 });
    if (last.size > MAX_TRACKED) last.delete(last.keys().next().value);
}

async function notifyAccess(key, entry, now, vars) {
    // The same address: counted, told in its next notice
    if (entry && now - entry.at < ACCESS_ADDRESS_MS) {
        entry.skipped += 1;
        return false;
    }
    if (now - total.since >= ACCESS_TOTAL_MS) total = { since: now, sent: 0 };
    if (total.sent >= ACCESS_TOTAL_MAX) {
        hidden += 1;
        return false;
    }
    total.sent += 1;
    const more = (entry?.skipped ? t('web.alert.accessMore', { n: entry.skipped }) : '') + (hidden ? t('web.alert.accessHidden', { n: hidden }) : '');
    hidden = 0;
    remember(key, now);
    const text = `${t('web.alert.access', { address: vars.address, agent: vars.agent ? `\n🖥️ ${vars.agent}` : '' })}${more}`;
    printInfo(`Web: ${text.replace(/\n/g, ' ')}`);
    pushNotice('web', { title: '🌐 ZapBot web', body: text.replace(/[*_~`]/g, ''), url: '/', urgent: true });
    await messageToSelf(text);
    return true;
}

const reset = () => {
    last.clear();
    total = { since: 0, sent: 0 };
    hidden = 0;
};

module.exports = { notifyWeb, reset };
