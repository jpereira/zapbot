/*
 * /ascii: the text in big letters, in a code block that fits the phone screen.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { generateAscii } = bot.src('commands/ascii');

beforeEach(bot.restart);

const widthMax = (art) => Math.max(...art.split('\n').map(l => l.length));

test('gera as 5 linhas dentro de um bloco de código', async () => {
    const [r] = await bot.replyAlt('/ascii Jorge!');
    assert.match(r, /^```\n[\s\S]+\n```$/);
    const linesAlt = r.replace(/```/g, '').trim().split('\n');
    assert.equal(linesAlt.length, 5);
    assert.ok(linesAlt.every(l => l.length <= 30), 'cabe nas 30 colunas');
    assert.equal(generateAscii('Oi'), ['### ###', '# #  #', '# #  #', '# #  #', '### ###'].join('\n'));
});

test('maiúsculas e acentos valem igual; o que não tem desenho é ignorado', () => {
    assert.equal(generateAscii('josé'), generateAscii('JOSE'));
    assert.equal(generateAscii('a#$%b'), generateAscii('ab'));
    assert.equal(generateAscii('#$%'), '');
});

test('quebra em linhas de letras separadas por uma linha em branco, sem passar da largura', () => {
    for (const widthAlt of [10, 20, 30, 60]) {
        const art = generateAscii('Feliz aniversario para voce', { largura: widthAlt });
        assert.ok(widthMax(art) <= widthAlt, `largura ${widthAlt}`);
    }
    const art = generateAscii('Feliz aniversario', { largura: 20 });
    assert.ok(art.split('\n\n').length > 1);
    assert.ok(art.split('\n\n').every(g => g.split('\n').length === 5));
    // trailing space on the line does not remain, and a space at the break does not open the next line of letters
    assert.ok(!/ $/m.test(art));
    assert.equal(generateAscii('ab cd', { largura: 7 }).split('\n\n').length, 2);
    assert.equal(generateAscii('  ab'), generateAscii('ab'));
});

test('-width, -char e o texto da mensagem respondida', async () => {
    const [narrow] = await bot.replyAlt('/ascii -w 10 Jorge');
    assert.ok(widthMax(narrow.replace(/```/g, '').trim()) <= 10);
    assert.ok(narrow.includes('\n\n'));

    const [arroba] = await bot.replyAlt('/ascii -c @ Oi');
    assert.match(arroba, /@@@ @@@/);
    assert.doesNotMatch(arroba, /#/);
    assert.match((await bot.replyAlt('/ascii -c . Oi'))[0], /\.\.\. \.\.\./);

    const quoted = bot.createMessage({ de: bot.OTHERAlt.jid, texto: 'Oi' });
    assert.equal((await bot.replyAlt('/ascii', { citada: quoted }))[0], (await bot.replyAlt('/ascii Oi'))[0]);
});

test('ascii.defaultChar muda o traço padrão; -char tem prioridade', async () => {
    await bot.setSetting('ascii.defaultChar', '*');
    const [defaults] = await bot.replyAlt('/ascii Oi');
    assert.match(defaults, /\*\*\* \*\*\*/);
    assert.doesNotMatch(defaults, /#/);
    assert.match((await bot.replyAlt('/ascii -c @ Oi'))[0], /@@@ @@@/);
    await bot.setSetting('ascii.defaultChar', '#');
});

test('erros: sem texto, texto grande, largura e caractere inválidos, nada desenhável', async () => {
    assert.match((await bot.replyAlt('/ascii'))[0], /^❌ Use: \/ascii/);
    assert.match((await bot.replyAlt(`/ascii ${'a'.repeat(41)}`))[0], /no máximo 40 caracteres/);
    for (const w of ['9', '61', 'x'])
        assert.match((await bot.replyAlt(`/ascii -w ${w} Oi`))[0], /^❌ -width precisa de um número de 10 a 60/);
    assert.match((await bot.replyAlt('/ascii -c ab Oi'))[0], /^❌ -char precisa de um único caractere/);
    assert.match((await bot.replyAlt('/ascii #$%'))[0], /^❌ Nada para desenhar/);
});

test('qualquer pessoa com permissão usa (não é admin)', async () => {
    await bot.setSetting('bot.users', true);
    assert.match((await bot.replyAlt('/ascii Oi', { de: bot.OTHERAlt.jid }))[0], /^```/);
});
