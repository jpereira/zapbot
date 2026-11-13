/*
 * /promote, /demote (o admin de quem está no grupo) e /invite (o link de convite).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };

let grupo;
let chamadas;

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarContato(CICLANO.jid, CICLANO.nome);
    grupo = bot.criarGrupo(GRUPO, 'Família', [
        { jid: DONO.jid, isAdmin: true },
        { jid: OUTRO.jid, isAdmin: true },
        CICLANO.jid
    ]);
    chamadas = [];
    grupo.promoteParticipants = async (ids) => { chamadas.push(['promote', ids]); return { status: 200 }; };
    grupo.demoteParticipants = async (ids) => { chamadas.push(['demote', ids]); return { status: 200 }; };
    grupo.getInviteCode = async () => 'ABC123';
    grupo.revokeInvite = async () => 'NOVO456';
});

describe('/promote e /demote', () => {
    test('/promote por menção, nome e número', async () => {
        assert.deepEqual(await bot.responder(`/promote +${CICLANO.jid.split('@')[0]}`), ['✅ Ciclano agora é admin do grupo.']);
        assert.deepEqual(chamadas, [['promote', [CICLANO.jid]]]);

        grupo.participants.find(p => p.id._serialized === CICLANO.jid).isAdmin = false;
        assert.deepEqual(await bot.responder('/promote /Ciclano/'), ['✅ Ciclano agora é admin do grupo.']);
    });

    test('respondendo uma mensagem: quem a escreveu', async () => {
        const citada = bot.criarMensagem({ texto: 'oi', de: CICLANO.jid });
        const [r] = await bot.responder('/promote', { citada });
        assert.equal(r, '✅ Ciclano agora é admin do grupo.');
        assert.deepEqual(chamadas, [['promote', [CICLANO.jid]]]);
    });

    test('avisos: já é admin, não é do grupo, sem ninguém', async () => {
        assert.deepEqual(await bot.responder(`/promote +${OUTRO.user}`), ['⚠️ Fulano já é admin.']);
        bot.criarContato('5521955555555@c.us', 'Forasteiro');
        assert.deepEqual(await bot.responder('/promote +5521955555555'), ['⚠️ Forasteiro não está neste grupo.']);
        assert.match((await bot.responder('/promote'))[0], /❌ Use: \/promote \[\/contato\/\|@menção\|\+número\]\.\.\./);
        assert.deepEqual(chamadas, []);
    });

    test('/demote tira o admin; quem não é admin e o criador do grupo recebem aviso', async () => {
        assert.deepEqual(await bot.responder(`/demote +${OUTRO.user}`), ['✅ Fulano deixou de ser admin do grupo.']);
        assert.deepEqual(chamadas, [['demote', [OUTRO.jid]]]);

        assert.deepEqual(await bot.responder('/demote /Ciclano/'), ['⚠️ Ciclano não é admin.']);

        grupo.participants.find(p => p.id._serialized === OUTRO.jid).isSuperAdmin = true;
        assert.deepEqual(await bot.responder(`/demote +${OUTRO.user}`), ['🚫 Fulano criou o grupo: o admin não pode ser tirado.']);
        assert.equal(chamadas.length, 1);
    });

    test('várias pessoas de uma vez', async () => {
        const r = await bot.responder(`/promote +${CICLANO.jid.split('@')[0]} +${OUTRO.user}`);
        assert.deepEqual(r, ['✅ Ciclano agora é admin do grupo.', '⚠️ Fulano já é admin.']);
    });

    test('o participante com @lid é achado pelo telefone', async () => {
        grupo.participants.push({ id: { _serialized: '999@lid', user: '999' }, isAdmin: false, isSuperAdmin: false });
        bot.client.lids.set('999@lid', '5521966666666@c.us');
        bot.criarContato('5521966666666@c.us', 'Beltrano');
        assert.deepEqual(await bot.responder('/promote +5521966666666'), ['✅ Beltrano agora é admin do grupo.']);
        assert.deepEqual(chamadas, [['promote', ['999@lid']]]);
    });

    test('a conta do bot precisa ser admin do grupo', async () => {
        grupo.participants.find(p => p.id._serialized === DONO.jid).isAdmin = false;
        assert.match((await bot.responder(`/promote +${CICLANO.jid.split('@')[0]}`))[0], /^🚫 A sua conta não é admin deste grupo/);
        assert.deepEqual(chamadas, []);
    });

    test('o WhatsApp recusando: a resposta traz o motivo', async () => {
        grupo.promoteParticipants = async () => ({ status: 403 });
        const r = await bot.executar(`/promote +${CICLANO.jid.split('@')[0]}`, { erroEsperado: true });
        assert.equal(r[0].texto, '❌ O WhatsApp recusou a mudança para Ciclano: status 403');
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.responder('/promote @Fulano', { chat: OUTRO.jid }), ['Apenas utilizado dentro de grupos.']);
        assert.deepEqual(await bot.responder('/demote @Fulano', { chat: OUTRO.jid }), ['Apenas utilizado dentro de grupos.']);
    });
});

describe('/invite', () => {
    test('o link do grupo', async () => {
        assert.deepEqual(await bot.responder('/invite'), ['🔗 Link de convite do grupo:\nhttps://chat.whatsapp.com/ABC123']);
    });

    test('-revoke gera outro', async () => {
        assert.deepEqual(await bot.responder('/invite -r'), [
            '🔗 O link antigo deixou de valer. Novo link de convite do grupo:\nhttps://chat.whatsapp.com/NOVO456'
        ]);
    });

    test('sem o código (a conta não é admin): o aviso', async () => {
        grupo.getInviteCode = async () => undefined;
        const [r] = await bot.executar('/invite', { erroEsperado: true });
        assert.match(r.texto, /^❌ Não consegui o link de convite: O WhatsApp não deu o link/);
    });

    test('fora de grupo; e um usuário comum não usa (admin, não delegável)', async () => {
        assert.deepEqual(await bot.responder('/invite', { chat: OUTRO.jid }), ['Apenas utilizado dentro de grupos.']);
        assert.deepEqual(await bot.responder('/invite', { de: OUTRO.jid }), [], 'o bot não responde a quem não é admin');
    });
});
