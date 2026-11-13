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
    await bot.replyAlt('/alias /eita -desc "Meu teste para dolar" /rates USD');
    await bot.replyAlt('/alias /eita2 /rates EUR');
    await bot.replyAlt('/alias eita3 /rates USDT');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: 'Meu teste para dolar', command: '/rates USD', quiet: 0 },
        { name: '/eita2', description: '', command: '/rates EUR', quiet: 0 },
        { name: '/eita3', description: '', command: '/rates USDT', quiet: 0 }
    ]);
    await bot.src('initialization').initializeDb();
    assert.equal((await aliases()).length, 3);
    const [list] = await bot.replyAlt('/alias');
    assert.match(list, /Meu teste para dolar/);
    assert.match(list, /\*\/eita3\*\n→ \/rates USDT/);
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

test('parâmetros $1, $N: pegam os argumentos digitados e as sobras vão para o fim', async t => {
    await bot.replyAlt('/alias /rec /sticker -ss $1 -es $2');
    const run = t.mock.method(HANDLERS, '/sticker', async ({ msg, args }) => msg.reply(`args: ${args}`));
    assert.deepEqual(await bot.replyAlt('/rec 10 20 http://minhaurl/foo'),
        ['🔗 Alias /rec -> /sticker -ss 10 -es 20 http://minhaurl/foo', 'args: -ss 10 -es 20 http://minhaurl/foo']);
    assert.equal(run.mock.callCount(), 1);
    assert.equal((await resolverAlias('/rec 5')).args, '-ss 5 -es', 'sem o $2, fica vazio');
});

test('/alias /nome mostra o que o alias faz; não sendo alias, o erro', async () => {
    await bot.replyAlt('/alias /dolar -desc "Dólar" /rates USD');
    await bot.replyAlt('/alias texto Oi {/rates USD}');
    await bot.replyAlt('/alias -q /quieto /rates EUR');

    assert.deepEqual(await bot.replyAlt('/alias /dolar'), ['*/dolar*\n📝 Dólar\n→ /rates USD']);
    assert.deepEqual(await bot.replyAlt('/alias dolar'), ['*/dolar*\n📝 Dólar\n→ /rates USD'], 'sem a barra também');
    assert.deepEqual(await bot.replyAlt('/alias /quieto'), ['*/quieto* 🔇\n→ /rates EUR']);
    assert.deepEqual(await bot.replyAlt('/alias texto'), ['*/texto*\n→ Oi {/rates USD}']);

    assert.deepEqual(await bot.replyAlt('/alias /naoexiste'), ['❌ Alias /naoexiste não encontrado.']);
    assert.deepEqual(await bot.replyAlt('/alias /gpt'), ['❌ /gpt já é um comando do bot.']);
    assert.equal((await aliases()).length, 3, 'consultar não cadastra nada');
});

test('opções do alvo são preservadas e aliases fixos são destinos válidos', async () => {
    await bot.replyAlt('/alias socorro /rates -h');
    assert.equal((await aliases())[0].command, '/rates -h');
    assert.match((await bot.replyAlt('/socorro'))[1], /Uso: \/rates/);
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
    await bot.replyAlt('/alias eita -d "Dólar" /rates USD');
    await bot.replyAlt('/alias eita /rates EUR');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: '', command: '/rates EUR', quiet: 0 }
    ]);
    assert.match((await bot.replyAlt('/alias -rm /eita'))[0], /removido/);
    assert.equal((await aliases()).length, 0);
    await bot.replyAlt('/alias eita /ping');
    assert.match((await bot.replyAlt('/alias -rm eita'))[0], /removido/);
    assert.match((await bot.replyAlt('/alias -rm eita'))[0], /não encontrado/);
    assert.match((await bot.replyAlt('/alias'))[0], /Nenhum alias/);
});

test('recusa nomes reservados, cadastro inválido, destinos inexistentes e ciclos', async () => {
    await bot.setSetting('commands.disabled', ['/ping']);
    for (const line of ['/alias ping /rates USD', '/alias mute /rates USD',
        '/alias all /rates USD', '/alias /all /rates USD', '/alias foo/bar /ping', '/alias foo', '/alias foo -d semaspas /rates USD',
        '/alias foo /naoexiste', '/alias foo /alias', '/alias foo /foo', '/alias foo /ping']) {
        assert.match((await bot.replyAlt(line))[0], /^❌/, line);
    }
    assert.deepEqual(await aliases(), []);
});

test('permissões do destino valem no alias e na listagem de /help alias', async t => {
    await bot.setSetting('bot.users', true);
    await bot.replyAlt('/alias publico /rates USD');
    await bot.replyAlt('/alias privado /show -l');
    const quote = t.mock.method(HANDLERS, '/rates', async ({ msg }) => msg.reply('cotação'));
    const show = t.mock.method(HANDLERS, '/show', async () => {
        throw new Error('sem permissão');
    });
    const de = bot.OTHERAlt.jid;
    assert.deepEqual(await bot.replyAlt('/publico', { de }), ['🔗 Alias /publico -> /rates USD', 'cotação']);
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

test('alias herda a permissão do destino: o +cmd do /gpt (role admin) vale para o alias, e o alias não é aceito no +cmd', async t => {
    await bot.replyAlt('/alias -q felipe /gpt');
    const gpt = t.mock.method(HANDLERS, '/gpt', async ({ msg }) => msg.reply('gpt'));
    const de = bot.OTHERAlt.jid;
    await bot.setSetting('bot.users', [bot.OTHERAlt.user]);
    assert.deepEqual(await bot.replyAlt('/felipe oi', { de }), []);

    await bot.setSetting('bot.users.cmds', [`${bot.OTHERAlt.user}=/gpt`]);
    assert.deepEqual(await bot.replyAlt('/felipe oi', { de }), ['gpt']);
    assert.equal(gpt.mock.callCount(), 1);

    await bot.setSetting('bot.users.cmds', [`${bot.OTHERAlt.user}=!/gpt`]);
    assert.deepEqual(await bot.replyAlt('/felipe oi', { de }), []);

    assert.match((await bot.replyAlt('/bot +cmd /felipe +u /Fulano/'))[0], /desconhecido/);
});

test('desativar o destino impede a execução e nomes reservados continuam protegidos', async t => {
    await bot.replyAlt('/alias eita /rates USD');
    await bot.setSetting('commands.disabled', ['/rates']);
    const run = t.mock.method(HANDLERS, '/rates', async () => {});
    assert.match((await bot.replyAlt('/eita'))[0], /desconhecido/);
    assert.equal(run.mock.callCount(), 0);
    assert.match((await bot.replyAlt('/help alias'))[0], /\*\/eita\*\n→ \/rates USD/);
    assert.match((await bot.replyAlt('/alias -l'))[0], /\*\/eita\*\n→ \/rates USD/);
    await bot.setSetting('bot.users', true);
    assert.match((await bot.replyAlt('/help alias', { de: bot.OTHERAlt.jid }))[0], /Nenhum alias/);
});


test('remoção de todos os aliases (-rm all) mantém os comandos do bot', async () => {
    await bot.replyAlt('/alias eita /rates USD');
    await bot.replyAlt('/alias eita2 /rates EUR');
    assert.match((await bot.replyAlt('/alias -rm all'))[0], /Todos os aliases removidos \(2\)/);
    assert.deepEqual(await aliases(), []);
    assert.match((await bot.replyAlt('/help alias'))[0], /Nenhum alias/);
    assert.ok(await resolverAlias('/rates USD'));
    assert.match((await bot.replyAlt('/alias -rm all'))[0], /removidos \(0\)/);
});


test('descrição aceita aspas curvas e misturadas sem alterar o comando salvo', async () => {
    for (const description of ['“Exibe Dinheiro"', '“Exibe Dinheiro”', '"Exibe Dinheiro”',
        '‘Exibe Dinheiro’', "‘Exibe Dinheiro'", "'Exibe Dinheiro’"]) {
        await bot.replyAlt(`/alias dimdim -desc ${description} /rates`);
        assert.deepEqual(await aliases(), [
            { name: '/dimdim', description: 'Exibe Dinheiro', command: '/rates', quiet: 0 }
        ]);
    }
    await bot.replyAlt('/alias euros -d “Preço em euros” /rates EUR -h');
    assert.equal((await aliases()).find(a => a.name === '/euros').command, '/rates EUR -h');
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
    assert.match(list, /\*\/nome2\*\n📝 Orca e Prjx\n→ Verificando Orca \{\/defi orca\}\n   Verificando Prjx \{\/defi prjx\}/);
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
    await bot.replyAlt('/alias misto Dólar {/rates USD} DeFi {/defi}');
    await bot.replyAlt('/alias dolarbtc Dólar {/rates USD} BTC {/crypto BTC}');
    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg }) => msg.reply('defi'));
    const quote = t.mock.method(HANDLERS, '/rates', async ({ msg, admin }) => msg.reply(`admin=${admin}`));
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('btc'));
    const de = bot.OTHERAlt.jid;

    // /defi is owner-only: the whole alias is silently ignored
    assert.deepEqual(await bot.replyAlt('/misto', { de }), []);
    assert.equal(defi.mock.callCount(), 0);

    // The commands run as whoever called, not as the owner
    assert.deepEqual(await bot.replyAlt('/dolarbtc', { de }),
        ['🔗 Alias /dolarbtc -> /rates USD, /crypto BTC', 'Dólar admin=false BTC btc']);

    // A command outside the person's rule blocks the alias
    await bot.setSetting('bot.users', []);
    await bot.replyAlt('/bot +u /Fulano/');
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
    for (const bad of ['0', '501', 'x'])
        assert.match((await bot.replyAlt(`/me -r ${bad} Haha!`))[0], /^❌ -repeat precisa de um número de 1 a 500/);
    assert.equal((await bot.replyAlt('/me -r 500 a'))[0], 'a'.repeat(500));
    await bot.setSetting('me.maxRepeat', 5);
    assert.match((await bot.replyAlt('/me -r 6 a'))[0], /1 a 5/);
    assert.equal((await bot.replyAlt('/me -r 5 a'))[0], 'aaaaa');
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

test('{/alias} dentro de um texto roda o alias de comando; alias de texto é recusado', async t => {
    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg, args }) => msg.reply(`${args} ok`));
    await bot.replyAlt('/alias orca /defi orca');
    await bot.replyAlt('/alias prjx /defi $1');
    await bot.replyAlt('/alias outro Outro: {/defi x}');
    await bot.replyAlt('/alias painel Orca: {/orca} e Prjx: {/prjx abc}');

    assert.deepEqual(await bot.replyAlt('/painel'), [
        '🔗 Alias /painel -> /orca, /prjx abc', 'Orca: orca ok e Prjx: abc ok'
    ]);
    assert.equal(defi.mock.callCount(), 2);

    const [errorAlt] = await bot.replyAlt('/alias ruim Texto {/outro}');
    assert.match(errorAlt, /alias \/outro é um texto/);
});

test('nome do alias aceita ponto e os parâmetros aceitam valor padrão ${N:-valor}', async t => {
    const cot = t.mock.method(HANDLERS, '/rates', async () => {});
    assert.match((await bot.replyAlt('/alias -q meu.comando /rates ${1:-USD} $2'))[0], /Alias salvo: \/meu\.comando/);
    await bot.replyAlt('/meu.comando');
    await bot.replyAlt('/meu.comando EUR');
    assert.deepEqual(cot.mock.calls.map(c => c.arguments[0].args), ['USD', 'EUR']);
});

test('o começo do nome de um alias salvo também completa (único roda, vários lista)', async () => {
    await bot.replyAlt('/alias -rm all');
    await bot.replyAlt('/alias zzuno /rates USD');
    const single = await resolverAlias('/zzu');
    assert.equal(single.alias, '/zzuno');
    assert.equal(single.prefixo, '/zzu');

    await bot.replyAlt('/alias zzdois /rates EUR');
    const several = await resolverAlias('/zz');
    assert.deepEqual(several.possiveis.map(c => c.cmd), ['/zzdois', '/zzuno']);
    await bot.replyAlt('/alias -rm all');
});

test('-rm aceita vários nomes (espaço ou vírgula) e diz os que não existiam', async () => {
    await bot.replyAlt('/alias -rm all');
    for (const n of ['um', 'dois', 'tres']) await bot.replyAlt(`/alias ${n} /rates USD`);

    const [r] = await bot.replyAlt('/alias -rm um /dois, nao');
    assert.match(r, /Aliases removidos \(2\): \/um, \/dois/);
    assert.match(r, /Não encontrado: \/nao/);
    assert.deepEqual((await aliases()).map(a => a.name), ['/tres']);

    assert.match((await bot.replyAlt('/alias -rm tres'))[0], /Alias \/tres removido/);
    assert.match((await bot.replyAlt('/alias -rm x y'))[0], /^❌ Não encontrados: \/x, \/y$/);
    await bot.replyAlt('/alias um /rates USD');
    assert.match((await bot.replyAlt('/alias -rm um all'))[0], /Todos os aliases removidos \(1\)/);
});

test('-move renomeia o alias e recusa nome existente, de comando ou alias inexistente', async () => {
    await bot.replyAlt('/alias -rm all');
    await bot.replyAlt('/alias velho -q -desc "Dólar" /rates USD');
    await bot.replyAlt('/alias outro /rates EUR');

    assert.match((await bot.replyAlt('/alias -m velho /novo'))[0], /renomeado: \/velho → \/novo/);
    const [a] = (await aliases()).filter(a => a.name === '/novo');
    assert.equal(a.command, '/rates USD');
    assert.equal(a.description, 'Dólar');
    assert.equal(a.quiet, 1);
    assert.equal((await aliases()).some(a => a.name === '/velho'), false);

    assert.match((await bot.replyAlt('/alias -move novo outro'))[0], /Já existe um alias \/outro/);
    assert.match((await bot.replyAlt('/alias -move nao x'))[0], /não encontrado/);
    assert.match((await bot.replyAlt('/alias -move novo /help'))[0], /já é um comando/);
    assert.match((await bot.replyAlt('/alias -move novo'))[0], /Use: \/alias -move/);
    await bot.replyAlt('/alias -rm all');
});

test('-desc sem comando atualiza só a descrição de um alias existente', async () => {
    await bot.replyAlt('/alias -rm all');
    await bot.replyAlt('/alias end.inga /rates USD');
    assert.match((await bot.replyAlt('/alias /end.inga -d “Endereço do Ingá"'))[0], /Descrição de \/end.inga atualizada/);
    const a = (await aliases()).find(a => a.name === '/end.inga');
    assert.equal(a.description, 'Endereço do Ingá');
    assert.equal(a.command, '/rates USD');
    assert.match((await bot.replyAlt('/alias nada -d "x"'))[0], /não encontrado/);
    await bot.replyAlt('/alias -rm all');
});
