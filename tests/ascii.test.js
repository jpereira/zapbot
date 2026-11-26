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
        const art = generateAscii('Feliz aniversario para voce', { width: widthAlt });
        assert.ok(widthMax(art) <= widthAlt, `largura ${widthAlt}`);
    }
    const art = generateAscii('Feliz aniversario', { width: 20 });
    assert.ok(art.split('\n\n').length > 1);
    assert.ok(art.split('\n\n').every(g => g.split('\n').length === 5));
    // trailing space on the line does not remain, and a space at the break does not open the next line of letters
    assert.ok(!/ $/m.test(art));
    assert.equal(generateAscii('ab cd', { width: 7 }).split('\n\n').length, 2);
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

    const quoted = bot.createMessage({ de: bot.OTHERAlt.jid, text: 'Oi' });
    assert.equal((await bot.replyAlt('/ascii', { quoted }))[0], (await bot.replyAlt('/ascii Oi'))[0]);
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
    assert.match((await bot.replyAlt('/ascii'))[0], /^\*Uso\*\n`\/ascii/);
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

test('\\n (digitado) e quebra de linha começam uma nova linha de letras', () => {
    const expected = generateAscii('A') + '\n\n' + generateAscii('B');
    assert.equal(generateAscii('A\\nB'), expected);
    assert.equal(generateAscii('A\nB'), expected);
});

test('texto grande quebra nos espaços (a palavra inteira desce); só a palavra maior que a linha parte', () => {
    const groups = (s) => s.split('\n\n');
    // Each word on its own line of letters
    assert.equal(groups(generateAscii('jorge pereira nazareno', { width: 30 })).length, 4); // JORGE / PEREIRA / NAZA / RENO
    assert.equal(groups(generateAscii('oi eu', { width: 30 })).length, 1);                   // fits junto
    assert.equal(groups(generateAscii('jorge pereira', { width: 30 })).length, 2);

    // Larger than the line: split into equal pieces, without a lone letter left over
    const partsAlt = groups(generateAscii('nazareno', { width: 20 }));
    assert.equal(partsAlt.length, 2);
    for (const part of partsAlt) assert.ok(Math.max(...part.split('\n').map(l => l.length)) >= 14, 'pedaços de 4 letras');

    // No line goes past the width
    for (const w of [10, 20, 30, 60]) {
        for (const line of generateAscii('jorge pereira nazareno silva', { width: w }).split('\n')) assert.ok(line.length <= w, `${w}: ${line}`);
    }
});
