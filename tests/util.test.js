/*
 * Utilities: formatting, contacts/@lid, group and mention names, uptime
 * and the commands' error message.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const { paraMs, plural, summarizeText, fmtInA, formatData } = bot.src('util/format');
const contacts = bot.src('contacts');
const { getBotUptime } = bot.src('log');
const { formatErrorCommand } = bot.src('commands/base');
const { humanSize, nameSafe, mediaIsPath, getFolderMedia } = bot.src('util/files');

beforeEach(bot.restart);

describe('formatação', () => {
    test('paraMs aceita segundos (WhatsApp) e milissegundos', () => {
        assert.equal(paraMs(1_790_000_000), 1_790_000_000_000);
        assert.equal(paraMs(1_790_000_000_000), 1_790_000_000_000);
    });

    test('formatarData no fuso de São Paulo', () => {
        assert.equal(formatData(Date.UTC(2026, 8, 30, 2, 30)), '29/09/2026, 23:30:00');
    });

    test('plural, números e resumo de texto', () => {
        assert.equal(plural(1, 'dia', 'dias'), '1 dia');
        assert.equal(plural(0, 'dia', 'dias'), '0 dias');
        assert.equal(fmtInA(12345), '12.345');
        assert.equal(summarizeText('  a \n  b  '), 'a b');
        assert.equal(summarizeText('x'.repeat(10), 5), 'xxxx…');
        assert.equal(summarizeText(null), '');
    });

    test('tempo no ar: dias, horas e minutos; segundos só no começo', () => {
        const nowAlt = Date.now();
        assert.equal(getBotUptime(nowAlt - 5_000), '5 segundos');
        assert.equal(getBotUptime(nowAlt - 61_000), '1 minuto, 1 segundo');
        assert.equal(getBotUptime(nowAlt - (2 * 86400 + 3 * 3600 + 60) * 1000), '2 dias, 3 horas, 1 minuto');
    });

    test('erro dos comandos com o comando e a causa', () => {
        const errorAlt = new Error('Falhou', { cause: { cmd: 'yt-dlp x', inner: new Error('exit 1') } });
        assert.equal(formatErrorCommand(errorAlt), '⚠️💥 Falhou.\n🛠️ *Cmd*:    yt-dlp x\n⛓️‍💥 *Inner*:  exit 1\n');
    });
});

describe('arquivos do cache', () => {
    test('tamanhos legíveis', () => {
        assert.equal(humanSize(512), '512 B');
        assert.equal(humanSize(1536), '1.50 KB');
        assert.equal(humanSize(5 * 1024 * 1024), '5.00 MB');
        assert.equal(humanSize(3 * 1024 ** 3), '3.00 GB');
    });

    test('nome de arquivo seguro e caminho dentro de cache/media', () => {
        assert.equal(nameSafe('../../etc/passwd', 'x'), 'etcpasswd');
        assert.equal(nameSafe('', 'padrao'), 'padrao');
        assert.equal(mediaIsPath(`${getFolderMedia()}/a.jpg`), true);
        assert.equal(mediaIsPath('/etc/passwd'), false);
        assert.equal(mediaIsPath(null), false);
    });
});

describe('contatos', () => {
    test('números e JIDs', () => {
        assert.equal(contacts.normalizerPhoneNumber('+55 (21) 99999-0000'), '5521999990000');
        assert.equal(contacts.isPhoneNumber('+55 21 99999-0000'), true);
        assert.equal(contacts.isPhoneNumber('123'), false);
        assert.equal(contacts.normalizeWid('5521:3@lid'), '5521@c.us');
        assert.equal(contacts.removeDeviceSuffix('123:93@lid'), '123@lid');
        assert.equal(contacts.removeDeviceSuffix('5521@c.us'), '5521@c.us');
        assert.equal(contacts.removeDeviceSuffix(null), null);
    });

    test('@lid vira telefone (com cache); desconhecido fica null', async () => {
        bot.client.lids.set('555@lid', OTHERAlt.jid);
        assert.equal(await contacts.resolveLidToPhone('555:7@lid'), OTHERAlt.jid);
        bot.client.lids.clear();
        assert.equal(await contacts.resolveLidToPhone('555@lid'), OTHERAlt.jid, 'veio do cache');
        assert.equal(await contacts.resolveLidToPhone('666@lid'), null);
        assert.equal(await contacts.resolveLidToPhone('5521@c.us'), '5521@c.us');
    });

    test('idsDoChatAtual inclui o telefone de um chat @lid', async () => {
        bot.client.lids.set('888@lid', OTHERAlt.jid);
        assert.deepEqual(await contacts.chatCurrentIds('888@lid'), ['888@lid', OTHERAlt.jid]);
        assert.deepEqual(await contacts.chatCurrentIds(bot.GROUP), [bot.GROUP]);
    });

    test('nome do grupo pelo id; não-grupo é null', async () => {
        bot.createGroup('120363000000000009@g.us', 'Churrasco');
        assert.equal(await contacts.groupResolverName('120363000000000009@g.us'), 'Churrasco');
        assert.equal(await contacts.groupResolverName(OTHERAlt.jid), null);
        assert.equal(await contacts.groupResolverName('120363000000000099@g.us'), null);
    });

    test('menções cruas viram o nome do contato', async () => {
        assert.equal(await contacts.resolverMentions(`oi @${OTHERAlt.user}`, [OTHERAlt.jid]), 'oi @Fulano');

        bot.client.lids.set('4444444@lid', '5521933333333@c.us');
        assert.equal(await contacts.resolverMentions('oi @4444444'), 'oi @+5521933333333', 'sem contato: o telefone');
        assert.equal(await contacts.resolverMentions('oi @123', []), 'oi @123', 'curto demais: não é menção');
    });
});
