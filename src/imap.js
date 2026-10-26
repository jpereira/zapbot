/*
 * Caixa de e-mail (o /bot -flush-email): conta e apaga as mensagens de Sent e Trash.
 * Cliente IMAP mínimo sobre TLS (POP3 só enxerga a Caixa de Entrada, sem Sent nem Trash).
 * Usa as configs do SMTP: o login é o mesmo e o servidor é o do SMTP trocando smtp por imap
 * (smtp.gmail.com -> imap.gmail.com), na porta 993.
 */

const tls = require('tls');

const TIMEOUT_MS = 20 * 1000;

const caixaConfigurada = () => ['QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_USER', 'QRCODE_EMAIL_SMTP_PASS']
    .every(v => process.env[v]?.trim());

// smtp.mail.yahoo.com -> imap.mail.yahoo.com
const servidorImap = () => process.env.QRCODE_EMAIL_SMTP_HOST.trim().replace(/^smtp(?=[.-])/i, 'imap');

const aspas = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`;

// Abre a conexão e devolve cmd(): manda um comando e resolve com as linhas até o "OK" dele
function abrir(host, port) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ host, port, servername: host });
        let buffer = '';
        let pendente = null; // { tag, linhas, ok, erro }
        let tag = 0;

        const falhar = (err) => {
            socket.destroy();
            if (pendente) pendente.erro(err);
            else reject(err);
        };
        socket.setTimeout(TIMEOUT_MS, () => falhar(new Error(`sem resposta em ${TIMEOUT_MS / 1000}s`)));
        socket.on('error', falhar);

        const cmd = (texto) => new Promise((ok, erro) => {
            const id = `A${++tag}`;
            pendente = { tag: id, linhas: [], ok, erro };
            socket.write(`${id} ${texto}\r\n`);
        });

        let saudacao = false;
        socket.on('data', (dados) => {
            buffer += dados.toString('utf8');
            let i;
            while ((i = buffer.indexOf('\r\n')) >= 0) {
                const linha = buffer.slice(0, i);
                buffer = buffer.slice(i + 2);

                if (!saudacao) {
                    saudacao = true;
                    if (!/^\* (OK|PREAUTH)/i.test(linha)) return falhar(new Error(linha));
                    resolve({ cmd, fechar: () => socket.end() });
                } else if (pendente && linha.startsWith(`${pendente.tag} `)) {
                    const p = pendente;
                    pendente = null;
                    if (/^\S+ OK/i.test(linha)) p.ok(p.linhas);
                    else p.erro(new Error(linha.replace(/^\S+ /, '')));
                } else pendente?.linhas.push(linha);
            }
        });
    });
}

// Sent e Trash: pelo atributo \Sent/\Trash (RFC 6154) ou, sem ele, pelo nome comum
const NOMES = {
    sent: /^(\[Gmail\]\/)?(Sent( Mail| Items| Messages)?|Enviados?|Itens Enviados)$/i,
    trash: /^(\[Gmail\]\/)?(Trash|Bin|Deleted( Items| Messages)?|Lixeira|Itens Excluídos)$/i
};

function acharPastas(linhasList) {
    const achadas = {};
    for (const linha of linhasList) {
        const m = linha.match(/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))$/i);
        if (!m) continue;
        const nome = (m[2] ?? m[3]).replace(/\\(.)/g, '$1');
        const attrs = m[1].toLowerCase();
        for (const [chave, re] of Object.entries(NOMES)) {
            if (attrs.includes(`\\${chave}`)) achadas[chave] = nome;
            else if (!achadas[chave] && re.test(nome)) achadas[chave] = nome;
        }
    }
    return achadas;
}

async function mensagensEm(cmd, pasta) {
    const linhas = await cmd(`STATUS ${aspas(pasta)} (MESSAGES)`);
    return Number(linhas.join('\n').match(/MESSAGES (\d+)/i)?.[1] ?? 0);
}

async function esvaziar(cmd, pasta) {
    await cmd(`SELECT ${aspas(pasta)}`);
    await cmd('STORE 1:* +FLAGS.SILENT (\\Deleted)');
    await cmd('EXPUNGE');
    await cmd('CLOSE');
}

/**
 * Conecta, conta as mensagens de Sent e Trash e, com `apagar`, esvazia as duas (Sent primeiro).
 * @returns {Promise<{sent: number, trash: number}>} quantas mensagens havia em cada uma
 */
async function caixas({ apagar = false } = {}) {
    if (!caixaConfigurada()) {
        throw new Error('QRCODE_EMAIL_SMTP_HOST, _USER e _PASS não configurados no config/.env');
    }

    const { cmd, fechar } = await abrir(servidorImap(), 993);
    try {
        await cmd(`LOGIN ${aspas(process.env.QRCODE_EMAIL_SMTP_USER)} ${aspas(process.env.QRCODE_EMAIL_SMTP_PASS)}`);
        const pastas = acharPastas(await cmd('LIST "" "*"'));
        if (!pastas.sent || !pastas.trash) {
            throw new Error(`pasta ${[!pastas.sent && 'Sent', !pastas.trash && 'Trash'].filter(Boolean).join(' e ')} não encontrada`);
        }

        const sent = await mensagensEm(cmd, pastas.sent);
        const trash = await mensagensEm(cmd, pastas.trash);
        if (apagar) {
            if (sent) await esvaziar(cmd, pastas.sent);
            if (trash) await esvaziar(cmd, pastas.trash);
        }
        await cmd('LOGOUT').catch(() => {});
        return { sent, trash };
    } finally {
        fechar();
    }
}

module.exports = {
    acharPastas,
    caixaConfigurada,
    caixas
};
