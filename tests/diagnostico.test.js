/*
 * /bot -test: cada item sai com ✅ ou ❌ (➖ = não configurado), sem derrubar os outros.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const dns = require('dns').promises;

beforeEach(async () => { await bot.reiniciar(); });

function simularRede(t, { falhaNaVelocidade = false } = {}) {
    t.mock.method(dns, 'lookup', async () => ({ address: '157.240.0.1', family: 4 }));
    t.mock.method(axios, 'get', async (url) => {
        if (new URL(url).hostname === 'speed.cloudflare.com') {
            if (falhaNaVelocidade) throw new Error('timeout');
            return { data: Buffer.alloc(0) };
        }
        return { status: 200 };
    });
    t.mock.method(axios, 'post', async () => ({ status: 200 }));
}

const linha = (texto, nome) => texto.split('\n').find(l => l.includes(`*${nome}*`));

test('/bot -test: cache, disco, banco, internet e velocidade ✅; SMTP não configurado ➖', async t => {
    simularRede(t);
    const respostas = await bot.responder('/bot -test');
    const texto = respostas.at(-1);

    // o "Testando..." é editado com o resultado, sem mandar outra mensagem
    assert.equal(respostas.length, 1);
    assert.doesNotMatch(texto, /Testando/);
    assert.match(texto, /^🧪 \*TESTE DO BOT\*/);
    for (const nome of ['Cache', 'Disco', 'Banco SQLite', 'DNS', 'Internet', 'Velocidade']) {
        assert.match(linha(texto, nome), /^✅/, nome);
    }
    assert.match(linha(texto, 'Velocidade'), /↓ .* Mbps · ↑ .* Mbps/);
    assert.match(linha(texto, 'E-mail (SMTP)'), /^➖.*não configurado/);
    assert.match(linha(texto, 'E-mail (IMAP)'), /^➖.*QRCODE_EMAIL_IMAP_HOST/);
    assert.match(texto, /\n(❌ \d+ de \d+ com falha|✅ \d+ de \d+ ok)$/);
});

test('/bot -test: o que falha vira ❌ com o motivo e entra na contagem', async t => {
    simularRede(t, { falhaNaVelocidade: true });
    const texto = (await bot.responder('/bot -test')).at(-1);

    assert.match(linha(texto, 'Velocidade'), /^❌.*timeout/);
    assert.match(linha(texto, 'Cache'), /^✅/);
    assert.match(texto, /❌ \d+ de \d+ com falha$/);
});

test('/bot -test não combina com as outras opções', async () => {
    assert.match((await bot.responder('/bot -test -info'))[0], /não combina/);
    assert.match((await bot.responder('/bot -info -test'))[0], /não combina/);
    assert.match((await bot.responder('/bot -test -on'))[0], /O -test não combina/);
});

test('/bot -flush-email: sem IMAP configurado avisa; não combina com as outras opções', async () => {
    delete process.env.QRCODE_EMAIL_IMAP_HOST;
    assert.match((await bot.responder('/bot -flush-email'))[0], /❌ Não consegui.*QRCODE_EMAIL_IMAP_HOST/);
    assert.match((await bot.responder('/bot -flush-email -test'))[0], /não combina/);
    assert.match((await bot.responder('/bot -flush-email talvez'))[0], /O -flush-email não combina/);
});

test('imap: acha Sent e Trash pelo atributo ou pelo nome', () => {
    const { acharPastas } = require('../src/imap');
    assert.deepEqual(acharPastas([
        '* LIST (\\HasNoChildren) "/" "INBOX"',
        '* LIST (\\HasNoChildren \\Sent) "/" "Enviadas"',
        '* LIST (\\HasNoChildren \\Trash) "/" "[Gmail]/Lixo"'
    ]), { sent: 'Enviadas', trash: '[Gmail]/Lixo' });
    assert.deepEqual(acharPastas(['* LIST () "." Sent', '* LIST () "." "Deleted Items"']),
        { sent: 'Sent', trash: 'Deleted Items' });
});

test('/bot -passwd e -login: de fora vira admin com a senha, só o hash fica e o dono é avisado', async () => {
    const OUTRO = { jid: '5521911111111@c.us', user: '5521911111111' };
    const privado = { chat: OUTRO.jid, de: OUTRO.jid };

    assert.match((await bot.responder('/bot -login segredo123', privado))[0], /Login desativado/);
    assert.match((await bot.responder('/bot -passwd curta'))[0], /pelo menos 8/);
    assert.match((await bot.responder('/bot -passwd segredo123'))[0], /Senha gravada/);
    assert.match(bot.getSetting('bot.login'), /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.ok(!bot.getSetting('bot.login').includes('segredo123'));

    assert.match((await bot.responder('/bot -login errada123', privado))[0], /Senha incorreta/);
    assert.deepEqual(bot.getSetting('bot.admins'), []);
    assert.match((await bot.responder('/bot -login segredo123', { chat: '120363@g.us', de: OUTRO.jid }))[0], /só no privado/);

    const respostas = await bot.responder('/bot -login segredo123', privado);
    assert.ok(respostas.some(r => /agora é admin/.test(r)));
    assert.ok(respostas.some(r => /Novo admin por senha/.test(r)), 'o dono é avisado no WhatsApp');
    assert.deepEqual(bot.getSetting('bot.admins'), [OUTRO.user]);
    assert.match((await bot.responder('/bot -login segredo123', privado))[0], /já é admin/);

    assert.match((await bot.responder('/bot -passwd off'))[0], /Login desligado/);
    assert.equal(bot.getSetting('bot.login'), '');
});
