/*
 * /search: WhatsApp Web's search, in the history (not only in the cache).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;

beforeEach(async () => {
    await bot.restart();
    bot.src('commands/search').cleanLastSearches();
});

// A message as searchMessages returns it
const foundAlt = (textAlt, { chat = GROUP, de = OTHERAlt.jid, when = Date.now(), ...extras } = {}) => ({
    ...bot.createMessage({ text: textAlt, chat, de, timestamp: Math.floor(when / 1000) }), ...extras
});

describe('/search', () => {
    test('no grupo, só nele; do mais recente para o mais antigo, com quem mandou', async () => {
        bot.client.searchResults = [
            foundAlt('manda o pix', { when: Date.UTC(2026, 9, 12, 12) }),
            foundAlt('pix feito', { de: OWNER.jid, when: Date.UTC(2026, 9, 13, 12) })
        ];
        const [r] = await bot.replyAlt('/search pix');

        assert.deepEqual(bot.client.searches, [{ query: 'pix', options: { page: 1, limit: 10, chatId: GROUP } }]);
        assert.equal(r, '🔎 *2 mensagens com* "pix"\n\n' +
            `1. 📅 13/10/2026, 09:00:00 · 👤 Você\n   "pix feito"\n   🆔 ${bot.client.searchResults[1].id._serialized}\n\n` +
            `2. 📅 12/10/2026, 09:00:00 · 👤 Fulano\n   "manda o pix"\n   🆔 ${bot.client.searchResults[0].id._serialized}` +
            '\n\n📖 _Para ler uma inteira: /search -r <nº>._');

        assert.equal((await bot.replyAlt('/search pix'))[0], r, 'o /search é o mesmo');
        assert.equal(bot.client.searches[1].query, 'pix');
    });

    test('no seu privado, em todos os chats (com o nome de cada um); -N e o limite', async () => {
        bot.client.searchResults = [foundAlt('boleto vence', { when: Date.UTC(2026, 9, 13, 12) })];
        const [r] = await bot.replyAlt('/search -1 boleto', { chat: OWNER.jid });

        assert.deepEqual(bot.client.searches[0], { query: 'boleto', options: { page: 1, limit: 1 } });
        assert.match(r, /^🔎 \*1 mensagem com\* "boleto" _\(todos os chats\)_\n\n1\. 📅 .* · 💬 Família · 👤 Fulano\n/);
        assert.match(r, /\n\n💡 _Pode haver mais: use -N para ver mais \(ex\.: \/search -30 <texto>\)\._\n\n📖 /);

        const [limited] = await bot.replyAlt('/search boleto vence -99', { chat: OWNER.jid });
        assert.deepEqual(bot.client.searches[1], { query: 'boleto vence', options: { page: 1, limit: 50 } }, 'o -N depois do texto também vale');
        assert.match(limited, /^🔎 \*1 mensagem com\* "boleto vence" _\(todos os chats\)_\n_\(limitado a 50 por vez\)_\n\n/);

        bot.client.searchResults = [foundAlt('me liga no +5521988887777')];
        assert.match((await bot.replyAlt('/search -m liga'))[0], /"me liga no \+55219\*\*\*\*77"\n/, 'o -mask (-m) ofusca os telefones');
        assert.match((await bot.replyAlt('/search liga'))[0], /"me liga no \+5521988887777"\n/);
    });

    test('mídia, texto longo, a própria mensagem do /search e nada encontrado', async () => {
        const commandAlt = bot.createMessage({ text: '/search foto' });
        bot.client.searchResults = [
            foundAlt('foto da praia', { hasMedia: true, type: 'image' }),
            { ...commandAlt }
        ];
        const r = await bot.deliver(commandAlt);
        assert.match(r[0].text, /^🔎 \*1 mensagem com\* "foto"\n\n1\. .*\n {3}📎 _\[image\]_ "foto da praia"\n {3}🆔 .*\n\n📖 /);

        bot.client.searchResults = [foundAlt('x'.repeat(250))];
        assert.match((await bot.replyAlt('/search x'))[0], /"x{200}…"\n {3}🆔 /);

        bot.client.searchResults = [];
        assert.equal((await bot.replyAlt('/search nada'))[0], '🔎 Nada com "nada" neste chat.\n💡 _Aqui só olhei este chat. Para buscar em todos, use /search -a <texto> (a lista vem no seu privado)._');
        assert.equal((await bot.replyAlt('/search nada', { chat: OWNER.jid }))[0], '🔎 Nada com "nada" em nenhum chat.');
    });

    test('-all: busca em todos os chats de qualquer lugar e manda a lista no privado do dono', async () => {
        bot.client.searchResults = [
            foundAlt('correto', { chat: OTHERAlt.jid, when: Date.UTC(2026, 9, 12, 12) }),
            foundAlt('tá correto', { chat: GROUP, when: Date.UTC(2026, 9, 13, 12) })
        ];
        const sendings = await bot.execute('/search -all correto', { chat: GROUP });

        // Without a chat filter, and the list does not show in the group
        assert.deepEqual(bot.client.searches.at(-1), { query: 'correto', options: { page: 1, limit: 10 } });
        const inGroup = sendings.filter(e => e.chatId === GROUP).map(e => e.text).join('\n');
        assert.match(inGroup, /2 mensagens encontradas em todos os chats: mandei a lista no seu privado/);
        assert.doesNotMatch(inGroup, /tá correto/);
        const inPrivate = sendings.filter(e => e.chatId === OWNER.jid).map(e => e.text).join('\n');
        assert.match(inPrivate, /🔎 \*2 mensagens com\* "correto" _\(todos os chats\)_/);
        assert.match(inPrivate, /tá correto/);

        // The -read <no.> works in private, with that search's list
        assert.match((await bot.replyAlt('/search -r 1', { chat: OWNER.jid }))[0], /tá correto$/);
    });

    test('-all é do dono; nada encontrado responde no próprio chat', async () => {
        bot.client.searchResults = [];
        await bot.setSetting('bot.admins', [OTHERAlt.user]);
        assert.match((await bot.replyAlt('/search -a x', { de: OTHERAlt.jid }))[0], /^⛔ O -all só é do dono/);
        assert.equal((await bot.replyAlt('/search -a x', { chat: GROUP }))[0], '🔎 Nada com "x" em nenhum chat.');
    });

    test('-read (-r) <nº>: o número da lista da última busca; sem lista ou fora dela, avisa', async () => {
        assert.match((await bot.replyAlt('/search -r 1'))[0], /^❌ Não há uma busca recente neste chat/);

        const longa = 'y'.repeat(250);
        bot.client.searchResults = [
            foundAlt('pix antigo', { when: Date.UTC(2026, 9, 11, 12) }),
            foundAlt(longa, { when: Date.UTC(2026, 9, 12, 12) })
        ];
        await bot.replyAlt('/search pix');

        // The list goes from newest to oldest: 1 is the long one
        assert.equal((await bot.replyAlt('/search -r 1'))[0], `📅 12/10/2026, 09:00:00 · 👤 Fulano\n\n${longa}`);
        assert.match((await bot.replyAlt('/search -r 2'))[0], /\n\npix antigo$/);
        assert.equal((await bot.replyAlt('/search -r 3'))[0], '❌ O nº 3 não está na lista (a última busca tem 2).');
    });

    test('a busca não lista o /search que você digitou antes nem a lista que o bot respondeu', async () => {
        bot.client.searchResults = [
            foundAlt('manda o pix', { when: Date.UTC(2026, 9, 12, 12) }),
            foundAlt('/search pix', { de: OWNER.jid, when: Date.UTC(2026, 9, 13, 12) }),
            foundAlt('🔎 *3 mensagens com* "pix" ...', { de: OWNER.jid, when: Date.UTC(2026, 9, 13, 13) })
        ];
        const [r] = await bot.replyAlt('/search pix');
        assert.match(r, /^🔎 \*1 mensagem com\* "pix"/);
        assert.doesNotMatch(r, /3 mensagens com/);
    });

    test('-read (-r) <id>: a mensagem inteira, no escopo da busca', async () => {
        const longa = 'y'.repeat(250);
        const her = foundAlt(longa, { when: Date.UTC(2026, 9, 12, 12) });
        const ofOther = foundAlt('segredo', { chat: OTHERAlt.jid });
        bot.client.searchResults = [her, ofOther];

        const [r] = await bot.replyAlt(`/search -read ${her.id._serialized}`);
        assert.equal(r, `📅 12/10/2026, 09:00:00 · 👤 Fulano\n\n${longa}`);
        assert.equal((await bot.replyAlt(`/search -r ${her.id._serialized}`))[0], r);

        assert.match((await bot.replyAlt(`/search -r ${ofOther.id._serialized}`))[0], /não encontrada neste chat\.$/);
        assert.match((await bot.replyAlt(`/search -r ${ofOther.id._serialized}`, { chat: OWNER.jid }))[0], /^📅 .* · 💬 .* · 👤 Fulano\n\nsegredo$/);
        assert.match((await bot.replyAlt('/search -r nada', { chat: OWNER.jid }))[0], /não encontrada em nenhum chat\.$/);
    });

    test('sem texto: a sintaxe; a busca falha: o aviso', async () => {
        assert.match((await bot.replyAlt('/search'))[0], /^```Usage: \/search \[-N\] \[-all\] <texto> \| -read <nº\|id>```\n💡 _\/search -h para ajuda_/);

        bot.client.searchResults = new Error('page crashed');
        const r = await bot.replyAlt('/search pix', { expectedError: true });
        assert.equal(r[0], '⚠️ A busca do WhatsApp falhou: page crashed');
    });

    test('só o dono e os admins', async () => {
        await bot.replyAlt('/search pix', { de: OTHERAlt.jid });
        assert.deepEqual(bot.client.searches, []);
    });
});
