/*
 * Shortcuts go through the normal flow: parser, permissions, reply and disabling.
 */
const bot = require('./helpers/bot');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { HANDLERS } = bot.src('commands/index');
const { resolverAlias } = bot.src('aliases');

beforeEach(async () => { await bot.restart(); });

const aliases = () => bot.dbAll('SELECT name, description, command, quiet FROM command_aliases ORDER BY name');

test('/alias cadastra com barra, sem barra, descrição longa e persiste no banco', async () => {
    await bot.replyAlt('/alias /eita -desc "Meu teste para dolar" /cotacao USD');
    await bot.replyAlt('/alias /eita2 /cotacao EUR');
    await bot.replyAlt('/alias eita3 /cotacao USDT');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: 'Meu teste para dolar', command: '/cotacao USD', quiet: 0 },
        { name: '/eita2', description: '', command: '/cotacao EUR', quiet: 0 },
        { name: '/eita3', description: '', command: '/cotacao USDT', quiet: 0 }
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
    await bot.replyAlt('/alias foto /sticker');
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
        { name: '/eita', description: '', command: '/cotacao EUR', quiet: 0 }
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
    for (const line of ['/alias ping /cotacao USD', '/alias mudo /cotacao USD',
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
            { name: '/dimdim', description: 'Exibe Dinheiro', command: '/cotacao', quiet: 0 }
        ]);
    }
    await bot.replyAlt('/alias euros -d “Preço em euros” /cotacao EUR -h');
    assert.equal((await aliases()).find(a => a.name === '/euros').command, '/cotacao EUR -h');
});

test('/alias /nome /crypto USD: nome com barra e destino com argumento', async t => {
    await bot.replyAlt('/alias /nome /crypto USD');
    assert.deepEqual(await aliases(), [{ name: '/nome', description: '', command: '/crypto USD', quiet: 0 }]);
    t.mock.method(HANDLERS, '/crypto', async ({ msg, args }) => msg.reply(`crypto ${args}`));
    assert.deepEqual(await bot.replyAlt('/nome'), ['🔗 Alias /nome -> /crypto USD', 'crypto USD']);
});

test('alias de texto: \\n vira quebra de linha e vários {/comando} saem numa mensagem só', async t => {
    const [salvo] = await bot.replyAlt(
        '/alias nome2 -d "Orca e Prjx" Verificando Orca {/defi orca}\\n Verificando Prjx {/defi prjx}');
    assert.match(salvo, /Alias salvo: \/nome2/);
    assert.deepEqual(await aliases(), [{
        name: '/nome2', description: 'Orca e Prjx',
        command: 'Verificando Orca {/defi orca}\nVerificando Prjx {/defi prjx}', quiet: 0
    }]);

    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg, args }) => msg.reply(`${args} ok`));
    assert.deepEqual(await bot.replyAlt('/nome2'), [
        '🔗 Alias /nome2 -> /defi orca, /defi prjx',
        'Verificando Orca orca ok\nVerificando Prjx prjx ok'
    ]);
    assert.equal(defi.mock.callCount(), 2);

    // A multi-line reply becomes a paragraph, as in /cron
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('₿ BTC\n💰 $1'));
    await bot.replyAlt('/alias btc Bitcoin: {/crypto BTC} fim');
    assert.equal((await bot.replyAlt('/btc'))[1], 'Bitcoin:\n\n₿ BTC\n💰 $1\n\nfim');

    const [list] = await bot.replyAlt('/alias -l');
    assert.match(list, /\/nome2 → Verificando Orca \{\/defi orca\}\nVerificando Prjx \{\/defi prjx\}/);
});

test('alias de texto: recusa texto sem {/comando}, comandos inexistentes e os que não rodam no texto', async () => {
    for (const line of ['/alias foo só texto', '/alias foo Oi {/naoexiste}', '/alias foo {/alias -l}',
        '/alias foo {/ping}', '/alias foo {/crypto -add DOGE}']) {
        assert.match((await bot.replyAlt(line))[0], /^❌/, line);
    }
    assert.match((await bot.replyAlt('/alias foo {/ping}'))[0], /o \/ping não roda dentro do \/alias/);
    assert.deepEqual(await aliases(), []);
});

test('alias de texto: cada {/comando} respeita as permissões de quem chama', async t => {
    await bot.replyAlt('/alias misto Dólar {/cotacao USD} DeFi {/defi}');
    await bot.replyAlt('/alias dolarbtc Dólar {/cotacao USD} BTC {/crypto BTC}');
    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg }) => msg.reply('defi'));
    const quote = t.mock.method(HANDLERS, '/cotacao', async ({ msg, admin }) => msg.reply(`admin=${admin}`));
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('btc'));
    const de = bot.OTHERAlt.jid;

    // /defi is owner-only: the whole alias is silently ignored
    assert.deepEqual(await bot.replyAlt('/misto', { de }), []);
    assert.equal(defi.mock.callCount(), 0);

    // The commands run as whoever called, not as the owner
    assert.deepEqual(await bot.replyAlt('/dolarbtc', { de }),
        ['🔗 Alias /dolarbtc -> /cotacao USD, /crypto BTC', 'Dólar admin=false BTC btc']);

    // A command outside the person's rule blocks the alias
    await bot.setSetting('bot.users', []);
    await bot.replyAlt('/bot +v /Fulano/');
    await bot.replyAlt('/bot -cmd /crypto /Fulano/');
    assert.match((await bot.replyAlt('/dolarbtc', { de }))[0], /O \/crypto não está liberado/);
    assert.equal(quote.mock.callCount(), 1);

    const [list] = await bot.replyAlt('/help alias', { de });
    assert.doesNotMatch(list, /\/misto|\/dolarbtc/);
    assert.match((await bot.replyAlt('/help alias'))[0], /\/misto[\s\S]*\/dolarbtc|\/dolarbtc[\s\S]*\/misto/);
});

test('/me envia a mensagem, roda {/comando} e aceita \\n', async t => {
    assert.deepEqual(await bot.replyAlt('/me Minha mensagem'), ['Minha mensagem']);
    assert.deepEqual(await bot.replyAlt('/me Linha 1\\nLinha 2'), ['Linha 1\nLinha 2']);
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('₿ BTC\n💰 $1'));
    assert.deepEqual(await bot.replyAlt('/me O preço está em {/crypto}'), ['O preço está em\n\n₿ BTC\n💰 $1']);
    assert.match((await bot.replyAlt('/me'))[0], /^❌ Use: \/me/);
    assert.match((await bot.replyAlt('/me {/ping}'))[0], /não roda dentro do \/me/);
});

test('/me -repeat|-r repete a mensagem n vezes', async () => {
    assert.deepEqual(await bot.replyAlt('/me -r 3 Haha!'), ['Haha!Haha!Haha!']);
    assert.deepEqual(await bot.replyAlt('/me -repeat 2 Haha!\\n'), ['Haha!\nHaha!\n']);
    for (const bad of ['0', '31', 'x'])
        assert.match((await bot.replyAlt(`/me -r ${bad} Haha!`))[0], /^❌ -repeat precisa/);
    assert.match((await bot.replyAlt('/me -r 3'))[0], /^❌ Use: \/me/);
});

test('/me respeita as permissões dos {/comando} de quem chama', async t => {
    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg }) => msg.reply('defi'));
    assert.deepEqual(await bot.replyAlt('/me Oi {/defi}', { de: bot.OTHERAlt.jid }), []);
    assert.equal(defi.mock.callCount(), 0);
});

test('/alias -q omite o cabeçalho e aceita /me como destino', async () => {
    const [salvo] = await bot.replyAlt('/alias -q /haha /me Hahaha vc e burro!');
    assert.match(salvo, /Alias salvo: \/haha/);
    assert.deepEqual(await aliases(), [
        { name: '/haha', description: '', command: '/me Hahaha vc e burro!', quiet: 1 }
    ]);
    assert.deepEqual(await bot.replyAlt('/haha'), ['Hahaha vc e burro!']);

    await bot.replyAlt('/alias /haha2 -quiet -d "Riso" /me Kkk');
    assert.deepEqual((await aliases())[1], { name: '/haha2', description: 'Riso', command: '/me Kkk', quiet: 1 });
    assert.deepEqual(await bot.replyAlt('/haha2'), ['Kkk']);

    // Without -q the header stays
    await bot.replyAlt('/alias fala /me Oi');
    assert.deepEqual(await bot.replyAlt('/fala'), ['🔗 Alias /fala -> /me Oi', 'Oi']);
});
