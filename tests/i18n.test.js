/*
 * i18n: the zapbot.lang setting (en_US, the default, and pt_BR), the catalogs (src/locales) and the help (-h, /help)
 * in both languages. The other tests run in pt_BR (bot.reiniciar turns it on); here the language changes on purpose.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { SETTINGS_SCHEMA, getSetting, setSetting } = bot.src('settings');
const { catalogs, LANGUAGES, DEFAULT, t } = bot.src('i18n');
const { activeCommands, formatCommandHelp } = bot.src('commands/base');
const CONFIG = bot.src('commands/commands');

beforeEach(bot.restart);

const placeholders = (textAlt) => [...String(typeof textAlt === 'object' ? JSON.stringify(textAlt) : textAlt).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('catálogos', () => {
    test('en_US e pt_BR têm as mesmas chaves e os mesmos {placeholders}', () => {
        const [en, pt] = LANGUAGES.map(l => catalogs[l]);
        assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
        for (const keyAlt of Object.keys(en)) assert.deepEqual(placeholders(pt[keyAlt]), placeholders(en[keyAlt]), keyAlt);
    });

    test('t(): interpolação, plural e o en_US quando falta a chave', () => {
        assert.equal(t('help.notFound', { cmd: '/x' }, 'en_US'), '❌ Command not found: /x');
        assert.equal(t('help.notFound', { cmd: '/x' }, 'pt_BR'), '❌ Comando não encontrado: /x');
        assert.equal(t('chave.que.nao.existe', {}, 'pt_BR'), 'chave.que.nao.existe');

        const extra = { en_US: catalogs.en_US, pt_BR: catalogs.pt_BR };
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
        assert.equal(SETTINGS_SCHEMA['zapbot.lang'].default, DEFAULT);
        assert.equal(DEFAULT, 'en_US');
        assert.equal(await setSetting('zapbot.lang', 'pt-BR'), 'pt_BR');
        assert.equal(await setSetting('zapbot.lang', 'EN'), 'en_US');
        assert.equal(await setSetting('zapbot.lang', 'pt'), 'pt_BR');
        await assert.rejects(setSetting('zapbot.lang', 'fr_FR'), /não suportado: fr_FR \(aceitos: en_US, pt_BR\)/);
    });

    test('/set zapbot.lang pt_BR e /set zapbot.lang=en_US trocam o idioma', async () => {
        await bot.replyAlt('/set zapbot.lang en_US');
        assert.equal(getSetting('zapbot.lang'), 'en_US');
        await bot.replyAlt('/set zapbot.lang=pt_BR');
        assert.equal(getSetting('zapbot.lang'), 'pt_BR');
        await bot.replyAlt('/set zapbot.lang=en');
        assert.equal(getSetting('zapbot.lang'), 'en_US');
    });
});

describe('definições dos comandos', () => {
    test('toda definição tem a tradução pt_BR com a mesma estrutura', () => {
        for (const c of CONFIG.commands) {
            const fileAlt = path.join(bot.ROOT, 'src/locales/pt_BR/definitions', `${c.cmd.slice(1)}.json`);
            assert.ok(fs.existsSync(fileAlt), `sem ${path.relative(bot.ROOT, fileAlt)}`);
            const pt = JSON.parse(fs.readFileSync(fileAlt, 'utf8'));
            for (const field of ['summary', 'usage', 'help']) assert.equal(typeof pt[field], 'string', `${c.cmd}: ${field}`);
            assert.equal((pt.ex ?? []).length, (c.ex ?? []).length, `${c.cmd}: ex`);
            assert.equal(pt.cmd_opts.length, (c.cmd_opts ?? []).length, `${c.cmd}: cmd_opts`);
            (c.cmd_opts ?? []).forEach((o, i) => {
                const p = pt.cmd_opts[i];
                const whereAlt = `${c.cmd} cmd_opts[${i}]`;
                assert.deepEqual(p.opts, o.opts, `${whereAlt}: opts`);
                assert.equal((p.argv ?? []).length, (o.argv ?? []).length, `${whereAlt}: argv`);
                assert.equal((p.values ?? []).length, (o.values ?? []).length, `${whereAlt}: values`);
                assert.equal((p.ex ?? []).length, (o.ex ?? []).length, `${whereAlt}: ex`);
                assert.equal(typeof p.desc, 'string', `${whereAlt}: desc`);
            });
            assert.deepEqual(Object.keys(pt.protocols ?? {}), Object.keys(c.protocols ?? {}), `${c.cmd}: protocolos`);
        }
    });

    test('o texto das definições é em inglês (sem acentos nem as palavras do português que a ajuda usava)', () => {
        // Inputs the bot reads in Portuguese (às 18h, amanhã, chat names...) are allowed
        const allowed = /às|amanhã|Família|Fulano|promoção|João|Niteroi|Ração|Brasília|é |ç|ã/;
        for (const c of CONFIG.commands) {
            const texts = [c.summary, c.usage, c.help, ...(c.ex ?? []), ...(c.cmd_opts ?? []).flatMap(o => [o.desc, ...(o.ex ?? []), ...(o.values ?? []), ...(o.argv ?? [])])]
                .filter(Boolean);
            for (const textAlt of texts) {
                const withoutInputs = textAlt.replace(/"[^"]*"/g, '').split(/\s+/).filter(p => !allowed.test(p) && !/[`/]/.test(p)).join(' ');
                assert.doesNotMatch(withoutInputs, /[áéíóúâêôõ]|\b(você|não|para o|uma|mensagem|comando)\b/i, `${c.cmd}: "${textAlt.slice(0, 80)}"`);
            }
            assert.doesNotMatch(c.usage, /\s{2}ou\s{2}/, `${c.cmd}: usage em inglês usa "  or  "`);
        }
    });

    test('a ajuda de todos os comandos sai nos dois idiomas, sem variáveis soltas', async () => {
        for (const lang of LANGUAGES) {
            await setSetting('zapbot.lang', lang);
            for (const c of activeCommands()) {
                for (const protocol of [undefined, ...Object.keys(c.protocols ?? {})]) {
                    const textAlt = formatCommandHelp(c, { protocol });
                    assert.doesNotMatch(textAlt, /\$\{|undefined|\[object/, `${lang} ${c.cmd}`);
                    assert.ok(textAlt.startsWith('Usage: '), `${lang} ${c.cmd}`);
                }
            }
        }
    });
});

describe('ajuda nos dois idiomas', () => {
    test('en_US: /gpt -h e /help em inglês', async () => {
        await setSetting('zapbot.lang', 'en_US');
        const [help] = await bot.replyAlt('/gpt -h');
        assert.match(help, /Usage: \/gpt \[-s\] \[question\]/);
        assert.match(help, /Options:\n/);
        assert.match(help, /Arguments:\n/);
        assert.match(help, /\nDetails: https:\/\/jpereira\.github\.io\/zapbot\/commands\/gpt\/```$/);
        assert.doesNotMatch(help, /Opções:|Argumentos:/);

        const [menu] = await bot.replyAlt('/help');
        assert.match(menu, /^🤖 \*HELP MENU\*/);
        assert.match(menu, /\*\/gpt\*\n_Asks ChatGPT/);
        assert.match(menu, /Use \*\/help \/command\* or \*\/command -h\* for more information\./);

        assert.deepEqual(await bot.replyAlt('/help /naoexiste'), ['❌ Command not found: /naoexiste']);
    });

    test('pt_BR: o mesmo, em português', async () => {
        await setSetting('zapbot.lang', 'pt_BR');
        const [help] = await bot.replyAlt('/gpt -h');
        assert.match(help, /Usage: \/gpt \[-s\] \[pergunta\]/);
        assert.match(help, /Opções:\n/);
        assert.match(help, /\nDetalhes: https:\/\/jpereira\.github\.io\/zapbot\/pt-BR\/commands\/gpt\/```$/);

        const [menu] = await bot.replyAlt('/help');
        assert.match(menu, /^🤖 \*MENU DE AJUDA\*/);
        assert.match(menu, /\*\/gpt\*\n_Pergunta ao ChatGPT/);
    });

    test('a ajuda segue o idioma na hora, sem reiniciar', async () => {
        const pt = (await bot.replyAlt('/ping -h'))[0];
        await setSetting('zapbot.lang', 'en_US');
        const en = (await bot.replyAlt('/ping -h'))[0];
        assert.notEqual(pt, en);
        assert.match(pt, /^```Usage: \/ping\n/);
        assert.match(en, /^```Usage: \/ping\n/);
    });
});
