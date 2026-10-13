/*
 * Configuration: commands.json, settings, option parser, help and the
 * consistency between config, code and README (alphabetical order included).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { SETTINGS_SCHEMA, envOuSetting, getSetting, setSetting, loadSettings } = bot.src('settings');
const { GetOptFromCommand } = bot.src('options');
const { findCommand, formatCommandHelp, getCommandSyntax, activeCommands } = bot.src('commands/base');
const { HANDLERS } = bot.src('commands/index');

const CONFIG = JSON.parse(fs.readFileSync(path.join(bot.ROOT, 'src/commands/commands.json'), 'utf8'));
const README = fs.readFileSync(path.join(bot.ROOT, 'README.md'), 'utf8');

const sorted = (list) => [...list].sort((a, b) => a.localeCompare(b));

beforeEach(bot.restart);

describe('commands.json', () => {
    test('comandos em ordem alfabética', () => {
        const cmds = CONFIG.commands.map(c => c.cmd);
        assert.deepEqual(cmds, sorted(cmds));
    });

    test('todo comando tem handler e todo handler tem comando', () => {
        for (const c of CONFIG.commands) assert.equal(typeof HANDLERS[c.cmd], 'function', `${c.cmd} sem handler`);
        assert.deepEqual(sorted(Object.keys(HANDLERS)), sorted(CONFIG.commands.map(c => c.cmd)));
    });

    test('HANDLERS em ordem alfabética', () => {
        assert.deepEqual(Object.keys(HANDLERS), sorted(Object.keys(HANDLERS)));
    });

    test('nomes e aliases não se repetem e começam com /', () => {
        const names = CONFIG.commands.flatMap(c => [c.cmd, ...(c.aliases ?? [])]);
        assert.equal(new Set(names).size, names.length, 'nome ou alias repetido');
        for (const n of names) assert.match(n, /^\//);
    });

    test('toda opção tem desc; valores são listas', () => {
        for (const c of CONFIG.commands) {
            assert.ok(c.help, `${c.cmd} sem help`);
            assert.equal(typeof c.onlyAdmin, 'boolean', `${c.cmd} sem onlyAdmin`);
            for (const o of c.cmd_opts ?? []) {
                assert.ok(o.desc, `${c.cmd}: opção sem desc`);
                if (o.opts) assert.ok(Array.isArray(o.values), `${c.cmd} -${o.opts[0]}: values não é lista`);
            }
        }
    });

    test('nomes de opção não se repetem dentro de um comando', () => {
        for (const c of CONFIG.commands) {
            const names = (c.cmd_opts ?? []).flatMap(o => o.opts ?? []);
            assert.equal(new Set(names).size, names.length, `${c.cmd}: opção repetida (${names.join(', ')})`);
            assert.ok(!names.includes('help') && !names.includes('h'), `${c.cmd}: -help/-h são de todo comando`);
        }
    });

    test('comando "disabled" não é carregado', () => {
        const { withoutDisabled } = bot.src('botConfig');
        const { ativos: assets, desativados: disabled } = withoutDisabled([{ cmd: '/a' }, { cmd: '/b', disabled: true }, { cmd: '/c', disabled: false }]);
        assert.deepEqual([assets.map(c => c.cmd), disabled], [['/a', '/c'], ['/b']]);
        assert.ok(CONFIG.commands.filter(c => c.disabled).every(c => !findCommand(c.cmd)), 'nenhum desativado do config carrega');
    });
});

/*
 * Documentation: README.md and docs/ (the MkDocs site)
 */
const DOCS = path.join(bot.ROOT, 'docs');
const readDoc = (rel) => fs.readFileSync(path.join(DOCS, rel), 'utf8');

// All the .md files in docs/ (paths relative to docs/)
const pagesDocs = (dir = DOCS) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? pagesDocs(path.join(dir, e.name))
    : e.name.endsWith('.md') ? [path.relative(DOCS, path.join(dir, e.name))] : []);

// Without the code blocks: a bash "# comment" is not a heading
const withoutCode = (md) => md.replace(/^```[\s\S]*?^```/gm, '');

// Anchor as GitHub (and the pymdownx.slugs of mkdocs.yml) generates it: lowercase, no punctuation/emoji, space becomes a hyphen
const ancora = (title) => title.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const anchors = (md) => new Set([...withoutCode(md).matchAll(/^#{1,6} (.+)$/gm)].map(m => ancora(m[1])));

// Rows "| `/cmd` ..." or "| [`/cmd`](cmd.md) ..." of the table that comes after `titulo`
function commandsTable(md, title) {
    const ini = md.indexOf(title);
    assert.ok(ini >= 0, `sem a seção ${title}`);
    const linesAlt = md.slice(ini).split('\n').slice(1);
    const table = [];
    for (const l of linesAlt) {
        if (/^\| (\[)?`\//.test(l)) table.push(l);
        else if (table.length) break;
    }
    return table.map(l => ({ linha: l, cmd: l.match(/`(\/[a-z]+)`/)[1], colunas: l.split('|') }));
}

function checkSummary(md, title, whereAlt, { comLinks: withLinks }) {
    const linesAlt = commandsTable(md, title);
    const names = linesAlt.map(l => l.cmd);

    // Includes the disabled ones ("disabled": true): they have a page too
    assert.deepEqual(names, sorted(names), `${whereAlt}: Resumo fora de ordem`);
    assert.deepEqual(sorted(names), sorted(CONFIG.commands.map(c => c.cmd)), `${whereAlt}: Resumo diferente do config`);

    for (const c of CONFIG.commands) {
        const { linha: line, colunas: columns } = linesAlt.find(l => l.cmd === c.cmd);
        const aliases = [...columns[2].matchAll(/`([^`]+)`/g)].map(m => m[1]);
        assert.deepEqual(aliases, c.aliases ?? [], `${whereAlt}: aliases de ${c.cmd} no Resumo`);
        assert.equal(columns[3].includes('✅'), c.onlyAdmin, `${whereAlt}: coluna Admin de ${c.cmd}`);
        if (withLinks) assert.ok(line.includes(`](${c.cmd.slice(1)}.md)`), `${whereAlt}: ${c.cmd} sem link para a página`);
    }
}

describe('documentação', () => {
    test('tabelas Markdown mantêm o número de colunas e escapam pipes nos valores', () => {
        for (const fileAlt of ['README.md', ...pagesDocs().map(f => `docs/${f}`)]) {
            const linesAlt = withoutCode(fs.readFileSync(path.join(bot.ROOT, fileAlt), 'utf8'))
                .split('\n');
            let columns = null;
            for (const [i, line] of linesAlt.entries()) {
                if (!line.startsWith('|')) {
                    columns = null;
                    continue;
                }
                const amount = line.split(/(?<!\\)\|/).length;
                columns ??= amount;
                assert.equal(amount, columns, `${fileAlt}:${i + 1}: tabela desalinhada`);
            }
        }
    });

    test('settings numéricos: padrões e intervalos documentados seguem o schema', () => {
        const linesAlt = readDoc('settings.md').split('\n');
        for (const [keyAlt, schema] of Object.entries(SETTINGS_SCHEMA)) {
            if (schema.type !== 'number') continue;
            const line = linesAlt.find(l => l.startsWith(`| \`${keyAlt}\` |`));
            const columns = line.split('|').map(c => c.trim());
            assert.equal(columns[2], `${schema.min}–${schema.max}`, `${keyAlt}: intervalo`);
            assert.equal(columns[3], `\`${schema.default}\``, `${keyAlt}: padrão`);
        }
    });

    test('uma página por comando, com o título igual ao config (aliases e "· admin")', () => {
        for (const c of CONFIG.commands) {
            const fileAlt = `commands/${c.cmd.slice(1)}.md`;
            assert.ok(fs.existsSync(path.join(DOCS, fileAlt)), `sem a página docs/${fileAlt}`);

            const title = readDoc(fileAlt).split('\n')[0];
            assert.ok(title.startsWith(`# \`${c.cmd}\``), `docs/${fileAlt}: o título não começa com ${c.cmd}`);
            const aliases = [...title.matchAll(/`(\/[^`]+)`/g)].map(m => m[1]).slice(1);
            assert.deepEqual(aliases, c.aliases ?? [], `docs/${fileAlt}: aliases no título`);
            assert.equal(title.includes('· admin'), c.onlyAdmin, `docs/${fileAlt}: "· admin" no título`);
        }

        const extras = pagesDocs(path.join(DOCS, 'commands')).map(f => `/${path.basename(f, '.md')}`)
            .filter(n => n !== '/index' && !CONFIG.commands.some(c => c.cmd === n));
        assert.deepEqual(extras, [], 'página de comando que não está no config');
    });

    test('a tabela de opções de cada página tem as mesmas opções do commands.json', () => {
        for (const c of CONFIG.commands) {
            const fileAlt = `commands/${c.cmd.slice(1)}.md`;
            const doConfig = new Set((c.cmd_opts ?? []).flatMap(o => o.opts ?? []));

            // 1st column of the tables: "| `-name`, `-n` |" (the argument rows, like `<url>` or `-N`, are left out)
            const pageAlt = new Set();
            for (const line of withoutCode(readDoc(fileAlt)).split('\n')) {
                const m = line.match(/^\| ((?:`[-+][^`]+`(?:, )?)+) \|/);
                if (m) for (const [, op] of m[1].matchAll(/`[-+]([^`]+)`/g)) if (op !== 'N') pageAlt.add(op);
            }

            assert.deepEqual([...pageAlt].filter(o => !doConfig.has(o)), [], `docs/${fileAlt}: opção que não está no config`);
            assert.deepEqual([...doConfig].filter(o => !pageAlt.has(o)), [], `docs/${fileAlt}: opção do config sem linha na tabela`);
        }
    });

    test('tabela Resumo do site e do README: todos os comandos, em ordem, iguais ao config', () => {
        checkSummary(readDoc('commands/index.md'), '## Resumo', 'docs/commands/index.md', { comLinks: true });
        checkSummary(README, '## Comandos', 'README.md', { comLinks: false });
    });

    test('menu do mkdocs.yml: todas as páginas, comandos em ordem alfabética', () => {
        const yml = fs.readFileSync(path.join(bot.ROOT, 'mkdocs.yml'), 'utf8');
        const inMenu = [...yml.slice(yml.indexOf('\nnav:')).matchAll(/([\w/]+\.md)\s*$/gm)].map(m => m[1]);

        assert.deepEqual(sorted(inMenu), sorted(pagesDocs()), 'página fora do menu (ou menu com página inexistente)');
        const commands = inMenu.filter(p => p.startsWith('commands/') && p !== 'commands/index.md');
        assert.deepEqual(commands, sorted(commands), 'comandos fora de ordem no menu');
    });

    test('tabela de settings: as chaves do SETTINGS_SCHEMA, em ordem', () => {
        const keys = withoutCode(readDoc('settings.md')).split('\n')
            .filter(l => /^\| `[a-z]/.test(l)).map(l => l.split('`')[1]);
        assert.deepEqual(keys, Object.keys(SETTINGS_SCHEMA));
    });

    test('nenhum link entre os .md quebrado (arquivo e âncora), no docs/ e no README', () => {
        const files = [...pagesDocs().map(f => path.join(DOCS, f)), path.join(bot.ROOT, 'README.md')];
        let total = 0;

        for (const fileAlt of files) {
            const md = fs.readFileSync(fileAlt, 'utf8');
            for (const [, target] of withoutCode(md).matchAll(/\]\(([^)\s]+)\)/g)) {
                if (/^(https?:|mailto:)/.test(target)) continue;
                total++;

                const [pathAlt, anc] = target.split('#');
                const destination = pathAlt ? path.resolve(path.dirname(fileAlt), pathAlt) : fileAlt;
                const whereAlt = `${path.relative(bot.ROOT, fileAlt)} → ${target}`;

                assert.ok(fs.existsSync(destination), `link quebrado (arquivo): ${whereAlt}`);
                if (anc && destination.endsWith('.md')) {
                    assert.ok(anchors(fs.readFileSync(destination, 'utf8')).has(decodeURIComponent(anc)), `link quebrado (âncora): ${whereAlt}`);
                }
            }
        }
        assert.ok(total > 50, `poucos links conferidos (${total})`);
    });

    test('instalação e README: a versão estável é uma release com data, até a do package.json (a seguinte só no bump.sh)', () => {
        const { version } = require('../package.json');
        const numbers = (v) => v.split('.').map(Number);
        const [x, y] = numbers(version);

        const m = readDoc('installation.md').match(/`release-(\d+\.\d+)` \(de \d{2}\/\d{2}\/\d{4}\)/);
        assert.ok(m, 'installation.md: sem "vX.Y.Z (de DD/MM/AAAA)"');
        const [ex, ey] = numbers(m[1]);
        assert.ok(ex < x || (ex === x && ey <= y), `a estável (${m[1]}) passa da versão do package.json (${version})`);

        assert.match(README, new RegExp(`hoje a \`release-${m[1].replace('.', '\\.')}\``));
        assert.match(README, new RegExp(`git checkout release-${m[1].replace('.', '\\.')}\n`));
    });

    test('nenhum título repetido na mesma página (a âncora ficaria ambígua), no docs/ e no README', () => {
        const files = [...pagesDocs().map(f => `docs/${f}`), 'README.md'];
        for (const fileAlt of files) {
            const titles = [...withoutCode(fs.readFileSync(path.join(bot.ROOT, fileAlt), 'utf8')).matchAll(/^#{1,6} (.+)$/gm)]
                .map(m => ancora(m[1]));
            const repeated = titles.filter((t, i) => titles.indexOf(t) !== i);
            assert.deepEqual(repeated, [], `${fileAlt}: título repetido`);
        }
    });

    test('links para o site (jpereira.github.io/zapbot) apontam para páginas e âncoras do docs/', () => {
        const SITE = /https:\/\/jpereira\.github\.io\/zapbot\/([^)\s"'`]*)/g;
        const files = ['README.md', 'SECURITY.md', 'src/commands/commands.json', ...pagesDocs().map(f => `docs/${f}`)];
        let total = 0;

        for (const fileAlt of files) {
            for (const [, url] of fs.readFileSync(path.join(bot.ROOT, fileAlt), 'utf8').matchAll(SITE)) {
                total++;
                // "comandos/show/" → docs/comandos/show.md; "comandos/" → docs/comandos/index.md; "" → docs/index.md
                const [pathAlt, anc] = url.split('#');
                const page = pathAlt.replace(/\/$/, '');
                const md = [`${page}.md`, `${page ? `${page}/` : ''}index.md`].find(f => fs.existsSync(path.join(DOCS, f)));

                assert.ok(md, `${fileAlt}: página do site não existe: ${url}`);
                if (anc) assert.ok(anchors(readDoc(md)).has(decodeURIComponent(anc)), `${fileAlt}: âncora não existe: ${url}`);
            }
        }
        assert.ok(total > 40, `poucos links para o site (${total})`);
    });
});

describe('SETTINGS_SCHEMA', () => {
    test('chaves em ordem alfabética', () => {
        const keys = Object.keys(SETTINGS_SCHEMA);
        assert.deepEqual(keys, sorted(keys));
    });

    test('todo padrão passa na própria validação', async () => {
        for (const [keyAlt, s] of Object.entries(SETTINGS_SCHEMA)) {
            assert.ok(s.desc, `${keyAlt} sem desc`);
            assert.deepEqual(await setSetting(keyAlt, s.default), s.default, keyAlt);
        }
    });
});

describe('settings', () => {
    test('boolean aceita on/off e sinônimos', async () => {
        for (const v of ['on', 'true', '1', 'sim', 'yes']) assert.equal(await setSetting('show.alert.edited', v), true);
        for (const v of ['off', 'false', '0', 'nao', 'não', 'no']) assert.equal(await setSetting('show.alert.edited', v), false);
        await assert.rejects(setSetting('show.alert.edited', 'talvez'), /use on\|off/);
    });

    test('number: inteiro dentro dos limites', async () => {
        assert.equal(await setSetting('show.max', '10'), 10);
        await assert.rejects(setSetting('show.max', '0'), /entre 1 e 100/);
        await assert.rejects(setSetting('show.max', '101'), /entre 1 e 100/);
        await assert.rejects(setSetting('show.max', '1.5'), /inteiro/);
        await assert.rejects(setSetting('show.max', ''), /inteiro/);
    });

    test('string: 1 a 100 caracteres; allowEmpty aceita vazio', async () => {
        assert.equal(await setSetting('tempo.city', '  Recife  '), 'Recife');
        await assert.rejects(setSetting('tempo.city', ''), /1 a 100/);
        await assert.rejects(setSetting('tempo.city', 'x'.repeat(101)), /1 a 100/);
        assert.equal(await setSetting('openai.api.key', ''), '');
    });

    test('list: separa por vírgula/espaço, normaliza e tira repetidos', async () => {
        assert.deepEqual(await setSetting('crypto.coins', 'btc, ethusdt ETH'), ['BTC', 'ETH']);
        await assert.rejects(setSetting('crypto.coins', 'XYZ'), /não suportada: XYZ/);
        assert.deepEqual(await setSetting('cotacao.coins', 'usd eur'), ['USD', 'EUR']);
        await assert.rejects(setSetting('cotacao.coins', 'BRL'), /não suportada: BRL/);
    });

    test('commands.disabled: aceita nome ou alias, recusa o /set', async () => {
        assert.deepEqual(await setSetting('commands.disabled', 'noffa /p'), ['/noffa', '/ping']);
        // A value saved under the old name (/ualisu, today an alias) becomes the current name
        assert.deepEqual(await setSetting('commands.disabled', ['/ualisu']), ['/walissu']);
        await assert.rejects(setSetting('commands.disabled', 'set'), /não pode ser desativado/);
        await assert.rejects(setSetting('commands.disabled', 'naoexiste'), /desconhecido/);
    });

    test('watch.rules: uma por linha (com espaços e vírgulas)', async () => {
        assert.deepEqual(await setSetting('watch.rules', 'oi, tudo bem\n/pix|boleto/i'), ['oi, tudo bem', '/pix|boleto/i']);
        await assert.rejects(setSetting('watch.rules', '/[/'), /regex inválida/);
    });

    test('news.*: só URLs http(s)', async () => {
        assert.deepEqual(await setSetting('news.g1', 'https://a.com/rss'), ['https://a.com/rss']);
        await assert.rejects(setSetting('news.g1', 'ftp://a.com/rss'), /URL inválida/);
    });

    test('valor gravado sobrevive a um recarregamento', async () => {
        await setSetting('show.max', 7);
        await loadSettings();
        assert.equal(getSetting('show.max'), 7);
    });

    test('valor inválido no banco vale o padrão (com erro no log)', async () => {
        await bot.dbRun("UPDATE settings SET value = '999' WHERE key = 'show.max'");
        await setSetting('show.max', 20);
        await bot.dbRun("UPDATE settings SET value = '999' WHERE key = 'show.max'");
        await loadSettings();
        assert.equal(getSetting('show.max'), 20);
        assert.ok(bot.errorsInLog().some(l => l.includes("Setting 'show.max' inválido")));
    });

    test('lista no banco com item que deixou de existir: fica com os outros; comando renomeado vira o novo', async () => {
        // A 1.8.0 bot with /status (today /bot -status) and /agendar (today /cron) disabled
        await bot.dbRun("UPDATE settings SET value = ? WHERE key = 'commands.disabled'", [JSON.stringify(['/walissu', '/status', '/agendar'])]);
        await loadSettings();
        assert.deepEqual(getSetting('commands.disabled'), ['/walissu', '/cron']);
        assert.ok(bot.errorsInLog().some(l => l.includes("Setting 'commands.disabled' com item inválido")));
    });

    test('settings renomeados: o valor antigo vai para o novo (se ele está no padrão) e o antigo sai', async () => {
        // A 1.8.0/2.0.0 bot: the old names with your values; the new ones, created with the default
        const save = (key, value) => bot.dbRun(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
        await save('resumo.maxMsgs', 50);
        await save('edit.alert', false);
        await save('show.revoke.status', false);
        await save('stats.enabled', true);
        await save('stats.enable', false);     // already changed to the new name (the default is on): the new one stays
        await save('show.max', 20);

        await loadSettings();
        assert.equal(getSetting('tldr.maxMsgs'), 50);
        assert.equal(getSetting('show.alert.edited'), false);
        assert.equal(getSetting('show.alert.status'), false);
        assert.equal(getSetting('stats.enable'), false);

        const old = await bot.dbAll("SELECT key FROM settings WHERE key IN ('resumo.maxMsgs', 'edit.alert', 'show.revoke.status', 'stats.enabled')");
        assert.deepEqual(old, []);
        assert.ok(bot.logs.some(l => l.includes("Setting 'resumo.maxMsgs' renomeado para 'tldr.maxMsgs': o valor salvo foi mantido")));
    });

    test('envOuSetting: .env vence; .env inválido cai no setting', async () => {
        await setSetting('openai.timeout.ms', 60000);
        process.env.OPENAI_TIMEOUT_MS = '9000';
        assert.equal(envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'), 9000);
        process.env.OPENAI_TIMEOUT_MS = 'abc';
        assert.equal(envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'), 60000);
        delete process.env.OPENAI_TIMEOUT_MS;
        assert.equal(envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'), 60000);
    });
});

describe('parser de opções', () => {
    const cmd = (nameAlt) => CONFIG.commands.find(c => c.cmd === nameAlt);

    test('opção booleana, com valor e argumentos soltos', () => {
        const o = GetOptFromCommand('-a -ss 10 https://x.com', cmd('/get'));
        assert.equal(o.opt.audio, true);
        assert.equal(o.opt.startSec, '10');
        assert.deepEqual(o.argv, ['https://x.com']);
        assert.ok(!Object.hasOwn(o.opt, 'argv'));
        assert.ok(o.given.has('audio') && o.given.has('startSec'));
    });

    test('opção com valor sem valor: null, mas presente em given', () => {
        const o = GetOptFromCommand('-q', cmd('/show'));
        assert.equal(o.opt.query, null);
        assert.ok(o.given.has('query'));
    });

    test('opção desconhecida e número negativo vão para argv', () => {
        assert.deepEqual(GetOptFromCommand('-3 -xyz', cmd('/show')).argv, ['-3', '-xyz']);
    });

    test('aspas agrupam', () => {
        assert.deepEqual(GetOptFromCommand('"a b" \'c d\'', cmd('/noffa')).argv, ['a b', 'c d']);
        // The 1st argument may start with "/" (a regex, a text): it is not the command
        assert.deepEqual(GetOptFromCommand('/^show\\./ x', cmd('/set')).argv, ['/^show\\./', 'x']);
    });

    test('barras preservam nomes, regex com espaços, escapes e flags sem virar opções', () => {
        const args = '/Jorge Pereira/ /foo -h bar/i /[ /] caminho\\/arquivo/gi -3';
        assert.deepEqual(GetOptFromCommand(args, cmd('/show')).argv, [
            '/Jorge Pereira/', '/foo -h bar/i', '/[ /] caminho\\/arquivo/gi', '-3'
        ]);
        assert.equal(GetOptFromCommand(args, cmd('/show')).opt.help, false);
        assert.deepEqual(GetOptFromCommand('/tmp/arquivo https://x.com/a/b', cmd('/get')).argv,
            ['/tmp/arquivo', 'https://x.com/a/b']);
    });

    test('opções dentro de aspas são valores ou argumentos, inclusive vazios', () => {
        const o = GetOptFromCommand('-msg "-h" \'-help\' ""', cmd('/crypto'));
        assert.equal(o.opt.msg, '-h');
        assert.equal(o.opt.help, false);
        assert.deepEqual(o.argv, ['-help', '']);
    });

    test('valor com aspas escapadas fica inteiro', () => {
        const o = GetOptFromCommand('-msg "ele disse \\"oi\\" hoje"', cmd('/crypto'));
        assert.equal(o.opt.msg, 'ele disse \\"oi\\" hoje');
        assert.deepEqual(o.argv, []);
    });

    test('opções com múltiplos valores preservam grupos e param na próxima opção', () => {
        const config = { cmd_opts: [
            { opts: ['intervalo', 'i'], values: ['inicio', 'fim'] },
            { opts: ['ativo', 'a'], values: [] }
        ] };
        const o = GetOptFromCommand('-i "um dois" \'-3\' -a solto', config);
        assert.deepEqual(o.opt.intervalo, ['um dois', '-3']);
        assert.equal(o.opt.ativo, true);
        assert.deepEqual(o.argv, ['solto']);
        assert.deepEqual([...o.given], ['intervalo', 'ativo']);
        assert.deepEqual(GetOptFromCommand('-i inicio -a', config).opt.intervalo, ['inicio']);
    });

    test('-h e -help em qualquer comando', () => {
        assert.equal(GetOptFromCommand('-h', cmd('/ping')).opt.help, true);
        assert.equal(GetOptFromCommand('-help', cmd('/ping')).opt.help, true);
    });
});

describe('ajuda', () => {
    test('todos os comandos ativos e aliases aceitam -h e -help com a mesma ajuda', async () => {
        for (const command of activeCommands()) {
            const expected = '```' + formatCommandHelp(command) + '```';
            for (const nameAlt of [command.cmd, ...(command.aliases ?? [])]) {
                for (const flag of ['-h', '-help']) {
                    assert.deepEqual(await bot.replyAlt(`${nameAlt} ${flag}`), [expected],
                        `${nameAlt} ${flag}`);
                }
            }
        }
    });

    test('ajuda mostra os títulos em português e as flags universais', () => {
        const textAlt = formatCommandHelp(findCommand('/get'));
        assert.match(textAlt, /^Uso:/);
        assert.match(textAlt, /\nOpções:\n/);
        assert.match(textAlt, /\nArgumentos:\n/);
        assert.match(textAlt, /\nAjuda: -help, -h\n/);
        assert.doesNotMatch(textAlt, /Usage:|Options:|Arguments:|\[OPTION\]/);
    });

    test('formatCommandHelp traz uso, opções, argumentos e aliases', () => {
        const textAlt = formatCommandHelp(findCommand('/show'));
        assert.match(textAlt, /^Uso: \/show \[-N\] \[OPÇÃO\]/);
        assert.match(textAlt, /-query, -q <texto\|\/regex\/flags>/);
        assert.match(textAlt, /Argumentos:\n  -N/);
        assert.match(textAlt, /Aliases: \/s$/);
    });

    test('as formas do uso ("  ou  ") saem uma por linha, alinhadas', () => {
        const textAlt = formatCommandHelp(findCommand('/defi'));
        const linesAlt = textAlt.split('\n');
        assert.equal(linesAlt[0], 'Uso: /defi [orca|prjx|liquidswap|morpho|aave] [-mask]');
        assert.equal(linesAlt[1], '     /defi -l');
        assert.equal(linesAlt[3], '     /defi [protocolo] -taxas [-alerta]');
        assert.equal(linesAlt[5], '     /defi <protocolo> <opções>');
        assert.doesNotMatch(textAlt, / {2}ou {2}/);
    });

    test('ajuda por protocolo: a geral agrupa as opções; a de um protocolo só traz as dele', async () => {
        const general = formatCommandHelp(findCommand('/defi'));
        const groups = general.split('\n').filter(l => l.startsWith(' > '));
        assert.deepEqual(groups, [' > Orca', ' > Aave', ' > Orca e Project X', ' > Project X, Liquidswap, Morpho e Aave', ' > Todos']);
        assert.match(general, / > Orca\n {2}-address <endereço> +Cadastra a posição da Orca/);

        const morpho = formatCommandHelp(findCommand('/defi'), { protocolo: 'morpho' });
        assert.match(morpho, /^Uso: \/defi morpho \[-mask\]\n {5}\/defi morpho -wallet <0x\.\.\.> \[-name <nome>\]\nPosição, empréstimos e risco no Morpho/);
        const optionsAlt = morpho.match(/^ {2}-\S+/gm);
        assert.deepEqual(optionsAlt, ['  -list,', '  -mask,', '  -name,', '  -rm', '  -wallet,']);
        assert.doesNotMatch(morpho, / > |Argumentos:/);

        const orca = formatCommandHelp(findCommand('/defi'), { protocolo: 'orca' });
        assert.match(orca, /-address <endereço>/);
        assert.doesNotMatch(orca, /^ {2}-wallet/m);

        // By the command's -help and by /help
        assert.equal((await bot.replyAlt('/defi prjx -help'))[0], '```' + formatCommandHelp(findCommand('/defi'), { protocolo: 'prjx' }) + '```');
        assert.match((await bot.replyAlt('/help defi orca'))[0], /^🤖 \*AJUDA\*\n\n```Uso: \/defi orca \[-mask\]\n/);
        assert.match((await bot.replyAlt('/defi xyz -help'))[0], /^```Uso: \/defi \[orca\|prjx\|liquidswap\|morpho\|aave\]/, 'protocolo desconhecido: a geral');

        // The protocol alias also finds its help
        const liquidswap = '```' + formatCommandHelp(findCommand('/defi'), { protocolo: 'liquidswap' }) + '```';
        assert.match(liquidswap, /^```Uso: \/defi liquidswap\|liqswp \[-mask\]/);
        assert.equal((await bot.replyAlt('/defi liqswp -help'))[0], liquidswap);
        assert.match((await bot.replyAlt('/help defi liqswp'))[0], /```Uso: \/defi liquidswap\|liqswp/);
    });

    test('ajuda para o celular: uma frase por linha e o "Ex:" na linha de baixo, um exemplo por linha', () => {
        // In the command text: the sentences and the Ex: start at column 0
        const cron = formatCommandHelp(findCommand('/cron')).split('\n');
        assert.match(cron[2], /^Na hora marcada, .* \(-pv\)\.$/);
        assert.match(cron[3], /^No texto, \{\/comando args\} roda/);
        assert.equal(cron[4], 'O \\n digitado vira quebra de linha.');
        assert.equal(cron[5], 'Ex: /cron 09h -r diario -to /Família/ Bom dia! {/crypto BTC}');
        assert.equal(cron[6], '    /cron 8h -r diario Orca {/defi orca}\\n Prjx {/defi prjx}');

        // In the options: the 1st sentence beside; the others and the Ex:, indented 4 spaces
        const linesAlt = formatCommandHelp(findCommand('/defi')).split('\n');
        const i = linesAlt.findIndex(l => l.startsWith('  [orca|prjx|liquidswap|morpho|aave]'));
        assert.match(linesAlt[i], /ou aave \(Aave V3\)\.$/);
        assert.match(linesAlt[i + 1], /^ {4}Sozinho, mostra/);
        assert.equal(linesAlt[i + 2], '    Ex: /defi');
        assert.equal(linesAlt[i + 3], '        /defi orca');
        assert.equal(linesAlt[i + 4], '        /defi liqswp');
        assert.equal(linesAlt[i + 5], '        /defi aave');

        // A single example also goes to the line below; "Paris, Texas" is one example, not two
        assert.match(formatCommandHelp(findCommand('/tempo')), /\n {4}Ex: \/tempo Paris, Texas\n/);
    });

    test('${CACHE_DIR}, ${MEDIA_DIR} e ${TMP_DIR} viram os caminhos reais na ajuda', () => {
        const { CACHE_DIR, MEDIA_DIR } = bot.src('constants');
        const help = getCommandSyntax('/cache');
        assert.ok(help.includes(`Exibe o espaço ocupado em ${CACHE_DIR} e limpa o cache.`), help);
        assert.ok(help.includes(`mídias baixadas em ${MEDIA_DIR}`));
        assert.doesNotMatch(help, /\$\{/);

        const { interpolar } = bot.src('commands/base');
        assert.equal(interpolar('em ${TMP_DIR}, ${NAO_EXISTE}'), `em ${bot.src('constants').TMP_DIR}, \${NAO_EXISTE}`);
    });

    test('ajuda de todos os comandos e protocolos resolve variáveis e mantém o recuo', () => {
        for (const command of activeCommands()) {
            for (const protocol of [undefined, ...Object.keys(command.protocolos ?? {})]) {
                const textAlt = formatCommandHelp(command, { protocolo: protocol });
                const whereAlt = `${command.cmd} ${protocol ?? ''}`;
                assert.doesNotMatch(textAlt, /\t|\$\{|[ \t]+$/m, whereAlt);
                assert.match(textAlt, /\nAjuda: -help, -h(?:\n|$)/, whereAlt);
                if (!protocol) continue;
                for (const optionAlt of command.cmd_opts.filter(o => o.opts)) {
                    const presente = !optionAlt.protocolos || optionAlt.protocolos.includes(protocol);
                    const syntax = `  -${optionAlt.opts[0]}`;
                    assert.equal(textAlt.split('\n').some(l => l.startsWith(`${syntax} `)
                        || l.startsWith(`${syntax},`)), presente, `${whereAlt}: ${syntax}`);
                }
            }
        }
    });

    test('getCommandSyntax de comando inexistente é null', () => {
        assert.equal(getCommandSyntax('/naoexiste'), null);
    });

    test('commands.disabled tira o comando da busca e da lista', async () => {
        await setSetting('commands.disabled', 'noffa');
        assert.equal(findCommand('/noffa'), undefined);
        assert.ok(!activeCommands().some(c => c.cmd === '/noffa'));
    });
});

describe('banco', () => {
    test('adicionarColunas: cria só as que faltam numa tabela de uma versão anterior', async () => {
        const { addColumns } = bot.src('initialization');
        await bot.prepare();
        await bot.dbRun('DROP TABLE IF EXISTS teste_antiga');
        await bot.dbRun('CREATE TABLE teste_antiga (id INTEGER PRIMARY KEY, nome TEXT)');
        await bot.dbRun("INSERT INTO teste_antiga (nome) VALUES ('antes')");

        await addColumns('teste_antiga', { nome: 'TEXT', extra: 'INTEGER DEFAULT 7' });
        await addColumns('teste_antiga', { extra: 'INTEGER DEFAULT 7' }); // again: does nothing

        assert.deepEqual(await bot.dbAll('SELECT * FROM teste_antiga'), [{ id: 1, nome: 'antes', extra: 7 }]);
        await bot.dbRun('DROP TABLE teste_antiga');
    });

    test('defi_positions antiga (position): vira address (Orca) e wallet (carteiras), com o alerta', async () => {
        const { initializeDb } = bot.src('initialization');
        await bot.prepare();
        await bot.dbRun('DROP TABLE defi_positions');
        await bot.dbRun(`CREATE TABLE defi_positions (id INTEGER PRIMARY KEY AUTOINCREMENT, protocol TEXT NOT NULL,
            position TEXT NOT NULL UNIQUE, nft TEXT, pool TEXT, created_at INTEGER NOT NULL,
            alert INTEGER DEFAULT 0, alert_fees REAL, in_range INTEGER)`);
        await bot.dbRun(`INSERT INTO defi_positions (protocol, position, nft, pool, created_at, alert, alert_fees, in_range)
            VALUES ('orca', 'ime1', '9UkH', 'J7Hz', 1, 1, 2000, 1), ('prjx', '0x12', NULL, NULL, 2, 0, NULL, NULL)`);

        await initializeDb();

        assert.deepEqual(await bot.dbAll('SELECT id, protocol, address, wallet, nft, pool, alert, alert_fees, in_range FROM defi_positions ORDER BY id'), [
            { id: 1, protocol: 'orca', address: 'ime1', wallet: null, nft: '9UkH', pool: 'J7Hz', alert: 1, alert_fees: 2000, in_range: 1 },
            { id: 2, protocol: 'prjx', address: null, wallet: '0x12', nft: null, pool: null, alert: 0, alert_fees: null, in_range: null }
        ]);
        assert.ok(!(await bot.dbAll('PRAGMA table_info(defi_positions)')).some(c => c.name === 'position'));

        // The same wallet in two protocols
        await bot.dbRun("INSERT INTO defi_positions (protocol, wallet, created_at) VALUES ('morpho', '0x12', 3)");
        await bot.dbRun('DELETE FROM defi_positions');
    });
});
