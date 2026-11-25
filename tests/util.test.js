/*
 * Utilities: formatting, contacts/@lid, group and mention names, uptime
 * and the commands' error message.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { OTHERAlt } = bot;
const { toMillis, plural, summarizeText, fmtInA, formatData } = bot.src('util/format');
const contacts = bot.src('contacts');
const { getBotUptime } = bot.src('log');
const { formatErrorCommand } = bot.src('commands/base');
const {
    humanSize, nameSafe, mediaIsPath, getFolderMedia, listCacheLevelOnly
} = bot.src('util/files');

beforeEach(bot.restart);

describe('formatação', () => {
    test('toMillis aceita segundos (WhatsApp) e milissegundos', () => {
        assert.equal(toMillis(1_790_000_000), 1_790_000_000_000);
        assert.equal(toMillis(1_790_000_000_000), 1_790_000_000_000);
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
        const cause = new Error('exit 1');
        const direct = new Error('Falhou', { cause: cause });
        direct.cmd = 'yt-dlp x';
        assert.equal(direct.cause, cause);
        assert.equal(formatErrorCommand(direct), formatErrorCommand(errorAlt));
    });
});

describe('Markdown do ChatGPT para o WhatsApp', () => {
    const { toWhatsapp } = bot.src('util/whatsapp');

    test('títulos, negrito duplo, tachado, listas, links e linhas viram a formatação do WhatsApp', () => {
        assert.equal(toWhatsapp('# 🧺 O que é um conjunto?\n\nUm **conjunto** é uma ~~lista~~ coleção.\n\n---\n\n## 1. Está dentro?'),
            '*🧺 O que é um conjunto?*\n\nUm *conjunto* é uma ~lista~ coleção.\n\n*1. Está dentro?*');
        assert.equal(toWhatsapp('* um\n+ dois\n  * aninhado\n- três\n1. primeiro'), '- um\n- dois\n  - aninhado\n- três\n1. primeiro');
        assert.equal(toWhatsapp('***forte***, __negrito__ e [o site](https://exemplo.com), [https://a.com](https://a.com)'),
            '*_forte_*, *negrito* e o site (https://exemplo.com), https://a.com');
        assert.equal(toWhatsapp('![foto](https://x.com/a.png)'), 'https://x.com/a.png');
        // Already in WhatsApp format: does not touch it
        assert.equal(toWhatsapp('*negrito* _itálico_ ~tachado~ `código`\n- item\n> citação'), '*negrito* _itálico_ ~tachado~ `código`\n- item\n> citação');
    });

    test('tabela vira um bloco de código alinhado, sem a marcação dentro das células', () => {
        const table = '| Símbolo | Significado | Exemplo |\n|---|:-:|---|\n| **∈** | Pertence | 🍎 ∈ A |\n| **∉** | Não pertence | ⚽ ∉ A |';
        assert.equal(toWhatsapp(`Veja:\n\n${table}\n\nFim`), [
            'Veja:', '', '```',
            'Símbolo  Significado   Exemplo',
            '-------  ------------  -------',
            '∈        Pertence      🍎 ∈ A',
            '∉        Não pertence  ⚽ ∉ A',
            '```', '', 'Fim'
        ].join('\n'));
    });

    test('o bloco de código fica como está (sem o nome da linguagem) e as linhas em branco demais caem', () => {
        assert.equal(toWhatsapp('Veja:\n\n```text\n **x** # y\n| a | b |\n```\n\n\n\n\nFim'), 'Veja:\n\n```\n **x** # y\n| a | b |\n```\n\nFim');
        assert.equal(toWhatsapp('a  \nb'), 'a\nb');
        assert.equal(toWhatsapp(''), '');
        assert.equal(toWhatsapp(undefined), '');
    });
});

describe('arquivos do cache', () => {
    test('árvore ordenada, tamanhos recursivos, total alinhado e separador contínuo', () => {
        const dir = fs.mkdtempSync(path.join(bot.CACHE_DIR, 'arvore-'));
        try {
            fs.mkdirSync(path.join(dir, 'tmp'));
            fs.mkdirSync(path.join(dir, 'media', 'dia'), { recursive: true });
            fs.writeFileSync(path.join(dir, 'media', 'dia', 'foto'), Buffer.alloc(2048));
            fs.writeFileSync(path.join(dir, 'zapbot.db'), Buffer.alloc(1024));
            fs.mkdirSync(path.join(dir, 'backups'));
            fs.writeFileSync(path.join(dir, 'backups', 'b.gz'), Buffer.alloc(512));
            assert.equal(listCacheLevelOnly(dir), [
                '├── 📁 backups/       512 B',
                '├── 📁 media/       2.00 KB',
                '├── 📁 tmp/             0 B',
                '└── zapbot.db       1.00 KB',
                '───────────────────────────',
                'Total:              3.50 KB'
            ].join('\n'));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

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
    test('nomeDoContato: o nome da agenda vem antes do pushname; o shortName e o verifiedName entram depois', () => {
        const { scheduleName, contactName } = contacts;
        assert.equal(contactName({ name: 'Maria Agenda', pushname: 'mari_99' }), 'Maria Agenda');
        assert.equal(contactName({ shortName: 'Mari', pushname: 'mari_99' }), 'Mari');
        assert.equal(contactName({ pushname: 'mari_99', verifiedName: 'Loja' }), 'mari_99');
        assert.equal(contactName({ verifiedName: 'Loja' }), 'Loja');
        assert.equal(scheduleName({ pushname: 'mari_99' }), null);
        assert.equal(contactName(null), null);
        assert.equal(contactName({}), null);
    });

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
        assert.equal(await contacts.resolveGroupName('120363000000000009@g.us'), 'Churrasco');
        assert.equal(await contacts.resolveGroupName(OTHERAlt.jid), null);
        assert.equal(await contacts.resolveGroupName('120363000000000099@g.us'), null);
    });

    test('menções cruas viram o nome do contato', async () => {
        assert.equal(await contacts.resolveMentions(`oi @${OTHERAlt.user}`, [OTHERAlt.jid]), 'oi @Fulano');

        bot.client.lids.set('4444444@lid', '5521933333333@c.us');
        assert.equal(await contacts.resolveMentions('oi @4444444'), 'oi @+5521933333333', 'sem contato: o telefone');
        assert.equal(await contacts.resolveMentions('oi @123', []), 'oi @123', 'curto demais: não é menção');
    });
});

describe('versão com o commit (version.js)', () => {
    const { readCommit } = bot.src('version');

    test('(devel) fora de uma release; numa tag v*, sem rótulo; sem o commit, só a versão', () => {
        const {
            inDevelopment, versionWithCommit, botVersion, zapbotUserAgentTemplate, expandUserAgent
        } = bot.src('version');
        const { version } = require('../package.json');
        const release = { commit: 'abc1234', ref: `v${version}` };
        const main = { commit: 'def5678', ref: 'HEAD' };

        assert.equal(versionWithCommit(release), `${version} (git+abc1234/v${version})`);
        assert.equal(versionWithCommit(main), `${version} (devel) (git+def5678/HEAD)`);
        assert.equal(versionWithCommit({ commit: 'def5678', ref: 'v9-teste' }), `${version} (devel) (git+def5678/v9-teste)`);
        assert.deepEqual([botVersion(release), botVersion(main)], [version, `${version} (devel)`]);
        assert.equal(inDevelopment(null), false);
        assert.equal(versionWithCommit(null), version);
        assert.equal(zapbotUserAgentTemplate, 'ZapBot/$version ($build) ($revision)');
        assert.equal(expandUserAgent(zapbotUserAgentTemplate, main),
            `ZapBot/${version} (devel) (git+def5678/HEAD)`);
        assert.equal(expandUserAgent(zapbotUserAgentTemplate, release),
            `ZapBot/${version} (release) (git+abc1234/v${version})`);
        assert.equal(expandUserAgent(zapbotUserAgentTemplate, null),
            `ZapBot/${version} (release) (unknown)`);
    });
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const HASH = '25b0870123456789abcdef0123456789abcdef01';

    // A fake project with the .git files the Docker image carries
    function project(files) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-git-'));
        for (const [fileAlt, content] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, '.git', fileAlt)), { recursive: true });
            fs.writeFileSync(path.join(root, '.git', fileAlt), content);
        }
        return root;
    }

    const TAG = '1111111111111111111111111111111111111111';     // the "tag" object of an annotated tag
    const c = (commit, ref) => ({ commit: commit.slice(0, 7), ref });

    test('num branch no commit de uma tag (o main logo depois do bump.sh, no commit da release): a tag', () => {
        const main = { HEAD: 'ref: refs/heads/main\n', 'refs/heads/main': `${HASH}\n` };
        assert.deepEqual(readCommit(project({ ...main, 'refs/tags/v2.0.0': `${HASH}\n` })), c(HASH, 'v2.0.0'));
        // Annotated, after git pack-refs --all (what bump.sh runs): the "^<commit>" in packed-refs
        assert.deepEqual(readCommit(project({ HEAD: 'ref: refs/heads/main\n',
            'packed-refs': `# pack-refs with: peeled\n${HASH} refs/heads/main\n${TAG} refs/tags/v2.0.0\n^${HASH}\n` })), c(HASH, 'v2.0.0'));
        // Annotated and loose, without the object or the reflog: there is no way to know
        assert.deepEqual(readCommit(project({ ...main, 'refs/tags/v2.0.0': `${TAG}\n` })), c(HASH, 'HEAD'));
    });

    test('branch (em refs/heads ou no packed-refs): o commit e HEAD; sem .git: null', () => {
        assert.deepEqual(readCommit(project({ HEAD: 'ref: refs/heads/main\n', 'refs/heads/main': `${HASH}\n` })), c(HASH, 'HEAD'));
        assert.deepEqual(readCommit(project({ HEAD: 'ref: refs/heads/main\n', 'packed-refs': `# pack-refs\n${'f'.repeat(40)} refs/heads/outro\n${HASH} refs/heads/main\n` })), c(HASH, 'HEAD'));
        assert.equal(readCommit(project({ HEAD: 'ref: refs/heads/sumiu\n' })), null);
        assert.equal(readCommit(fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-sem-git-'))), null);
    });

    test('HEAD destacado numa tag: lightweight, anotada no packed-refs, anotada solta (pelo objeto ou pelo reflog)', () => {
        // Lightweight: the ref points to the commit
        assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n`, 'refs/tags/v2.0.0': `${HASH}\n` })), c(HASH, 'v2.0.0'));

        // Annotated in a clone: "^<commit>" on the next line of packed-refs
        assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n`, 'packed-refs': `# pack-refs with: peeled\n${TAG} refs/tags/v2.0.0\n^${HASH}\n` })),
            c(HASH, 'v2.0.0'));

        // Annotated loose, with the object (outside Docker)
        const object = require('zlib').deflateSync(Buffer.from(`tag 100\0object ${HASH}\ntype commit\ntag v2.0.0\n`));
        assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n`, 'refs/tags/v2.0.0': `${TAG}\n`, [`objects/11/${TAG.slice(2)}`]: object })),
            c(HASH, 'v2.0.0'));

        // Annotated loose, without the object (the Docker image): the last checkout in the reflog, if it went to this commit
        const reflog = (target) => `${'0'.repeat(40)} ${target} Fulano <f@x> 1790000000 -0300\tcheckout: moving from main to v2.0.0\n`;
        assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n`, 'refs/tags/v2.0.0': `${TAG}\n`, 'logs/HEAD': reflog(HASH) })), c(HASH, 'v2.0.0'));
        assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n`, 'refs/tags/v2.0.0': `${TAG}\n`, 'logs/HEAD': reflog('f'.repeat(40)) })), c(HASH, 'HEAD'),
            'o reflog foi para outro commit');

        // Detached on a commit without a tag; two tags on the same commit: the higher version
        assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n` })), c(HASH, 'HEAD'));
        assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n`, 'refs/tags/v1.9.0': `${HASH}\n`, 'refs/tags/v1.10.0': `${HASH}\n` })), c(HASH, 'v1.10.0'));
    });

    test('ZAPBOT_COMMIT tem prioridade ("commit" ou "commit/ref")', () => {
        try {
            process.env.ZAPBOT_COMMIT = 'abcdef0123456789';
            assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n` })), { commit: 'abcdef0', ref: 'HEAD' });
            process.env.ZAPBOT_COMMIT = 'abcdef0123456789/v2.0.0';
            assert.deepEqual(readCommit(project({ HEAD: `${HASH}\n` })), { commit: 'abcdef0', ref: 'v2.0.0' });
        } finally {
            delete process.env.ZAPBOT_COMMIT;
        }
    });
});

describe('caracteres invisíveis (util/messageBody.js)', () => {
    test('saem o WORD JOINER, o espaço de largura zero, as marcas de direção e o BOM; ficam o ZWJ dos emojis e as inversões', () => {
        const { withoutInvisible } = bot.src('util/messageBody');
        assert.equal(withoutInvisible('/⁠Fulano de Tal/'), '/Fulano de Tal/');
        assert.equal(withoutInvisible('﻿Maria​ Souza‎'), 'Maria Souza');
        const runner = '🏃🏽‍♂️ Corrida';
        assert.equal(withoutInvisible(runner), runner);
    });
});
