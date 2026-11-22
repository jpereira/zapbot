/*
 * The password typed in the command: /notes -v -lock <password> #tag. It is only the word (or "words in quotes")
 * right after -lock (or -lo), that does not start with # or -. These functions find it and hide it, so that it
 * does not stay in the logs, in the echo of an alias or in the messages table.
 */

const VIEWING = ['-view', '-v', '-export', '-e', '-search', '-s', '-compact', '-c'];
const WORD = String.raw`"[^"]+"|“[^”]+”|[^\s#"“-]\S*`;
// Safety net for the logs: the same, and the -l beside another way of seeing (-v -l <password> #tag)
const GENERIC = new RegExp(String.raw`((?:^|\s)-(?:lock|lo)\s+)(?:${WORD})`, 'gi');
const GENERIC_L = new RegExp(String.raw`(?<=(?:^|\s)-(?:view|v|export|e|search|s|compact|c)(?:\s+\S+)*?\s)(-l\s+)(?:${WORD})`, 'gi');

/*
 * A -l beside another way of seeing (-v -l #tag) is not "list" (two at once mean nothing): it is -lock.
 * "-v -l #tag" → "-v -lock #tag"
 */
function normalizeLock(text) {
    const lead = [];
    for (const word of String(text).trim().split(/\s+/)) {
        if (!word.startsWith('-')) break;
        lead.push(word.toLowerCase());
    }
    if (!VIEWING.includes(lead[0]) || !lead.slice(1).includes('-l')) return text;
    return String(text).replace(/(^|\s)-l(?=\s|$)/i, (m, space, offset) => (offset === 0 ? m : `${space}-lock`));
}

const unquote = (word) => word.replace(/^["“]|["”]$/g, '');

/**
 * { password, rest } when there is a password after -lock/-lo (rest: the text without it, keeping the -lock),
 * or null. `-lock #tag` and `-lock -now` have none. The -lock has to be among the options at the start: a
 * "-lock word" in the text of a note is text.
 */
function extractPassword(text) {
    const words = normalizeLock(String(text ?? '')).trim().split(/\s+/);
    let lead = 0;
    while (lead < words.length && words[lead].startsWith('-')) lead += 1;
    const at = words.slice(0, lead).findIndex(w => /^-(?:lock|lo)$/i.test(w));
    if (at === -1 || at + 1 >= words.length) return null;

    // The password: one word, or "several words in quotes"
    let end = at + 1;
    const first = words[end];
    if (/^["“]/.test(first) && !/["”]$/.test(first.slice(1))) {
        while (end + 1 < words.length && !/["”]$/.test(words[end])) end += 1;
    }
    const word = words.slice(at + 1, end + 1).join(' ');
    if (!new RegExp(`^(?:${WORD})$`).test(word)) return null;
    return { password: unquote(word), rest: [...words.slice(0, at + 1), ...words.slice(end + 1)].join(' ') };
}

// The text with the known password hidden (as it came or normalized)
function maskSecret(text, secret) {
    const s = String(text ?? '');
    if (!secret) return s;
    return s.split(secret).join('***');
}

// The text without any password after -lock: for whatever prints lines (the logs)
function maskLockPassword(text) {
    const s = String(text ?? '');
    if (!/-(?:lock|lo|l)\s/i.test(s)) return s;
    return s.replace(GENERIC, '$1***').replace(GENERIC_L, '$1***');
}

module.exports = { extractPassword, maskLockPassword, maskSecret, normalizeLock };
