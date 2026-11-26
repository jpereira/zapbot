/*
 * /join and /leave: join a group by invite, leave and list the groups.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const CODE = 'AbCdEfGhIjKlMnOpQrStUv';
const WORK = '120363000000000002@g.us';

beforeEach(async () => {
    await bot.restart();
    bot.client.invites.clear();
    bot.client.inputs.length = 0;
    bot.client.invites.set(CODE, { id: '120363000000000009@g.us', subject: 'Churrasco', size: 7, desc: 'Sábado' });
});

describe('/join', () => {
    test('entra pelo link (com ou sem https, ou só o código)', async () => {
        for (const inputAlt of [`https://chat.whatsapp.com/${CODE}`, `chat.whatsapp.com/invite/${CODE}`, CODE]) {
            assert.equal((await bot.replyAlt(`/join ${inputAlt}`))[0], '✅ Entrei em 👥 Churrasco');
        }
        assert.deepEqual(bot.client.inputs, [CODE, CODE, CODE]);
    });

    test('-info mostra o grupo sem entrar', async () => {
        const [r] = await bot.replyAlt(`/join -info chat.whatsapp.com/${CODE}`);
        assert.match(r, /^👥 \*Churrasco\*\n👤 7 participantes\n📝 Sábado/);
        assert.deepEqual(bot.client.inputs, []);
    });

    test('erros: sem link, link inválido, convite expirado e recusa do WhatsApp', async () => {
        assert.match((await bot.replyAlt('/join'))[0], /^\*Uso\*\n`\/join/);
        assert.match((await bot.replyAlt('/join https://exemplo.com/x'))[0], /Link de convite inválido/);
        assert.match((await bot.replyAlt('/join chat.whatsapp.com/ZZZZZZZZZZZZZZZZZZZZZZ'))[0], /Convite inválido, expirado/);

        bot.client.invites.set(CODE, { id: 'x@g.us', subject: 'Churrasco', refuse: 'precisa de aprovação' });
        assert.equal((await bot.replyAlt(`/join ${CODE}`, { expectedError: true }))[0], '❌ Não consegui entrar em 👥 Churrasco: precisa de aprovação.');
        assert.deepEqual(bot.client.inputs, []);
    });
});

describe('/leave', () => {
    beforeEach(() => bot.createGroup(WORK, 'Trabalho', [bot.OWNER.jid, OTHERAlt.jid]));

    test('lista os grupos numerados (/leave, /leave -l e /join -l)', async () => {
        const [list] = await bot.replyAlt('/leave -l');
        assert.match(list, /^👥 \*GRUPOS\* \(2\)\n\n1. Família · 2 participantes\n2. Trabalho · 2 participantes\n\n/);
        assert.equal((await bot.replyAlt('/leave'))[0], list);
        assert.equal((await bot.replyAlt('/join -l'))[0], list);
    });

    test('sai pelo nome e pelo nº da lista', async () => {
        assert.equal((await bot.replyAlt('/leave /Trabalho/'))[0], '👋 Saí de 👥 Trabalho');
        assert.equal(bot.client.chats.has(WORK), false);

        await bot.replyAlt('/leave -l');
        assert.equal((await bot.replyAlt('/leave 1'))[0], '👋 Saí de 👥 Família');
        assert.match((await bot.replyAlt('/leave 1'))[0], /não é um grupo em que você está/);
    });

    test('vários de uma vez: nºs e nomes, sem repetir, com o que falhou', async () => {
        bot.createGroup('120363000000000003@g.us', 'Amigos', [bot.OWNER.jid]);
        await bot.replyAlt('/leave -l');  // 1 Amigos, 2 Família, 3 Trabalho
        const [r] = await bot.replyAlt('/leave 3 1 /Família/ 1 9');
        assert.match(r, /^👋 Saí de 3 grupos:\n👥 Trabalho\n👥 Amigos\n👥 Família\n\n❌ Nº 9 fora da lista/);
        assert.equal(bot.client.chats.size, 0);
    });

    test('nome que não existe', async () => {
        assert.match((await bot.replyAlt('/leave Inexistente'))[0], /Nenhum grupo com "Inexistente"/);
    });
});
