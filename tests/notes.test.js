/*
 * /notes: anotações (-add, -list, -rem) e o -alerta (data/hora, -to, disparo único).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { verificarNotas } = bot.src('notas');

const L200 = '120363000000000200@g.us';

beforeEach(async () => {
    await bot.reiniciar();
    await bot.dbRun('DELETE FROM notes');
    await bot.dbRun("DELETE FROM sqlite_sequence WHERE name = 'notes'");
    bot.criarGrupo(L200, 'Grupo sobre L200', [bot.DONO.jid]);
});

const notas = () => bot.dbAll('SELECT id, text, alert_at FROM notes ORDER BY id');

async function vencer(id) {
    await bot.dbRun('UPDATE notes SET alert_at = ? WHERE id = ?', [Date.now() - 1000, id]);
    const antes = bot.client.enviadas.length;
    await verificarNotas();
    return bot.client.enviadas.slice(antes);
}

test('-add, -list e -rem (vários IDs, all e ID inexistente sem remover nada)', async () => {
    assert.match((await bot.responder('/notes'))[0], /Nenhuma anotação/);
    assert.match((await bot.responder('/notes -add comprar leite'))[0], /Anotação #1/);
    await bot.responder('/notes -a ligar pro João\nsegunda linha');
    await bot.responder('/notes -a pagar boleto');
    assert.deepEqual((await notas()).map(n => n.text), ['comprar leite', 'ligar pro João\nsegunda linha', 'pagar boleto']);

    const [lista] = await bot.responder('/notes');
    assert.match(lista, /\*#1\* comprar leite/);
    assert.match(lista, /\*#3\* pagar boleto/);
    assert.equal((await bot.responder('/notes -l'))[0], lista);
    assert.equal((await bot.responder('/notes -list'))[0], lista);

    assert.match((await bot.responder('/notes -r 2 9'))[0], /ID 9 não existe/);
    assert.equal((await notas()).length, 3);
    assert.match((await bot.responder('/notes -rem 2'))[0], /1 anotação removida/);
    assert.deepEqual((await notas()).map(n => n.id), [1, 3]);
    assert.match((await bot.responder('/notes -r all'))[0], /2 anotações removidas/);
    assert.equal((await notas()).length, 0);
});

test('-add sem texto, com -to sem -alerta e com quando inválido ou no passado', async () => {
    assert.match((await bot.responder('/notes -add'))[0], /Use: \/notes -add/);
    assert.match((await bot.responder('/notes -add texto -to /Grupo sobre L200/'))[0], /só vale com o -alerta/);
    assert.match((await bot.responder('/notes -add texto -alerta banana'))[0], /Quando inválido/);
    assert.match((await bot.responder('/notes -add texto -alerta 18h sobra'))[0], /Quando inválido/);
    assert.equal((await notas()).length, 0);
});

test('-alerta no -add: dispara uma vez no privado e a anotação continua', async () => {
    const [resposta] = await bot.responder('/notes -a ligar pro João -alerta +2h');
    assert.match(resposta, /Anotação #1/);
    assert.match(resposta, /seu privado/);
    assert.equal((await notas())[0].text, 'ligar pro João');
    assert.ok((await notas())[0].alert_at > Date.now());

    const antes = bot.client.enviadas.length;
    await verificarNotas();
    assert.equal(bot.client.enviadas.length, antes, 'ainda não venceu');

    const enviadas = await vencer(1);
    assert.equal(enviadas.length, 1);
    assert.match(enviadas[0].content, /ANOTAÇÃO #1[\s\S]*ligar pro João/);
    assert.equal((await notas())[0].alert_at, null, 'o alerta zera, a anotação fica');
    assert.equal((await vencer(1)).length, 1, 'forçando o vencimento de novo, avisa de novo');
    assert.match((await bot.responder('/notes -alerta'))[0], /Nenhuma anotação com alerta/);
});

test('-alerta <id> <quando> com -to, lista e -alerta -rm', async () => {
    await bot.responder('/notes -a reunião');
    await bot.responder('/notes -a outra');
    assert.match((await bot.responder('/notes -alerta 9 +1h'))[0], /ID 9 não existe/);
    assert.match((await bot.responder('/notes -alerta 1 banana'))[0], /Quando inválido/);
    assert.match((await bot.responder('/notes -alerta -to /Grupo sobre L200/'))[0], /só vale ao criar/);

    const [criado] = await bot.responder('/notes -alerta 1 +1h -to /Grupo sobre L200/');
    assert.match(criado, /Alerta criado.*#1/);
    assert.match(criado, /Grupo sobre L200/);

    const [lista] = await bot.responder('/notes -alerta');
    assert.match(lista, /#1/);
    assert.doesNotMatch(lista, /#2/);

    const enviadas = await vencer(1);
    assert.equal(enviadas[0].chatId, L200);

    await bot.responder('/notes -alerta 2 +1h');
    await bot.responder('/notes -alerta -rm 2');
    assert.equal((await notas())[1].alert_at, null);
    assert.equal((await notas()).length, 2, '-alerta -rm mantém as anotações');
    assert.match((await bot.responder('/notes -alerta -rm 7'))[0], /ID 7 não existe/);
});

test('texto sem opção na frente anota (igual ao -add); opção desconhecida dá erro', async () => {
    assert.match((await bot.responder('/notes não esquecer de remover a opção tal'))[0], /Anotação #1/);
    assert.match((await bot.responder('/notes comprar pão -alerta +1h'))[0], /Anotação #2[\s\S]*⏰/);
    assert.deepEqual((await notas()).map(n => n.text), ['não esquecer de remover a opção tal', 'comprar pão']);
    assert.match((await bot.responder('/notes'))[0], /\*#1\* não esquecer/);
    assert.match((await bot.responder('/notes -banana'))[0], /Use: \/notes/);
    assert.equal((await notas()).length, 2);
});

test('#tag: agrupa na lista, filtra e remove por tag', async () => {
    await bot.responder('/notes #casa Lembrar de comprar pão');
    await bot.responder('/notes -a #Duvidas Olhar sobre ETFs');
    await bot.responder('/notes #casa trocar lâmpada');
    await bot.responder('/notes sem tag nenhuma');
    assert.deepEqual((await bot.dbAll('SELECT tag, text FROM notes ORDER BY id')).map(n => n.tag),
        ['casa', 'duvidas', 'casa', null]);

    const [lista] = await bot.responder('/notes');
    assert.ok(lista.indexOf('*#casa* (2)') < lista.indexOf('*#duvidas* (1)'));
    assert.ok(lista.indexOf('*#duvidas* (1)') < lista.indexOf('*sem tag* (1)'));

    const [soCasa] = await bot.responder('/notes #casa');
    assert.match(soCasa, /comprar pão/);
    assert.match(soCasa, /lâmpada/);
    assert.doesNotMatch(soCasa, /ETFs/);
    assert.equal((await bot.responder('/notes -l #casa'))[0], soCasa);
    assert.match((await bot.responder('/notes #nada'))[0], /Nenhuma anotação em #nada/);

    assert.match((await bot.responder('/notes -rem #nada'))[0], /#nada não existe/);
    assert.match((await bot.responder('/notes -rem #casa'))[0], /2 anotações removidas/);
    assert.deepEqual((await notas()).map(n => n.id), [2, 4]);
    await bot.responder('/notes -rem all');
    assert.deepEqual(await notas(), []);
});
