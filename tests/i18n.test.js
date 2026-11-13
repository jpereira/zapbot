/*
 * i18n: o setting zapbot.lang (en_US, o padrão, e pt_BR), os catálogos (src/locales) e a ajuda (-h, /help)
 * nos dois idiomas. Os outros testes rodam em pt_BR (o bot.reiniciar liga); aqui o idioma muda de propósito.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { SETTINGS_SCHEMA, getSetting, setSetting } = bot.src('settings');
const { catalogos, IDIOMAS, PADRAO, t } = bot.src('i18n');
const { activeCommands, formatCommandHelp } = bot.src('comandos/base');
const CONFIG = bot.src('comandos/comandos');

beforeEach(bot.reiniciar);

const placeholders = (texto) => [...String(typeof texto === 'object' ? JSON.stringify(texto) : texto).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('catálogos', () => {
    test('en_US e pt_BR têm as mesmas chaves e os mesmos {placeholders}', () => {
        const [en, pt] = IDIOMAS.map(l => catalogos[l]);
        assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
        for (const chave of Object.keys(en)) assert.deepEqual(placeholders(pt[chave]), placeholders(en[chave]), chave);
    });

    test('t(): interpolação, plural e o en_US quando falta a chave', () => {
        assert.equal(t('help.notFound', { cmd: '/x' }, 'en_US'), '❌ Command not found: /x');
        assert.equal(t('help.notFound', { cmd: '/x' }, 'pt_BR'), '❌ Comando não encontrado: /x');
        assert.equal(t('chave.que.nao.existe', {}, 'pt_BR'), 'chave.que.nao.existe');

        const extra = { en_US: catalogos.en_US, pt_BR: catalogos.pt_BR };
        extra.en_US['teste.itens'] = { one: '{n} item', other: '{n} items' };
        try {
            assert.equal(t('teste.itens', { n: 1 }, 'en_US'), '1 item');
            assert.equal(t('teste.itens', { n: 3 }, 'en_US'), '3 items');
            assert.equal(t('teste.itens', { n: 3 }, 'pt_BR'), '3 items', 'falta no pt_BR: vale o en_US');
        } finally {
            delete extra.en_US['teste.itens'];
        }
    });
});

describe('zapbot.lang', () => {
    test('o padrão é en_US e o pt_BR é aceito (também como pt-BR, pt e en)', async () => {
        assert.equal(SETTINGS_SCHEMA['zapbot.lang'].default, PADRAO);
        assert.equal(PADRAO, 'en_US');
        assert.equal(await setSetting('zapbot.lang', 'pt-BR'), 'pt_BR');
        assert.equal(await setSetting('zapbot.lang', 'EN'), 'en_US');
        assert.equal(await setSetting('zapbot.lang', 'pt'), 'pt_BR');
        await assert.rejects(setSetting('zapbot.lang', 'fr_FR'), /não suportado: fr_FR \(aceitos: en_US, pt_BR\)/);
    });

    test('/set zapbot.lang pt_BR e /set zapbot.lang=en_US trocam o idioma', async () => {
        await bot.responder('/set zapbot.lang en_US');
        assert.equal(getSetting('zapbot.lang'), 'en_US');
        await bot.responder('/set zapbot.lang=pt_BR');
        assert.equal(getSetting('zapbot.lang'), 'pt_BR');
        await bot.responder('/set zapbot.lang=en');
        assert.equal(getSetting('zapbot.lang'), 'en_US');
    });
});

describe('definições dos comandos', () => {
    test('toda definição tem a tradução pt_BR com a mesma estrutura', () => {
        for (const c of CONFIG.commands) {
            const arquivo = path.join(bot.RAIZ, 'src/locales/pt_BR/definicoes', `${c.cmd.slice(1)}.json`);
            assert.ok(fs.existsSync(arquivo), `sem ${path.relative(bot.RAIZ, arquivo)}`);
            const pt = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
            for (const campo of ['summary', 'usage', 'help']) assert.equal(typeof pt[campo], 'string', `${c.cmd}: ${campo}`);
            assert.equal((pt.ex ?? []).length, (c.ex ?? []).length, `${c.cmd}: ex`);
            assert.equal(pt.cmd_opts.length, (c.cmd_opts ?? []).length, `${c.cmd}: cmd_opts`);
            (c.cmd_opts ?? []).forEach((o, i) => {
                const p = pt.cmd_opts[i];
                const onde = `${c.cmd} cmd_opts[${i}]`;
                assert.deepEqual(p.opts, o.opts, `${onde}: opts`);
                assert.equal((p.argv ?? []).length, (o.argv ?? []).length, `${onde}: argv`);
                assert.equal((p.values ?? []).length, (o.values ?? []).length, `${onde}: values`);
                assert.equal((p.ex ?? []).length, (o.ex ?? []).length, `${onde}: ex`);
                assert.equal(typeof p.desc, 'string', `${onde}: desc`);
            });
            assert.deepEqual(Object.keys(pt.protocolos ?? {}), Object.keys(c.protocolos ?? {}), `${c.cmd}: protocolos`);
        }
    });

    test('o texto das definições é em inglês (sem acentos nem as palavras do português que a ajuda usava)', () => {
        // Entradas que o bot lê em português (às 18h, amanhã, nomes de chat...) são permitidas
        const permitidas = /às|amanhã|Família|Fulano|promoção|João|Niteroi|Ração|Brasília|é |ç|ã/;
        for (const c of CONFIG.commands) {
            const textos = [c.summary, c.usage, c.help, ...(c.ex ?? []), ...(c.cmd_opts ?? []).flatMap(o => [o.desc, ...(o.ex ?? []), ...(o.values ?? []), ...(o.argv ?? [])])]
                .filter(Boolean);
            for (const texto of textos) {
                const semEntradas = texto.replace(/"[^"]*"/g, '').split(/\s+/).filter(p => !permitidas.test(p) && !/[`/]/.test(p)).join(' ');
                assert.doesNotMatch(semEntradas, /[áéíóúâêôõ]|\b(você|não|para o|uma|mensagem|comando)\b/i, `${c.cmd}: "${texto.slice(0, 80)}"`);
            }
            assert.doesNotMatch(c.usage, /\s{2}ou\s{2}/, `${c.cmd}: usage em inglês usa "  or  "`);
        }
    });

    test('a ajuda de todos os comandos sai nos dois idiomas, sem variáveis soltas', async () => {
        for (const lang of IDIOMAS) {
            await setSetting('zapbot.lang', lang);
            for (const c of activeCommands()) {
                for (const protocolo of [undefined, ...Object.keys(c.protocolos ?? {})]) {
                    const texto = formatCommandHelp(c, { protocolo });
                    assert.doesNotMatch(texto, /\$\{|undefined|\[object/, `${lang} ${c.cmd}`);
                    assert.ok(texto.startsWith(lang === 'en_US' ? 'Usage: ' : 'Uso: '), `${lang} ${c.cmd}`);
                }
            }
        }
    });
});

describe('ajuda nos dois idiomas', () => {
    test('en_US: /gpt -h e /help em inglês', async () => {
        await setSetting('zapbot.lang', 'en_US');
        const [ajuda] = await bot.responder('/gpt -h');
        assert.match(ajuda, /Usage: \/gpt \[-s\] \[question\]/);
        assert.match(ajuda, /Options:\n/);
        assert.match(ajuda, /Arguments:\n/);
        assert.match(ajuda, /\nDetails: https:\/\/jpereira\.github\.io\/zapbot\/comandos\/gpt\/```$/);
        assert.doesNotMatch(ajuda, /Uso:|Opções:|Argumentos:/);

        const [menu] = await bot.responder('/help');
        assert.match(menu, /^🤖 \*HELP MENU\*/);
        assert.match(menu, /\/gpt +- Asks ChatGPT/);
        assert.match(menu, /Use \*\/help \/command\* or \*\/command -h\* for more information\./);

        assert.deepEqual(await bot.responder('/help /naoexiste'), ['❌ Command not found: /naoexiste']);
    });

    test('pt_BR: o mesmo, em português', async () => {
        await setSetting('zapbot.lang', 'pt_BR');
        const [ajuda] = await bot.responder('/gpt -h');
        assert.match(ajuda, /Uso: \/gpt \[-s\] \[pergunta\]/);
        assert.match(ajuda, /Opções:\n/);
        assert.match(ajuda, /\nDetalhes: https:\/\/jpereira\.github\.io\/zapbot\/pt-BR\/comandos\/gpt\/```$/);

        const [menu] = await bot.responder('/help');
        assert.match(menu, /^🤖 \*MENU DE AJUDA\*/);
        assert.match(menu, /\/gpt +- Pergunta ao ChatGPT/);
    });

    test('a ajuda segue o idioma na hora, sem reiniciar', async () => {
        const pt = (await bot.responder('/ping -h'))[0];
        await setSetting('zapbot.lang', 'en_US');
        const en = (await bot.responder('/ping -h'))[0];
        assert.notEqual(pt, en);
        assert.match(pt, /^```Uso: \/ping\n/);
        assert.match(en, /^```Usage: \/ping\n/);
    });
});
