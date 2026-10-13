/*
 * /block (/bloquear) e /unblock: o bloqueio na sua conta do WhatsApp.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OUTRO } = bot;
const BELTRANO = { jid: '5521922222222@c.us', nome: 'Beltrano' };

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarContato(BELTRANO.jid, BELTRANO.nome);
});

const contato = (jid) => bot.client.contatos.get(jid);

// Um contato que o WhatsApp só conhece pelo @lid (o number dele é o próprio lid)
const bloqueadoPeloLid = (lid) => Object.assign(bot.criarContato(lid, null),
    { name: undefined, pushname: undefined, isBlocked: true });

describe('/block e /unblock', () => {
    test('bloqueia pelo nome; de novo: já está; a lista; desbloqueia pelo nº', async () => {
        assert.equal((await bot.responder('/block /Fulano/'))[0],
            '🚫 *Bloqueado:* 👤 Fulano\n💡 _Desfaça com /unblock; veja a lista com /block._');
        assert.equal(contato(OUTRO.jid).isBlocked, true);
        assert.match((await bot.responder('/block /Fulano/'))[0], /^ℹ️ 👤 Fulano já está bloqueado\./);

        await bot.responder('/bloquear +5521922222222');
        assert.equal(contato(BELTRANO.jid).isBlocked, true, 'o /bloquear é o mesmo');

        const [lista] = await bot.responder('/block');
        assert.equal(lista, '🚫 *Bloqueados* (2)\n\n1. 👤 Beltrano · +5521922222222\n2. 👤 Fulano · +5521911111111\n\n' +
            '💡 _Desbloqueie com /unblock <nº|nome>._');
        assert.equal((await bot.responder('/block -l'))[0], lista);
        assert.match((await bot.responder('/block -mask /Beltrano/'))[0], /^ℹ️ 👤 Beltrano já está bloqueado\./,
            'o -mask não entra no nome');

        // -mask (-m): os telefones ofuscados, na lista e na confirmação
        const mascarada = '🚫 *Bloqueados* (2)\n\n1. 👤 Beltrano · +55219****22\n2. 👤 Fulano · +55219****11\n\n' +
            '💡 _Desbloqueie com /unblock <nº|nome>._';
        assert.equal((await bot.responder('/block -l -m'))[0], mascarada);
        assert.equal((await bot.responder('/block -m'))[0], mascarada);
        assert.equal((await bot.responder('/block -mask'))[0], mascarada);
        assert.equal((await bot.responder('/block'))[0], lista, 'sem o -mask, completos de novo');

        assert.equal((await bot.responder('/unblock 2'))[0], '✅ *Desbloqueado:* 👤 Fulano · +5521911111111');
        assert.equal(contato(OUTRO.jid).isBlocked, false);
        assert.match((await bot.responder('/unblock /Fulano/'))[0], /^ℹ️ 👤 Fulano não está bloqueado\./);
        assert.match((await bot.responder('/unblock 9'))[0], /^❌ Nº 9 não existe\./);
        assert.equal((await bot.responder('/unblock /Beltrano/'))[0], '✅ *Desbloqueado:* 👤 Beltrano');
    });

    test('várias pessoas de uma vez: números, /nome/ e @menção; um resumo só', async () => {
        const CICLANO = bot.criarContato('5521933333333@c.us', 'Ciclano Souza');
        bot.criarContato(bot.DONO.jid, bot.DONO.nome);  // a conta do bot, achada pelo número
        contato(BELTRANO.jid).isBlocked = true;

        const r = await bot.responder('/block +5521911111111 /Ciclano Souza/ @5521922222222 +5521900000000 +5521911111111',
            { mencoes: [BELTRANO.jid] });
        assert.deepEqual(r, ['🚫 *Bloqueados (2):*\n👤 Fulano\n👤 Ciclano Souza\n\n' +
            'ℹ️ *Já estavam bloqueados (1):*\n👤 Beltrano\n\n' +
            '❌ *Não bloqueados (1):*\n👤 Dono: é a conta do próprio bot\n\n' +
            '💡 _Desfaça com /unblock; veja a lista com /block._']);
        assert.deepEqual([contato(OUTRO.jid).isBlocked, CICLANO.isBlocked], [true, true]);
    });

    test('várias: quem não é achado tem o erro dele, e os outros seguem', async () => {
        const r = await bot.responder('/block +5521977777777 +5521922222222');
        assert.deepEqual(r, ['❌ O número +5521977777777 não está no WhatsApp.',
            '🚫 *Bloqueados (1):*\n👤 Beltrano\n\n💡 _Desfaça com /unblock; veja a lista com /block._']);
    });

    test('pelo @lid, quando o WhatsApp informa: o bloqueio e o "já está" são dele', async () => {
        const lid = Object.assign(bot.criarContato('103642006839525@lid', null), { name: undefined, pushname: undefined });
        bot.client.lids.set('103642006839525@lid', OUTRO.jid);

        assert.match((await bot.responder('/block +5521911111111'))[0], /^🚫 \*Bloqueado:\* 👤 Fulano\n/);
        assert.deepEqual([lid.isBlocked, contato(OUTRO.jid).isBlocked], [true, false], 'bloqueou o @lid, não o telefone');
        assert.match((await bot.responder('/block /Fulano/'))[0], /^ℹ️ 👤 Fulano já está bloqueado\./);
    });

    test('o erro do WhatsApp numa pessoa não derruba as outras', async () => {
        // O erro interno do WhatsApp Web, sem mensagem: o "t" do log
        contato(OUTRO.jid).block = async () => { throw new Error('t'); };

        const r = await bot.responder('/block +5521911111111 +5521922222222', { erroEsperado: true });
        assert.deepEqual(r, ['🚫 *Bloqueados (1):*\n👤 Beltrano\n\n' +
            '❌ *Não bloqueados (1):*\n👤 Fulano: o WhatsApp recusou o bloqueio (erro "t")\n\n' +
            '💡 _Desfaça com /unblock; veja a lista com /block._']);

        assert.deepEqual(await bot.responder('/block +5521911111111', { erroEsperado: true }),
            ['⚠️ Não consegui bloquear 👤 Fulano: o WhatsApp recusou o bloqueio (erro "t").']);
    });

    test('o bloqueio que não entra na lista do WhatsApp é falha', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        contato(OUTRO.jid).block = async () => true;  // como o whatsapp-web.js: true, sem conferir

        const [r] = await bot.esperarComRelogio(t, bot.executar('/block +5521911111111'), 500);
        assert.equal(r.texto, '⚠️ Não consegui bloquear 👤 Fulano: o WhatsApp não bloqueou (não entrou na lista).');
    });

    test('palavras soltas são um nome só (não várias pessoas)', async () => {
        const CICLANO = bot.criarContato('5521933333333@c.us', 'Ciclano Souza');
        assert.equal((await bot.responder('/block Ciclano Souza'))[0], '🚫 *Bloqueado:* 👤 Ciclano Souza\n' +
            '💡 _Desfaça com /unblock; veja a lista com /block._');
        assert.equal(CICLANO.isBlocked, true);
        assert.equal(contato(OUTRO.jid).isBlocked, false);
    });

    test('bloqueados pelo @lid: o telefone e o nome da agenda; sem telefone conhecido, o id interno', async () => {
        const comTelefone = bloqueadoPeloLid('103642006839525@lid');
        bot.client.lids.set('103642006839525@lid', OUTRO.jid);
        bloqueadoPeloLid('8706418802871@lid');

        const [lista] = await bot.responder('/block');
        assert.equal(lista, '🚫 *Bloqueados* (2)\n\n1. 👤 Fulano · +5521911111111\n' +
            '2. 👤 8706418802871 _(id interno, sem telefone conhecido)_\n\n💡 _Desbloqueie com /unblock <nº|nome>._');

        assert.equal((await bot.responder('/unblock 1'))[0], '✅ *Desbloqueado:* 👤 Fulano · +5521911111111');
        assert.equal(comTelefone.isBlocked, false);
    });

    test('respondendo uma mensagem: quem a escreveu; a sua conta não', async () => {
        const citada = bot.criarMensagem({ texto: 'spam', de: OUTRO.jid });
        assert.match((await bot.responder('/block', { citada }))[0], /^🚫 \*Bloqueado:\* 👤 Fulano\n/);
        assert.equal((await bot.responder('/unblock', { citada }))[0], '✅ *Desbloqueado:* 👤 Fulano');

        const minha = bot.criarMensagem({ texto: 'oi' });
        assert.equal((await bot.responder('/block', { citada: minha }))[0], '❌ Não dá para bloquear a conta do próprio bot.');
    });

    test('grupo e e-mail não; ninguém bloqueado: a dica (no /block e no /unblock)', async () => {
        const dica = '🚫 Ninguém bloqueado.\n💡 _Ex.: /block /Fulano/, @menção ou +5521999999999, ou responda uma mensagem com /block._';
        assert.equal((await bot.responder('/block'))[0], dica);
        assert.equal((await bot.responder('/unblock'))[0], dica);
        assert.match((await bot.responder('/block /Família/'))[0], /^❌ Nenhum contato com "Família" no nome\./);
        assert.match((await bot.responder('/block fulano@exemplo.com'))[0], /^❌ O \/block é de pessoas/);
    });

    test('/unblock -all: todos; quem falha não segura os outros', async () => {
        assert.equal((await bot.responder('/unblock -all'))[0], '🚫 Ninguém bloqueado.');

        contato(OUTRO.jid).isBlocked = true;
        contato(BELTRANO.jid).isBlocked = true;
        bloqueadoPeloLid('8706418802871@lid').unblock = async () => { throw new Error('rede fora'); };

        const r = await bot.executar('/unblock -a');
        assert.equal(r.length, 1, 'só o aviso, editado com o resultado');
        assert.equal(r[0].texto, '✅ 2 desbloqueados.\n\n⚠️ Não consegui desbloquear (1):\n' +
            '• 8706418802871 _(id interno, sem telefone conhecido)_: rede fora');
        assert.equal(r[0].editada, true, 'o "⏳ Desbloqueando 3 contatos, aguarde." virou o resultado');
        assert.deepEqual([contato(OUTRO.jid).isBlocked, contato(BELTRANO.jid).isBlocked], [false, false]);
    });

    test('/unblock -all: se o WhatsApp não deixa editar o aviso, o resultado vai em outra mensagem', async () => {
        contato(OUTRO.jid).isBlocked = true;
        bot.client.recusarEdicao = true;
        assert.deepEqual(await bot.responder('/unblock -all'), ['⏳ Desbloqueando 1 contato, aguarde.', '✅ 1 desbloqueado.']);
    });

    describe('o unblock() do whatsapp-web.js não confere: o bot confere na lista', () => {
        // Como um bloqueio guardado pelo telefone: o unblock() da lib desbloqueia o @lid e devolve true
        const semEfeito = (jid) => {
            const c = contato(jid);
            c.isBlocked = true;
            c.unblock = async () => true;
            return c;
        };
        // A conferência espera o WhatsApp Web atualizar a lista: o relógio simulado pula a espera
        beforeEach((t) => t.mock.timers.enable({ apis: ['setTimeout'] }));
        const executarComRelogio = (t, linha, opcoes) => bot.esperarComRelogio(t, bot.executar(linha, opcoes), 500);

        test('continua na lista: falha, sem o ✅ falso', async (t) => {
            semEfeito(OUTRO.jid);
            contato(BELTRANO.jid).isBlocked = true;

            // Sem a página do WhatsApp Web (o falso não tem), a 2ª tentativa falha e fica no log
            const [r] = await executarComRelogio(t, '/unblock -all', { erroEsperado: true });
            assert.equal(r.texto, '✅ 1 desbloqueado.\n\n⚠️ Não consegui desbloquear (1):\n' +
                '• Fulano · +5521911111111: o WhatsApp não desbloqueou (continua na lista)');

            const [s1] = await executarComRelogio(t, '/unblock /Fulano/', { erroEsperado: true });
            assert.equal(s1.texto, '⚠️ Não consegui desbloquear 👤 Fulano: o WhatsApp não desbloqueou (continua na lista).');
        });

        test('quem ficou é desbloqueado pelo id exato da lista', async (t) => {
            const fulano = semEfeito(OUTRO.jid);
            const pedidos = [];
            bot.client.pupPage = { evaluate: async (fn, id) => { pedidos.push(id); contato(id).isBlocked = false; } };
            try {
                const [r] = await executarComRelogio(t, '/unblock -all');
                assert.equal(r.texto, '✅ 1 desbloqueado.');
                assert.deepEqual(pedidos, [OUTRO.jid]);
                assert.equal(fulano.isBlocked, false);
            } finally {
                delete bot.client.pupPage;
            }
        });
    });

    test('pelo nome, com o bloqueio guardado no @lid: acha pelo telefone', async () => {
        const lid = bloqueadoPeloLid('103642006839525@lid');
        bot.client.lids.set('103642006839525@lid', OUTRO.jid);

        assert.equal((await bot.responder('/unblock /Fulano/'))[0], '✅ *Desbloqueado:* 👤 Fulano');
        assert.equal(lid.isBlocked, false);
    });

    test('só o dono e os admins', async () => {
        const r = await bot.responder('/block /Beltrano/', { de: OUTRO.jid });
        assert.equal(contato(BELTRANO.jid).isBlocked, false);
        assert.ok(!r.some(t => t.startsWith('🚫 *Bloqueado')));
    });
});
