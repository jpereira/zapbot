/*
 * Commands without an external service: /help, /debug, /uptime, /version, /ping,
 * /noffa, /bot e /set.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const packageJson = require('../package.json');
const COMMANDS = require('../src/commands/commands');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const { OTHERAlt } = bot;

beforeEach(bot.restart);

describe('/help', () => {
    test('sem argumento (o dono): todos os comandos ativos', async () => {
        const [r] = await bot.replyAlt('/help');
        assert.match(r, /MENU DE AJUDA/);
        assert.match(r, /\n\*\/alias\*\n_[^\n]+_\n\n[^]*\n\*\/ascii\*\n_/);
        assert.match(r, /\n\*\/show\*\n_Mostra mensagens do cache do bot_\n/);
        assert.match(r, /\n\*\/stocks\*\n_/);
        assert.doesNotMatch(r, /Usage:|```/);
        assert.ok(r.endsWith('_\n\n💡 Utilize */help /comando* ou */comando -h* para mais informações.'));
    });

    test('a lista tem "*/cmd*" e, na linha de baixo, "_o que faz_": negrito e itálico, um par por comando', async () => {
        const [r] = await bot.replyAlt('/help');
        const linesAlt = r.split('\n');
        const commands = linesAlt.map((l, i) => [l, linesAlt[i + 1]]).filter(([l]) => /^\*\//.test(l));
        assert.equal(commands.length, COMMANDS.commands.length);
        // WhatsApp formatting closes on each line (no leftover *, _ or ` inside the description)
        for (const [cmd, description] of commands) {
            assert.match(cmd, /^\*\/[a-z]+\*$/, cmd);
            assert.match(description, /^_[^*_`~]+_$/, description);
        }
    });

    test('um comando, com ou sem "/", por nome ou alias', async () => {
        for (const line of ['/help show', '/help /show', '/help show']) {
            const [r] = await bot.replyAlt(line);
            assert.match(r, /AJUDA[\s\S]*Usage: \/show/, line);
        }
    });

    test('comando inexistente', async () => {
        assert.deepEqual(await bot.replyAlt('/help naoexiste'), ['❌ Comando não encontrado: /naoexiste']);
    });

    test('quem não é admin vê só os comandos comuns; o admin extra vê tudo', async () => {
        const [r] = await bot.replyAlt('/help', { de: OTHERAlt.jid });
        assert.match(r, /^🤖 \*MENU DE AJUDA\* _\(os comandos que você pode usar\)_/);
        assert.match(r, /\n\*\/stocks\*\n_/);
        assert.doesNotMatch(r, /\n\*\/(show|backup|bot|set)\*\n/);

        assert.deepEqual(await bot.replyAlt('/help show', { de: OTHERAlt.jid }),
            ['⛔ O /show é só do dono do bot (e dos admins).\n💡 _Veja os que você pode usar com /help_']);
        assert.match((await bot.replyAlt('/help stocks', { de: OTHERAlt.jid }))[0], /Usage: \/stocks/);

        await bot.setSetting('bot.admins', [OTHERAlt.user]);
        const [admin] = await bot.replyAlt('/help', { de: OTHERAlt.jid });
        assert.match(admin, /^🤖 \*MENU DE AJUDA\*\n/);
        assert.match(admin, /\n\*\/show\*\n_/);
    });

    test('-role|-r: lista por role (owner, admin, user), só o que a pessoa pode usar', async () => {
        const [r] = await bot.replyAlt('/help -r');
        assert.match(r, /🔸 Role: owner\n\n\*\/contacts\*\n_[^]*\n\n🔸 Role: admin\n\n\*\/alias\*\n_[^]*\n\n🔸 Role: user\n\n\*\/ascii\*\n_/);
        assert.ok(r.search(/\*\/show\*\n_/) < r.indexOf('Role: user'));
        assert.deepEqual(await bot.replyAlt('/help -r'), [r]);

        const [other] = await bot.replyAlt('/help -r', { de: OTHERAlt.jid });
        assert.match(other, /🔸 Role: user\n\n\*\/ascii\*\n_/);
        assert.doesNotMatch(other, /Role: (owner|admin)/);

        await bot.setSetting('bot.users.cmds', [`${OTHERAlt.user}=/ping,/show`]);
        await bot.setSetting('bot.users', [OTHERAlt.user]);
        const [delegated] = await bot.replyAlt('/help -r', { de: OTHERAlt.jid });
        assert.match(delegated, /Role: admin\n\n\*\/show\*\n_[^]*\n\n🔸 Role: user\n\n\*\/help\*\n_[^]*\n\n\*\/ping\*\n_/);
        assert.doesNotMatch(delegated, /Role: owner/);

        // with the command, -r does not get in the way
        assert.match((await bot.replyAlt('/help -r get'))[0], /Usage: \/get/);
    });

    test('comando desativado por setting some do menu', async () => {
        await bot.setSetting('commands.disabled', 'noffa');
        assert.doesNotMatch((await bot.replyAlt('/help'))[0], /\n\*\/noffa\*\n/);
    });
});

describe('"digitando..." ao executar um comando', () => {
    const typing = () => bot.client.chats.get(bot.GROUP).typing;

    test('todo comando mostra, menos os que declaram digitando: false (responde na hora)', async () => {
        await bot.replyAlt('/ping');
        await bot.replyAlt('/help');
        assert.equal(typing(), 0);

        await bot.replyAlt('/me oi');
        assert.equal(typing(), 1);
        await bot.replyAlt('/me oi');
        assert.equal(typing(), 2);
    });

    test('marca a conversa como lida antes de responder (commands.seen), até nos instantâneos', async () => {
        const group = bot.client.chats.get(bot.GROUP);
        await bot.replyAlt('/ping');
        await bot.replyAlt('/me oi');
        assert.equal(group.read, 2);

        await bot.setSetting('commands.seen', false);
        await bot.replyAlt('/ping');
        assert.equal(group.read, 2, 'desligado: não marca');
    });

    test('segue aceso enquanto o comando roda (a resposta do meio apaga o aviso) e apaga ao terminar', async () => {
        const { withTyping } = bot.src('execute');
        const sentAlt3 = [];
        let deleted = 0;
        const chat = { sendStateTyping: async () => { sentAlt3.push(Date.now()); }, clearState: async () => { deleted++; } };
        const msg = { getChat: async () => chat };

        const resultAlt = await withTyping(msg, {}, async () => {
            await new Promise(r => setTimeout(r, 75));
            return 'ok';
        }, { each: 20 });
        assert.equal(resultAlt, 'ok');
        assert.ok(sentAlt3.length >= 3, `reenviou ${sentAlt3.length}x`);
        await new Promise(setImmediate);
        assert.equal(deleted, 1);

        // Finished: does not resend anymore
        const total = sentAlt3.length;
        await new Promise(r => setTimeout(r, 60));
        assert.equal(sentAlt3.length, total);

        // The command error goes through, and the notice also deletes
        await assert.rejects(withTyping(msg, {}, async () => { throw new Error('falhou'); }, { each: 20 }), /falhou/);
        await new Promise(setImmediate);
        assert.equal(deleted, 2);

        // typing: false does not touch the chat
        const beforeAlt = sentAlt3.length;
        await withTyping(msg, { typing: false }, async () => {}, { each: 20 });
        assert.equal(sentAlt3.length, beforeAlt);
    });
});

describe('/debug', () => {
    test('-on e -off gravam o setting; sem opção mostra o estado', async () => {
        assert.deepEqual(await bot.replyAlt('/debug -on'), ['🪲 Debug Ativado. [DEBUG0]']);
        assert.equal(bot.getSetting('debug.enabled'), true);
        assert.deepEqual(await bot.replyAlt('/debug -off'), ['🪲 Debug Desativado.']);
        assert.equal(bot.getSetting('debug.enabled'), false);
        assert.deepEqual(await bot.replyAlt('/debug'), ['🪲 Debug Desativado.']);
    });
});

describe('/uptime e /version', () => {
    // With the commit that is running (in the tests, the one from the project's .git)
    const banner = new RegExp(`🤖 \\*ZapBot ${escapeRegex(packageJson.version)}(?: \\(devel\\))? \\(git\\+[0-9a-f]{7}/[\\w.-]+\\)\\*[\\s\\S]*⚡ Online:[\\s\\S]*🔐 Conectado:`);

    test('o mesmo banner com a versão em todos os nomes', async () => {
        for (const line of ['/uptime', '/version']) {
            const [r] = await bot.replyAlt(line);
            assert.match(r, banner, line);
        }
    });

    test('"não conectado" antes de autenticar; tempo depois', async () => {
        bot.state.authenticatedAt = 0;
        assert.match((await bot.replyAlt('/uptime'))[0], /Conectado: \*não conectado\*/);
        bot.state.authenticatedAt = Date.now() - 2 * 60 * 1000;
        assert.match((await bot.replyAlt('/uptime'))[0], /Conectado: \*2 minutos, 0 segundos\*/);
    });
});

describe('/noffa', () => {
    test('enfeita os espaços do texto', async () => {
        assert.deepEqual(await bot.replyAlt('/noffa bom dia grupo'), ['bom 🌈 dia 🏳️‍🌈 grupo']);
    });

    test('usa o texto da mensagem respondida', async () => {
        const quoted = bot.createMessage({ text: 'olá mundo', de: OTHERAlt.jid });
        assert.deepEqual(await bot.replyAlt('/noffa', { quoted }), ['olá 🌈 mundo']);
    });

    test('sem texto mostra a sintaxe', async () => {
        assert.match((await bot.replyAlt('/noffa'))[0], /^```Usage: \/noffa/);
    });

    test('texto começando com "/" ganha um 🌈 na frente (nunca vira comando)', async () => {
        const [r] = await bot.replyAlt('/noffa /cache -a');
        assert.ok(r.startsWith('🌈 /cache'));
    });
});

describe('/bot', () => {
    test('-h: os pares +a/-a, +u/-u e +cmd/-cmd juntos, uma opção por bloco', async () => {
        const [r] = await bot.replyAlt('/bot -h');
        const linesAlt = r.split('\n').filter(l => /^  [+-]/.test(l)).map(l => l.trim().split(/\s{2,}/)[0]);
        assert.deepEqual(linesAlt, ['-on', '-off', '+a, -a [pessoa...]', '+u, -u [pessoa|grupo...]', '+cmd, -cmd <comandos>',
            '+limit, -limit <N[/período]|comandos>', '-list-users, -lu [all]', '-list-commands, -lc', '-reset, -r [force]', '-yes, -y', '-status, -s [<hora>|off]', '-to <destino>',
            '-info, -i', '-test, -t', '-denied, -d [on|off|reset|<texto>]', '-flood, -f [off|on|<N>[/<segundos>]]', '-passwd <senha|off>', '-login <senha>', '-flush-email, -fe', '-mask, -m']);
        assert.match(r, /\n  -on +Liga o bot\n/);
        assert.match(r, /\nDetalhes: https:\/\/jpereira\.github\.io\/zapbot\/pt-BR\/commands\/bot\/```$/);
        assert.doesNotMatch(r, /admin, -admin|Argumentos:/);
    });

    test('sem opção: o status (o mesmo do -status), com o estado no topo e quem usa', async () => {
        const [r] = await bot.replyAlt('/bot');
        assert.match(r, /^📊 \*Status do ZapBot .*\n_.*_\n\n▶️ \*Bot:\* ativo\n🔓 \*Comandos:\* todos usam os comuns\n⚠️ .*\/set bot\.users false/);
        assert.match(r, /\n💾 \*Último backup:\* nenhum\n\n🔕 Status diário desligado\./);
        assert.match(r, /\n\nℹ️ _Mais informações em \/bot -h_$/);
        // The same as -status (the time and the messages, which count the command itself, separately)
        const without = (t) => t.replace(/_\S{3} [\d/: ]+_/, '').replace(/· \d+ mensage[mn]s?/, '');
        assert.equal(without((await bot.replyAlt('/bot -s'))[0]), without(r));
    });

    test('-off e -on só ligam e desligam: os admins e os usuários ficam', async () => {
        await bot.setSetting('bot.admins', ['5521933333333']);
        await bot.setSetting('bot.users', ['5521911111111']);
        const [off] = await bot.replyAlt('/bot -off');
        assert.equal(bot.getSetting('bot.paused'), true);
        assert.match(off, /^⏸️ \*Bot:\* desligado/);
        await bot.replyAlt('/bot -on');
        assert.equal(bot.getSetting('bot.paused'), false);
        assert.deepEqual([bot.getSetting('bot.admins'), bot.getSetting('bot.users')], [['5521933333333'], ['5521911111111']]);
    });

    test('-info: avisa versão nova do yt-dlp (PyPI) e do whatsapp-web.js (release e commits no main)', async () => {
        const { compareVersions, cleanNews, versionNote } = bot.src('system');
        assert.equal(compareVersions('2026.08.19', '2026.8.19'), 0);
        assert.equal(compareVersions('2026.9.1', '2026.08.19'), 1);
        assert.equal(compareVersions('1.34.7', '1.35.0'), -1);
        assert.equal(versionNote('2026.08.19', '2026.8.19'), ' · ✅ a mais recente');
        assert.equal(versionNote('2026.08.19', '2026.9.30'), ' · ⬆️ *nova: 2026.9.30*');
        assert.equal(versionNote(null, '2026.9.30'), '', 'sem a instalada (não achou o binário): sem nota');

        const commit = packageJson.dependencies['whatsapp-web.js'].split('#')[1];
        cleanNews();
        bot.network.responder('get', 'pypi.org/pypi/yt-dlp/json', { info: { version: '2099.1.1' } });
        bot.network.responder('get', 'api.github.com/repos/wwebjs/whatsapp-web.js/releases/latest', { tag_name: 'v99.0.0' });
        bot.network.responder('get', `api.github.com/repos/wwebjs/whatsapp-web.js/compare/${commit}...main`, { ahead_by: 3 });
        const [r] = await bot.replyAlt('/bot -info');
        assert.match(r, /• whatsapp-web\.js: [\d.]+ \(commit [0-9a-f]{7}\) · ⬆️ \*nova: 99\.0\.0\* · ⬆️ 3 commits novos no main\n/);

        // Kept for 6 h: does not query again
        const calls = bot.network.calls.length;
        await bot.replyAlt('/bot -info');
        assert.equal(bot.network.calls.length, calls);

        // Down: no note (and no error)
        cleanNews();
        bot.network.clear();
        assert.match((await bot.replyAlt('/bot -i'))[0], /• whatsapp-web\.js: [\d.]+ \(commit [0-9a-f]{7}\)\n/);
        cleanNews();
    });

    test('-info (-i): versões do bot, dos programas e o sistema', async () => {
        for (const line of ['/bot -info', '/bot -i']) {
            const [r] = await bot.replyAlt(line);
            assert.match(r, new RegExp(`^ℹ️ \\*ZapBot ${escapeRegex(packageJson.version)}(?: \\(devel\\))?\\* · informações do sistema\n\n🤖 \\*Bot\\*\n`), line);
            assert.match(r, new RegExp(`• Node\\.js: ${escapeRegex(process.version)} \\(V8 `));
            assert.match(r, new RegExp(`• ZapBot: ${escapeRegex(packageJson.version)}(?: \\(devel\\))? \\(git\\+[0-9a-f]{7}/[\\w.-]+\\)\n`));
            assert.match(r, /• whatsapp-web\.js: [\d.]+ \(commit [0-9a-f]{7}\)\n/);
            assert.match(r, /• WhatsApp Web: _não encontrado_\n/);   // the simulated client has no getWWebVersion
            assert.match(r, /• SQLite: \d+\.\d+\.\d+\n/);
            assert.match(r, /🧰 \*Programas\*\n• Chromium: .+\n• yt-dlp: .+\n• ffmpeg: .+\n• ffprobe: .+\n• Python: .+\n• faster-whisper: .+\n• Piper: .+\n• Tesseract: .+\n• pdftotext: .+\n/);
            assert.match(r, /🖥️ \*Sistema\*\n• .+\n• Host: .+\n• CPU: \d+× .+ · carga [\d.]+ · [\d.]+ · [\d.]+\n• Memória: .+ de .+ em uso · o bot usa .+\n• No ar: sistema há .+ · bot há .+ \(PID \d+\)$/);
        }
        assert.match((await bot.replyAlt('/bot -i -on'))[0], /❌ O -info não combina com as outras opções/);
        assert.equal(bot.getSetting('bot.paused'), false);
    });

    test('-list-users e -list-users all combinam com -on/-off: -on -list-users all liga e mostra todos', async () => {
        await bot.setSetting('bot.paused', true);
        await bot.setSetting('bot.users', ['5521911111111', '5521977777777']);
        const [r] = await bot.replyAlt('/bot -on -list-users all');
        assert.equal(bot.getSetting('bot.paused'), false);
        assert.match(r, /^▶️ \*Bot:\* ativo\n[\s\S]*\n\n\*Usuários\* \(2\)\n/);
        assert.doesNotMatch(r, /fora daqui/);
        assert.match((await bot.replyAlt('/bot -on -lu'))[0], /\n\n\*Usuários\* \(1\) neste grupo\n/);
    });

    test('combinações inválidas mostram o uso', async () => {
        for (const line of ['/bot -on -off', '/bot +admin', '/bot -admin', '/bot xyz']) {
            assert.match((await bot.replyAlt(line))[0], /❌ Opção inválida para o \/bot/, line);
        }
    });
});

describe('/set', () => {
    test('sem argumento lista todas as chaves, em ordem', async () => {
        const [r] = await bot.replyAlt('/set');
        const keys = [...r.matchAll(/^([a-z][\w.]+)\s{2}/gm)].map(m => m[1]);
        assert.deepEqual(keys, [...keys].sort());
        assert.ok(keys.includes('show.max') && keys.includes('stocks.alert.max'));
    });

    test('<chave> mostra valor, padrão, tipo e limites', async () => {
        const [r] = await bot.replyAlt('/set show.max');
        assert.match(r, /\*Valor:\* 20\n\*Padrão:\* 20\n\*Tipo:\* number \(1\.\.100\)/);
    });

    test('<chave> <valor> altera; valor inválido é recusado', async () => {
        assert.deepEqual(await bot.replyAlt('/set show.max 10'), ['✅ *show.max* = 10']);
        assert.equal(bot.getSetting('show.max'), 10);
        assert.deepEqual(await bot.replyAlt('/set show.max 12'), ['✅ *show.max* = 12']);
        assert.equal(bot.getSetting('show.max'), 12);
        assert.match((await bot.replyAlt('/set show.max 500'))[0], /❌ Valor inválido para \*show.max\*: precisa estar entre 1 e 100/);
    });

    test('lista: itens separados por espaço; "" esvazia', async () => {
        assert.deepEqual(await bot.replyAlt('/set crypto.coins btc eth'), ['✅ *crypto.coins* = BTC, ETH']);
        assert.deepEqual(await bot.replyAlt('/set commands.disabled ""'), ['✅ *commands.disabled* = (vazio)']);
    });

    test('lista "uma por linha" (watch.rules) usa o texto cru', async () => {
        await bot.replyAlt('/set watch.rules oi, tudo bem\n/pix/i');
        assert.deepEqual(bot.getSetting('watch.rules'), ['oi, tudo bem', '/pix/i']);
        const [r] = await bot.replyAlt('/set watch.rules');
        assert.match(r, /\*Valor:\* \n1\. oi, tudo bem\n2\. \/pix\/i/);
    });

    test('segredo aparece mascarado', async () => {
        assert.deepEqual(await bot.replyAlt('/set gpt.api.key sk-abcdef123456'), ['✅ *gpt.api.key* = ••••3456']);
        assert.match((await bot.replyAlt('/set'))[0], /gpt\.api\.key\s+••••3456/);
    });

    test('config/.env: somente leitura, só no seu privado, com os segredos mascarados', async () => {
        process.env.OPENAI_API_KEY = 'sk-env-abcd1234';
        process.env.OPENAI_MODEL = 'gpt-4.1';
        try {
            const [private] = await bot.replyAlt('/set', { chat: bot.OWNER.jid });
            assert.match(private, /🔒 \*config\/\.env\* _\(somente leitura: mude no arquivo e recrie o container\)_\n\n```\n/);
            assert.match(private, /OPENAI_API_KEY\s+••••1234\n/);
            assert.match(private, /OPENAI_MODEL\s+gpt-4\.1\n/);
            assert.match(private, /PHONE_NUMBER\s+5521900000000\n/);
            assert.match(private, /GIPHY_API_KEY\s+\(vazio\)\n/);
            assert.doesNotMatch(private, /sk-env/);

            const [group] = await bot.replyAlt('/set');
            assert.match(group, /⚙️ \*SETTINGS\*/);
            assert.match(group, /🔒 _As variáveis do config\/\.env \(somente leitura\) aparecem só no seu privado\._$/);
            assert.doesNotMatch(group, /OPENAI_MODEL|PHONE_NUMBER/);

            assert.deepEqual(await bot.replyAlt('/set OPENAI_API_KEY', { chat: bot.OWNER.jid }), ['🔒 *OPENAI_API_KEY* = ••••1234\n_config/.env, somente leitura_']);
            assert.deepEqual(await bot.replyAlt('/set OPENAI_MODEL'), ['🔒 _As variáveis do config/.env (somente leitura) aparecem só no seu privado._']);
            assert.deepEqual(await bot.replyAlt('/set OPENAI_MODEL gpt-6-sol', { chat: bot.OWNER.jid }),
                ['❌ OPENAI_MODEL é do config/.env (somente leitura): mude no arquivo e recrie o container.']);
            assert.equal(process.env.OPENAI_MODEL, 'gpt-4.1');
        } finally {
            delete process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_MODEL;
        }
    });

    test('<trecho> ou /regex/ que não é uma chave: lista as que casam; nada casa: erro', async () => {
        const [r] = await bot.replyAlt('/set alert');
        assert.match(r, /^⚙️ \*SETTINGS\* com "alert" \(10\)\n\n```\ncrypto\.alert\.intervalMin  5\n\ncrypto\.alert\.max          20\n\ndefi\.alert\.intervalMin    10\n\nshow\.alert\.deleted        on\n\nshow\.alert\.edited         on\n\nshow\.alert\.reaction       on\n\nshow\.alert\.status         on\n\nstocks\.alert\.intervalMin  5\n\nstocks\.alert\.max          20\n\nzapbot\.email\.alerts       on\n```\n💡 _\/set <chave> para detalhes_$/);

        const keys = (textAlt) => [...textAlt.matchAll(/^([a-z][\w.]+)\s{2}/gm)].map(m => m[1]);
        assert.deepEqual(keys((await bot.replyAlt('/set GPT.'))[0]), ['gpt.admin.key', 'gpt.api.key', 'gpt.api.model', 'gpt.credit.since', 'gpt.credit.total', 'gpt.footer', 'gpt.gif.frameMs', 'gpt.gif.frames', 'gpt.image.gifModel', 'gpt.image.model', 'gpt.pricing', 'gpt.pricing.auto', 'gpt.pricing.updated', 'gpt.status', 'gpt.timeout.ms', 'gpt.transcribe.model', 'gpt.tts.instructions', 'gpt.tts.model', 'gpt.tts.speed', 'gpt.tts.voice']);
        assert.deepEqual(keys((await bot.replyAlt('/set /^show\\./'))[0]), ['show.alert.deleted', 'show.alert.edited', 'show.alert.reaction', 'show.alert.status', 'show.delayMs', 'show.max']);
        assert.deepEqual(keys((await bot.replyAlt('/set /max$/'))[0]).length > 3, true);

        assert.deepEqual(await bot.replyAlt('/set xyz'), ['❌ Nenhum setting com "xyz".\n💡 _Veja todos com /set_']);
        assert.deepEqual(await bot.replyAlt('/set /[/'), ['❌ Regex inválida: /[/']);

        // An exact key still shows the details; with a value, the snippet does not count
        assert.match((await bot.replyAlt('/set stocks.alert.max'))[0], /^⚙️ \*stocks\.alert\.max\*\n/);
        assert.match((await bot.replyAlt('/set alert 5'))[0], /❌ Setting desconhecido: alert/);
    });

    test('-append (-a) e -rm: acrescentam e tiram itens de uma lista; em outra chave, recusa e sugere o -reset', async () => {
        assert.deepEqual(await bot.replyAlt('/set -a commands.disabled noffa /ping'), ['✅ *commands.disabled* + /noffa, /ping\n= /noffa, /ping']);
        assert.deepEqual(await bot.replyAlt('/set -a commands.disabled walissu'), ['✅ *commands.disabled* + /walissu\n= /noffa, /ping, /walissu']);
        assert.deepEqual(await bot.replyAlt('/set -a commands.disabled noffa'), ['ℹ️ *commands.disabled* já tem /noffa.']);
        assert.deepEqual(await bot.replyAlt('/set -rm commands.disabled /ping'), ['✅ *commands.disabled* − /ping\n= /noffa, /walissu']);
        assert.match((await bot.replyAlt('/set -rm commands.disabled ping'))[0], /❌ \*commands\.disabled\* não tem \/ping/);
        assert.match((await bot.replyAlt('/set -a commands.disabled naoexiste'))[0], /❌ Valor inválido para \*commands\.disabled\*: comando desconhecido/);

        // watch.rules (one per line): the raw text, with spaces and commas
        assert.deepEqual(await bot.replyAlt('/set -a watch.rules oi, tudo bem'), ['✅ *watch.rules* + oi, tudo bem\n= oi, tudo bem']);

        assert.deepEqual(await bot.replyAlt('/set -a show.max 5'), [
            '❌ *show.max* não é uma lista: o -append vale só para chaves com várias entradas.\n' +
            '💡 _Troque o valor com /set show.max <valor> ou volte ao padrão com /set -r show.max._']);
        assert.match((await bot.replyAlt('/set -rm naoexiste x'))[0], /❌ Setting desconhecido: naoexiste/);
        assert.match((await bot.replyAlt('/set -a commands.disabled'))[0], /Informe o que acrescentar a \*commands\.disabled\*/);
    });

    test('-reset volta ao padrão; chave desconhecida', async () => {
        await bot.setSetting('show.max', 5);
        assert.deepEqual(await bot.replyAlt('/set -r show.max'), ['♻️ *show.max* = 20 _(padrão)_']);
        assert.match((await bot.replyAlt('/set -r naoexiste'))[0], /❌ Setting desconhecido: naoexiste/);
        assert.match((await bot.replyAlt('/set naoexiste 1'))[0], /❌ Setting desconhecido: naoexiste/);
        assert.match((await bot.replyAlt('/set naoexiste'))[0], /❌ Nenhum setting com "naoexiste"/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt('/set show.max 1', { de: OTHERAlt.jid }), []);
        assert.equal(bot.getSetting('show.max'), 20);
    });
});

describe('/bot -info: a versão do Piper (tts.py)', () => {
    test('vem do "tts.py --version": a versão do Piper, as vozes padrão e a versão do script', () => {
        const { describePiper } = bot.src('system');
        const voices = { pt: 'pt_BR-faber-medium', en: 'en_US-lessac-medium' };
        assert.equal(describePiper('{"wrapper": "2.0.0", "piper": "1.8.0"}', voices),
            '1.8.0 (vozes pt_BR-faber-medium, en_US-lessac-medium) · tts.py 2.0.0');
        assert.equal(describePiper(null, voices), null);
        assert.equal(describePiper('lixo', voices), null);
        assert.equal(describePiper('{"wrapper": "2.0.0"}', voices), null);
    });
});

describe('/bot -info: a versão do faster-whisper', () => {
    test('vem do "stt.py --version": a versão da API, o modelo e a versão do script', () => {
        const { describeWhisper } = bot.src('system');
        assert.equal(describeWhisper('{"wrapper": "1.0.0", "faster_whisper": "1.2.0"}', 'small'),
            '1.2.0 (modelo small) · stt.py 1.0.0');
        // Without the API installed (the script exits with an error and prints nothing) or with odd output: null
        assert.equal(describeWhisper(null, 'small'), null);
        assert.equal(describeWhisper('lixo', 'small'), null);
        assert.equal(describeWhisper('{"wrapper": "1.0.0"}', 'small'), null);
    });
});
