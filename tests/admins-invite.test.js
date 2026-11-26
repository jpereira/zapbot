/*
 * /promote, /demote (the admin of whoever is in the group) and /invite (the invite link).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const CICLANO = { jid: '5521922222222@c.us', name: 'Ciclano' };

let group;
let calls;

beforeEach(async () => {
    await bot.restart();
    bot.createContact(CICLANO.jid, CICLANO.name);
    group = bot.createGroup(GROUP, 'Família', [
        { jid: OWNER.jid, isAdmin: true },
        { jid: OTHERAlt.jid, isAdmin: true },
        CICLANO.jid
    ]);
    calls = [];
    group.promoteParticipants = async (ids) => { calls.push(['promote', ids]); return { status: 200 }; };
    group.demoteParticipants = async (ids) => { calls.push(['demote', ids]); return { status: 200 }; };
    group.getInviteCode = async () => 'ABC123';
    group.revokeInvite = async () => 'NOVO456';
});

describe('/promote e /demote', () => {
    test('/promote por menção, nome e número', async () => {
        assert.deepEqual(await bot.replyAlt(`/promote +${CICLANO.jid.split('@')[0]}`), ['✅ Ciclano agora é admin do grupo.']);
        assert.deepEqual(calls, [['promote', [CICLANO.jid]]]);

        group.participants.find(p => p.id._serialized === CICLANO.jid).isAdmin = false;
        assert.deepEqual(await bot.replyAlt('/promote /Ciclano/'), ['✅ Ciclano agora é admin do grupo.']);
    });

    test('respondendo uma mensagem: quem a escreveu', async () => {
        const quoted = bot.createMessage({ text: 'oi', de: CICLANO.jid });
        const [r] = await bot.replyAlt('/promote', { quoted });
        assert.equal(r, '✅ Ciclano agora é admin do grupo.');
        assert.deepEqual(calls, [['promote', [CICLANO.jid]]]);
    });

    test('avisos: já é admin, não é do grupo, sem ninguém', async () => {
        assert.deepEqual(await bot.replyAlt(`/promote +${OTHERAlt.user}`), ['⚠️ Fulano já é admin.']);
        bot.createContact('5521955555555@c.us', 'Forasteiro');
        assert.deepEqual(await bot.replyAlt('/promote +5521955555555'), ['⚠️ Forasteiro não está neste grupo.']);
        assert.match((await bot.replyAlt('/promote'))[0], /`\/promote \[\/contato\/\|@menção\|\+número\]\.\.\./);
        assert.deepEqual(calls, []);
    });

    test('/demote tira o admin; quem não é admin e o criador do grupo recebem aviso', async () => {
        assert.deepEqual(await bot.replyAlt(`/demote +${OTHERAlt.user}`), ['✅ Fulano deixou de ser admin do grupo.']);
        assert.deepEqual(calls, [['demote', [OTHERAlt.jid]]]);

        assert.deepEqual(await bot.replyAlt('/demote /Ciclano/'), ['⚠️ Ciclano não é admin.']);

        group.participants.find(p => p.id._serialized === OTHERAlt.jid).isSuperAdmin = true;
        assert.deepEqual(await bot.replyAlt(`/demote +${OTHERAlt.user}`), ['🚫 Fulano criou o grupo: o admin não pode ser tirado.']);
        assert.equal(calls.length, 1);
    });

    test('várias pessoas de uma vez', async () => {
        const r = await bot.replyAlt(`/promote +${CICLANO.jid.split('@')[0]} +${OTHERAlt.user}`);
        assert.deepEqual(r, ['✅ Ciclano agora é admin do grupo.', '⚠️ Fulano já é admin.']);
    });

    test('o participante com @lid é achado pelo telefone', async () => {
        group.participants.push({ id: { _serialized: '999@lid', user: '999' }, isAdmin: false, isSuperAdmin: false });
        bot.client.lids.set('999@lid', '5521966666666@c.us');
        bot.createContact('5521966666666@c.us', 'Beltrano');
        assert.deepEqual(await bot.replyAlt('/promote +5521966666666'), ['✅ Beltrano agora é admin do grupo.']);
        assert.deepEqual(calls, [['promote', ['999@lid']]]);
    });

    test('a conta do bot precisa ser admin do grupo', async () => {
        group.participants.find(p => p.id._serialized === OWNER.jid).isAdmin = false;
        assert.match((await bot.replyAlt(`/promote +${CICLANO.jid.split('@')[0]}`))[0], /^🚫 A sua conta não é admin deste grupo/);
        assert.deepEqual(calls, []);
    });

    test('o WhatsApp recusando: a resposta traz o motivo', async () => {
        group.promoteParticipants = async () => ({ status: 403 });
        const r = await bot.execute(`/promote +${CICLANO.jid.split('@')[0]}`, { expectedError: true });
        assert.equal(r[0].text, '❌ O WhatsApp recusou a mudança para Ciclano: status 403');
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.replyAlt('/promote @Fulano', { chat: OTHERAlt.jid }), ['Apenas utilizado dentro de grupos.']);
        assert.deepEqual(await bot.replyAlt('/demote @Fulano', { chat: OTHERAlt.jid }), ['Apenas utilizado dentro de grupos.']);
    });
});

describe('/invite', () => {
    test('o link do grupo', async () => {
        assert.deepEqual(await bot.replyAlt('/invite'), ['🔗 Link de convite do grupo:\nhttps://chat.whatsapp.com/ABC123']);
    });

    test('-revoke gera outro', async () => {
        assert.deepEqual(await bot.replyAlt('/invite -r'), [
            '🔗 O link antigo deixou de valer. Novo link de convite do grupo:\nhttps://chat.whatsapp.com/NOVO456'
        ]);
    });

    test('sem o código (a conta não é admin): o aviso', async () => {
        group.getInviteCode = async () => undefined;
        const [r] = await bot.execute('/invite', { expectedError: true });
        assert.match(r.text, /^❌ Não consegui o link de convite: O WhatsApp não deu o link/);
    });

    test('fora de grupo; e um usuário comum não usa (admin, não delegável)', async () => {
        assert.deepEqual(await bot.replyAlt('/invite', { chat: OTHERAlt.jid }), ['Apenas utilizado dentro de grupos.']);
        assert.deepEqual(await bot.replyAlt('/invite', { de: OTHERAlt.jid }), [], 'o bot não responde a quem não é admin');
    });
});
