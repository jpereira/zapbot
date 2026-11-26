/*
 * /block and /unblock: the block on your WhatsApp account.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const BELTRANO = { jid: '5521922222222@c.us', name: 'Beltrano' };

beforeEach(async () => {
    await bot.restart();
    bot.createContact(BELTRANO.jid, BELTRANO.name);
});

const contactAlt = (jid) => bot.client.contacts.get(jid);

// A contact WhatsApp only knows by the @lid (its number is the lid itself)
const blockedByLid = (lid) => Object.assign(bot.createContact(lid, null),
    { name: undefined, pushname: undefined, isBlocked: true });

describe('/block e /unblock', () => {
    test('bloqueia pelo nome; de novo: já está; a lista; desbloqueia pelo nº', async () => {
        assert.equal((await bot.replyAlt('/block /Fulano/'))[0],
            '🚫 *Bloqueado:* 👤 Fulano\n💡 *Dicas*\n/unblock desfaz\n/block mostra a lista');
        assert.equal(contactAlt(OTHERAlt.jid).isBlocked, true);
        assert.match((await bot.replyAlt('/block /Fulano/'))[0], /^ℹ️ 👤 Fulano já está bloqueado\./);

        await bot.replyAlt('/block +5521922222222');
        assert.equal(contactAlt(BELTRANO.jid).isBlocked, true, 'o /block é o mesmo');

        const [list] = await bot.replyAlt('/block');
        assert.equal(list, '🚫 *Bloqueados* (2)\n\n1. 👤 Beltrano · +5521922222222\n2. 👤 Fulano · +5521911111111\n\n' +
            '💡 _Desbloqueie com /unblock <nº|nome>._');
        assert.equal((await bot.replyAlt('/block -l'))[0], list);
        assert.match((await bot.replyAlt('/block -m /Beltrano/'))[0], /^ℹ️ 👤 Beltrano já está bloqueado\./,
            'o -mask não entra no nome');

        // -mask (-m): the phones obfuscated, in the list and in the confirmation
        const masked = '🚫 *Bloqueados* (2)\n\n1. 👤 Beltrano · +55219****22\n2. 👤 Fulano · +55219****11\n\n' +
            '💡 _Desbloqueie com /unblock <nº|nome>._';
        assert.equal((await bot.replyAlt('/block -l -m'))[0], masked);
        assert.equal((await bot.replyAlt('/block -m'))[0], masked);
        assert.equal((await bot.replyAlt('/block -m'))[0], masked);
        assert.equal((await bot.replyAlt('/block'))[0], list, 'sem o -mask, completos de novo');

        assert.equal((await bot.replyAlt('/unblock 2'))[0], '✅ *Desbloqueado:* 👤 Fulano · +5521911111111');
        assert.equal(contactAlt(OTHERAlt.jid).isBlocked, false);
        assert.match((await bot.replyAlt('/unblock /Fulano/'))[0], /^ℹ️ 👤 Fulano não está bloqueado\./);
        assert.match((await bot.replyAlt('/unblock 9'))[0], /^❌ Nº 9 não existe\./);
        assert.equal((await bot.replyAlt('/unblock /Beltrano/'))[0], '✅ *Desbloqueado:* 👤 Beltrano');
    });

    test('várias pessoas de uma vez: números, /nome/ e @menção; um resumo só', async () => {
        const CICLANO = bot.createContact('5521933333333@c.us', 'Ciclano Souza');
        bot.createContact(bot.OWNER.jid, bot.OWNER.name);  // the bot account, found by the number
        contactAlt(BELTRANO.jid).isBlocked = true;

        const r = await bot.replyAlt('/block +5521911111111 /Ciclano Souza/ @5521922222222 +5521900000000 +5521911111111',
            { mentions: [BELTRANO.jid] });
        assert.deepEqual(r, ['🚫 *Bloqueados (2):*\n👤 Fulano\n👤 Ciclano Souza\n\n' +
            'ℹ️ *Já estavam bloqueados (1):*\n👤 Beltrano\n\n' +
            '❌ *Não bloqueados (1):*\n👤 Dono: é a conta do próprio bot\n\n' +
            '💡 *Dicas*\n/unblock desfaz\n/block mostra a lista']);
        assert.deepEqual([contactAlt(OTHERAlt.jid).isBlocked, CICLANO.isBlocked], [true, true]);
    });

    test('várias: quem não é achado tem o erro dele, e os outros seguem', async () => {
        const r = await bot.replyAlt('/block +5521977777777 +5521922222222');
        assert.deepEqual(r, ['❌ O número +5521977777777 não está no WhatsApp.',
            '🚫 *Bloqueados (1):*\n👤 Beltrano\n\n💡 *Dicas*\n/unblock desfaz\n/block mostra a lista']);
    });

    test('pelo @lid, quando o WhatsApp informa: o bloqueio e o "já está" são dele', async () => {
        const lid = Object.assign(bot.createContact('103642006839525@lid', null), { name: undefined, pushname: undefined });
        bot.client.lids.set('103642006839525@lid', OTHERAlt.jid);

        assert.match((await bot.replyAlt('/block +5521911111111'))[0], /^🚫 \*Bloqueado:\* 👤 Fulano\n/);
        assert.deepEqual([lid.isBlocked, contactAlt(OTHERAlt.jid).isBlocked], [true, false], 'bloqueou o @lid, não o telefone');
        assert.match((await bot.replyAlt('/block /Fulano/'))[0], /^ℹ️ 👤 Fulano já está bloqueado\./);
    });

    test('o erro do WhatsApp numa pessoa não derruba as outras', async () => {
        // WhatsApp Web's internal error, without a message: the "t" in the log
        contactAlt(OTHERAlt.jid).block = async () => { throw new Error('t'); };

        const r = await bot.replyAlt('/block +5521911111111 +5521922222222', { expectedError: true });
        assert.deepEqual(r, ['🚫 *Bloqueados (1):*\n👤 Beltrano\n\n' +
            '❌ *Não bloqueados (1):*\n👤 Fulano: o WhatsApp recusou o bloqueio (erro "t")\n\n' +
            '💡 *Dicas*\n/unblock desfaz\n/block mostra a lista']);

        assert.deepEqual(await bot.replyAlt('/block +5521911111111', { expectedError: true }),
            ['⚠️ Não consegui bloquear 👤 Fulano: o WhatsApp recusou o bloqueio (erro "t").']);
    });

    test('o bloqueio que não entra na lista do WhatsApp é falha', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        contactAlt(OTHERAlt.jid).block = async () => true;  // like whatsapp-web.js: true, without checking

        const [r] = await bot.waitWithClock(t, bot.execute('/block +5521911111111'), 500);
        assert.equal(r.text, '⚠️ Não consegui bloquear 👤 Fulano: o WhatsApp não bloqueou (não entrou na lista).');
    });

    test('palavras soltas são um nome só (não várias pessoas)', async () => {
        const CICLANO = bot.createContact('5521933333333@c.us', 'Ciclano Souza');
        assert.equal((await bot.replyAlt('/block Ciclano Souza'))[0], '🚫 *Bloqueado:* 👤 Ciclano Souza\n' +
            '💡 *Dicas*\n/unblock desfaz\n/block mostra a lista');
        assert.equal(CICLANO.isBlocked, true);
        assert.equal(contactAlt(OTHERAlt.jid).isBlocked, false);
    });

    test('bloqueados pelo @lid: o telefone e o nome da agenda; sem telefone conhecido, o id interno', async () => {
        const withPhone = blockedByLid('103642006839525@lid');
        bot.client.lids.set('103642006839525@lid', OTHERAlt.jid);
        blockedByLid('8706418802871@lid');

        const [list] = await bot.replyAlt('/block');
        assert.equal(list, '🚫 *Bloqueados* (2)\n\n1. 👤 Fulano · +5521911111111\n' +
            '2. 👤 8706418802871 _(id interno, sem telefone conhecido)_\n\n💡 _Desbloqueie com /unblock <nº|nome>._');

        assert.equal((await bot.replyAlt('/unblock 1'))[0], '✅ *Desbloqueado:* 👤 Fulano · +5521911111111');
        assert.equal(withPhone.isBlocked, false);
    });

    test('respondendo uma mensagem: quem a escreveu; a sua conta não', async () => {
        const quoted = bot.createMessage({ text: 'spam', de: OTHERAlt.jid });
        assert.match((await bot.replyAlt('/block', { quoted }))[0], /^🚫 \*Bloqueado:\* 👤 Fulano\n/);
        assert.equal((await bot.replyAlt('/unblock', { quoted }))[0], '✅ *Desbloqueado:* 👤 Fulano');

        const my = bot.createMessage({ text: 'oi' });
        assert.equal((await bot.replyAlt('/block', { quoted: my }))[0], '❌ Não dá para bloquear a conta do próprio bot.');
    });

    test('grupo e e-mail não; ninguém bloqueado: a dica (no /block e no /unblock)', async () => {
        const tip = '🚫 Ninguém bloqueado.\n💡 _Ex.: /block /Fulano/, @menção ou +5521999999999, ou responda uma mensagem com /block._';
        assert.equal((await bot.replyAlt('/block'))[0], tip);
        assert.equal((await bot.replyAlt('/unblock'))[0], tip);
        assert.match((await bot.replyAlt('/block /Família/'))[0], /^❌ Nenhum contato com "Família" no nome\./);
        assert.match((await bot.replyAlt('/block fulano@exemplo.com'))[0], /^❌ O \/block é de pessoas/);
    });

    test('/unblock -all: todos; quem falha não segura os outros', async () => {
        assert.equal((await bot.replyAlt('/unblock -a'))[0], '🚫 Ninguém bloqueado.');

        contactAlt(OTHERAlt.jid).isBlocked = true;
        contactAlt(BELTRANO.jid).isBlocked = true;
        blockedByLid('8706418802871@lid').unblock = async () => { throw new Error('rede fora'); };

        const r = await bot.execute('/unblock -a');
        assert.equal(r.length, 1, 'só o aviso, editado com o resultado');
        assert.equal(r[0].text, '✅ 2 desbloqueados.\n\n⚠️ Não consegui desbloquear (1):\n' +
            '• 8706418802871 _(id interno, sem telefone conhecido)_: rede fora');
        assert.equal(r[0].editada, true, 'o "⏳ Desbloqueando 3 contatos, aguarde." virou o resultado');
        assert.deepEqual([contactAlt(OTHERAlt.jid).isBlocked, contactAlt(BELTRANO.jid).isBlocked], [false, false]);
    });

    test('/unblock -all: se o WhatsApp não deixa editar o aviso, o resultado vai em outra mensagem', async () => {
        contactAlt(OTHERAlt.jid).isBlocked = true;
        bot.client.refuseEdit = true;
        assert.deepEqual(await bot.replyAlt('/unblock -a'), ['⏳ Desbloqueando 1 contato, aguarde.', '✅ 1 desbloqueado.']);
    });

    describe('o unblock() do whatsapp-web.js não confere: o bot confere na lista', () => {
        // Like a block stored by phone: the lib's unblock() unblocks the @lid and returns true
        const withoutEffect = (jid) => {
            const c = contactAlt(jid);
            c.isBlocked = true;
            c.unblock = async () => true;
            return c;
        };
        // The check waits for WhatsApp Web to refresh the list: the simulated clock skips the wait
        beforeEach((t) => t.mock.timers.enable({ apis: ['setTimeout'] }));
        const runWithClock = (t, line, optionsAlt) => bot.waitWithClock(t, bot.execute(line, optionsAlt), 500);

        test('continua na lista: falha, sem o ✅ falso', async (t) => {
            withoutEffect(OTHERAlt.jid);
            contactAlt(BELTRANO.jid).isBlocked = true;

            // Without the WhatsApp Web page (the fake has none), the 2nd attempt fails and stays in the log
            const [r] = await runWithClock(t, '/unblock -all', { expectedError: true });
            assert.equal(r.text, '✅ 1 desbloqueado.\n\n⚠️ Não consegui desbloquear (1):\n' +
                '• Fulano · +5521911111111: o WhatsApp não desbloqueou (continua na lista)');

            const [s1] = await runWithClock(t, '/unblock /Fulano/', { expectedError: true });
            assert.equal(s1.text, '⚠️ Não consegui desbloquear 👤 Fulano: o WhatsApp não desbloqueou (continua na lista).');
        });

        test('quem ficou é desbloqueado pelo id exato da lista', async (t) => {
            const someone = withoutEffect(OTHERAlt.jid);
            const requests = [];
            bot.client.pupPage = { evaluate: async (fn, id) => { requests.push(id); contactAlt(id).isBlocked = false; } };
            try {
                const [r] = await runWithClock(t, '/unblock -all');
                assert.equal(r.text, '✅ 1 desbloqueado.');
                assert.deepEqual(requests, [OTHERAlt.jid]);
                assert.equal(someone.isBlocked, false);
            } finally {
                delete bot.client.pupPage;
            }
        });
    });

    test('pelo nome, com o bloqueio guardado no @lid: acha pelo telefone', async () => {
        const lid = blockedByLid('103642006839525@lid');
        bot.client.lids.set('103642006839525@lid', OTHERAlt.jid);

        assert.equal((await bot.replyAlt('/unblock /Fulano/'))[0], '✅ *Desbloqueado:* 👤 Fulano');
        assert.equal(lid.isBlocked, false);
    });

    test('só o dono e os admins', async () => {
        const r = await bot.replyAlt('/block /Beltrano/', { de: OTHERAlt.jid });
        assert.equal(contactAlt(BELTRANO.jid).isBlocked, false);
        assert.ok(!r.some(t => t.startsWith('🚫 *Bloqueado')));
    });
});
