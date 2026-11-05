/*
 * /join e /leave: entrar em um grupo por convite, sair e listar os grupos.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OUTRO } = bot;
const CODIGO = 'AbCdEfGhIjKlMnOpQrStUv';
const TRABALHO = '120363000000000002@g.us';

beforeEach(async () => {
    await bot.reiniciar();
    bot.client.convites.clear();
    bot.client.entradas.length = 0;
    bot.client.convites.set(CODIGO, { id: '120363000000000009@g.us', subject: 'Churrasco', size: 7, desc: 'Sábado' });
});

describe('/join', () => {
    test('entra pelo link (com ou sem https, ou só o código)', async () => {
        for (const entrada of [`https://chat.whatsapp.com/${CODIGO}`, `chat.whatsapp.com/invite/${CODIGO}`, CODIGO]) {
            assert.equal((await bot.responder(`/join ${entrada}`))[0], '✅ Entrei em 👥 Churrasco');
        }
        assert.deepEqual(bot.client.entradas, [CODIGO, CODIGO, CODIGO]);
    });

    test('-info mostra o grupo sem entrar', async () => {
        const [r] = await bot.responder(`/join -info chat.whatsapp.com/${CODIGO}`);
        assert.match(r, /^👥 \*Churrasco\*\n👤 7 participantes\n📝 Sábado/);
        assert.deepEqual(bot.client.entradas, []);
    });

    test('erros: sem link, link inválido, convite expirado e recusa do WhatsApp', async () => {
        assert.match((await bot.responder('/join'))[0], /^❌ Use: \/join/);
        assert.match((await bot.responder('/join https://exemplo.com/x'))[0], /Link de convite inválido/);
        assert.match((await bot.responder('/join chat.whatsapp.com/ZZZZZZZZZZZZZZZZZZZZZZ'))[0], /Convite inválido, expirado/);

        bot.client.convites.set(CODIGO, { id: 'x@g.us', subject: 'Churrasco', recusar: 'precisa de aprovação' });
        assert.equal((await bot.responder(`/join ${CODIGO}`, { erroEsperado: true }))[0], '❌ Não consegui entrar em 👥 Churrasco: precisa de aprovação.');
        assert.deepEqual(bot.client.entradas, []);
    });
});

describe('/leave', () => {
    beforeEach(() => bot.criarGrupo(TRABALHO, 'Trabalho', [bot.DONO.jid, OUTRO.jid]));

    test('lista os grupos numerados (/leave, /leave -l e /join -l)', async () => {
        const [lista] = await bot.responder('/leave -l');
        assert.match(lista, /^👥 \*GRUPOS\* \(2\)\n\n1. Família · 2 participantes\n2. Trabalho · 2 participantes\n\n/);
        assert.equal((await bot.responder('/leave'))[0], lista);
        assert.equal((await bot.responder('/join -l'))[0], lista);
    });

    test('sai pelo nome e pelo nº da lista', async () => {
        assert.equal((await bot.responder('/leave /Trabalho/'))[0], '👋 Saí de 👥 Trabalho');
        assert.equal(bot.client.chats.has(TRABALHO), false);

        await bot.responder('/leave -l');
        assert.equal((await bot.responder('/leave 1'))[0], '👋 Saí de 👥 Família');
        assert.match((await bot.responder('/leave 1'))[0], /não é um grupo em que você está/);
    });

    test('vários de uma vez: nºs e nomes, sem repetir, com o que falhou', async () => {
        bot.criarGrupo('120363000000000003@g.us', 'Amigos', [bot.DONO.jid]);
        await bot.responder('/leave -l');  // 1 Amigos, 2 Família, 3 Trabalho
        const [r] = await bot.responder('/leave 3 1 /Família/ 1 9');
        assert.match(r, /^👋 Saí de 3 grupos:\n👥 Trabalho\n👥 Amigos\n👥 Família\n\n❌ Nº 9 fora da lista/);
        assert.equal(bot.client.chats.size, 0);
    });

    test('nome que não existe', async () => {
        assert.match((await bot.responder('/leave Inexistente'))[0], /Nenhum grupo com "Inexistente"/);
    });
});
