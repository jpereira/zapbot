/*
 * Email inbox (/bot -flush-email): counts and deletes the Sent and Trash messages.
 * Minimal IMAP client over TLS (POP3 only sees the Inbox, without Sent or Trash).
 * Only works with QRCODE_EMAIL_IMAP_HOST (port 993); the login is the same as SMTP's.
 */

const tls = require('tls');

const { t } = require('./i18n');

const TIMEOUT_MS = 20 * 1000;

const boxConfigured = () => ['QRCODE_EMAIL_IMAP_HOST', 'QRCODE_EMAIL_SMTP_USER', 'QRCODE_EMAIL_SMTP_PASS']
    .every(v => process.env[v]?.trim());

const quotes = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`;

// Opens the connection and returns cmd(): sends a command and resolves with the lines up to its "OK"
function open(host, port) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ host, port, servername: host });
        let buffer = '';
        let pending = null; // { tag, lines, ok, error }
        let tag = 0;

        const fail = (err) => {
            socket.destroy();
            if (pending) pending.error(err);
            else reject(err);
        };
        socket.setTimeout(TIMEOUT_MS, () => fail(new Error(t('imap.semResposta', { s: TIMEOUT_MS / 1000 }))));
        socket.on('error', fail);

        const cmd = (textAlt) => new Promise((ok, errorAlt) => {
            const id = `A${++tag}`;
            pending = { tag: id, lines: [], ok, error: errorAlt };
            socket.write(`${id} ${textAlt}\r\n`);
        });

        let greeting = false;
        socket.on('data', (dataAlt) => {
            buffer += dataAlt.toString('utf8');
            let i;
            while ((i = buffer.indexOf('\r\n')) >= 0) {
                const line = buffer.slice(0, i);
                buffer = buffer.slice(i + 2);

                if (!greeting) {
                    greeting = true;
                    if (!/^\* (OK|PREAUTH)/i.test(line)) return fail(new Error(line));
                    resolve({ cmd, close: () => socket.end() });
                } else if (pending && line.startsWith(`${pending.tag} `)) {
                    const p = pending;
                    pending = null;
                    if (/^\S+ OK/i.test(line)) p.ok(p.lines);
                    else p.error(new Error(line.replace(/^\S+ /, '')));
                } else pending?.lines.push(line);
            }
        });
    });
}

// Sent and Trash: by the \Sent/\Trash attribute (RFC 6154) or, without it, by the common name
const NAMES = {
    sent: /^(\[Gmail\]\/)?(Sent( Mail| Items| Messages)?|Enviados?|Itens Enviados)$/i,
    trash: /^(\[Gmail\]\/)?(Trash|Bin|Deleted( Items| Messages)?|Lixeira|Itens Excluídos)$/i
};

function findFolders(linesList) {
    const foundAlt3 = {};
    for (const line of linesList) {
        const m = line.match(/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))$/i);
        if (!m) continue;
        const nameAlt = (m[2] ?? m[3]).replace(/\\(.)/g, '$1');
        const attrs = m[1].toLowerCase();
        for (const [keyAlt, re] of Object.entries(NAMES)) {
            if (attrs.includes(`\\${keyAlt}`)) foundAlt3[keyAlt] = nameAlt;
            else if (!foundAlt3[keyAlt] && re.test(nameAlt)) foundAlt3[keyAlt] = nameAlt;
        }
    }
    return foundAlt3;
}

async function messagesIn(cmd, folder) {
    const linesAlt = await cmd(`STATUS ${quotes(folder)} (MESSAGES)`);
    return Number(linesAlt.join('\n').match(/MESSAGES (\d+)/i)?.[1] ?? 0);
}

async function empty(cmd, folder) {
    await cmd(`SELECT ${quotes(folder)}`);
    await cmd('STORE 1:* +FLAGS.SILENT (\\Deleted)');
    await cmd('EXPUNGE');
    await cmd('CLOSE');
}

/** Only connects and logs in (the IMAP item of /bot -test), touching nothing. */
async function check() {
    if (!boxConfigured()) throw new Error(t('imap.naoConfigurado'));

    const { cmd, close } = await open(process.env.QRCODE_EMAIL_IMAP_HOST.trim(), 993);
    try {
        await cmd(`LOGIN ${quotes(process.env.QRCODE_EMAIL_SMTP_USER)} ${quotes(process.env.QRCODE_EMAIL_SMTP_PASS)}`);
        await cmd('LOGOUT').catch(() => {});
    } finally {
        close();
    }
}

/**
 * Connects, counts the Sent and Trash messages and, with `erase`, empties both (Sent first).
 * @returns {Promise<{sent: number, trash: number}>} how many messages there were in each
 */
async function boxes({ erase: removeAlt = false } = {}) {
    if (!boxConfigured()) {
        throw new Error(t('imap.naoConfiguradoVars'));
    }

    const { cmd, close } = await open(process.env.QRCODE_EMAIL_IMAP_HOST.trim(), 993);
    try {
        await cmd(`LOGIN ${quotes(process.env.QRCODE_EMAIL_SMTP_USER)} ${quotes(process.env.QRCODE_EMAIL_SMTP_PASS)}`);
        const folders = findFolders(await cmd('LIST "" "*"'));
        if (!folders.sent || !folders.trash) {
            throw new Error(t('imap.pastaNaoEncontrada', { folders: [!folders.sent && 'Sent', !folders.trash && 'Trash'].filter(Boolean).join(t('imap.e')) }));
        }

        const sent = await messagesIn(cmd, folders.sent);
        const trash = await messagesIn(cmd, folders.trash);
        if (removeAlt) {
            if (sent) await empty(cmd, folders.sent);
            if (trash) await empty(cmd, folders.trash);
        }
        await cmd('LOGOUT').catch(() => {});
        return { sent, trash };
    } finally {
        close();
    }
}

module.exports = {
    findFolders,
    boxConfigured,
    boxes,
    check
};
