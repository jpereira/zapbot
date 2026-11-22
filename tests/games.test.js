/*
 * /games: ball 8, verdade, desafio e trivia.
 */
const bot = require('./helpers/bot');

const { test, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');

const { GAMES, openAlt } = bot.src('commands/games');

beforeEach(async () => {
    await bot.restart();
    openAlt.clear();
});

const PT = GAMES.pt_BR;

test('as listas: mesmo tamanho em en_US e pt_BR, e cada trivia com 4 opções e uma certa', () => {
    for (const nameAlt of ['ball', 'truth', 'dare', 'trivia']) {
        assert.equal(GAMES.en_US[nameAlt].length, PT[nameAlt].length, nameAlt);
        assert.ok(PT[nameAlt].length >= 15, nameAlt);
    }
    for (const q of [...PT.trivia, ...GAMES.en_US.trivia]) {
        assert.equal(q.o.length, 4, q.q);
        assert.ok(q.a >= 0 && q.a < 4, q.q);
    }
});

test('-8ball: a pergunta e uma resposta da lista; sem pergunta, pede uma', async () => {
    const [r] = await bot.replyAlt('/games -8ball vou passar na prova?');
    assert.match(r, /^🎱 \*vou passar na prova\?\*\n/);
    assert.ok(PT.ball.some(x => r.endsWith(x)), r);

    assert.match((await bot.replyAlt('/games -8ball'))[0], /Faça uma pergunta/);
});

test('-truth e -dare: um item da lista', async () => {
    const [v] = await bot.replyAlt('/games -truth');
    assert.ok(PT.truth.some(x => v === `🗣️ *Verdade:* ${x}`), v);
    const [d] = await bot.replyAlt('/games -dare');
    assert.ok(PT.dare.some(x => d === `🎯 *Desafio:* ${x}`), d);
});

test('sem jogo: a lista dos jogos', async () => {
    assert.match((await bot.replyAlt('/games'))[0], /Escolha um jogo.*-8ball.*-truth.*-dare.*-trivia/);
});

test('-trivia: pergunta com A-D, a resposta certa fecha, a errada mostra a certa, sem aberta avisa', async () => {
    const [p] = await bot.replyAlt('/games -trivia');
    assert.match(p, /^🧠 \*Trivia\*\n\n.+\n\nA\) .+\nB\) .+\nC\) .+\nD\) .+\n\n/);
    const q = PT.trivia.find(x => p.includes(x.q));
    const letter = 'ABCD'[q.a];

    assert.match((await bot.replyAlt(`/games -trivia ${letter.toLowerCase()}`))[0], new RegExp(`^✅ Acertou! ${letter}\\) `));
    assert.match((await bot.replyAlt(`/games -trivia ${letter}`))[0], /Não há pergunta aberta/);

    await bot.replyAlt('/games -trivia');
    const open = [...openAlt.values()][0];
    const wrong = 'ABCD'[(open.correct + 1) % 4];
    const [e] = await bot.replyAlt(`/games -trivia ${wrong}`);
    assert.match(e, new RegExp(`^❌ Dessa vez não. A resposta era ${'ABCD'[open.correct]}\\) `));
});

test('-trivia: letra inválida não fecha a pergunta; passados 5 minutos ela expira', async () => {
    await bot.replyAlt('/games -trivia');
    assert.match((await bot.replyAlt('/games -trivia X'))[0], /Responda com A, B, C ou D/);
    assert.equal(openAlt.size, 1);

    for (const a of openAlt.values()) a.expires = Date.now() - 1;
    assert.match((await bot.replyAlt('/games -trivia A'))[0], /Não há pergunta aberta/);
});

test('-trivia não vai no /cron; os outros jogos vão', async () => {
    const config = require('../src/botConfig').botConfig.commands.find(c => c.cmd === '/games');
    assert.equal(config.cmd_opts.find(o => o.opts.includes('trivia')).cron, false);
    assert.notEqual(config.cmd_opts.find(o => o.opts.includes('truth')).cron, false);
});

describe('jogar só respondendo (reply) a mensagem do bot, sem o comando', () => {
    const lastId = () => bot.client.sent.at(-1).id._serialized;
    const reply = (textAlt, id, extra = {}) => bot.replyAlt(textAlt, { quoted: { id: { _serialized: id } }, ...extra });

    test('trivia: responder com a letra (maiúscula, minúscula ou "b)") acerta ou erra; conversa solta é ignorada', async () => {
        await bot.replyAlt('/games -trivia');
        const id = lastId();
        const right = 'ABCD'[[...openAlt.values()][0].correct];

        assert.deepEqual(await reply('quem sabe?', id), [], 'texto que não é letra: ignorado');
        assert.equal(openAlt.size, 1);

        const [r] = await reply(`${right.toLowerCase()})`, id);
        assert.match(r, new RegExp(`^✅ Acertou! ${right}\\) `));
        assert.equal(openAlt.size, 0);
    });

    test('8ball: responder com outra pergunta responde de novo, e dá para continuar na resposta nova', async () => {
        await bot.replyAlt('/games -8ball vou passar?');
        const [r1] = await reply('e na prova de amanhã?', lastId());
        assert.match(r1, /^🎱 \*e na prova de amanhã\?\*\n/);
        const [r2] = await reply('e na de sexta?', lastId());
        assert.match(r2, /^🎱 \*e na de sexta\?\*\n/);
    });

    test('8ball: o comando sem pergunta, respondendo uma mensagem, usa o texto dela', async () => {
        const [r] = await bot.replyAlt('/games -8ball', { quoted: bot.createMessage({ text: 'vai dar certo?' }) });
        assert.match(r, /^🎱 \*vai dar certo\?\*\n/);
    });

    test('truth e dare: a resposta ganha ✅; "outra" sorteia outra', async () => {
        for (const [cmd, label] of [['-truth', 'Verdade'], ['-dare', 'Desafio']]) {
            await bot.replyAlt(`/games ${cmd}`);
            const id = lastId();
            bot.client.reacted.length = 0;

            assert.deepEqual(await reply('minha resposta é longa', id), []);
            assert.deepEqual(bot.client.reacted.map(r => r.emoji), ['✅']);

            const [other] = await reply('outra', id);
            assert.match(other, new RegExp(`^.{1,3} \\*${label}:\\* `));
        }
    });

    test('responder a uma mensagem que não é de jogo, ou depois dos 30 minutos, não faz nada', async () => {
        await bot.replyAlt('/ping');
        assert.deepEqual(await reply('B', lastId()), []);

        await bot.replyAlt('/games -truth');
        const id = lastId();
        for (const j of require('../src/commands/games').games.values()) j.expires = Date.now() - 1;
        bot.client.reacted.length = 0;
        assert.deepEqual(await reply('tarde demais', id), []);
        assert.equal(bot.client.reacted.length, 0);
    });
});
