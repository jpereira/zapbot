/*
 * Atalhos passam pelo fluxo normal: parser, permissões, reply e desativação.
 */
const bot = require('./helpers/bot');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { HANDLERS } = bot.src('comandos/index');
const { resolverAlias } = bot.src('aliases');

beforeEach(async () => { await bot.reiniciar(); });

const aliases = () => bot.dbAll('SELECT name, description, command, quiet FROM command_aliases ORDER BY name');

test('/alias cadastra com barra, sem barra, descrição longa e persiste no banco', async () => {
    await bot.responder('/alias /eita -desc "Meu teste para dolar" /cotacao USD');
    await bot.responder('/alias /eita2 /cotacao EUR');
    await bot.responder('/alias eita3 /cotacao USDT');
    assert.deepEqual(await aliases(), [
        { name: '/eita', description: 'Meu teste para dolar', command: '/cotacao USD', quiet: 0 },
        { name: '/eita2', description: '', command: '/cotacao EUR', quiet: 0 },
        { name: '/eita3', description: '', command: '/cotacao USDT', quiet: 0 }
    ]);
    await bot.src('inicializacao').inicializarBanco();
    assert.equal((await aliases()).length, 3);
    const [lista] = await bot.responder('/alias');
    assert.match(lista, /Meu teste para dolar/);
    assert.match(lista, /\*\/eita3\*\n→ \/cotacao USDT/);
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

test('parâmetros $1, $N: pegam os argumentos digitados e as sobras vão para o fim', async t => {
    await bot.responder('/alias /rec /sticker -ss $1 -es $2');
    const executar = t.mock.method(HANDLERS, '/sticker', async ({ msg, args }) => msg.reply(`args: ${args}`));
    assert.deepEqual(await bot.responder('/rec 10 20 http://minhaurl/foo'),
        ['🔗 Alias /rec -> /sticker -ss 10 -es 20 http://minhaurl/foo', 'args: -ss 10 -es 20 http://minhaurl/foo']);
    assert.equal(executar.mock.callCount(), 1);
    assert.equal((await resolverAlias('/rec 5')).args, '-ss 5 -es', 'sem o $2, fica vazio');
});

test('opções do alvo são preservadas e aliases fixos são destinos válidos', async () => {
    await bot.responder('/alias ajuda /cotacao -h');
    assert.equal((await aliases())[0].command, '/cotacao -h');
    assert.match((await bot.responder('/ajuda'))[1], /Uso: \/cotacao/);
    await bot.responder('/alias foto /sticker');
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
        { name: '/eita', description: '', command: '/cotacao EUR', quiet: 0 }
    ]);
    assert.match((await bot.responder('/alias -rm /eita'))[0], /removido/);
    assert.equal((await aliases()).length, 0);
    await bot.responder('/alias eita /ping');
    assert.match((await bot.responder('/alias -rm eita'))[0], /removido/);
    assert.match((await bot.responder('/alias -rm eita'))[0], /não encontrado/);
    assert.match((await bot.responder('/alias'))[0], /Nenhum alias/);
});

test('recusa nomes reservados, cadastro inválido, destinos inexistentes e ciclos', async () => {
    await bot.setSetting('commands.disabled', ['/ping']);
    for (const linha of ['/alias ping /cotacao USD', '/alias mudo /cotacao USD',
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
    assert.match((await bot.responder('/help alias'))[0], /\*\/eita\*\n→ \/cotacao USD/);
    assert.match((await bot.responder('/alias -l'))[0], /\*\/eita\*\n→ \/cotacao USD/);
    await bot.setSetting('bot.users', true);
    assert.match((await bot.responder('/help alias', { de: bot.OUTRO.jid }))[0], /Nenhum alias/);
});


test('remoção de todos os aliases (-rm all) mantém os comandos do bot', async () => {
    await bot.responder('/alias eita /cotacao USD');
    await bot.responder('/alias eita2 /cotacao EUR');
    assert.match((await bot.responder('/alias -rm all'))[0], /Todos os aliases removidos \(2\)/);
    assert.deepEqual(await aliases(), []);
    assert.match((await bot.responder('/help alias'))[0], /Nenhum alias/);
    assert.ok(await resolverAlias('/cotacao USD'));
    assert.match((await bot.responder('/alias -rm all'))[0], /removidos \(0\)/);
});


test('descrição aceita aspas curvas e misturadas sem alterar o comando salvo', async () => {
    for (const descricao of ['“Exibe Dinheiro"', '“Exibe Dinheiro”', '"Exibe Dinheiro”',
        '‘Exibe Dinheiro’', "‘Exibe Dinheiro'", "'Exibe Dinheiro’"]) {
        await bot.responder(`/alias dimdim -desc ${descricao} /cotacao`);
        assert.deepEqual(await aliases(), [
            { name: '/dimdim', description: 'Exibe Dinheiro', command: '/cotacao', quiet: 0 }
        ]);
    }
    await bot.responder('/alias euros -d “Preço em euros” /cotacao EUR -h');
    assert.equal((await aliases()).find(a => a.name === '/euros').command, '/cotacao EUR -h');
});

test('/alias /nome /crypto USD: nome com barra e destino com argumento', async t => {
    await bot.responder('/alias /nome /crypto USD');
    assert.deepEqual(await aliases(), [{ name: '/nome', description: '', command: '/crypto USD', quiet: 0 }]);
    t.mock.method(HANDLERS, '/crypto', async ({ msg, args }) => msg.reply(`crypto ${args}`));
    assert.deepEqual(await bot.responder('/nome'), ['🔗 Alias /nome -> /crypto USD', 'crypto USD']);
});

test('alias de texto: \\n vira quebra de linha e vários {/comando} saem numa mensagem só', async t => {
    const [salvo] = await bot.responder(
        '/alias nome2 -d "Orca e Prjx" Verificando Orca {/defi orca}\\n Verificando Prjx {/defi prjx}');
    assert.match(salvo, /Alias salvo: \/nome2/);
    assert.deepEqual(await aliases(), [{
        name: '/nome2', description: 'Orca e Prjx',
        command: 'Verificando Orca {/defi orca}\nVerificando Prjx {/defi prjx}', quiet: 0
    }]);

    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg, args }) => msg.reply(`${args} ok`));
    assert.deepEqual(await bot.responder('/nome2'), [
        '🔗 Alias /nome2 -> /defi orca, /defi prjx',
        'Verificando Orca orca ok\nVerificando Prjx prjx ok'
    ]);
    assert.equal(defi.mock.callCount(), 2);

    // Resposta de várias linhas vira um parágrafo, como no /cron
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('₿ BTC\n💰 $1'));
    await bot.responder('/alias btc Bitcoin: {/crypto BTC} fim');
    assert.equal((await bot.responder('/btc'))[1], 'Bitcoin:\n\n₿ BTC\n💰 $1\n\nfim');

    const [lista] = await bot.responder('/alias -l');
    assert.match(lista, /\*\/nome2\*\n📝 Orca e Prjx\n→ Verificando Orca \{\/defi orca\}\n   Verificando Prjx \{\/defi prjx\}/);
});

test('alias de texto: recusa texto sem {/comando}, comandos inexistentes e os que não rodam no texto', async () => {
    for (const linha of ['/alias foo só texto', '/alias foo Oi {/naoexiste}', '/alias foo {/alias -l}',
        '/alias foo {/ping}', '/alias foo {/crypto -add DOGE}']) {
        assert.match((await bot.responder(linha))[0], /^❌/, linha);
    }
    assert.match((await bot.responder('/alias foo {/ping}'))[0], /o \/ping não roda dentro do \/alias/);
    assert.deepEqual(await aliases(), []);
});

test('alias de texto: cada {/comando} respeita as permissões de quem chama', async t => {
    await bot.responder('/alias misto Dólar {/cotacao USD} DeFi {/defi}');
    await bot.responder('/alias dolarbtc Dólar {/cotacao USD} BTC {/crypto BTC}');
    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg }) => msg.reply('defi'));
    const cotacao = t.mock.method(HANDLERS, '/cotacao', async ({ msg, admin }) => msg.reply(`admin=${admin}`));
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('btc'));
    const de = bot.OUTRO.jid;

    // /defi é só do dono: o alias inteiro é ignorado em silêncio
    assert.deepEqual(await bot.responder('/misto', { de }), []);
    assert.equal(defi.mock.callCount(), 0);

    // Os comandos rodam como quem chamou, não como o dono
    assert.deepEqual(await bot.responder('/dolarbtc', { de }),
        ['🔗 Alias /dolarbtc -> /cotacao USD, /crypto BTC', 'Dólar admin=false BTC btc']);

    // Um comando fora da regra da pessoa barra o alias
    await bot.setSetting('bot.users', []);
    await bot.responder('/bot +v /Fulano/');
    await bot.responder('/bot -cmd /crypto /Fulano/');
    assert.match((await bot.responder('/dolarbtc', { de }))[0], /O \/crypto não está liberado/);
    assert.equal(cotacao.mock.callCount(), 1);

    const [lista] = await bot.responder('/help alias', { de });
    assert.doesNotMatch(lista, /\/misto|\/dolarbtc/);
    assert.match((await bot.responder('/help alias'))[0], /\/misto[\s\S]*\/dolarbtc|\/dolarbtc[\s\S]*\/misto/);
});

test('/me envia a mensagem, roda {/comando} e aceita \\n', async t => {
    assert.deepEqual(await bot.responder('/me Minha mensagem'), ['Minha mensagem']);
    assert.deepEqual(await bot.responder('/me Linha 1\\nLinha 2'), ['Linha 1\nLinha 2']);
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('₿ BTC\n💰 $1'));
    assert.deepEqual(await bot.responder('/me O preço está em {/crypto}'), ['O preço está em\n\n₿ BTC\n💰 $1']);
    assert.match((await bot.responder('/me'))[0], /^❌ Use: \/me/);
    assert.match((await bot.responder('/me {/ping}'))[0], /não roda dentro do \/me/);
});

test('/me -repeat|-r repete a mensagem n vezes', async () => {
    assert.deepEqual(await bot.responder('/me -r 3 Haha!'), ['Haha!Haha!Haha!']);
    assert.deepEqual(await bot.responder('/me -repeat 2 Haha!\\n'), ['Haha!\nHaha!\n']);
    for (const ruim of ['0', '501', 'x'])
        assert.match((await bot.responder(`/me -r ${ruim} Haha!`))[0], /^❌ -repeat precisa de um número de 1 a 500/);
    assert.equal((await bot.responder('/me -r 500 a'))[0], 'a'.repeat(500));
    await bot.setSetting('me.maxRepeat', 5);
    assert.match((await bot.responder('/me -r 6 a'))[0], /1 a 5/);
    assert.equal((await bot.responder('/me -r 5 a'))[0], 'aaaaa');
    assert.match((await bot.responder('/me -r 3'))[0], /^❌ Use: \/me/);
});

test('/me respeita as permissões dos {/comando} de quem chama', async t => {
    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg }) => msg.reply('defi'));
    assert.deepEqual(await bot.responder('/me Oi {/defi}', { de: bot.OUTRO.jid }), []);
    assert.equal(defi.mock.callCount(), 0);
});

test('/alias -q omite o cabeçalho e aceita /me como destino', async () => {
    const [salvo] = await bot.responder('/alias -q /haha /me Hahaha vc e burro!');
    assert.match(salvo, /Alias salvo: \/haha/);
    assert.deepEqual(await aliases(), [
        { name: '/haha', description: '', command: '/me Hahaha vc e burro!', quiet: 1 }
    ]);
    assert.deepEqual(await bot.responder('/haha'), ['Hahaha vc e burro!']);

    await bot.responder('/alias /haha2 -quiet -d "Riso" /me Kkk');
    assert.deepEqual((await aliases())[1], { name: '/haha2', description: 'Riso', command: '/me Kkk', quiet: 1 });
    assert.deepEqual(await bot.responder('/haha2'), ['Kkk']);

    // Sem -q o cabeçalho continua
    await bot.responder('/alias fala /me Oi');
    assert.deepEqual(await bot.responder('/fala'), ['🔗 Alias /fala -> /me Oi', 'Oi']);
});

test('{/alias} dentro de um texto roda o alias de comando; alias de texto é recusado', async t => {
    const defi = t.mock.method(HANDLERS, '/defi', async ({ msg, args }) => msg.reply(`${args} ok`));
    await bot.responder('/alias orca /defi orca');
    await bot.responder('/alias prjx /defi $1');
    await bot.responder('/alias outro Outro: {/defi x}');
    await bot.responder('/alias painel Orca: {/orca} e Prjx: {/prjx abc}');

    assert.deepEqual(await bot.responder('/painel'), [
        '🔗 Alias /painel -> /orca, /prjx abc', 'Orca: orca ok e Prjx: abc ok'
    ]);
    assert.equal(defi.mock.callCount(), 2);

    const [erro] = await bot.responder('/alias ruim Texto {/outro}');
    assert.match(erro, /alias \/outro é um texto/);
});

test('nome do alias aceita ponto e os parâmetros aceitam valor padrão ${N:-valor}', async t => {
    const cot = t.mock.method(HANDLERS, '/cotacao', async () => {});
    assert.match((await bot.responder('/alias -q meu.comando /cotacao ${1:-USD} $2'))[0], /Alias salvo: \/meu\.comando/);
    await bot.responder('/meu.comando');
    await bot.responder('/meu.comando EUR');
    assert.deepEqual(cot.mock.calls.map(c => c.arguments[0].args), ['USD', 'EUR']);
});

test('o começo do nome de um alias salvo também completa (único roda, vários lista)', async () => {
    await bot.responder('/alias -rm all');
    await bot.responder('/alias zzuno /cotacao USD');
    const unico = await resolverAlias('/zzu');
    assert.equal(unico.alias, '/zzuno');
    assert.equal(unico.prefixo, '/zzu');

    await bot.responder('/alias zzdois /cotacao EUR');
    const varios = await resolverAlias('/zz');
    assert.deepEqual(varios.possiveis.map(c => c.cmd), ['/zzdois', '/zzuno']);
    await bot.responder('/alias -rm all');
});

test('-rm aceita vários nomes (espaço ou vírgula) e diz os que não existiam', async () => {
    await bot.responder('/alias -rm all');
    for (const n of ['um', 'dois', 'tres']) await bot.responder(`/alias ${n} /cotacao USD`);

    const [r] = await bot.responder('/alias -rm um /dois, nao');
    assert.match(r, /Aliases removidos \(2\): \/um, \/dois/);
    assert.match(r, /Não encontrado: \/nao/);
    assert.deepEqual((await aliases()).map(a => a.name), ['/tres']);

    assert.match((await bot.responder('/alias -rm tres'))[0], /Alias \/tres removido/);
    assert.match((await bot.responder('/alias -rm x y'))[0], /^❌ Não encontrados: \/x, \/y$/);
    await bot.responder('/alias um /cotacao USD');
    assert.match((await bot.responder('/alias -rm um all'))[0], /Todos os aliases removidos \(1\)/);
});

test('-move renomeia o alias e recusa nome existente, de comando ou alias inexistente', async () => {
    await bot.responder('/alias -rm all');
    await bot.responder('/alias velho -q -desc "Dólar" /cotacao USD');
    await bot.responder('/alias outro /cotacao EUR');

    assert.match((await bot.responder('/alias -m velho /novo'))[0], /renomeado: \/velho → \/novo/);
    const [a] = (await aliases()).filter(a => a.name === '/novo');
    assert.equal(a.command, '/cotacao USD');
    assert.equal(a.description, 'Dólar');
    assert.equal(a.quiet, 1);
    assert.equal((await aliases()).some(a => a.name === '/velho'), false);

    assert.match((await bot.responder('/alias -move novo outro'))[0], /Já existe um alias \/outro/);
    assert.match((await bot.responder('/alias -move nao x'))[0], /não encontrado/);
    assert.match((await bot.responder('/alias -move novo /help'))[0], /já é um comando/);
    assert.match((await bot.responder('/alias -move novo'))[0], /Use: \/alias -move/);
    await bot.responder('/alias -rm all');
});

test('-desc sem comando atualiza só a descrição de um alias existente', async () => {
    await bot.responder('/alias -rm all');
    await bot.responder('/alias end.inga /cotacao USD');
    assert.match((await bot.responder('/alias /end.inga -d “Endereço do Ingá"'))[0], /Descrição de \/end.inga atualizada/);
    const a = (await aliases()).find(a => a.name === '/end.inga');
    assert.equal(a.description, 'Endereço do Ingá');
    assert.equal(a.command, '/cotacao USD');
    assert.match((await bot.responder('/alias nada -d "x"'))[0], /não encontrado/);
    await bot.responder('/alias -rm all');
});
