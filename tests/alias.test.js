/*
 * Atalhos passam pelo fluxo normal: parser, permissões, reply e desativação.
 */
const bot = require('./helpers/bot');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { HANDLERS } = bot.src('comandos/index');
const { resolverAlias } = bot.src('aliases');

beforeEach(async () => { await bot.reiniciar(); });

const aliases = () => bot.dbAll('SELECT * FROM command_aliases ORDER BY name');

test('/alias cadastra com barra, sem barra, descrição longa e persiste no banco', async () => {
    await bot.responder('/alias /eita -desc "Meu teste para dolar" /cotacao USD');
    await bot.responder('/alias /eita2 /cotacao EUR');
    await bot.responder('/alias eita3 /cotacao USDT');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: 'Meu teste para dolar', command: '/cotacao USD' },
        { name: '/eita2', description: '', command: '/cotacao EUR' },
        { name: '/eita3', description: '', command: '/cotacao USDT' }
    ]);
    await bot.src('inicializacao').inicializarBanco();
    assert.equal((await aliases()).length, 3);
    const [lista] = await bot.responder('/alias');
    assert.match(lista, /Meu teste para dolar/);
    assert.match(lista, /\/eita3 → \/cotacao USDT/);
    assert.equal((await bot.responder('/alias -list'))[0], lista);
    assert.equal((await bot.responder('/alias -l'))[0], lista);
    assert.equal((await bot.responder('/help alias'))[0], lista);
    assert.equal((await bot.responder('/help /alias'))[0], lista);
    assert.match((await bot.responder('/alias -h'))[0], /Uso: \/alias/);
});

test('execução preserva opções, aspas, destinos repetidos e argumentos adicionais', async t => {
    const comando = '/crypto -alerta BTC > 90000 -to /Jorge Pereira/ -to /Lourival Neto/ ' +
        '-msg "⏰ Bitcoin to the moon! 🚀"';
    await bot.responder('/alias lua -d "Preço do Bitcoin" ' + comando);
    const executar = t.mock.method(HANDLERS, '/crypto', async ({ msg, args, opts }) => {
        assert.equal(args, comando.slice('/crypto '.length) + ' -list');
        const { destinos } = bot.src('destinos').extrairDestinos(args);
        assert.deepEqual(destinos, ['Jorge Pereira', 'Lourival Neto']);
        assert.equal(opts.opt.alerta, true);
        await msg.reply('executado');
    });
    assert.deepEqual(await bot.responder('/lua -list'), [`🔗 Alias /lua -> ${comando} -list`, 'executado']);
    assert.equal(executar.mock.callCount(), 1);
    assert.equal((await resolverAlias('/lua')).args, comando.slice('/crypto '.length));
});

test('opções do alvo são preservadas e aliases fixos são destinos válidos', async () => {
    await bot.responder('/alias ajuda /cotacao -h');
    assert.equal((await aliases())[0].command, '/cotacao -h');
    assert.match((await bot.responder('/ajuda'))[1], /Uso: \/cotacao/);
    await bot.responder('/alias foto /st');
    assert.match((await bot.responder('/foto'))[1], /Uso: \/sticker/);
    await bot.responder('/alias apagar /mute -rm 2');
    assert.equal((await aliases()).find(a => a.name === '/apagar').command, '/mute -rm 2');
});

test('reply do atalho chega ao comando original', async t => {
    await bot.responder('/alias foto /sticker');
    const citada = bot.criarMensagem({ texto: 'original', de: bot.OUTRO.jid });
    t.mock.method(HANDLERS, '/sticker', async ({ msg, quotedMsg }) => {
        assert.equal(quotedMsg, citada);
        await msg.reply('reply preservado');
    });
    assert.deepEqual(await bot.responder('/foto', { citada }), ['🔗 Alias /foto -> /sticker', 'reply preservado']);
});

test('cadastro substitui o atalho e remoção aceita com ou sem barra', async () => {
    await bot.responder('/alias eita -d "Dólar" /cotacao USD');
    await bot.responder('/alias eita /cotacao EUR');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: '', command: '/cotacao EUR' }
    ]);
    assert.match((await bot.responder('/alias -rm /eita'))[0], /removido/);
    assert.equal((await aliases()).length, 0);
    await bot.responder('/alias eita /ping');
    assert.match((await bot.responder('/alias -rem eita'))[0], /removido/);
    assert.match((await bot.responder('/alias -rm eita'))[0], /não encontrado/);
    assert.match((await bot.responder('/alias'))[0], /Nenhum alias/);
});

test('recusa nomes reservados, cadastro inválido, destinos inexistentes e ciclos', async () => {
    await bot.setSetting('commands.disabled', ['/ping']);
    for (const linha of ['/alias ping /cotacao USD', '/alias st /cotacao USD',
        '/alias all /cotacao USD', '/alias /all /cotacao USD', '/alias foo/bar /ping', '/alias foo', '/alias foo -d semaspas /cotacao USD',
        '/alias foo /naoexiste', '/alias foo /alias', '/alias foo /foo', '/alias foo /ping']) {
        assert.match((await bot.responder(linha))[0], /^❌/, linha);
    }
    assert.deepEqual(await aliases(), []);
});

test('permissões do destino valem no alias e na listagem de /help alias', async t => {
    await bot.setSetting('bot.users', true);
    await bot.responder('/alias publico /cotacao USD');
    await bot.responder('/alias privado /show -l');
    const cotacao = t.mock.method(HANDLERS, '/cotacao', async ({ msg }) => msg.reply('cotação'));
    const show = t.mock.method(HANDLERS, '/show', async () => {
        throw new Error('sem permissão');
    });
    const de = bot.OUTRO.jid;
    assert.deepEqual(await bot.responder('/publico', { de }), ['🔗 Alias /publico -> /cotacao USD', 'cotação']);
    assert.deepEqual(await bot.responder('/privado', { de }), []);
    assert.equal(show.mock.callCount(), 0);
    const [lista] = await bot.responder('/help alias', { de });
    assert.match(lista, /\/publico/);
    assert.doesNotMatch(lista, /\/privado/);
    await bot.responder('/alias novo /ping', { de });
    assert.equal((await aliases()).length, 2);
    await bot.setSetting('bot.users', []);
    await bot.responder('/bot +cmd /ping /Fulano/');
    await bot.responder('/publico', { de });
    assert.equal(cotacao.mock.callCount(), 1);
});

test('desativar o destino impede a execução e nomes reservados continuam protegidos', async t => {
    await bot.responder('/alias eita /cotacao USD');
    await bot.setSetting('commands.disabled', ['/cotacao']);
    const executar = t.mock.method(HANDLERS, '/cotacao', async () => {});
    assert.match((await bot.responder('/eita'))[0], /desconhecido/);
    assert.equal(executar.mock.callCount(), 0);
    assert.match((await bot.responder('/help alias'))[0], /\/eita → \/cotacao USD/);
    assert.match((await bot.responder('/alias -l'))[0], /\/eita → \/cotacao USD/);
    await bot.setSetting('bot.users', true);
    assert.match((await bot.responder('/help alias', { de: bot.OUTRO.jid }))[0], /Nenhum alias/);
});


test('remoção de todos os aliases aceita -rm e -rem e mantém os comandos do bot', async () => {
    for (const opcao of ['-rm', '-rem']) {
        await bot.responder('/alias eita /cotacao USD');
        await bot.responder('/alias eita2 /cotacao EUR');
        assert.match((await bot.responder(`/alias ${opcao} all`))[0], /Todos os aliases removidos \(2\)/);
        assert.deepEqual(await aliases(), []);
        assert.match((await bot.responder('/help alias'))[0], /Nenhum alias/);
        assert.ok(await resolverAlias('/cotacao USD'));
        assert.match((await bot.responder(`/alias ${opcao} all`))[0], /removidos \(0\)/);
    }
});


test('descrição aceita aspas curvas e misturadas sem alterar o comando salvo', async () => {
    for (const descricao of ['“Exibe Dinheiro"', '“Exibe Dinheiro”', '"Exibe Dinheiro”',
        '‘Exibe Dinheiro’', "‘Exibe Dinheiro'", "'Exibe Dinheiro’"]) {
        await bot.responder(`/alias dimdim -desc ${descricao} /cotacao`);
        assert.deepEqual(await aliases(), [
            { name: '/dimdim', description: 'Exibe Dinheiro', command: '/cotacao' }
        ]);
    }
    await bot.responder('/alias euros -d “Preço em euros” /cotacao EUR -h');
    assert.equal((await aliases()).find(a => a.name === '/euros').command, '/cotacao EUR -h');
});
