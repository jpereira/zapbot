/*
 * Comandos sem serviço externo: /help, /debug, /uptime, /version, /ping,
 * /noffa, /bot e /set.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const packageJson = require('../package.json');
const { OUTRO } = bot;

beforeEach(bot.reiniciar);

describe('/help (/h)', () => {
    test('sem argumento (o dono): todos os comandos ativos', async () => {
        const [r] = await bot.responder('/help');
        assert.match(r, /MENU DE AJUDA/);
        assert.match(r, /Usage: \/show/);
        assert.match(r, /Usage: \/cotacao/);
        assert.doesNotMatch(r, /Usage: \/monitor/); // desativado no config
    });

    test('um comando, com ou sem "/", por nome ou alias', async () => {
        for (const linha of ['/help show', '/help /show', '/h s']) {
            const [r] = await bot.responder(linha);
            assert.match(r, /AJUDA[\s\S]*Usage: \/show/, linha);
        }
    });

    test('comando inexistente', async () => {
        assert.deepEqual(await bot.responder('/help naoexiste'), ['❌ Comando não encontrado: /naoexiste']);
    });

    test('quem não é admin vê só os comandos comuns; o admin extra vê tudo', async () => {
        const [r] = await bot.responder('/help', { de: OUTRO.jid });
        assert.match(r, /^🤖 \*MENU DE AJUDA\* _\(os comandos que você pode usar\)_/);
        assert.match(r, /Usage: \/cotacao/);
        assert.doesNotMatch(r, /Usage: \/(show|backup|bot|set)\b/);

        assert.deepEqual(await bot.responder('/help show', { de: OUTRO.jid }),
            ['⛔ O /show é só do dono do bot (e dos admins).\n💡 _Veja os que você pode usar com /help_']);
        assert.match((await bot.responder('/help cotacao', { de: OUTRO.jid }))[0], /Usage: \/cotacao/);

        await bot.setSetting('bot.admins', [OUTRO.user]);
        const [admin] = await bot.responder('/help', { de: OUTRO.jid });
        assert.match(admin, /^🤖 \*MENU DE AJUDA\*\n/);
        assert.match(admin, /Usage: \/show/);
    });

    test('comando desativado por setting some do menu', async () => {
        await bot.setSetting('commands.disabled', 'noffa');
        assert.doesNotMatch((await bot.responder('/help'))[0], /Usage: \/noffa/);
    });
});

describe('/debug (/d, /dbg)', () => {
    test('-on e -off gravam o setting; sem opção mostra o estado', async () => {
        assert.deepEqual(await bot.responder('/debug -on'), ['🪲 Debug Ativado.']);
        assert.equal(bot.getSetting('debug.enabled'), true);
        assert.deepEqual(await bot.responder('/dbg -off'), ['🪲 Debug Desativado.']);
        assert.equal(bot.getSetting('debug.enabled'), false);
        assert.deepEqual(await bot.responder('/d'), ['🪲 Debug Desativado.']);
    });
});

describe('/uptime (/u, /up) e /version (/ver)', () => {
    // Com o commit que está rodando (nos testes, o do .git do projeto)
    const banner = new RegExp(`🤖 \\*ZapBot ${packageJson.version.replace('.', '\\.')}(?: \\(devel\\))? \\(git\\+[0-9a-f]{7}/[\\w.-]+\\)\\*[\\s\\S]*⚡ Online:[\\s\\S]*🔐 Conectado:`);

    test('o mesmo banner com a versão em todos os nomes', async () => {
        for (const linha of ['/uptime', '/u', '/up', '/version', '/ver']) {
            const [r] = await bot.responder(linha);
            assert.match(r, banner, linha);
        }
    });

    test('"não conectado" antes de autenticar; tempo depois', async () => {
        bot.estado.autenticadoEm = 0;
        assert.match((await bot.responder('/uptime'))[0], /Conectado: \*não conectado\*/);
        bot.estado.autenticadoEm = Date.now() - 2 * 60 * 1000;
        assert.match((await bot.responder('/uptime'))[0], /Conectado: \*2 minutos, 0 segundos\*/);
    });
});

describe('/noffa', () => {
    test('enfeita os espaços do texto', async () => {
        assert.deepEqual(await bot.responder('/noffa bom dia grupo'), ['bom 🌈 dia 🏳️‍🌈 grupo']);
    });

    test('usa o texto da mensagem respondida', async () => {
        const citada = bot.criarMensagem({ texto: 'olá mundo', de: OUTRO.jid });
        assert.deepEqual(await bot.responder('/noffa', { citada }), ['olá 🌈 mundo']);
    });

    test('sem texto mostra a sintaxe', async () => {
        assert.match((await bot.responder('/noffa'))[0], /^Syntax: \/noffa/);
    });

    test('texto começando com "/" ganha um 🌈 na frente (nunca vira comando)', async () => {
        const [r] = await bot.responder('/noffa /cache -a');
        assert.ok(r.startsWith('🌈 /cache'));
    });
});

describe('/bot', () => {
    test('-h: os pares +admin/-admin, +o/-o e +v/-v juntos, uma linha cada', async () => {
        const [r] = await bot.responder('/bot -h');
        const linhas = r.split('\n').filter(l => /^  [+-]/.test(l)).map(l => l.trim().split(/\s{2,}/)[0]);
        assert.deepEqual(linhas, ['-on', '-off', '+admin, -admin', '+o, -o [pessoa...]', '+v, -v [pessoa|grupo...]',
            '-all-users, -au', '-reset, -r', '-status, -s [<hora>|off]', '-info, -i']);
        assert.doesNotMatch(r, /Arguments:/);
    });

    test('sem opção mostra os dois estados', async () => {
        const [r] = await bot.responder('/bot');
        assert.match(r, /▶️ \*Bot:\* ativo/);
        assert.match(r, /🔓 \*Comandos:\* todos usam os comuns/);
    });

    test('-off, -on, +admin e -admin gravam os settings (+admin: bot.users false; -admin: true)', async () => {
        await bot.responder('/bot -off');
        assert.equal(bot.getSetting('bot.paused'), true);
        await bot.responder('/bot -on +admin');
        assert.equal(bot.getSetting('bot.paused'), false);
        assert.deepEqual(bot.getSetting('bot.users'), []);
        const [r] = await bot.responder('/bot -admin');
        assert.deepEqual(bot.getSetting('bot.users'), ['all']);
        assert.match(r, /🔓 \*Comandos:\* todos usam os comuns/);
    });

    test('-info: avisa versão nova do yt-dlp (PyPI) e do whatsapp-web.js (release e commits no main)', async () => {
        const { compararVersoes, limparNovidades, notaDeVersao } = bot.src('sistema');
        assert.equal(compararVersoes('2026.08.19', '2026.8.19'), 0);
        assert.equal(compararVersoes('2026.9.1', '2026.08.19'), 1);
        assert.equal(compararVersoes('1.34.7', '1.35.0'), -1);
        assert.equal(notaDeVersao('2026.08.19', '2026.8.19'), ' · ✅ a mais recente');
        assert.equal(notaDeVersao('2026.08.19', '2026.9.30'), ' · ⬆️ *nova: 2026.9.30*');
        assert.equal(notaDeVersao(null, '2026.9.30'), '', 'sem a instalada (não achou o binário): sem nota');

        const commit = packageJson.dependencies['whatsapp-web.js'].split('#')[1];
        limparNovidades();
        bot.rede.responder('get', 'pypi.org/pypi/yt-dlp/json', { info: { version: '2099.1.1' } });
        bot.rede.responder('get', 'api.github.com/repos/wwebjs/whatsapp-web.js/releases/latest', { tag_name: 'v99.0.0' });
        bot.rede.responder('get', `api.github.com/repos/wwebjs/whatsapp-web.js/compare/${commit}...main`, { ahead_by: 3 });
        const [r] = await bot.responder('/bot -info');
        assert.match(r, /• whatsapp-web\.js: [\d.]+ \(commit [0-9a-f]{7}\) · ⬆️ \*nova: 99\.0\.0\* · ⬆️ 3 commits novos no main\n/);

        // Guardado por 6 h: não consulta de novo
        const chamadas = bot.rede.chamadas.length;
        await bot.responder('/bot -info');
        assert.equal(bot.rede.chamadas.length, chamadas);

        // Fora do ar: sem nota (e sem erro)
        limparNovidades();
        bot.rede.limpar();
        assert.match((await bot.responder('/bot -info'))[0], /• whatsapp-web\.js: [\d.]+ \(commit [0-9a-f]{7}\)\n/);
        limparNovidades();
    });

    test('-info (-i): versões do bot, dos programas e o sistema', async () => {
        for (const linha of ['/bot -info', '/bot -i']) {
            const [r] = await bot.responder(linha);
            assert.match(r, new RegExp(`^ℹ️ \\*ZapBot ${packageJson.version.replace('.', '\\.')}(?: \\(devel\\))?\\* · informações do sistema\n\n🤖 \\*Bot\\*\n`), linha);
            assert.match(r, new RegExp(`• Node\\.js: ${process.version.replace(/\./g, '\\.')} \\(V8 `));
            assert.match(r, new RegExp(`• ZapBot: ${packageJson.version.replace('.', '\\.')}(?: \\(devel\\))? \\(git\\+[0-9a-f]{7}/[\\w.-]+\\) \\(APP_ENV=test\\)\n`));
            assert.match(r, /• whatsapp-web\.js: [\d.]+ \(commit [0-9a-f]{7}\)\n/);
            assert.match(r, /• WhatsApp Web: _não encontrado_\n/);   // o cliente simulado não tem getWWebVersion
            assert.match(r, /• SQLite: \d+\.\d+\.\d+\n/);
            assert.match(r, /🧰 \*Programas\*\n• Chromium: .+\n• yt-dlp: .+\n• ffmpeg: .+\n/);
            assert.match(r, /🖥️ \*Sistema\*\n• .+\n• Host: .+\n• CPU: \d+× .+ · carga [\d.]+ · [\d.]+ · [\d.]+\n• Memória: .+ de .+ em uso · o bot usa .+\n• No ar: sistema há .+ · bot há .+ \(PID \d+\)$/);
        }
        assert.match((await bot.responder('/bot -i -on'))[0], /❌ O -info não combina com as outras opções/);
        assert.equal(bot.getSetting('bot.paused'), false);
    });

    test('-au combina com as outras: -on -au liga e mostra todos', async () => {
        await bot.setSetting('bot.paused', true);
        await bot.setSetting('bot.users', ['5521911111111', '5521977777777']);
        const [r] = await bot.responder('/bot -on -au');
        assert.equal(bot.getSetting('bot.paused'), false);
        assert.match(r, /^▶️ \*Bot:\* ativo\n[\s\S]*\*Quem usa\* \(2\)\n/);
        assert.doesNotMatch(r, /fora daqui/);
    });

    test('combinações inválidas mostram o uso', async () => {
        for (const linha of ['/bot -on -off', '/bot +admin -admin', '/bot xyz']) {
            assert.match((await bot.responder(linha))[0], /❌ Uso: \/bot/, linha);
        }
    });
});

describe('/set (/config)', () => {
    test('sem argumento lista todas as chaves, em ordem', async () => {
        const [r] = await bot.responder('/set');
        const chaves = [...r.matchAll(/^([a-z][\w.]+)\s{2}/gm)].map(m => m[1]);
        assert.deepEqual(chaves, [...chaves].sort());
        assert.ok(chaves.includes('show.max') && chaves.includes('alerta.max'));
    });

    test('<chave> mostra valor, padrão, tipo e limites', async () => {
        const [r] = await bot.responder('/set show.max');
        assert.match(r, /\*Valor:\* 20\n\*Padrão:\* 20\n\*Tipo:\* number \(1\.\.100\)/);
    });

    test('<chave> <valor> altera; valor inválido é recusado', async () => {
        assert.deepEqual(await bot.responder('/set show.max 10'), ['✅ *show.max* = 10']);
        assert.equal(bot.getSetting('show.max'), 10);
        assert.deepEqual(await bot.responder('/config show.max 12'), ['✅ *show.max* = 12']);
        assert.equal(bot.getSetting('show.max'), 12);
        assert.match((await bot.responder('/set show.max 500'))[0], /❌ Valor inválido para \*show.max\*: precisa estar entre 1 e 100/);
    });

    test('lista: itens separados por espaço; "" esvazia', async () => {
        assert.deepEqual(await bot.responder('/set crypto.coins btc eth'), ['✅ *crypto.coins* = BTC, ETH']);
        assert.deepEqual(await bot.responder('/set commands.disabled ""'), ['✅ *commands.disabled* = (vazio)']);
    });

    test('lista "uma por linha" (watch.rules) usa o texto cru', async () => {
        await bot.responder('/set watch.rules oi, tudo bem\n/pix/i');
        assert.deepEqual(bot.getSetting('watch.rules'), ['oi, tudo bem', '/pix/i']);
        const [r] = await bot.responder('/set watch.rules');
        assert.match(r, /\*Valor:\* \n1\. oi, tudo bem\n2\. \/pix\/i/);
    });

    test('segredo aparece mascarado', async () => {
        assert.deepEqual(await bot.responder('/set openai.api.key sk-abcdef123456'), ['✅ *openai.api.key* = ••••3456']);
        assert.match((await bot.responder('/set'))[0], /openai\.api\.key\s+••••3456/);
    });

    test('config/.env: somente leitura, só no seu privado, com os segredos mascarados', async () => {
        process.env.OPENAI_API_KEY = 'sk-env-abcd1234';
        process.env.OPENAI_MODEL = 'gpt-4.1';
        try {
            const [privado] = await bot.responder('/set', { chat: bot.DONO.jid });
            assert.match(privado, /🔒 \*config\/\.env\* _\(somente leitura: mude no arquivo e recrie o container\)_\n\n```\n/);
            assert.match(privado, /OPENAI_API_KEY\s+••••1234\n/);
            assert.match(privado, /OPENAI_MODEL\s+gpt-4\.1\n/);
            assert.match(privado, /PHONE_NUMBER\s+5521900000000@c\.us\n/);
            assert.match(privado, /GIPHY_API_KEY\s+\(vazio\)\n/);
            assert.doesNotMatch(privado, /sk-env/);

            const [grupo] = await bot.responder('/set');
            assert.match(grupo, /⚙️ \*SETTINGS\*/);
            assert.match(grupo, /🔒 _As variáveis do config\/\.env \(somente leitura\) aparecem só no seu privado\._$/);
            assert.doesNotMatch(grupo, /OPENAI_MODEL|PHONE_NUMBER/);

            assert.deepEqual(await bot.responder('/set OPENAI_API_KEY', { chat: bot.DONO.jid }), ['🔒 *OPENAI_API_KEY* = ••••1234\n_config/.env, somente leitura_']);
            assert.deepEqual(await bot.responder('/set OPENAI_MODEL'), ['🔒 _As variáveis do config/.env (somente leitura) aparecem só no seu privado._']);
            assert.deepEqual(await bot.responder('/set OPENAI_MODEL gpt-6-sol', { chat: bot.DONO.jid }),
                ['❌ OPENAI_MODEL é do config/.env (somente leitura): mude no arquivo e recrie o container.']);
            assert.equal(process.env.OPENAI_MODEL, 'gpt-4.1');
        } finally {
            delete process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_MODEL;
        }
    });

    test('<trecho> ou /regex/ que não é uma chave: lista as que casam; nada casa: erro', async () => {
        const [r] = await bot.responder('/set alerta');
        assert.match(r, /^⚙️ \*SETTINGS\* com "alerta" \(3\)\n\n```\nalerta\.intervalMin       5\nalerta\.max               20\ndefi\.alerta\.intervalMin  10\n```\n💡 _\/set <chave> para detalhes_$/);

        const chaves = (texto) => [...texto.matchAll(/^([a-z][\w.]+)\s{2}/gm)].map(m => m[1]);
        assert.deepEqual(chaves((await bot.responder('/set OPENAI'))[0]), ['openai.api.key', 'openai.api.model', 'openai.timeout.ms']);
        assert.deepEqual(chaves((await bot.responder('/set /^show\\./'))[0]), ['show.alert.deleted', 'show.alert.edited', 'show.alert.status', 'show.delayMs', 'show.max']);
        assert.deepEqual(chaves((await bot.responder('/set /max$/'))[0]).length > 3, true);

        assert.deepEqual(await bot.responder('/set xyz'), ['❌ Nenhum setting com "xyz".\n💡 _Veja todos com /set_']);
        assert.deepEqual(await bot.responder('/set /[/'), ['❌ Regex inválida: /[/']);

        // Chave exata continua mostrando os detalhes; com valor, o trecho não vale
        assert.match((await bot.responder('/set alerta.max'))[0], /^⚙️ \*alerta\.max\*\n/);
        assert.match((await bot.responder('/set alerta 5'))[0], /❌ Setting desconhecido: alerta/);
    });

    test('-append (-a) e -rem: acrescentam e tiram itens de uma lista; em outra chave, recusa e sugere o -reset', async () => {
        assert.deepEqual(await bot.responder('/set -a commands.disabled noffa /p'), ['✅ *commands.disabled* + /noffa, /ping\n= /noffa, /ping']);
        assert.deepEqual(await bot.responder('/set -append commands.disabled walissu'), ['✅ *commands.disabled* + /walissu\n= /noffa, /ping, /walissu']);
        assert.deepEqual(await bot.responder('/set -a commands.disabled noffa'), ['ℹ️ *commands.disabled* já tem /noffa.']);
        assert.deepEqual(await bot.responder('/set -rem commands.disabled /ping'), ['✅ *commands.disabled* − /ping\n= /noffa, /walissu']);
        assert.match((await bot.responder('/set -rem commands.disabled ping'))[0], /❌ \*commands\.disabled\* não tem \/ping/);
        assert.match((await bot.responder('/set -a commands.disabled naoexiste'))[0], /❌ Valor inválido para \*commands\.disabled\*: comando desconhecido/);

        // watch.rules (uma por linha): o texto cru, com espaços e vírgulas
        assert.deepEqual(await bot.responder('/set -a watch.rules oi, tudo bem'), ['✅ *watch.rules* + oi, tudo bem\n= oi, tudo bem']);

        assert.deepEqual(await bot.responder('/set -a show.max 5'), [
            '❌ *show.max* não é uma lista: o -append vale só para chaves com várias entradas.\n' +
            '💡 _Troque o valor com /set show.max <valor> ou volte ao padrão com /set -reset show.max (-r)._']);
        assert.match((await bot.responder('/set -rem naoexiste x'))[0], /❌ Setting desconhecido: naoexiste/);
        assert.match((await bot.responder('/set -a commands.disabled'))[0], /❌ Informe o que acrescentar a \*commands\.disabled\*/);
    });

    test('-reset volta ao padrão; chave desconhecida', async () => {
        await bot.setSetting('show.max', 5);
        assert.deepEqual(await bot.responder('/set -reset show.max'), ['♻️ *show.max* = 20 _(padrão)_']);
        assert.match((await bot.responder('/set -r naoexiste'))[0], /❌ Setting desconhecido: naoexiste/);
        assert.match((await bot.responder('/set naoexiste 1'))[0], /❌ Setting desconhecido: naoexiste/);
        assert.match((await bot.responder('/set naoexiste'))[0], /❌ Nenhum setting com "naoexiste"/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.responder('/set show.max 1', { de: OUTRO.jid }), []);
        assert.equal(bot.getSetting('show.max'), 20);
    });
});
