/*
 * /watch (/w): text and regex rules, private notices and the command options.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt } = bot;
const { compileRuleWatch } = bot.src('watch/rules');

beforeEach(bot.restart);

// Someone writes in the group; returns the notices the bot sent
const someoneWrite = (textAlt, optionsAlt = {}) => bot.executar(textAlt, { de: OTHERAlt.jid, ...optionsAlt });

describe('regras', () => {
    test('texto: contém, sem diferenciar maiúsculas nem acentos', () => {
        const rule = compileRuleWatch('Reunião');
        assert.equal(rule('a REUNIAO de amanhã'), true);
        assert.equal(rule('reuniões'), false);
    });

    test('regex com flags (g e y são ignoradas)', () => {
        assert.equal(compileRuleWatch('/pix|boleto/i')('Me manda o PIX'), true);
        const g = compileRuleWatch('/a/g');
        assert.equal(g('a'), true);
        assert.equal(g('a'), true); // without the g flag, lastIndex does not get in the way
    });

    test('inválidas: regex quebrada, vazia ou longa demais', () => {
        assert.throws(() => compileRuleWatch('/[/'), /regex inválida/);
        assert.throws(() => compileRuleWatch(''), /1 a 200/);
        assert.throws(() => compileRuleWatch('x'.repeat(201)), /1 a 200/);
    });
});

describe('detecção', () => {
    test('mensagem que casa: grava e avisa no seu privado', async () => {
        await bot.setSetting('watch.rules', 'promoção\n/pix/i');
        const notices = await someoneWrite('olha a PROMOCAO do pix');

        assert.equal(notices.length, 1);
        assert.equal(notices[0].chatId, OWNER.jid);
        assert.match(notices[0].texto, /👀 \*WATCH: MENSAGEM DETECTADA\*/);
        assert.match(notices[0].texto, /🔎 \*Regra #1:\* promoção\n🔎 \*Regra #2:\* \/pix\/i/);
        assert.match(notices[0].texto, /👥 \*Grupo:\* Família\n👤 \*Nome:\* Fulano/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 2);
    });

    test('não avisa: suas mensagens, comandos, sem casar, repetida e /watch desativado', async () => {
        await bot.setSetting('watch.rules', 'pix');
        assert.deepEqual(await bot.executar('meu pix'), []);                  // your
        const commandAltAlt = await someoneWrite('/noffa pix');             // command: only its reply
        assert.ok(!commandAltAlt.some(e => /WATCH/.test(e.texto)));
        assert.deepEqual(await someoneWrite('nada a ver'), []);

        const msg = bot.createMessage({ texto: 'pix', de: OTHERAlt.jid, id: 'REPETIDA' });
        assert.equal((await bot.deliver(msg)).length, 1);
        assert.equal((await bot.deliver(msg)).length, 0);

        await bot.setSetting('commands.disabled', 'watch');
        assert.deepEqual(await someoneWrite('outro pix'), []);
    });

    test('menções cruas viram nomes no aviso', async () => {
        await bot.setSetting('watch.rules', 'oi');
        const [notice] = await someoneWrite(`oi @${OTHERAlt.user}`, { mencoes: [OTHERAlt.jid] });
        assert.match(notice.texto, /"oi @Fulano"/);
    });
});

describe('/watch', () => {
    test('-a adiciona texto e regex; aspas e espaços são mantidos', async () => {
        assert.match((await bot.replyAlt('/watch -a promoção relâmpago'))[0], /✅ Regra \*#1\* adicionada _\(texto\)_: promoção relâmpago/);
        assert.match((await bot.replyAlt('/w -add "/pix|boleto/i"'))[0], /✅ Regra \*#2\* adicionada _\(regex\)_: \/pix\|boleto\/i/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['promoção relâmpago', '/pix|boleto/i']);
    });

    test('-a: sem regra, repetida, inválida e acima do watch.max', async () => {
        assert.match((await bot.replyAlt('/watch -a'))[0], /Usage: \/watch/);
        await bot.replyAlt('/watch -a pix');
        assert.match((await bot.replyAlt('/watch -a pix'))[0], /ℹ️ A regra #1 já existe: pix/);
        assert.match((await bot.replyAlt('/watch -a /[/'))[0], /❌ Regra inválida: regex inválida/);

        await bot.setSetting('watch.max', 1);
        assert.match((await bot.replyAlt('/watch -a outra'))[0], /❌ Limite de 1 regras atingido/);
    });

    test('-l lista as regras com as ocorrências, no chat onde foi digitado', async () => {
        assert.match((await bot.replyAlt('/watch -l'))[0], /Nenhuma regra cadastrada/);

        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix');
        const r = await bot.executar('/watch -l');
        assert.equal(r.length, 1);
        assert.equal(r[0].chatId, bot.GROUP);
        assert.match(r[0].texto, /#1  pix  \(1\)\n#2  boleto  \(0\)/);

        const [here] = await bot.executar('/watch -s');
        assert.equal(here.chatId, bot.GROUP);
        assert.match(here.texto, /WATCH/);
    });

    test('-s (e sem opção): ocorrências de todas; -s N de uma regra', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix 1');
        await someoneWrite('boleto 1');

        const allAlt = (await bot.executar('/watch', { chat: OWNER.jid }))[0].texto;
        assert.match(allAlt, /🔎 \*Regras:\* todas\n📦 \*Total:\* 2/);
        // Each occurrence with the no. of the rule that matched (the order is by time; here they tie)
        assert.match(allAlt, /· 🔎 #1\n.*\n    💬 "pix 1"/);
        assert.match(allAlt, /· 🔎 #2\n.*\n    💬 "boleto 1"/);

        const aAlt = (await bot.executar('/watch -s -2', { chat: OWNER.jid }))[0].texto;
        assert.match(aAlt, /🔎 \*Regra #2:\* boleto\n📦 \*Total:\* 1/);
        assert.doesNotMatch(aAlt, /pix 1/);

        assert.match((await bot.replyAlt('/watch -s 9'))[0], /❌ Regra inválida\. Existem 2 regras/);
    });

    test('-s respeita o watch.showMax', async () => {
        await bot.setSetting('watch.rules', 'pix');
        await bot.setSetting('watch.showMax', 1);
        await someoneWrite('pix a');
        await someoneWrite('pix b');
        const [r] = await bot.replyAlt('/watch -s', { chat: OWNER.jid });
        assert.match(r, /📦 \*Total:\* 2 _\(exibindo as 1 mais recentes\)_/);
    });

    test('-d remove a regra e as ocorrências dela', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix');
        const [r] = await bot.replyAlt('/watch -r -1');
        assert.match(r, /🗑️ Regra \*#1\* removida: pix\n🗄️ Ocorrências apagadas: \*1\*\n💡 _As regras seguintes foram renumeradas/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['boleto']);

        assert.match((await bot.replyAlt('/watch -r 5'))[0], /❌ A regra #5 não existe/);
        assert.match((await bot.replyAlt('/watch -r'))[0], /Usage: \/watch/);
    });

    test('-f apaga as ocorrências (de todas ou de uma) e mantém as regras', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix');
        await someoneWrite('boleto');

        assert.match((await bot.replyAlt('/watch -f -2'))[0], /Flush das ocorrências da regra #2:\* boleto\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.match((await bot.replyAlt('/watch -f'))[0], /Flush das ocorrências de todas as regras\*\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix', 'boleto']);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt('/watch -a x', { de: OTHERAlt.jid }), []);
        assert.deepEqual(bot.getSetting('watch.rules'), []);
    });
});
