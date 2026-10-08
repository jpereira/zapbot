/*
 * Configuração: comandos.json, settings, parser de opções, ajuda e a
 * coerência entre config, código e README (ordem alfabética incluída).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { SETTINGS_SCHEMA, envOuSetting, getSetting, setSetting, carregarSettings } = bot.src('settings');
const { GetOptFromCommand } = bot.src('opcoes');
const { findCommand, formatCommandHelp, getCommandSyntax, activeCommands } = bot.src('comandos/base');
const { HANDLERS } = bot.src('comandos/index');

const CONFIG = JSON.parse(fs.readFileSync(path.join(bot.RAIZ, 'src/comandos/comandos.json'), 'utf8'));
const README = fs.readFileSync(path.join(bot.RAIZ, 'README.md'), 'utf8');

const ordenado = (lista) => [...lista].sort((a, b) => a.localeCompare(b));

beforeEach(bot.reiniciar);

describe('comandos.json', () => {
    test('comandos em ordem alfabética', () => {
        const cmds = CONFIG.commands.map(c => c.cmd);
        assert.deepEqual(cmds, ordenado(cmds));
    });

    test('todo comando tem handler e todo handler tem comando', () => {
        for (const c of CONFIG.commands) assert.equal(typeof HANDLERS[c.cmd], 'function', `${c.cmd} sem handler`);
        assert.deepEqual(ordenado(Object.keys(HANDLERS)), ordenado(CONFIG.commands.map(c => c.cmd)));
    });

    test('HANDLERS em ordem alfabética', () => {
        assert.deepEqual(Object.keys(HANDLERS), ordenado(Object.keys(HANDLERS)));
    });

    test('nomes e aliases não se repetem e começam com /', () => {
        const nomes = CONFIG.commands.flatMap(c => [c.cmd, ...(c.aliases ?? [])]);
        assert.equal(new Set(nomes).size, nomes.length, 'nome ou alias repetido');
        for (const n of nomes) assert.match(n, /^\//);
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
            const nomes = (c.cmd_opts ?? []).flatMap(o => o.opts ?? []);
            assert.equal(new Set(nomes).size, nomes.length, `${c.cmd}: opção repetida (${nomes.join(', ')})`);
            assert.ok(!nomes.includes('help') && !nomes.includes('h'), `${c.cmd}: -help/-h são de todo comando`);
        }
    });

    test('comando "disabled" não é carregado (/monitor)', () => {
        assert.equal(CONFIG.commands.find(c => c.cmd === '/monitor').disabled, true);
        assert.equal(findCommand('/monitor'), undefined);
    });
});

/*
 * Documentação: README.md e docs/ (o site do MkDocs)
 */
const DOCS = path.join(bot.RAIZ, 'docs');
const lerDoc = (rel) => fs.readFileSync(path.join(DOCS, rel), 'utf8');

// Todos os .md do docs/ (caminhos relativos a docs/)
const paginasDocs = (dir = DOCS) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? paginasDocs(path.join(dir, e.name))
    : e.name.endsWith('.md') ? [path.relative(DOCS, path.join(dir, e.name))] : []);

// Sem os blocos de código: um "# comentário" de bash não é título
const semCodigo = (md) => md.replace(/^```[\s\S]*?^```/gm, '');

// Âncora como o GitHub (e o pymdownx.slugs do mkdocs.yml) gera: minúsculas, sem pontuação/emoji, espaço vira hífen
const ancora = (titulo) => titulo.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const ancorasDe = (md) => new Set([...semCodigo(md).matchAll(/^#{1,6} (.+)$/gm)].map(m => ancora(m[1])));

// Linhas "| `/cmd` ..." ou "| [`/cmd`](cmd.md) ..." da tabela que vem depois de `titulo`
function tabelaDeComandos(md, titulo) {
    const ini = md.indexOf(titulo);
    assert.ok(ini >= 0, `sem a seção ${titulo}`);
    const linhas = md.slice(ini).split('\n').slice(1);
    const tabela = [];
    for (const l of linhas) {
        if (/^\| (\[)?`\//.test(l)) tabela.push(l);
        else if (tabela.length) break;
    }
    return tabela.map(l => ({ linha: l, cmd: l.match(/`(\/[a-z]+)`/)[1], colunas: l.split('|') }));
}

function conferirResumo(md, titulo, onde, { comLinks }) {
    const linhas = tabelaDeComandos(md, titulo);
    const nomes = linhas.map(l => l.cmd);

    // Inclui os desativados ("disabled": true): o /monitor é documentado como em desenvolvimento
    assert.deepEqual(nomes, ordenado(nomes), `${onde}: Resumo fora de ordem`);
    assert.deepEqual(ordenado(nomes), ordenado(CONFIG.commands.map(c => c.cmd)), `${onde}: Resumo diferente do config`);

    for (const c of CONFIG.commands) {
        const { linha, colunas } = linhas.find(l => l.cmd === c.cmd);
        const aliases = [...colunas[2].matchAll(/`([^`]+)`/g)].map(m => m[1]);
        assert.deepEqual(aliases, c.aliases ?? [], `${onde}: aliases de ${c.cmd} no Resumo`);
        assert.equal(colunas[3].includes('✅'), c.onlyAdmin, `${onde}: coluna Admin de ${c.cmd}`);
        if (comLinks) assert.ok(linha.includes(`](${c.cmd.slice(1)}.md)`), `${onde}: ${c.cmd} sem link para a página`);
    }
}

describe('documentação', () => {
    test('tabelas Markdown mantêm o número de colunas e escapam pipes nos valores', () => {
        for (const arquivo of ['README.md', ...paginasDocs().map(f => `docs/${f}`)]) {
            const linhas = semCodigo(fs.readFileSync(path.join(bot.RAIZ, arquivo), 'utf8'))
                .split('\n');
            let colunas = null;
            for (const [i, linha] of linhas.entries()) {
                if (!linha.startsWith('|')) {
                    colunas = null;
                    continue;
                }
                const quantidade = linha.split(/(?<!\\)\|/).length;
                colunas ??= quantidade;
                assert.equal(quantidade, colunas, `${arquivo}:${i + 1}: tabela desalinhada`);
            }
        }
    });

    test('settings numéricos: padrões e intervalos documentados seguem o schema', () => {
        const linhas = lerDoc('settings.md').split('\n');
        for (const [chave, schema] of Object.entries(SETTINGS_SCHEMA)) {
            if (schema.type !== 'number') continue;
            const linha = linhas.find(l => l.startsWith(`| \`${chave}\` |`));
            const colunas = linha.split('|').map(c => c.trim());
            assert.equal(colunas[2], `${schema.min}–${schema.max}`, `${chave}: intervalo`);
            assert.equal(colunas[3], `\`${schema.default}\``, `${chave}: padrão`);
        }
    });

    test('uma página por comando, com o título igual ao config (aliases e "· admin")', () => {
        for (const c of CONFIG.commands) {
            const arquivo = `comandos/${c.cmd.slice(1)}.md`;
            assert.ok(fs.existsSync(path.join(DOCS, arquivo)), `sem a página docs/${arquivo}`);

            const titulo = lerDoc(arquivo).split('\n')[0];
            assert.ok(titulo.startsWith(`# \`${c.cmd}\``), `docs/${arquivo}: o título não começa com ${c.cmd}`);
            const aliases = [...titulo.matchAll(/`(\/[^`]+)`/g)].map(m => m[1]).slice(1);
            assert.deepEqual(aliases, c.aliases ?? [], `docs/${arquivo}: aliases no título`);
            assert.equal(titulo.includes('· admin'), c.onlyAdmin, `docs/${arquivo}: "· admin" no título`);
        }

        const extras = paginasDocs(path.join(DOCS, 'comandos')).map(f => `/${path.basename(f, '.md')}`)
            .filter(n => n !== '/index' && !CONFIG.commands.some(c => c.cmd === n));
        assert.deepEqual(extras, [], 'página de comando que não está no config');
    });

    test('a tabela de opções de cada página tem as mesmas opções do comandos.json', () => {
        for (const c of CONFIG.commands) {
            const arquivo = `comandos/${c.cmd.slice(1)}.md`;
            const doConfig = new Set((c.cmd_opts ?? []).flatMap(o => o.opts ?? []));

            // 1ª coluna das tabelas: "| `-nome`, `-n` |" (as linhas de argumento, como `<url>` ou `-N`, ficam de fora)
            const daPagina = new Set();
            for (const linha of semCodigo(lerDoc(arquivo)).split('\n')) {
                const m = linha.match(/^\| ((?:`[-+][^`]+`(?:, )?)+) \|/);
                if (m) for (const [, op] of m[1].matchAll(/`[-+]([^`]+)`/g)) if (op !== 'N') daPagina.add(op);
            }

            assert.deepEqual([...daPagina].filter(o => !doConfig.has(o)), [], `docs/${arquivo}: opção que não está no config`);
            assert.deepEqual([...doConfig].filter(o => !daPagina.has(o)), [], `docs/${arquivo}: opção do config sem linha na tabela`);
        }
    });

    test('tabela Resumo do site e do README: todos os comandos, em ordem, iguais ao config', () => {
        conferirResumo(lerDoc('comandos/index.md'), '## Resumo', 'docs/comandos/index.md', { comLinks: true });
        conferirResumo(README, '## Comandos', 'README.md', { comLinks: false });
    });

    test('menu do mkdocs.yml: todas as páginas, comandos em ordem alfabética', () => {
        const yml = fs.readFileSync(path.join(bot.RAIZ, 'mkdocs.yml'), 'utf8');
        const noMenu = [...yml.slice(yml.indexOf('\nnav:')).matchAll(/([\w/]+\.md)\s*$/gm)].map(m => m[1]);

        assert.deepEqual(ordenado(noMenu), ordenado(paginasDocs()), 'página fora do menu (ou menu com página inexistente)');
        const comandos = noMenu.filter(p => p.startsWith('comandos/') && p !== 'comandos/index.md');
        assert.deepEqual(comandos, ordenado(comandos), 'comandos fora de ordem no menu');
    });

    test('tabela de settings: as chaves do SETTINGS_SCHEMA, em ordem', () => {
        const chaves = semCodigo(lerDoc('settings.md')).split('\n')
            .filter(l => /^\| `[a-z]/.test(l)).map(l => l.split('`')[1]);
        assert.deepEqual(chaves, Object.keys(SETTINGS_SCHEMA));
    });

    test('nenhum link entre os .md quebrado (arquivo e âncora), no docs/ e no README', () => {
        const arquivos = [...paginasDocs().map(f => path.join(DOCS, f)), path.join(bot.RAIZ, 'README.md')];
        let total = 0;

        for (const arquivo of arquivos) {
            const md = fs.readFileSync(arquivo, 'utf8');
            for (const [, alvo] of semCodigo(md).matchAll(/\]\(([^)\s]+)\)/g)) {
                if (/^(https?:|mailto:)/.test(alvo)) continue;
                total++;

                const [caminho, anc] = alvo.split('#');
                const destino = caminho ? path.resolve(path.dirname(arquivo), caminho) : arquivo;
                const onde = `${path.relative(bot.RAIZ, arquivo)} → ${alvo}`;

                assert.ok(fs.existsSync(destino), `link quebrado (arquivo): ${onde}`);
                if (anc && destino.endsWith('.md')) {
                    assert.ok(ancorasDe(fs.readFileSync(destino, 'utf8')).has(decodeURIComponent(anc)), `link quebrado (âncora): ${onde}`);
                }
            }
        }
        assert.ok(total > 50, `poucos links conferidos (${total})`);
    });

    test('instalação e README: a versão estável é uma release com data, até a do package.json (a seguinte só no bump.sh)', () => {
        const { version } = require('../package.json');
        const numeros = (v) => v.split('.').map(Number);
        const [x, y] = numeros(version);

        const m = lerDoc('instalacao.md').match(/`release-(\d+\.\d+)` \(de \d{2}\/\d{2}\/\d{4}\)/);
        assert.ok(m, 'instalacao.md: sem "release-X.Y (de DD/MM/AAAA)"');
        const [ex, ey] = numeros(m[1]);
        assert.ok(ex < x || (ex === x && ey <= y), `a estável (${m[1]}) passa da versão do package.json (${version})`);

        assert.match(README, new RegExp(`hoje a \`release-${m[1].replace('.', '\\.')}\``));
        assert.match(README, new RegExp(`git checkout release-${m[1].replace('.', '\\.')}\n`));
    });

    test('nenhum título repetido na mesma página (a âncora ficaria ambígua), no docs/ e no README', () => {
        const arquivos = [...paginasDocs().map(f => `docs/${f}`), 'README.md'];
        for (const arquivo of arquivos) {
            const titulos = [...semCodigo(fs.readFileSync(path.join(bot.RAIZ, arquivo), 'utf8')).matchAll(/^#{1,6} (.+)$/gm)]
                .map(m => ancora(m[1]));
            const repetidos = titulos.filter((t, i) => titulos.indexOf(t) !== i);
            assert.deepEqual(repetidos, [], `${arquivo}: título repetido`);
        }
    });

    test('links para o site (jpereira.github.io/zapbot) apontam para páginas e âncoras do docs/', () => {
        const SITE = /https:\/\/jpereira\.github\.io\/zapbot\/([^)\s"'`]*)/g;
        const arquivos = ['README.md', 'SECURITY.md', 'src/comandos/comandos.json', ...paginasDocs().map(f => `docs/${f}`)];
        let total = 0;

        for (const arquivo of arquivos) {
            for (const [, url] of fs.readFileSync(path.join(bot.RAIZ, arquivo), 'utf8').matchAll(SITE)) {
                total++;
                // "comandos/show/" → docs/comandos/show.md; "comandos/" → docs/comandos/index.md; "" → docs/index.md
                const [caminho, anc] = url.split('#');
                const pagina = caminho.replace(/\/$/, '');
                const md = [`${pagina}.md`, `${pagina ? `${pagina}/` : ''}index.md`].find(f => fs.existsSync(path.join(DOCS, f)));

                assert.ok(md, `${arquivo}: página do site não existe: ${url}`);
                if (anc) assert.ok(ancorasDe(lerDoc(md)).has(decodeURIComponent(anc)), `${arquivo}: âncora não existe: ${url}`);
            }
        }
        assert.ok(total > 40, `poucos links para o site (${total})`);
    });
});

describe('SETTINGS_SCHEMA', () => {
    test('chaves em ordem alfabética', () => {
        const chaves = Object.keys(SETTINGS_SCHEMA);
        assert.deepEqual(chaves, ordenado(chaves));
    });

    test('todo padrão passa na própria validação', async () => {
        for (const [chave, s] of Object.entries(SETTINGS_SCHEMA)) {
            assert.ok(s.desc, `${chave} sem desc`);
            assert.deepEqual(await setSetting(chave, s.default), s.default, chave);
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
        // Valor salvo com o nome antigo (/ualisu, hoje alias) vira o nome atual
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
        await carregarSettings();
        assert.equal(getSetting('show.max'), 7);
    });

    test('valor inválido no banco vale o padrão (com erro no log)', async () => {
        await bot.dbRun("UPDATE settings SET value = '999' WHERE key = 'show.max'");
        await setSetting('show.max', 20);
        await bot.dbRun("UPDATE settings SET value = '999' WHERE key = 'show.max'");
        await carregarSettings();
        assert.equal(getSetting('show.max'), 20);
        assert.ok(bot.errosNoLog().some(l => l.includes("Setting 'show.max' inválido")));
    });

    test('lista no banco com item que deixou de existir: fica com os outros; comando renomeado vira o novo', async () => {
        // Um bot da 1.8 com o /status (hoje /bot -status) e o /agendar (hoje /cron) desativados
        await bot.dbRun("UPDATE settings SET value = ? WHERE key = 'commands.disabled'", [JSON.stringify(['/walissu', '/status', '/agendar'])]);
        await carregarSettings();
        assert.deepEqual(getSetting('commands.disabled'), ['/walissu', '/cron']);
        assert.ok(bot.errosNoLog().some(l => l.includes("Setting 'commands.disabled' com item inválido")));
    });

    test('settings renomeados: o valor antigo vai para o novo (se ele está no padrão) e o antigo sai', async () => {
        // Um bot da 1.8/2.0: os nomes antigos com valores seus; os novos, criados com o padrão
        const salvar = (key, value) => bot.dbRun(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
        await salvar('resumo.maxMsgs', 50);
        await salvar('edit.alert', false);
        await salvar('show.revoke.status', false);
        await salvar('stats.enabled', true);
        await salvar('stats.enable', false);     // já mudado no nome novo (o padrão é on): fica o novo
        await salvar('show.max', 20);

        await carregarSettings();
        assert.equal(getSetting('tldr.maxMsgs'), 50);
        assert.equal(getSetting('show.alert.edited'), false);
        assert.equal(getSetting('show.alert.status'), false);
        assert.equal(getSetting('stats.enable'), false);

        const antigos = await bot.dbAll("SELECT key FROM settings WHERE key IN ('resumo.maxMsgs', 'edit.alert', 'show.revoke.status', 'stats.enabled')");
        assert.deepEqual(antigos, []);
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
    const cmd = (nome) => CONFIG.commands.find(c => c.cmd === nome);

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
        // O 1º argumento pode começar com "/" (uma regex, um texto): não é o comando
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
            const esperado = '```' + formatCommandHelp(command) + '```';
            for (const nome of [command.cmd, ...(command.aliases ?? [])]) {
                for (const flag of ['-h', '-help']) {
                    assert.deepEqual(await bot.responder(`${nome} ${flag}`), [esperado],
                        `${nome} ${flag}`);
                }
            }
        }
    });

    test('ajuda mostra os títulos em português e as flags universais', () => {
        const texto = formatCommandHelp(findCommand('/get'));
        assert.match(texto, /^Uso:/);
        assert.match(texto, /\nOpções:\n/);
        assert.match(texto, /\nArgumentos:\n/);
        assert.match(texto, /\nAjuda: -help, -h\n/);
        assert.doesNotMatch(texto, /Usage:|Options:|Arguments:|\[OPTION\]/);
    });

    test('formatCommandHelp traz uso, opções, argumentos e aliases', () => {
        const texto = formatCommandHelp(findCommand('/show'));
        assert.match(texto, /^Uso: \/show \[-N\] \[OPÇÃO\]/);
        assert.match(texto, /-query, -q <texto>/);
        assert.match(texto, /Argumentos:\n  -N/);
        assert.match(texto, /Aliases: \/s$/);
    });

    test('as formas do uso ("  ou  ") saem uma por linha, alinhadas', () => {
        const texto = formatCommandHelp(findCommand('/defi'));
        const linhas = texto.split('\n');
        assert.equal(linhas[0], 'Uso: /defi [orca|prjx|liquidswap|morpho|aave] [-mask]');
        assert.equal(linhas[1], '     /defi -l');
        assert.equal(linhas[3], '     /defi [protocolo] -taxas [-alerta]');
        assert.equal(linhas[5], '     /defi <protocolo> <opções>');
        assert.doesNotMatch(texto, / {2}ou {2}/);
    });

    test('ajuda por protocolo: a geral agrupa as opções; a de um protocolo só traz as dele', async () => {
        const geral = formatCommandHelp(findCommand('/defi'));
        const grupos = geral.split('\n').filter(l => l.startsWith(' > '));
        assert.deepEqual(grupos, [' > Orca', ' > Aave', ' > Orca e Project X', ' > Project X, Liquidswap, Morpho e Aave', ' > Todos']);
        assert.match(geral, / > Orca\n {2}-address <endereço> +Cadastra a posição da Orca/);

        const morpho = formatCommandHelp(findCommand('/defi'), { protocolo: 'morpho' });
        assert.match(morpho, /^Uso: \/defi morpho \[-mask\]\n {5}\/defi morpho -wallet <0x\.\.\.> \[-name <nome>\]\nPosição, empréstimos e risco no Morpho/);
        const opcoes = morpho.match(/^ {2}-\S+/gm);
        assert.deepEqual(opcoes, ['  -list,', '  -mask,', '  -name,', '  -rm', '  -wallet,']);
        assert.doesNotMatch(morpho, / > |Argumentos:/);

        const orca = formatCommandHelp(findCommand('/defi'), { protocolo: 'orca' });
        assert.match(orca, /-address <endereço>/);
        assert.doesNotMatch(orca, /^ {2}-wallet/m);

        // Pelo -help do comando e pelo /help
        assert.equal((await bot.responder('/defi prjx -help'))[0], '```' + formatCommandHelp(findCommand('/defi'), { protocolo: 'prjx' }) + '```');
        assert.match((await bot.responder('/help defi orca'))[0], /^🤖 \*AJUDA\*\n\n```Uso: \/defi orca \[-mask\]\n/);
        assert.match((await bot.responder('/defi xyz -help'))[0], /^```Uso: \/defi \[orca\|prjx\|liquidswap\|morpho\|aave\]/, 'protocolo desconhecido: a geral');

        // O alias do protocolo também acha a ajuda dele
        const liquidswap = '```' + formatCommandHelp(findCommand('/defi'), { protocolo: 'liquidswap' }) + '```';
        assert.match(liquidswap, /^```Uso: \/defi liquidswap\|liqswp \[-mask\]/);
        assert.equal((await bot.responder('/defi liqswp -help'))[0], liquidswap);
        assert.match((await bot.responder('/help defi liqswp'))[0], /```Uso: \/defi liquidswap\|liqswp/);
    });

    test('ajuda para o celular: uma frase por linha e o "Ex:" na linha de baixo, um exemplo por linha', () => {
        // No texto do comando: as frases e o Ex: começam na coluna 0
        const cron = formatCommandHelp(findCommand('/cron')).split('\n');
        assert.match(cron[2], /^Na hora marcada, .* \(-pv\)\.$/);
        assert.match(cron[3], /^No texto, \{\/comando args\} roda/);
        assert.equal(cron[4], 'O \\n digitado vira quebra de linha.');
        assert.equal(cron[5], 'Ex: /cron 09h -r diario -to /Família/ Bom dia! {/crypto BTC}');
        assert.equal(cron[6], '    /cron 8h -r diario Orca {/defi orca}\\n Prjx {/defi prjx}');

        // Nas opções: a 1ª frase ao lado; as outras e o Ex:, recuadas 4 espaços
        const linhas = formatCommandHelp(findCommand('/defi')).split('\n');
        const i = linhas.findIndex(l => l.startsWith('  [orca|prjx|liquidswap|morpho|aave]'));
        assert.match(linhas[i], /ou aave \(Aave V3\)\.$/);
        assert.match(linhas[i + 1], /^ {4}Sozinho, mostra/);
        assert.equal(linhas[i + 2], '    Ex: /defi');
        assert.equal(linhas[i + 3], '        /defi orca');
        assert.equal(linhas[i + 4], '        /defi liqswp');
        assert.equal(linhas[i + 5], '        /defi aave');

        // Um exemplo só também vai para a linha de baixo; "Paris, Texas" é um exemplo, não dois
        assert.match(formatCommandHelp(findCommand('/tempo')), /\n {4}Ex: \/tempo Paris, Texas\n/);
    });

    test('${CACHE_DIR}, ${MEDIA_DIR} e ${TMP_DIR} viram os caminhos reais na ajuda', () => {
        const { CACHE_DIR, MEDIA_DIR } = bot.src('constantes');
        const ajuda = getCommandSyntax('/cache');
        assert.ok(ajuda.includes(`Exibe o espaço ocupado em ${CACHE_DIR} e limpa o cache.`), ajuda);
        assert.ok(ajuda.includes(`mídias baixadas em ${MEDIA_DIR}`));
        assert.doesNotMatch(ajuda, /\$\{/);

        const { interpolar } = bot.src('comandos/base');
        assert.equal(interpolar('em ${TMP_DIR}, ${NAO_EXISTE}'), `em ${bot.src('constantes').TMP_DIR}, \${NAO_EXISTE}`);
    });

    test('ajuda de todos os comandos e protocolos resolve variáveis e mantém o recuo', () => {
        for (const command of activeCommands()) {
            for (const protocolo of [undefined, ...Object.keys(command.protocolos ?? {})]) {
                const texto = formatCommandHelp(command, { protocolo });
                const onde = `${command.cmd} ${protocolo ?? ''}`;
                assert.doesNotMatch(texto, /\t|\$\{|[ \t]+$/m, onde);
                assert.match(texto, /\nAjuda: -help, -h(?:\n|$)/, onde);
                if (!protocolo) continue;
                for (const opcao of command.cmd_opts.filter(o => o.opts)) {
                    const presente = !opcao.protocolos || opcao.protocolos.includes(protocolo);
                    const sintaxe = `  -${opcao.opts[0]}`;
                    assert.equal(texto.split('\n').some(l => l.startsWith(`${sintaxe} `)
                        || l.startsWith(`${sintaxe},`)), presente, `${onde}: ${sintaxe}`);
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
        const { adicionarColunas } = bot.src('inicializacao');
        await bot.preparar();
        await bot.dbRun('DROP TABLE IF EXISTS teste_antiga');
        await bot.dbRun('CREATE TABLE teste_antiga (id INTEGER PRIMARY KEY, nome TEXT)');
        await bot.dbRun("INSERT INTO teste_antiga (nome) VALUES ('antes')");

        await adicionarColunas('teste_antiga', { nome: 'TEXT', extra: 'INTEGER DEFAULT 7' });
        await adicionarColunas('teste_antiga', { extra: 'INTEGER DEFAULT 7' }); // de novo: não faz nada

        assert.deepEqual(await bot.dbAll('SELECT * FROM teste_antiga'), [{ id: 1, nome: 'antes', extra: 7 }]);
        await bot.dbRun('DROP TABLE teste_antiga');
    });

    test('defi_positions antiga (position): vira address (Orca) e wallet (carteiras), com o alerta', async () => {
        const { inicializarBanco } = bot.src('inicializacao');
        await bot.preparar();
        await bot.dbRun('DROP TABLE defi_positions');
        await bot.dbRun(`CREATE TABLE defi_positions (id INTEGER PRIMARY KEY AUTOINCREMENT, protocol TEXT NOT NULL,
            position TEXT NOT NULL UNIQUE, nft TEXT, pool TEXT, created_at INTEGER NOT NULL,
            alert INTEGER DEFAULT 0, alert_fees REAL, in_range INTEGER)`);
        await bot.dbRun(`INSERT INTO defi_positions (protocol, position, nft, pool, created_at, alert, alert_fees, in_range)
            VALUES ('orca', 'Hz15', 'C1ME', 'Ceaz', 1, 1, 2000, 1), ('prjx', '0x92', NULL, NULL, 2, 0, NULL, NULL)`);

        await inicializarBanco();

        assert.deepEqual(await bot.dbAll('SELECT id, protocol, address, wallet, nft, pool, alert, alert_fees, in_range FROM defi_positions ORDER BY id'), [
            { id: 1, protocol: 'orca', address: 'Hz15', wallet: null, nft: 'C1ME', pool: 'Ceaz', alert: 1, alert_fees: 2000, in_range: 1 },
            { id: 2, protocol: 'prjx', address: null, wallet: '0x92', nft: null, pool: null, alert: 0, alert_fees: null, in_range: null }
        ]);
        assert.ok(!(await bot.dbAll('PRAGMA table_info(defi_positions)')).some(c => c.name === 'position'));

        // A mesma carteira em dois protocolos
        await bot.dbRun("INSERT INTO defi_positions (protocol, wallet, created_at) VALUES ('morpho', '0x92', 3)");
        await bot.dbRun('DELETE FROM defi_positions');
    });
});
