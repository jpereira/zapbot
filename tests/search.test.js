/*
 * /search (/buscar): a busca do WhatsApp Web, no histórico (não só no cache).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;

beforeEach(bot.reiniciar);

// Uma mensagem como o searchMessages devolve
const achada = (texto, { chat = GRUPO, de = OUTRO.jid, quando = Date.now(), ...extras } = {}) => ({
    ...bot.criarMensagem({ texto, chat, de, timestamp: Math.floor(quando / 1000) }), ...extras
});

describe('/search (/buscar)', () => {
    test('no grupo, só nele; do mais recente para o mais antigo, com quem mandou', async () => {
        bot.client.resultadosDaBusca = [
            achada('manda o pix', { quando: Date.UTC(2026, 9, 12, 12) }),
            achada('pix feito', { de: DONO.jid, quando: Date.UTC(2026, 9, 13, 12) })
        ];
        const [r] = await bot.responder('/search pix');

        assert.deepEqual(bot.client.buscas, [{ query: 'pix', options: { page: 1, limit: 10, chatId: GRUPO } }]);
        assert.equal(r, '🔎 *2 mensagens com* "pix"\n\n' +
            '1. 📅 13/10/2026, 09:00:00 · 👤 Você\n   "pix feito"\n\n' +
            '2. 📅 12/10/2026, 09:00:00 · 👤 Fulano\n   "manda o pix"');

        assert.equal((await bot.responder('/buscar pix'))[0], r, 'o /buscar é o mesmo');
        assert.equal(bot.client.buscas[1].query, 'pix');
    });

    test('no seu privado, em todos os chats (com o nome de cada um); -N e o limite', async () => {
        bot.client.resultadosDaBusca = [achada('boleto vence', { quando: Date.UTC(2026, 9, 13, 12) })];
        const [r] = await bot.responder('/search -1 boleto', { chat: DONO.jid });

        assert.deepEqual(bot.client.buscas[0], { query: 'boleto', options: { page: 1, limit: 1 } });
        assert.match(r, /^🔎 \*1 mensagem com\* "boleto" _\(todos os chats\)_\n\n1\. 📅 .* · 💬 Família · 👤 Fulano\n/);
        assert.match(r, /\n\n💡 _Pode haver mais: use -N para ver mais \(ex\.: \/search -30 <texto>\)\._$/);

        const [limitado] = await bot.responder('/search boleto vence -99', { chat: DONO.jid });
        assert.deepEqual(bot.client.buscas[1], { query: 'boleto vence', options: { page: 1, limit: 50 } }, 'o -N depois do texto também vale');
        assert.match(limitado, /^🔎 \*1 mensagem com\* "boleto vence" _\(todos os chats\)_\n_\(limitado a 50 por vez\)_\n\n/);

        bot.client.resultadosDaBusca = [achada('me liga no +5521988887777')];
        assert.match((await bot.responder('/search -m liga'))[0], /"me liga no \+55219\*\*\*\*77"$/, 'o -mask (-m) ofusca os telefones');
        assert.match((await bot.responder('/search liga'))[0], /"me liga no \+5521988887777"$/);
    });

    test('mídia, texto longo, a própria mensagem do /search e nada encontrado', async () => {
        const comando = bot.criarMensagem({ texto: '/search foto' });
        bot.client.resultadosDaBusca = [
            achada('foto da praia', { hasMedia: true, type: 'image' }),
            { ...comando }
        ];
        const r = await bot.entregar(comando);
        assert.match(r[0].texto, /^🔎 \*1 mensagem com\* "foto"\n\n1\. .*\n {3}📎 _\[image\]_ "foto da praia"$/);

        bot.client.resultadosDaBusca = [achada('x'.repeat(250))];
        assert.match((await bot.responder('/search x'))[0], /"x{200}…"$/);

        bot.client.resultadosDaBusca = [];
        assert.equal((await bot.responder('/search nada'))[0], '🔎 Nada com "nada" neste chat.');
        assert.equal((await bot.responder('/search nada', { chat: DONO.jid }))[0], '🔎 Nada com "nada" em nenhum chat.');
    });

    test('sem texto: a sintaxe; a busca falha: o aviso', async () => {
        assert.match((await bot.responder('/search'))[0], /^```Uso: \/search \[-N\] <texto>\n/);

        bot.client.resultadosDaBusca = new Error('page crashed');
        const r = await bot.responder('/search pix', { erroEsperado: true });
        assert.equal(r[0], '⚠️ A busca do WhatsApp falhou: page crashed');
    });

    test('só o dono e os admins', async () => {
        await bot.responder('/search pix', { de: OUTRO.jid });
        assert.deepEqual(bot.client.buscas, []);
    });
});
