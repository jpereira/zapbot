/*
 * /ascii: o texto em letras grandes, num bloco de código que cabe na tela do celular.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { gerarAscii } = bot.src('comandos/ascii');

beforeEach(bot.reiniciar);

const larguraMax = (arte) => Math.max(...arte.split('\n').map(l => l.length));

test('gera as 5 linhas dentro de um bloco de código', async () => {
    const [r] = await bot.responder('/ascii Jorge!');
    assert.match(r, /^```\n[\s\S]+\n```$/);
    const linhas = r.replace(/```/g, '').trim().split('\n');
    assert.equal(linhas.length, 5);
    assert.ok(linhas.every(l => l.length <= 30), 'cabe nas 30 colunas');
    assert.equal(gerarAscii('Oi'), ['### ###', '# #  #', '# #  #', '# #  #', '### ###'].join('\n'));
});

test('maiúsculas e acentos valem igual; o que não tem desenho é ignorado', () => {
    assert.equal(gerarAscii('josé'), gerarAscii('JOSE'));
    assert.equal(gerarAscii('a#$%b'), gerarAscii('ab'));
    assert.equal(gerarAscii('#$%'), '');
});

test('quebra em linhas de letras separadas por uma linha em branco, sem passar da largura', () => {
    for (const largura of [10, 20, 30, 60]) {
        const arte = gerarAscii('Feliz aniversario para voce', { largura });
        assert.ok(larguraMax(arte) <= largura, `largura ${largura}`);
    }
    const arte = gerarAscii('Feliz aniversario', { largura: 20 });
    assert.ok(arte.split('\n\n').length > 1);
    assert.ok(arte.split('\n\n').every(g => g.split('\n').length === 5));
    // espaço do fim da linha não sobra, e um espaço na quebra não abre a linha de letras seguinte
    assert.ok(!/ $/m.test(arte));
    assert.equal(gerarAscii('ab cd', { largura: 7 }).split('\n\n').length, 2);
    assert.equal(gerarAscii('  ab'), gerarAscii('ab'));
});

test('-width, -char e o texto da mensagem respondida', async () => {
    const [estreito] = await bot.responder('/ascii -w 10 Jorge');
    assert.ok(larguraMax(estreito.replace(/```/g, '').trim()) <= 10);
    assert.ok(estreito.includes('\n\n'));

    const [arroba] = await bot.responder('/ascii -c @ Oi');
    assert.match(arroba, /@@@ @@@/);
    assert.doesNotMatch(arroba, /#/);
    assert.match((await bot.responder('/ascii -c . Oi'))[0], /\.\.\. \.\.\./);

    const citada = bot.criarMensagem({ de: bot.OUTRO.jid, texto: 'Oi' });
    assert.equal((await bot.responder('/ascii', { citada }))[0], (await bot.responder('/ascii Oi'))[0]);
});

test('ascii.defaultChar muda o traço padrão; -char tem prioridade', async () => {
    await bot.setSetting('ascii.defaultChar', '*');
    const [padrao] = await bot.responder('/ascii Oi');
    assert.match(padrao, /\*\*\* \*\*\*/);
    assert.doesNotMatch(padrao, /#/);
    assert.match((await bot.responder('/ascii -c @ Oi'))[0], /@@@ @@@/);
    await bot.setSetting('ascii.defaultChar', '#');
});

test('erros: sem texto, texto grande, largura e caractere inválidos, nada desenhável', async () => {
    assert.match((await bot.responder('/ascii'))[0], /^❌ Use: \/ascii/);
    assert.match((await bot.responder(`/ascii ${'a'.repeat(41)}`))[0], /no máximo 40 caracteres/);
    for (const w of ['9', '61', 'x'])
        assert.match((await bot.responder(`/ascii -w ${w} Oi`))[0], /^❌ -width precisa de um número de 10 a 60/);
    assert.match((await bot.responder('/ascii -c ab Oi'))[0], /^❌ -char precisa de um único caractere/);
    assert.match((await bot.responder('/ascii #$%'))[0], /^❌ Nada para desenhar/);
});

test('qualquer pessoa com permissão usa (não é admin)', async () => {
    await bot.setSetting('bot.users', true);
    assert.match((await bot.responder('/ascii Oi', { de: bot.OUTRO.jid }))[0], /^```/);
});
