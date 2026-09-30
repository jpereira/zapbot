/*
 * Configuração: bot-config.json, settings, parser de opções, ajuda e a
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

const CONFIG = JSON.parse(fs.readFileSync(path.join(bot.RAIZ, 'config/bot-config.json'), 'utf8'));
const README = fs.readFileSync(path.join(bot.RAIZ, 'README.md'), 'utf8');

const ordenado = (lista) => [...lista].sort((a, b) => a.localeCompare(b));

beforeEach(bot.reiniciar);

describe('bot-config.json', () => {
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

describe('README', () => {
    const linhasDaTabela = (titulo, ate) => {
        const trecho = README.slice(README.indexOf(titulo), README.indexOf(ate, README.indexOf(titulo)));
        return trecho.split('\n').filter(l => /^\| `/.test(l));
    };

    // Inclui os desativados ("disabled": true): o README documenta o /monitor como em desenvolvimento
    test('tabela Resumo: todos os comandos do config, em ordem, com os aliases do config', () => {
        const linhas = linhasDaTabela('### Resumo', '### `/');
        const nomes = linhas.map(l => l.split('`')[1]);

        assert.deepEqual(nomes, ordenado(nomes), 'Resumo fora de ordem');
        assert.deepEqual(ordenado(nomes), ordenado(CONFIG.commands.map(c => c.cmd)));

        for (const c of CONFIG.commands) {
            const linha = linhas.find(l => l.startsWith(`| \`${c.cmd}\``));
            const aliases = [...linha.split('|')[2].matchAll(/`([^`]+)`/g)].map(m => m[1]);
            assert.deepEqual(aliases, c.aliases ?? [], `aliases de ${c.cmd} no Resumo`);
            assert.equal(linha.split('|')[3].includes('✅'), c.onlyAdmin, `coluna Admin de ${c.cmd}`);
        }
    });

    test('uma seção por comando, em ordem alfabética', () => {
        const secoes = [...README.matchAll(/^### `(\/[a-z]+)/gm)].map(m => m[1]);
        assert.deepEqual(secoes, ordenado(secoes));
        for (const c of CONFIG.commands.filter(c => !c.disabled)) {
            assert.ok(secoes.includes(c.cmd), `README sem seção para ${c.cmd}`);
        }
    });

    test('título de cada comando: aliases e "· admin" iguais ao config', () => {
        for (const [titulo, nome] of README.matchAll(/^### `(\/[a-z]+)`.*$/gm)) {
            const c = CONFIG.commands.find(x => x.cmd === nome);
            if (!c) continue;
            const aliases = [...titulo.matchAll(/`(\/[^`]+)`/g)].map(m => m[1]).slice(1);
            assert.deepEqual(aliases, c.aliases ?? [], `aliases no título de ${nome}`);
            assert.equal(titulo.includes('· admin'), c.onlyAdmin, `"· admin" no título de ${nome}`);
        }
    });

    // Âncora como o GitHub gera: minúsculas, sem pontuação/emoji, espaço vira hífen
    const ancora = (titulo) => titulo.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

    test('todo link interno (#...) aponta para um título que existe', () => {
        const ancoras = new Set([...README.matchAll(/^#{1,6} (.+)$/gm)].map(m => ancora(m[1])));
        const links = [...README.matchAll(/\]\(#([^)]+)\)/g)].map(m => m[1]);
        assert.ok(links.length > 20);
        for (const link of links) assert.ok(ancoras.has(link), `link quebrado: #${link}`);
    });

    test('tabela Settings: as chaves do SETTINGS_SCHEMA, em ordem', () => {
        const chaves = linhasDaTabela('#### Settings', 'Uma chave nova').map(l => l.split('`')[1]);
        assert.deepEqual(chaves, Object.keys(SETTINGS_SCHEMA));
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
        for (const v of ['on', 'true', '1', 'sim', 'yes']) assert.equal(await setSetting('edit.alert', v), true);
        for (const v of ['off', 'false', '0', 'nao', 'não', 'no']) assert.equal(await setSetting('edit.alert', v), false);
        await assert.rejects(setSetting('edit.alert', 'talvez'), /use on\|off/);
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

    test('chave renomeada (api.key.giphy) é migrada para o nome novo', async () => {
        await bot.dbRun('DELETE FROM settings WHERE key = ?', ['gif.giphy.api.key']);
        await bot.dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['api.key.giphy', JSON.stringify('chave-antiga')]);
        await carregarSettings();
        assert.equal(getSetting('gif.giphy.api.key'), 'chave-antiga');
        assert.equal(await bot.dbGet("SELECT 1 FROM settings WHERE key = 'api.key.giphy'"), undefined);
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

    test('getCommandSyntax de comando inexistente é null', () => {
        assert.equal(getCommandSyntax('/naoexiste'), null);
    });

    test('commands.disabled tira o comando da busca e da lista', async () => {
        await setSetting('commands.disabled', 'noffa');
        assert.equal(findCommand('/noffa'), undefined);
        assert.ok(!activeCommands().some(c => c.cmd === '/noffa'));
    });
});
