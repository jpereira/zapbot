/*
 * /bot -test: each item comes out with ✅ or ❌ (➖ = not configured), without taking the others down.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const dns = require('dns').promises;

beforeEach(async () => { await bot.restart(); });

function simulateNetwork(t, { falhaNaVelocidade: failureInSpeed = false } = {}) {
    t.mock.method(dns, 'lookup', async () => ({ address: '157.240.0.1', family: 4 }));
    t.mock.method(axios, 'get', async (url) => {
        if (url.includes('speed.cloudflare.com')) {
            if (failureInSpeed) throw new Error('timeout');
            return { data: Buffer.alloc(0) };
        }
        return { status: 200 };
    });
    t.mock.method(axios, 'post', async () => ({ status: 200 }));
}

const line = (textAlt, nameAlt) => textAlt.split('\n').find(l => l.includes(`*${nameAlt}*`));

test('/bot -test: cache, disco, banco, internet e velocidade ✅; SMTP não configurado ➖', async t => {
    simulateNetwork(t);
    const replies = await bot.replyAlt('/bot -test');
    const textAlt = replies.at(-1);

    // the "Testando..." is edited with the result, without sending another message
    assert.equal(replies.length, 1);
    assert.doesNotMatch(textAlt, /Testando/);
    assert.match(textAlt, /^🧪 \*TESTE DO BOT\*/);
    for (const nameAlt of ['Cache', 'Disco', 'Banco SQLite', 'DNS', 'Internet', 'Velocidade']) {
        assert.match(line(textAlt, nameAlt), /^✅/, nameAlt);
    }
    assert.match(line(textAlt, 'Velocidade'), /↓ .* Mbps · ↑ .* Mbps/);
    assert.match(line(textAlt, 'E-mail (SMTP)'), /^➖.*não configurado/);
    assert.match(line(textAlt, 'E-mail (IMAP)'), /^➖.*QRCODE_EMAIL_IMAP_HOST/);
    assert.match(textAlt, /\n(❌ \d+ de \d+ com falha|✅ \d+ de \d+ ok)$/);
});

test('/bot -test: o que falha vira ❌ com o motivo e entra na contagem', async t => {
    simulateNetwork(t, { falhaNaVelocidade: true });
    const textAlt = (await bot.replyAlt('/bot -test')).at(-1);

    assert.match(line(textAlt, 'Velocidade'), /^❌.*timeout/);
    assert.match(line(textAlt, 'Cache'), /^✅/);
    assert.match(textAlt, /❌ \d+ de \d+ com falha$/);
});

test('/bot -test não combina com as outras opções', async () => {
    assert.match((await bot.replyAlt('/bot -test -info'))[0], /não combina/);
    assert.match((await bot.replyAlt('/bot -info -test'))[0], /não combina/);
    assert.match((await bot.replyAlt('/bot -test -on'))[0], /O -test não combina/);
});

test('/bot -flush-email: sem IMAP configurado avisa; não combina com as outras opções', async () => {
    delete process.env.QRCODE_EMAIL_IMAP_HOST;
    assert.match((await bot.replyAlt('/bot -flush-email'))[0], /❌ Não consegui.*QRCODE_EMAIL_IMAP_HOST/);
    assert.match((await bot.replyAlt('/bot -flush-email -test'))[0], /não combina/);
    assert.match((await bot.replyAlt('/bot -flush-email talvez'))[0], /O -flush-email não combina/);
});

test('imap: acha Sent e Trash pelo atributo ou pelo nome', () => {
    const { findFolders } = require('../src/imap');
    assert.deepEqual(findFolders([
        '* LIST (\\HasNoChildren) "/" "INBOX"',
        '* LIST (\\HasNoChildren \\Sent) "/" "Enviadas"',
        '* LIST (\\HasNoChildren \\Trash) "/" "[Gmail]/Lixo"'
    ]), { sent: 'Enviadas', trash: '[Gmail]/Lixo' });
    assert.deepEqual(findFolders(['* LIST () "." Sent', '* LIST () "." "Deleted Items"']),
        { sent: 'Sent', trash: 'Deleted Items' });
});
