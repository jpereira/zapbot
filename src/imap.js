/*
 * Email inbox (/bot -flush-email): counts and deletes the Sent and Trash messages.
 * Minimal IMAP client over TLS (POP3 only sees the Inbox, without Sent or Trash).
 * Uses the SMTP configs: the login is the same and the server is the SMTP one swapping smtp for imap
 * (smtp.gmail.com -> imap.gmail.com), on port 993.
 */

const tls = require('tls');

const TIMEOUT_MS = 20 * 1000;

const boxConfigured = () => ['QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_USER', 'QRCODE_EMAIL_SMTP_PASS']
    .every(v => process.env[v]?.trim());

// smtp.mail.yahoo.com -> imap.mail.yahoo.com
const servidorImap = () => process.env.QRCODE_EMAIL_SMTP_HOST.trim().replace(/^smtp(?=[.-])/i, 'imap');

const quotes = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`;

// Opens the connection and returns cmd(): sends a command and resolves with the lines up to its "OK"
function open(host, port) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ host, port, servername: host });
        let buffer = '';
        let pending = null; // { tag, linhas, ok, erro }
        let tag = 0;

        const fail = (err) => {
            socket.destroy();
            if (pending) pending.erro(err);
            else reject(err);
        };
        socket.setTimeout(TIMEOUT_MS, () => fail(new Error(`sem resposta em ${TIMEOUT_MS / 1000}s`)));
        socket.on('error', fail);

        const cmd = (textAlt) => new Promise((ok, errorAlt) => {
            const id = `A${++tag}`;
            pending = { tag: id, linhas: [], ok, erro: errorAlt };
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
                    resolve({ cmd, fechar: () => socket.end() });
                } else if (pending && line.startsWith(`${pending.tag} `)) {
                    const p = pending;
                    pending = null;
                    if (/^\S+ OK/i.test(line)) p.ok(p.linhas);
                    else p.erro(new Error(line.replace(/^\S+ /, '')));
                } else pending?.linhas.push(line);
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

/**
 * Connects, counts the Sent and Trash messages and, with `apagar`, empties both (Sent first).
 * @returns {Promise<{sent: number, trash: number}>} how many messages there were in each
 */
async function boxes({ apagar: removeAlt = false } = {}) {
    if (!boxConfigured()) {
        throw new Error('QRCODE_EMAIL_SMTP_HOST, _USER e _PASS não configurados no config/.env');
    }

    const { cmd, fechar: close } = await open(servidorImap(), 993);
    try {
        await cmd(`LOGIN ${quotes(process.env.QRCODE_EMAIL_SMTP_USER)} ${quotes(process.env.QRCODE_EMAIL_SMTP_PASS)}`);
        const folders = findFolders(await cmd('LIST "" "*"'));
        if (!folders.sent || !folders.trash) {
            throw new Error(`pasta ${[!folders.sent && 'Sent', !folders.trash && 'Trash'].filter(Boolean).join(' e ')} não encontrada`);
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
    boxes
};
