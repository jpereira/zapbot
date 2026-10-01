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

    test('comando "disabled" não é carregado (/monitor)', () => {
        assert.equal(CONFIG.commands.find(c => c.cmd === '/monitor').disabled, true);
        assert.equal(findCommand('/monitor'), undefined);
        assert.equal(findCommand('/m'), undefined);
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

    test('instalação: a release atual (a do package.json) com a data dela', () => {
        const { version } = require('../package.json');
        assert.match(lerDoc('instalacao.md'), new RegExp(`\`release-${version.replace('.', '\\.')}\` \\(de \\d{2}/\\d{2}/\\d{4}\\)`));
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
        for (const v of ['on', 'true', '1', 'sim', 'yes']) assert.equal(await setSetting('show.alert.edit', v), true);
        for (const v of ['off', 'false', '0', 'nao', 'não', 'no']) assert.equal(await setSetting('show.alert.edit', v), false);
        await assert.rejects(setSetting('show.alert.edit', 'talvez'), /use on\|off/);
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
        assert.ok(o.given.has('audio') && o.given.has('startSec'));
    });

    test('opção com valor sem valor: null, mas presente em given', () => {
        const o = GetOptFromCommand('-c', cmd('/show'));
        assert.equal(o.opt.chat, null);
        assert.ok(o.given.has('chat'));
    });

    test('opção desconhecida e número negativo vão para argv', () => {
        assert.deepEqual(GetOptFromCommand('-3 -xyz', cmd('/show')).argv, ['-3', '-xyz']);
    });

    test('aspas agrupam', () => {
        assert.deepEqual(GetOptFromCommand('"a b" \'c d\'', cmd('/noffa')).argv, ['a b', 'c d']);
    });

    test('-h e -help em qualquer comando', () => {
        assert.equal(GetOptFromCommand('-h', cmd('/ping')).opt.help, true);
        assert.equal(GetOptFromCommand('-help', cmd('/ping')).opt.help, true);
    });
});

describe('ajuda', () => {
    test('formatCommandHelp traz uso, opções, argumentos e aliases', () => {
        const texto = formatCommandHelp(findCommand('/show'));
        assert.match(texto, /^Usage: \/show \[-N\] \[OPTION\]/);
        assert.match(texto, /-chat, -c <nº\|nome>/);
        assert.match(texto, /Arguments:\n  -N/);
        assert.match(texto, /Aliases: \/undo, \/s/);
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
});
