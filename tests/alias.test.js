/*
 * Shortcuts go through the normal flow: parser, permissions, reply and disabling.
 */
const bot = require('./helpers/bot');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { HANDLERS } = bot.src('commands/index');
const { resolverAlias } = bot.src('aliases');

beforeEach(async () => { await bot.restart(); });

const aliases = () => bot.dbAll('SELECT * FROM command_aliases ORDER BY name');

test('/alias cadastra com barra, sem barra, descrição longa e persiste no banco', async () => {
    await bot.replyAlt('/alias /eita -desc "Meu teste para dolar" /cotacao USD');
    await bot.replyAlt('/alias /eita2 /cotacao EUR');
    await bot.replyAlt('/alias eita3 /cotacao USDT');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: 'Meu teste para dolar', command: '/cotacao USD' },
        { name: '/eita2', description: '', command: '/cotacao EUR' },
        { name: '/eita3', description: '', command: '/cotacao USDT' }
    ]);
    await bot.src('initialization').initializeDb();
    assert.equal((await aliases()).length, 3);
    const [list] = await bot.replyAlt('/alias');
    assert.match(list, /Meu teste para dolar/);
    assert.match(list, /\/eita3 → \/cotacao USDT/);
    assert.equal((await bot.replyAlt('/alias -list'))[0], list);
    assert.equal((await bot.replyAlt('/alias -l'))[0], list);
    assert.equal((await bot.replyAlt('/help alias'))[0], list);
    assert.equal((await bot.replyAlt('/help /alias'))[0], list);
    assert.match((await bot.replyAlt('/alias -h'))[0], /Uso: \/alias/);
});

test('execução preserva opções, aspas, destinos repetidos e argumentos adicionais', async t => {
    const commandAlt = '/crypto -alerta BTC > 90000 -to /Jorge Pereira/ -to /Lourival Neto/ ' +
        '-msg "⏰ Bitcoin to the moon! 🚀"';
    await bot.replyAlt('/alias lua -d "Preço do Bitcoin" ' + commandAlt);
    const run = t.mock.method(HANDLERS, '/crypto', async ({ msg, args, opts }) => {
        assert.equal(args, commandAlt.slice('/crypto '.length) + ' -list');
        const { destinos: destinations } = bot.src('destinations').extractDestinations(args);
        assert.deepEqual(destinations, ['Jorge Pereira', 'Lourival Neto']);
        assert.equal(opts.opt.alerta, true);
        await msg.reply('executado');
    });
    assert.deepEqual(await bot.replyAlt('/lua -list'), [`🔗 Alias /lua -> ${commandAlt} -list`, 'executado']);
    assert.equal(run.mock.callCount(), 1);
    assert.equal((await resolverAlias('/lua')).args, commandAlt.slice('/crypto '.length));
});

test('opções do alvo são preservadas e aliases fixos são destinos válidos', async () => {
    await bot.replyAlt('/alias ajuda /cotacao -h');
    assert.equal((await aliases())[0].command, '/cotacao -h');
    assert.match((await bot.replyAlt('/ajuda'))[1], /Uso: \/cotacao/);
    await bot.replyAlt('/alias foto /st');
    assert.match((await bot.replyAlt('/foto'))[1], /Uso: \/sticker/);
    await bot.replyAlt('/alias apagar /mute -rm 2');
    assert.equal((await aliases()).find(a => a.name === '/apagar').command, '/mute -rm 2');
});

test('reply do atalho chega ao comando original', async t => {
    await bot.replyAlt('/alias foto /sticker');
    const quoted = bot.createMessage({ texto: 'original', de: bot.OTHERAlt.jid });
    t.mock.method(HANDLERS, '/sticker', async ({ msg, quotedMsg }) => {
        assert.equal(quotedMsg, quoted);
        await msg.reply('reply preservado');
    });
    assert.deepEqual(await bot.replyAlt('/foto', { citada: quoted }), ['🔗 Alias /foto -> /sticker', 'reply preservado']);
});

test('cadastro substitui o atalho e remoção aceita com ou sem barra', async () => {
    await bot.replyAlt('/alias eita -d "Dólar" /cotacao USD');
    await bot.replyAlt('/alias eita /cotacao EUR');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: '', command: '/cotacao EUR' }
    ]);
    assert.match((await bot.replyAlt('/alias -rm /eita'))[0], /removido/);
    assert.equal((await aliases()).length, 0);
    await bot.replyAlt('/alias eita /ping');
    assert.match((await bot.replyAlt('/alias -rem eita'))[0], /removido/);
    assert.match((await bot.replyAlt('/alias -rm eita'))[0], /não encontrado/);
    assert.match((await bot.replyAlt('/alias'))[0], /Nenhum alias/);
});

test('recusa nomes reservados, cadastro inválido, destinos inexistentes e ciclos', async () => {
    await bot.setSetting('commands.disabled', ['/ping']);
    for (const line of ['/alias ping /cotacao USD', '/alias st /cotacao USD',
        '/alias all /cotacao USD', '/alias /all /cotacao USD', '/alias foo/bar /ping', '/alias foo', '/alias foo -d semaspas /cotacao USD',
        '/alias foo /naoexiste', '/alias foo /alias', '/alias foo /foo', '/alias foo /ping']) {
        assert.match((await bot.replyAlt(line))[0], /^❌/, line);
    }
    assert.deepEqual(await aliases(), []);
});

test('permissões do destino valem no alias e na listagem de /help alias', async t => {
    await bot.setSetting('bot.users', true);
    await bot.replyAlt('/alias publico /cotacao USD');
    await bot.replyAlt('/alias privado /show -l');
    const quote = t.mock.method(HANDLERS, '/cotacao', async ({ msg }) => msg.reply('cotação'));
    const show = t.mock.method(HANDLERS, '/show', async () => {
        throw new Error('sem permissão');
    });
    const de = bot.OTHERAlt.jid;
    assert.deepEqual(await bot.replyAlt('/publico', { de }), ['🔗 Alias /publico -> /cotacao USD', 'cotação']);
    assert.deepEqual(await bot.replyAlt('/privado', { de }), []);
    assert.equal(show.mock.callCount(), 0);
    const [list] = await bot.replyAlt('/help alias', { de });
    assert.match(list, /\/publico/);
    assert.doesNotMatch(list, /\/privado/);
    await bot.replyAlt('/alias novo /ping', { de });
    assert.equal((await aliases()).length, 2);
    await bot.setSetting('bot.users', []);
    await bot.replyAlt('/bot +cmd /ping /Fulano/');
    await bot.replyAlt('/publico', { de });
    assert.equal(quote.mock.callCount(), 1);
});

test('desativar o destino impede a execução e nomes reservados continuam protegidos', async t => {
    await bot.replyAlt('/alias eita /cotacao USD');
    await bot.setSetting('commands.disabled', ['/cotacao']);
    const run = t.mock.method(HANDLERS, '/cotacao', async () => {});
    assert.match((await bot.replyAlt('/eita'))[0], /desconhecido/);
    assert.equal(run.mock.callCount(), 0);
    assert.match((await bot.replyAlt('/help alias'))[0], /\/eita → \/cotacao USD/);
    assert.match((await bot.replyAlt('/alias -l'))[0], /\/eita → \/cotacao USD/);
    await bot.setSetting('bot.users', true);
    assert.match((await bot.replyAlt('/help alias', { de: bot.OTHERAlt.jid }))[0], /Nenhum alias/);
});


test('remoção de todos os aliases aceita -rm e -rem e mantém os comandos do bot', async () => {
    for (const optionAlt of ['-rm', '-rem']) {
        await bot.replyAlt('/alias eita /cotacao USD');
        await bot.replyAlt('/alias eita2 /cotacao EUR');
        assert.match((await bot.replyAlt(`/alias ${optionAlt} all`))[0], /Todos os aliases removidos \(2\)/);
        assert.deepEqual(await aliases(), []);
        assert.match((await bot.replyAlt('/help alias'))[0], /Nenhum alias/);
        assert.ok(await resolverAlias('/cotacao USD'));
        assert.match((await bot.replyAlt(`/alias ${optionAlt} all`))[0], /removidos \(0\)/);
    }
});


test('descrição aceita aspas curvas e misturadas sem alterar o comando salvo', async () => {
    for (const description of ['“Exibe Dinheiro"', '“Exibe Dinheiro”', '"Exibe Dinheiro”',
        '‘Exibe Dinheiro’', "‘Exibe Dinheiro'", "'Exibe Dinheiro’"]) {
        await bot.replyAlt(`/alias dimdim -desc ${description} /cotacao`);
        assert.deepEqual(await aliases(), [
            { name: '/dimdim', description: 'Exibe Dinheiro', command: '/cotacao' }
        ]);
    }
    await bot.replyAlt('/alias euros -d “Preço em euros” /cotacao EUR -h');
    assert.equal((await aliases()).find(a => a.name === '/euros').command, '/cotacao EUR -h');
});
