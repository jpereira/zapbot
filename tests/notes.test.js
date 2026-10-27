/*
 * /notes: notes (-add, -list, -rem) and the -alerta (date/time, -to, one-shot).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { checkNotes } = bot.src('notes');

const L200 = '120363000000000200@g.us';

beforeEach(async () => {
    await bot.restart();
    await bot.dbRun('DELETE FROM notes');
    await bot.dbRun("DELETE FROM sqlite_sequence WHERE name = 'notes'");
    bot.createGroup(L200, 'Grupo sobre L200', [bot.OWNER.jid]);
});

const notes = () => bot.dbAll('SELECT id, text, alert_at FROM notes ORDER BY id');

async function expire(id) {
    await bot.dbRun('UPDATE notes SET alert_at = ? WHERE id = ?', [Date.now() - 1000, id]);
    const beforeAlt = bot.client.enviadas.length;
    await checkNotes();
    return bot.client.enviadas.slice(beforeAlt);
}

test('-add, -list e -rem (vários IDs, all e ID inexistente sem remover nada)', async () => {
    assert.match((await bot.replyAlt('/notes'))[0], /Nenhuma anotação/);
    assert.match((await bot.replyAlt('/notes -add comprar leite'))[0], /Anotação #1/);
    await bot.replyAlt('/notes -a ligar pro João\nsegunda linha');
    await bot.replyAlt('/notes -a pagar boleto');
    assert.deepEqual((await notes()).map(n => n.text), ['comprar leite', 'ligar pro João\nsegunda linha', 'pagar boleto']);

    const [list] = await bot.replyAlt('/notes');
    assert.match(list, /\*#1\* comprar leite/);
    assert.match(list, /\*#3\* pagar boleto/);
    assert.equal((await bot.replyAlt('/notes -l'))[0], list);
    assert.equal((await bot.replyAlt('/notes -list'))[0], list);

    assert.match((await bot.replyAlt('/notes -r 2 9'))[0], /ID 9 não existe/);
    assert.equal((await notes()).length, 3);
    assert.match((await bot.replyAlt('/notes -rem 2'))[0], /1 anotação removida/);
    assert.deepEqual((await notes()).map(n => n.id), [1, 3]);
    assert.match((await bot.replyAlt('/notes -r all'))[0], /2 anotações removidas/);
    assert.equal((await notes()).length, 0);
});

test('-add sem texto, com -to sem -alerta e com quando inválido ou no passado', async () => {
    assert.match((await bot.replyAlt('/notes -add'))[0], /Use: \/notes -add/);
    assert.match((await bot.replyAlt('/notes -add texto -to /Grupo sobre L200/'))[0], /só vale com o -alerta/);
    assert.match((await bot.replyAlt('/notes -add texto -alerta banana'))[0], /Quando inválido/);
    assert.match((await bot.replyAlt('/notes -add texto -alerta 18h sobra'))[0], /Quando inválido/);
    assert.equal((await notes()).length, 0);
});

test('-alerta no -add: dispara uma vez no privado e a anotação continua', async () => {
    const [reply] = await bot.replyAlt('/notes -a ligar pro João -alerta +2h');
    assert.match(reply, /Anotação #1/);
    assert.match(reply, /seu privado/);
    assert.equal((await notes())[0].text, 'ligar pro João');
    assert.ok((await notes())[0].alert_at > Date.now());

    const beforeAlt = bot.client.enviadas.length;
    await checkNotes();
    assert.equal(bot.client.enviadas.length, beforeAlt, 'ainda não venceu');

    const sentAlt2 = await expire(1);
    assert.equal(sentAlt2.length, 1);
    assert.match(sentAlt2[0].content, /ANOTAÇÃO #1[\s\S]*ligar pro João/);
    assert.equal((await notes())[0].alert_at, null, 'o alerta zera, a anotação fica');
    assert.equal((await expire(1)).length, 1, 'forçando o vencimento de novo, avisa de novo');
    assert.match((await bot.replyAlt('/notes -alerta'))[0], /Nenhuma anotação com alerta/);
});

test('-alerta <id> <quando> com -to, lista e -alerta -rm', async () => {
    await bot.replyAlt('/notes -a reunião');
    await bot.replyAlt('/notes -a outra');
    assert.match((await bot.replyAlt('/notes -alerta 9 +1h'))[0], /ID 9 não existe/);
    assert.match((await bot.replyAlt('/notes -alerta 1 banana'))[0], /Quando inválido/);
    assert.match((await bot.replyAlt('/notes -alerta -to /Grupo sobre L200/'))[0], /só vale ao criar/);

    const [created] = await bot.replyAlt('/notes -alerta 1 +1h -to /Grupo sobre L200/');
    assert.match(created, /Alerta criado.*#1/);
    assert.match(created, /Grupo sobre L200/);

    const [list] = await bot.replyAlt('/notes -alerta');
    assert.match(list, /#1/);
    assert.doesNotMatch(list, /#2/);

    const sentAlt2 = await expire(1);
    assert.equal(sentAlt2[0].chatId, L200);

    await bot.replyAlt('/notes -alerta 2 +1h');
    await bot.replyAlt('/notes -alerta -rm 2');
    assert.equal((await notes())[1].alert_at, null);
    assert.equal((await notes()).length, 2, '-alerta -rm mantém as anotações');
    assert.match((await bot.replyAlt('/notes -alerta -rm 7'))[0], /ID 7 não existe/);
});

test('texto sem opção na frente anota (igual ao -add); opção desconhecida dá erro', async () => {
    assert.match((await bot.replyAlt('/notes não esquecer de remover a opção tal'))[0], /Anotação #1/);
    assert.match((await bot.replyAlt('/notes comprar pão -alerta +1h'))[0], /Anotação #2[\s\S]*⏰/);
    assert.deepEqual((await notes()).map(n => n.text), ['não esquecer de remover a opção tal', 'comprar pão']);
    assert.match((await bot.replyAlt('/notes'))[0], /\*#1\* não esquecer/);
    assert.match((await bot.replyAlt('/notes -banana'))[0], /Use: \/notes/);
    assert.equal((await notes()).length, 2);
});

test('#tag: agrupa na lista, filtra e remove por tag', async () => {
    await bot.replyAlt('/notes #casa Lembrar de comprar pão');
    await bot.replyAlt('/notes -a #Duvidas Olhar sobre ETFs');
    await bot.replyAlt('/notes #casa trocar lâmpada');
    await bot.replyAlt('/notes sem tag nenhuma');
    assert.deepEqual((await bot.dbAll('SELECT tag, text FROM notes ORDER BY id')).map(n => n.tag),
        ['casa', 'duvidas', 'casa', null]);

    const [list] = await bot.replyAlt('/notes');
    assert.ok(list.indexOf('*#casa* (2)') < list.indexOf('*#duvidas* (1)'));
    assert.ok(list.indexOf('*#duvidas* (1)') < list.indexOf('*sem tag* (1)'));

    const [soHome] = await bot.replyAlt('/notes #casa');
    assert.match(soHome, /comprar pão/);
    assert.match(soHome, /lâmpada/);
    assert.doesNotMatch(soHome, /ETFs/);
    assert.equal((await bot.replyAlt('/notes -l #casa'))[0], soHome);
    assert.match((await bot.replyAlt('/notes #nada'))[0], /Nenhuma anotação em #nada/);

    assert.match((await bot.replyAlt('/notes -rem #nada'))[0], /#nada não existe/);
    assert.match((await bot.replyAlt('/notes -rem #casa'))[0], /2 anotações removidas/);
    assert.deepEqual((await notes()).map(n => n.id), [2, 4]);
    await bot.replyAlt('/notes -rem all');
    assert.deepEqual(await notes(), []);
});
