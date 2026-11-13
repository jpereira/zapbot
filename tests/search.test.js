/*
 * /search: WhatsApp Web's search, in the history (not only in the cache).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;

beforeEach(bot.restart);

// A message as searchMessages returns it
const foundAlt = (textAlt, { chat = GROUP, de = OTHERAlt.jid, quando: when = Date.now(), ...extras } = {}) => ({
    ...bot.createMessage({ texto: textAlt, chat, de, timestamp: Math.floor(when / 1000) }), ...extras
});

describe('/search', () => {
    test('no grupo, só nele; do mais recente para o mais antigo, com quem mandou', async () => {
        bot.client.resultadosDaBusca = [
            foundAlt('manda o pix', { quando: Date.UTC(2026, 9, 12, 12) }),
            foundAlt('pix feito', { de: OWNER.jid, quando: Date.UTC(2026, 9, 13, 12) })
        ];
        const [r] = await bot.replyAlt('/search pix');

        assert.deepEqual(bot.client.buscas, [{ query: 'pix', options: { page: 1, limit: 10, chatId: GROUP } }]);
        assert.equal(r, '🔎 *2 mensagens com* "pix"\n\n' +
            `1. 📅 13/10/2026, 09:00:00 · 👤 Você\n   "pix feito"\n   🆔 ${bot.client.resultadosDaBusca[1].id._serialized}\n\n` +
            `2. 📅 12/10/2026, 09:00:00 · 👤 Fulano\n   "manda o pix"\n   🆔 ${bot.client.resultadosDaBusca[0].id._serialized}` +
            '\n\n📖 _Para ler uma inteira: /search -read <id>._');

        assert.equal((await bot.replyAlt('/search pix'))[0], r, 'o /search é o mesmo');
        assert.equal(bot.client.buscas[1].query, 'pix');
    });

    test('no seu privado, em todos os chats (com o nome de cada um); -N e o limite', async () => {
        bot.client.resultadosDaBusca = [foundAlt('boleto vence', { quando: Date.UTC(2026, 9, 13, 12) })];
        const [r] = await bot.replyAlt('/search -1 boleto', { chat: OWNER.jid });

        assert.deepEqual(bot.client.buscas[0], { query: 'boleto', options: { page: 1, limit: 1 } });
        assert.match(r, /^🔎 \*1 mensagem com\* "boleto" _\(todos os chats\)_\n\n1\. 📅 .* · 💬 Família · 👤 Fulano\n/);
        assert.match(r, /\n\n💡 _Pode haver mais: use -N para ver mais \(ex\.: \/search -30 <texto>\)\._\n\n📖 /);

        const [limited] = await bot.replyAlt('/search boleto vence -99', { chat: OWNER.jid });
        assert.deepEqual(bot.client.buscas[1], { query: 'boleto vence', options: { page: 1, limit: 50 } }, 'o -N depois do texto também vale');
        assert.match(limited, /^🔎 \*1 mensagem com\* "boleto vence" _\(todos os chats\)_\n_\(limitado a 50 por vez\)_\n\n/);

        bot.client.resultadosDaBusca = [foundAlt('me liga no +5521988887777')];
        assert.match((await bot.replyAlt('/search -m liga'))[0], /"me liga no \+55219\*\*\*\*77"\n/, 'o -mask (-m) ofusca os telefones');
        assert.match((await bot.replyAlt('/search liga'))[0], /"me liga no \+5521988887777"\n/);
    });

    test('mídia, texto longo, a própria mensagem do /search e nada encontrado', async () => {
        const commandAlt = bot.createMessage({ texto: '/search foto' });
        bot.client.resultadosDaBusca = [
            foundAlt('foto da praia', { hasMedia: true, type: 'image' }),
            { ...commandAlt }
        ];
        const r = await bot.deliver(commandAlt);
        assert.match(r[0].texto, /^🔎 \*1 mensagem com\* "foto"\n\n1\. .*\n {3}📎 _\[image\]_ "foto da praia"\n {3}🆔 .*\n\n📖 /);

        bot.client.resultadosDaBusca = [foundAlt('x'.repeat(250))];
        assert.match((await bot.replyAlt('/search x'))[0], /"x{200}…"\n {3}🆔 /);

        bot.client.resultadosDaBusca = [];
        assert.equal((await bot.replyAlt('/search nada'))[0], '🔎 Nada com "nada" neste chat.');
        assert.equal((await bot.replyAlt('/search nada', { chat: OWNER.jid }))[0], '🔎 Nada com "nada" em nenhum chat.');
    });

    test('-read (-r) <id>: a mensagem inteira, no escopo da busca', async () => {
        const longa = 'y'.repeat(250);
        const her = foundAlt(longa, { quando: Date.UTC(2026, 9, 12, 12) });
        const doutro = foundAlt('segredo', { chat: OTHERAlt.jid });
        bot.client.resultadosDaBusca = [her, doutro];

        const [r] = await bot.replyAlt(`/search -read ${her.id._serialized}`);
        assert.equal(r, `📅 12/10/2026, 09:00:00 · 👤 Fulano\n\n${longa}`);
        assert.equal((await bot.replyAlt(`/search -r ${her.id._serialized}`))[0], r);

        assert.match((await bot.replyAlt(`/search -r ${doutro.id._serialized}`))[0], /não encontrada neste chat\.$/);
        assert.match((await bot.replyAlt(`/search -r ${doutro.id._serialized}`, { chat: OWNER.jid }))[0], /^📅 .* · 💬 .* · 👤 Fulano\n\nsegredo$/);
        assert.match((await bot.replyAlt('/search -r nada', { chat: OWNER.jid }))[0], /não encontrada em nenhum chat\.$/);
    });

    test('sem texto: a sintaxe; a busca falha: o aviso', async () => {
        assert.match((await bot.replyAlt('/search'))[0], /^```Uso: \/search \[-N\] <texto> \| -read <id>\n/);

        bot.client.resultadosDaBusca = new Error('page crashed');
        const r = await bot.replyAlt('/search pix', { erroEsperado: true });
        assert.equal(r[0], '⚠️ A busca do WhatsApp falhou: page crashed');
    });

    test('só o dono e os admins', async () => {
        await bot.replyAlt('/search pix', { de: OTHERAlt.jid });
        assert.deepEqual(bot.client.buscas, []);
    });
});
