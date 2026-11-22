/*
 * /notes -lock: protected tag (text and files encrypted, password asked in your private chat).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, CACHE_DIR } = bot;
const { dbAll, dbGet } = bot.src('db');
const lock = bot.src('notesLock');
const { extractPassword, maskLockPassword, maskSecret, normalizeLock } = bot.src('util/lockPassword');
const { checkNotes } = bot.src('notes');

const PRIVATE = { chat: OWNER.jid };
const PASSWORD = 'senhaforte1';
// What the /notes command sees: in your own private chat, not sending anywhere
const inPrivate = (fn) => lock.runIn({ privateChat: true, sending: false }, fn);
const row = (id = 1) => dbGet('SELECT * FROM notes WHERE id = ?', [id]);

beforeEach(async () => {
    await bot.restart();
    lock.reset();
});

// Protects #foo with PASSWORD: the notes it already has are encrypted
async function protectFoo() {
    await bot.replyAlt('/notes -lock #foo', PRIVATE);
    await bot.replyAlt(PASSWORD, PRIVATE);
    return bot.replyAlt(PASSWORD, PRIVATE);
}

describe('/notes -lock', () => {
    test('primeira vez: pede a senha duas vezes, apaga as mensagens e cifra o que já havia na tag', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        assert.equal((await row()).text, 'segredo 123');

        assert.match((await bot.replyAlt('/notes -lock #foo', PRIVATE))[0], /^🔑 Crie uma senha para a #foo:\n⚠️ Não há recuperação/);
        // The message with the password is deleted and does not stay in the history
        const before = bot.client.sent.length;
        const first = bot.createMessage({ text: PASSWORD, chat: OWNER.jid, de: OWNER.jid });
        await bot.deliver(first);
        assert.equal(first.deletedFor, 'todos');
        assert.equal((await dbGet('SELECT body FROM messages WHERE id = ?', [first.id.id])).body, '🔑 ***');
        assert.deepEqual(bot.client.sent.slice(before).map(e => e.content), ['🔑 Repita a senha:']);

        const [done] = await bot.replyAlt(PASSWORD, PRIVATE);
        assert.equal(done, '🔓 A tag #foo agora está protegida (1 notas cifradas) e liberada, vai ser travada em 5m sem interagir.\n' +
            '💡 O histórico ainda tem 1 comandos antigos da #foo. Para apagá-los: /notes -lock #foo -clean -yes');
        assert.match((await row()).text, /^enc:v1:/);
        assert.doesNotMatch(JSON.stringify(await dbAll('SELECT text FROM notes')), /segredo/);

        // Open: the notes work and the text comes back
        assert.match((await bot.replyAlt('/notes #foo', PRIVATE))[0], /segredo 123/);
    });

    test('as respostas à senha são mensagens diretas, nunca reply (um reply mostraria a senha citada ao fundo)', async () => {
        await bot.replyAlt('/notes #foo algo', PRIVATE);
        await bot.replyAlt('/notes -lock #foo', PRIVATE);
        for (const [password, expected] of [[PASSWORD, /^🔑 Repita a senha:/], ['outra-senha', /^❌ As senhas não conferem/]]) {
            const msg = bot.createMessage({ text: password, chat: OWNER.jid, de: OWNER.jid });
            msg.reply = async () => { throw new Error('respondeu com reply: a senha ficaria citada'); };
            const before = bot.client.sent.length;
            await bot.deliver(msg);
            assert.match(bot.client.sent.slice(before).map(e => e.content).join('\n'), expected);
        }

        // The confirmation that it protected, and the unlock, too
        for (const step of ['/notes -lock #foo', PASSWORD, PASSWORD]) {
            const msg = bot.createMessage({ text: step, chat: OWNER.jid, de: OWNER.jid });
            if (!step.startsWith('/')) msg.reply = async () => { throw new Error('respondeu com reply'); };
            await bot.deliver(msg);
        }
        assert.match(bot.client.sent.at(-1).content, /^🔓 A tag #foo agora está protegida/);
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);
        await bot.replyAlt('/notes -lock #foo', PRIVATE);
        const msg = bot.createMessage({ text: PASSWORD, chat: OWNER.jid, de: OWNER.jid });
        msg.reply = async () => { throw new Error('respondeu com reply'); };
        await bot.deliver(msg);
        assert.match(bot.client.sent.at(-1).content, /^🔓 A tag #foo está liberada/);
    });

    test('ver uma tag protegida: travada mostra o cadeado e diz como abrir; liberada mostra tudo', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await protectFoo();
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);

        const [view, hint] = await bot.replyAlt('/notes -v #foo', PRIVATE);
        assert.match(view, /🔒 \(nota protegida\)/);
        assert.doesNotMatch(view, /segredo/);
        assert.equal(hint, '🔒 A tag #foo está travada: /notes -lock #foo');
        assert.equal((await bot.replyAlt('/notes -e #foo', PRIVATE)).at(-1), hint);
        assert.equal((await bot.replyAlt('/notes #foo', PRIVATE)).at(-1), hint);
        const id = (await dbAll("SELECT id FROM notes WHERE tag = 'foo'"))[0].id;
        assert.equal((await bot.replyAlt(`/notes -v ${id}`, PRIVATE)).at(-1), hint);

        await bot.replyAlt('/notes -lock #foo', PRIVATE);
        await bot.replyAlt(PASSWORD, PRIVATE);
        const opened = await bot.replyAlt('/notes -v #foo', PRIVATE);
        assert.equal(opened.length, 1);
        assert.match(opened[0], /\*segredo 123\*/);
    });

    test('/notes -v -lock #tag: pede a senha e, liberada, já mostra (também -e, -l e -s); já liberada, mostra direto', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await bot.replyAlt('/notes #foo outro 456', PRIVATE);
        await protectFoo();
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);

        const sent = () => bot.client.sent.map(e => String(e.content));
        const before = sent().length;
        assert.match((await bot.replyAlt('/notes -v -lock #foo', PRIVATE))[0], /^🔑 Digite sua senha:/);
        // Nothing was shown yet: only the question
        const asked = sent().slice(before);
        assert.ok(asked.some(m => m.startsWith('🔑 Digite sua senha:')));
        assert.doesNotMatch(asked.join('\n'), /segredo/);
        const afterAsk = sent().length;

        await bot.replyAlt(PASSWORD, PRIVATE);
        const shown = sent().slice(afterAsk).join('\n--\n');
        assert.match(shown, /🔓 A tag #foo está liberada/);
        assert.match(shown, /\*segredo 123\*/);
        assert.match(shown, /\*outro 456\*/);
        assert.doesNotMatch(shown, /🔒 \(nota protegida\)/);

        // Already unlocked: no question, it shows
        const direct = await bot.replyAlt('/notes -v -lock #foo', PRIVATE);
        assert.equal(direct.length, 2, 'uma mensagem por nota, sem pergunta');
        assert.match(direct.join('\n'), /\*segredo 123\*[^]*\*outro 456\*/);

        // The list (-l) and the search (-s) after the password
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);
        await bot.replyAlt('/notes -s -lock #foo segredo', PRIVATE);
        const found = (await bot.replyAlt(PASSWORD, PRIVATE)).join('\n');
        assert.match(found + sent().at(-1), /segredo 123/);

        // A wrong password shows nothing; without a tag or with an unprotected tag it explains
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);
        await bot.replyAlt('/notes -v -lock #foo', PRIVATE);
        const mark = sent().length;
        await bot.replyAlt('errada123', PRIVATE);
        assert.doesNotMatch(sent().slice(mark).join('\n'), /segredo/);
        assert.match((await bot.replyAlt('/notes -v -lock', PRIVATE))[0], /^❌ Com o -lock, diga uma tag protegida/);
        await bot.replyAlt('/notes #aberta oi', PRIVATE);
        assert.match((await bot.replyAlt('/notes -v -lock #aberta', PRIVATE))[0], /^ℹ️ A tag #aberta não é protegida/);
    });

    test('travar em qualquer ordem: -n #tag, -n -lock #tag, -lock -n #tag, -n -l #tag, -l -n #tag; "-n" no texto de uma nota não trava', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await protectFoo();
        const unlockAgain = async () => {
            await bot.replyAlt('/notes -lock #foo', PRIVATE);
            await bot.replyAlt(PASSWORD, PRIVATE);
            assert.equal(lock.isUnlocked('foo'), true);
        };
        for (const form of ['/notes -n #foo', '/notes -no #foo', '/notes -now #foo', '/notes -n -lock #foo', '/notes -lock -n #foo',
            '/notes -lo -no #foo', '/notes -n -l #foo', '/notes -l -n #foo', '/notes -lock #foo -now', '/notes -lock #foo -n']) {
            assert.equal(lock.isUnlocked('foo'), true, `${form}: começou liberada`);
            assert.deepEqual(await bot.replyAlt(form, PRIVATE), ['🔒 A tag #foo foi travada.'], form);
            assert.equal(lock.isUnlocked('foo'), false, form);
            await unlockAgain();
        }

        // -n in the text of a note is text, and without a tag it explains
        await bot.replyAlt('/notes #foo comprar -n 5 itens', PRIVATE);
        assert.equal(lock.isUnlocked('foo'), true);
        assert.match((await bot.replyAlt('/notes -n', PRIVATE))[0], /^❌ Use: \/notes -lock #tag/);
        assert.match((await bot.replyAlt('/notes -n #outra', PRIVATE))[0], /^ℹ️ A tag #outra não é protegida/);
    });

    test('-v -l #tag: o -l ao lado de outro jeito de ver é o -lock; a pergunta da senha não vem com a dica de travada', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await protectFoo();
        await bot.replyAlt('/notes -n #foo', PRIVATE);
        for (const form of ['/notes -v -l #foo', '/notes -v -lo #foo', '/notes -v -lock #foo']) {
            const replies = await bot.replyAlt(form, PRIVATE);
            assert.deepEqual(replies, ['🔑 Digite sua senha:'], form);
            await bot.replyAlt('/notes -n #foo', PRIVATE);
        }
        // -l alone is still the list
        assert.match((await bot.replyAlt('/notes -l #foo', PRIVATE))[0], /🔒 \(nota protegida\)/);
    });

    test('exemplo examples/secret-notes.zb: /stash.view, /stash.add e /stash.lock na tag #stash (com e sem a senha no comando)', async () => {
        assert.match((await bot.replyAlt('/alias -examples secret-notes -yes', PRIVATE)).join('\n'), /stash\.add|stash\.lock|stash\.view|3/);
        const names = (await dbAll('SELECT name FROM command_aliases ORDER BY name')).map(r => r.name);
        assert.deepEqual(names.filter(n => n.startsWith('/stash')), ['/stash.add', '/stash.lock', '/stash.view']);
        const sent = () => bot.client.sent.map(e => String(e.content));

        // First time: /stash.view does not create the protection (it is a way to see), it says how
        assert.match((await bot.replyAlt('/stash.view', PRIVATE))[0], /^ℹ️ A tag #stash não é protegida: \/notes -lock #stash protege\./);
        assert.match((await bot.replyAlt('/notes -lock #stash', PRIVATE))[0], /^🔑 Crie uma senha para a #stash/);
        await bot.replyAlt(PASSWORD, PRIVATE);
        await bot.replyAlt(PASSWORD, PRIVATE);
        assert.equal(lock.isUnlocked('stash'), true);

        // The shortcut message does not stay in the history, and the note is saved encrypted
        const typed = bot.createMessage({ text: '/stash.add o PIN do banco é 1234', chat: OWNER.jid, de: OWNER.jid });
        await bot.deliver(typed);
        assert.doesNotMatch((await dbGet('SELECT body FROM messages WHERE id = ?', [typed.id.id])).body, /1234/);
        assert.doesNotMatch(JSON.stringify(await dbAll('SELECT text FROM notes')), /PIN|1234/);

        // /stash.lock locks right now: afterwards only the lock shows, and /stash.add is refused
        assert.deepEqual(await bot.replyAlt('/stash.lock', PRIVATE), ['🔒 A tag #stash foi travada.']);
        assert.equal(lock.isUnlocked('stash'), false);
        assert.match((await bot.replyAlt('/stash.add outra coisa', PRIVATE))[0], /^🔒 A tag #stash está travada/);

        // /stash.view asks the password, unlocks and shows
        assert.deepEqual(await bot.replyAlt('/stash.view', PRIVATE), ['🔑 Digite sua senha:']);
        const before = sent().length;
        await bot.replyAlt(PASSWORD, PRIVATE);
        assert.match(sent().slice(before).join('\n'), /\*o PIN do banco é 1234\*/);

        // The same alias takes the password from the command ($1): one message, and the message leaves
        await bot.replyAlt('/stash.lock', PRIVATE);
        const inline = bot.createMessage({ text: `/stash.view ${PASSWORD}`, chat: OWNER.jid, de: OWNER.jid });
        const mark = sent().length;
        await bot.deliver(inline);
        assert.equal(inline.deletedFor, 'todos');
        const shown = sent().slice(mark).join('\n');
        assert.match(shown, /\*o PIN do banco é 1234\*/);
        assert.doesNotMatch(shown, new RegExp(PASSWORD));
        assert.equal((await dbGet('SELECT body FROM messages WHERE id = ?', [inline.id.id])).body, '/stash.view ***');

        // In a group the notes stay locked even with the tag unlocked
        const group = await bot.replyAlt('/stash.view', { chat: GROUP });
        assert.doesNotMatch(group.join('\n'), /1234/);
    });

    test('util/lockPassword: acha a senha depois do -lock/-lo (palavra ou "entre aspas"), não confunde #tag nem -opção', () => {
        assert.deepEqual(extractPassword('-v -lock minhasenha #stash'), { password: 'minhasenha', rest: '-v -lock #stash' });
        assert.deepEqual(extractPassword('-lo "minha senha forte" #stash'), { password: 'minha senha forte', rest: '-lo #stash' });
        assert.deepEqual(extractPassword('-v -l minhasenha #stash'), { password: 'minhasenha', rest: '-v -lock #stash' });
        assert.equal(extractPassword('-v -lock #stash'), null);
        assert.equal(extractPassword('-lock -n #stash'), null);
        assert.equal(extractPassword('-lock #stash -now'), null);
        assert.equal(extractPassword('-l minhasenha #stash'), null, '-l sozinho é a lista');
        assert.equal(normalizeLock('-l #stash'), '-l #stash');

        assert.equal(maskLockPassword('executed \'/notes -v -lock minhasenha #stash\' in x'), 'executed \'/notes -v -lock *** #stash\' in x');
        assert.equal(maskLockPassword('/notes -v -l minhasenha #stash'), '/notes -v -l *** #stash');
        assert.equal(maskLockPassword('/notes -lo "minha senha" #stash'), '/notes -lo *** #stash');
        assert.equal(maskLockPassword('/notes -lock #stash -now'), '/notes -lock #stash -now');
        assert.equal(maskLockPassword('/notes -l #stash'), '/notes -l #stash');
        assert.equal(maskSecret('/stash.lock minhasenha', 'minhasenha'), '/stash.lock ***');

        // Only among the options at the start: "-lock word" in the text of a note is text
        assert.equal(extractPassword('#foo para travar use -lock palavra'), null);
        assert.equal(extractPassword('-a #foo para travar use -lock palavra'), null);
        assert.equal(extractPassword('-lock'), null);
        assert.equal(extractPassword('-lock "aberta e sem fechar'), null);
    });

    test('"-lock palavra" no texto de uma nota continua texto; sem tag, a mensagem com a senha também some', async () => {
        await bot.replyAlt('/notes #aberta para travar use -lock palavra', PRIVATE);
        assert.equal((await dbAll("SELECT text FROM notes WHERE tag = 'aberta'"))[0].text, 'para travar use -lock palavra');

        const msg = bot.createMessage({ text: '/notes -v -lock minhasenha', chat: OWNER.jid, de: OWNER.jid });
        const before = bot.client.sent.length;
        await bot.deliver(msg);
        assert.equal(msg.deletedFor, 'todos');
        assert.match(bot.client.sent.slice(before).map(e => String(e.content)).join('\n'), /^❌ Com o -lock, diga uma tag protegida/);
        const bare = bot.createMessage({ text: '/notes -lock minhasenha', chat: OWNER.jid, de: OWNER.jid });
        await bot.deliver(bare);
        assert.equal(bare.deletedFor, 'todos');
    });

    test('a senha no comando (/notes -v -lock <senha> #tag): libera e mostra; a mensagem é apagada; nada em log, histórico ou resposta', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await protectFoo();
        await bot.replyAlt('/notes -n #foo', PRIVATE);

        const before = bot.client.sent.length;
        const logsBefore = bot.logs.length;
        const msg = bot.createMessage({ text: `/notes -v -lock ${PASSWORD} #foo`, chat: OWNER.jid, de: OWNER.jid });
        msg.reply = async (content) => { bot.client.sent.push({ content, chatId: OWNER.jid }); };
        await bot.deliver(msg);

        assert.equal(msg.deletedFor, 'todos', 'o comando com a senha foi apagado');
        const sent = bot.client.sent.slice(before).map(e => String(e.content)).join('\n--\n');
        assert.match(sent, /🔓 A tag #foo está liberada/);
        assert.match(sent, /\*segredo 123\*/);
        assert.doesNotMatch(sent, new RegExp(PASSWORD), 'a senha não volta em nenhuma resposta');
        assert.doesNotMatch(bot.logs.slice(logsBefore).join('\n'), new RegExp(PASSWORD), 'nem nos logs');
        assert.match(bot.logs.slice(logsBefore).join('\n'), /executed '\/notes -v -lock \*\*\* #foo'/);
        assert.equal((await dbGet('SELECT body FROM messages WHERE id = ?', [msg.id.id])).body, '/notes -v -lock *** #foo');
        assert.doesNotMatch(JSON.stringify(await dbAll('SELECT body, raw_json FROM messages')), new RegExp(PASSWORD));

        // Already unlocked: no password needed again, but the message with it still leaves
        const again = bot.createMessage({ text: `/notes -lock ${PASSWORD} #foo`, chat: OWNER.jid, de: OWNER.jid });
        await bot.deliver(again);
        assert.equal(again.deletedFor, 'todos');
        assert.match(bot.client.sent.at(-1).content, /^🔓 A tag #foo já está liberada/);
    });

    test('senha no comando: errada avisa e conta (5 bloqueiam); sempre apagada; tag sem proteção, -now e grupo explicam', async () => {
        await protectFoo();
        await bot.replyAlt('/notes -n #foo', PRIVATE);
        const type = async (text, chat = OWNER.jid) => {
            const msg = bot.createMessage({ text, chat, de: OWNER.jid });
            const before = bot.client.sent.length;
            const logs = bot.logs.length;
            await bot.deliver(msg);
            return { msg, sent: bot.client.sent.slice(before).map(e => String(e.content)).join('\n'), logs: bot.logs.slice(logs).join('\n') };
        };

        for (let i = 1; i <= 5; i++) {
            const r = await type(`/notes -v -lock errada${i}xx #foo`);
            assert.equal(r.msg.deletedFor, 'todos', `tentativa ${i} apagada`);
            assert.match(r.sent, i < 5 ? /^❌ Senha incorreta/ : /^⛔ Muitas senhas erradas para a #foo/);
            assert.doesNotMatch(r.sent + r.logs, new RegExp(`errada${i}xx`), 'a senha errada também não aparece');
        }
        assert.match((await type(`/notes -lock ${PASSWORD} #foo`)).sent, /^⛔ Muitas senhas erradas/);

        lock.reset();
        await bot.replyAlt('/notes #aberta oi', PRIVATE);
        const unprotected = await type('/notes -lock minhasenha #aberta');
        assert.match(unprotected.sent, /^❌ A tag #aberta não é protegida: a senha no comando só abre/);
        assert.equal(unprotected.msg.deletedFor, 'todos');
        assert.doesNotMatch(unprotected.sent + unprotected.logs, /minhasenha/);

        const withNow = await type('/notes -lock minhasenha -now #aberta');
        assert.match(withNow.sent, /^❌ O -now e o -clean não pedem senha/);
        assert.equal(withNow.msg.deletedFor, 'todos');

        // In a group: it does not open anything, and the message still leaves
        const inGroup = await type('/notes -v -lock minhasenha #aberta', GROUP);
        assert.equal(inGroup.msg.deletedFor, 'todos');
        assert.match(inGroup.sent, /^🔒 A senha só é digitada no seu próprio privado/);
        assert.doesNotMatch(inGroup.sent + inGroup.logs, /minhasenha/);
    });

    test('alias com a senha (/stash.lock <senha>): o eco do alias, o log e o histórico saem com ***', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await protectFoo();
        await bot.replyAlt('/notes -n #foo', PRIVATE);
        await bot.replyAlt('/alias /foo.lock /notes -v -lock $@ #foo', PRIVATE); // without -q: the alias echoes its command

        const msg = bot.createMessage({ text: `/foo.lock ${PASSWORD}`, chat: OWNER.jid, de: OWNER.jid });
        const before = bot.client.sent.length;
        const logs = bot.logs.length;
        await bot.deliver(msg);
        const sent = bot.client.sent.slice(before).map(e => String(e.content)).join('\n--\n');
        assert.match(sent, /🔗 Alias \/foo\.lock -> \/notes -v -lock \*\*\* #foo/);
        assert.match(sent, /\*segredo 123\*/);
        assert.doesNotMatch(sent, new RegExp(PASSWORD));
        assert.doesNotMatch(bot.logs.slice(logs).join('\n'), new RegExp(PASSWORD));
        assert.equal((await dbGet('SELECT body FROM messages WHERE id = ?', [msg.id.id])).body, '/foo.lock ***');
        assert.equal(msg.deletedFor, 'todos');
    });

    test('só abre e só se acessa no seu privado: liberada, num grupo ou com -to continua travada para quem lê', async () => {
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await protectFoo();
        assert.equal(lock.isUnlocked('foo'), true, 'liberada no privado');

        // In the group: the same tag, unlocked, shows only the lock and says where it opens
        const [view, hint] = await bot.replyAlt('/notes -v #foo', { chat: GROUP });
        assert.match(view, /🔒 \(nota protegida\)/);
        assert.doesNotMatch(view, /segredo/);
        assert.equal(hint, '🔒 As notas da #foo só abrem no seu próprio privado (as mensagens com você mesmo).');
        for (const cmd of ['/notes #foo', '/notes -s segredo', '/notes -e #foo']) {
            const replies = (await bot.replyAlt(cmd, { chat: GROUP })).join('\n');
            assert.doesNotMatch(replies, /segredo 123/, cmd);
        }
        // Writing in a group is refused (and the command does not stay in the history)
        const typed = bot.createMessage({ text: '/notes #foo mais um segredo', chat: GROUP, de: OWNER.jid });
        await bot.deliver(typed);
        assert.match(bot.client.sent.at(-1).content, /^🔒 As notas da #foo só abrem no seu próprio privado/);
        assert.equal((await dbAll("SELECT id FROM notes WHERE tag = 'foo'")).length, 1);
        assert.doesNotMatch((await dbGet('SELECT body FROM messages WHERE id = ?', [typed.id.id])).body, /mais um segredo/);
        const noteId = (await dbAll("SELECT id FROM notes WHERE tag = 'foo'"))[0].id;
        assert.match((await bot.replyAlt(`/notes -u ${noteId} trocar`, { chat: GROUP }))[0], /^🔒 As notas da #foo só abrem/);

        // Unlocking in a group is refused, with the password typed there (the message still leaves)
        await bot.replyAlt('/notes -n #foo', PRIVATE);
        assert.match((await bot.replyAlt('/notes -lock #foo', { chat: GROUP }))[0], /^🔒 A senha só é digitada no seu próprio privado/);

        // In the private chat it works; with -to, never: the command is refused, nothing goes out
        await bot.replyAlt('/notes -lock #foo', PRIVATE);
        await bot.replyAlt(PASSWORD, PRIVATE);
        assert.match((await bot.replyAlt('/notes -v #foo', PRIVATE))[0], /\*segredo 123\*/);
        const before = bot.client.sent.length;
        const sent = await bot.replyAlt('/notes -v #foo -to /Fulano/', PRIVATE);
        assert.match(sent[0], /^🔒 As notas da #foo são protegidas: não vão para outros chats nem e-mails \(sem -to\)/);
        assert.doesNotMatch(bot.client.sent.slice(before).map(e => String(e.content)).join('\n'), /segredo/);
        assert.match((await bot.replyAlt('/notes -e #foo -to fulano@exemplo.com', PRIVATE))[0], /^🔒 As notas da #foo são protegidas/);
        // A list of everything sent to another place shows no protected text either
        const all = (await bot.replyAlt('/notes -l -to /Fulano/', PRIVATE)).join('\n');
        assert.doesNotMatch(all, /segredo 123/);
    });

    test('o eco das mensagens do próprio bot (voltam como suas) não é tomado como a senha', async () => {
        const echo = async (text) => {
            const before = bot.client.sent.length;
            await bot.deliver(bot.createMessage({ text, chat: OWNER.jid, de: OWNER.jid }));
            assert.equal(bot.client.sent.length, before, `o eco "${text.slice(0, 20)}" não gerou resposta`);
        };
        const [ask] = await bot.replyAlt('/notes -lock #foo', PRIVATE);
        await echo(ask);
        const [again] = await bot.replyAlt(PASSWORD, PRIVATE);
        assert.equal(again, '🔑 Repita a senha:');
        await echo(again);
        const [done] = await bot.replyAlt(PASSWORD, PRIVATE);
        assert.match(done, /^🔓 A tag #foo agora está protegida/);
        await echo(done);
        assert.equal(lock.isUnlocked('foo'), true);
    });

    test('travar (-now|-n|-no), listar travada, senha errada, liberar e o tempo (renova com o uso)', async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
        await bot.replyAlt('/notes #foo segredo 123', PRIVATE);
        await protectFoo();

        assert.deepEqual(await bot.replyAlt('/notes -lock #foo -now', PRIVATE), ['🔒 A tag #foo foi travada.']);
        assert.deepEqual(await bot.replyAlt('/notes -lock #foo -n', PRIVATE), ['ℹ️ A tag #foo já estava travada.']);
        const [list] = await bot.replyAlt('/notes #foo', PRIVATE);
        assert.match(list, /🔒 \(nota protegida\)/);
        assert.doesNotMatch(list, /segredo/);
        assert.match((await bot.replyAlt('/notes #foo mais uma', PRIVATE))[0], /^🔒 A tag #foo está travada: \/notes -lock #foo/);

        // Wrong password, then right
        assert.deepEqual(await bot.replyAlt('/notes -lock #foo', PRIVATE), ['🔑 Digite sua senha:']);
        assert.deepEqual(await bot.replyAlt('errada123', PRIVATE), ['❌ Senha incorreta.']);
        await bot.replyAlt('/notes -lock #foo', PRIVATE);
        assert.deepEqual(await bot.replyAlt(PASSWORD, PRIVATE), ['🔓 A tag #foo está liberada, vai ser travada em 5m sem interagir.']);
        assert.match((await bot.replyAlt('/notes #foo', PRIVATE))[0], /segredo 123/);

        // 4 minutes + use = renews; 6 minutes without use = locked
        t.mock.timers.tick(4 * 60 * 1000);
        assert.equal(lock.isUnlocked('foo'), true);
        await bot.replyAlt('/notes #foo', PRIVATE);
        t.mock.timers.tick(4 * 60 * 1000);
        assert.equal(lock.isUnlocked('foo'), true, 'o uso renovou');
        t.mock.timers.tick(2 * 60 * 1000);
        assert.equal(lock.isUnlocked('foo'), false, 'sem uso, travou');
        assert.match((await bot.replyAlt('/notes #foo', PRIVATE))[0], /🔒 \(nota protegida\)/);
    });

    test('anotar na tag liberada: vai cifrado, o comando some do histórico e o aviso não mostra o texto', async () => {
        await protectFoo();
        const msg = bot.createMessage({ text: '/notes #foo outra coisa secreta', chat: OWNER.jid, de: OWNER.jid });
        await bot.deliver(msg);
        const saved = (await dbAll('SELECT * FROM notes'))[0];
        assert.match(saved.text, /^enc:v1:/);
        assert.doesNotMatch(saved.text, /secreta/);
        assert.equal((await dbGet('SELECT body FROM messages WHERE id = ?', [msg.id.id])).body, '/notes #foo ***');
        assert.match(bot.client.sent.at(-1).content, /^📝 \*#\d+\* · #foo · 🔒$/);

        // -update keeps it encrypted and in the tag
        await bot.replyAlt(`/notes -u ${saved.id} trocou o texto`, PRIVATE);
        assert.match((await row(saved.id)).text, /^enc:v1:/);
        assert.match((await bot.replyAlt('/notes #foo', PRIVATE))[0], /trocou o texto/);
        assert.match((await bot.replyAlt(`/notes -u ${saved.id} #outra x`, PRIVATE))[0], /^❌ A #foo é protegida/);
        assert.match((await bot.replyAlt('/notes -m #foo #nova', PRIVATE))[0], /^❌ A #foo é protegida/);
    });

    test('só no seu privado; tag precisa de nome; 5 senhas erradas bloqueiam; /comando cancela o pedido', async () => {
        assert.match((await bot.replyAlt('/notes -lock #foo', { chat: GROUP }))[0], /^🔒 A senha só é digitada no seu próprio privado/);
        assert.match((await bot.replyAlt('/notes -lock', PRIVATE))[0], /^❌ Use: \/notes -lock #tag/);
        assert.match((await bot.replyAlt('/notes -lock #foo #bar', PRIVATE))[0], /^❌ Use: \/notes -lock #tag/);

        await protectFoo();
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);
        for (let i = 1; i <= 5; i++) {
            await bot.replyAlt('/notes -lock #foo', PRIVATE);
            const [r] = await bot.replyAlt(`errada${i}xx`, PRIVATE);
            assert.match(r, i < 5 ? /^❌ Senha incorreta/ : /^⛔ Muitas senhas erradas para a #foo: tente de novo em 15 min/);
        }
        assert.match((await bot.replyAlt('/notes -lock #foo', PRIVATE))[0], /^⛔ Muitas senhas erradas/);

        // A command typed instead of the password is a command: cancels the question
        await bot.restart();
        await bot.replyAlt('/notes -lock #zed', PRIVATE);
        assert.match((await bot.replyAlt('/ping', PRIVATE))[0] ?? '', /pong|🏓|Pong/i);
        assert.deepEqual(await bot.replyAlt('qualquer coisa', PRIVATE), []);

        // Too short password
        await bot.replyAlt('/notes -lock #zed', PRIVATE);
        assert.match((await bot.replyAlt('abc', PRIVATE))[0], /^❌ A senha precisa de pelo menos 6 caracteres/);
        await bot.replyAlt('/notes -lock #zed', PRIVATE);
        await bot.replyAlt(PASSWORD, PRIVATE);
        assert.match((await bot.replyAlt('outra-senha', PRIVATE))[0], /^❌ As senhas não conferem/);
    });

    test('arquivo da nota: cifrado em .enc, a cópia aberta só existe com a tag liberada, e some ao travar', async () => {
        await protectFoo();
        const original = path.join(CACHE_DIR, 'notes', '1_abc_arquivo.txt');
        fs.mkdirSync(path.dirname(original), { recursive: true });
        fs.writeFileSync(original, 'conteudo secreto do arquivo');
        const sealed = await lock.sealFile('foo', original);
        assert.equal(sealed, `${original}.enc`);
        assert.equal(fs.existsSync(original), false);
        assert.doesNotMatch(fs.readFileSync(sealed).toString('latin1'), /secreto/);

        const note = inPrivate(() => lock.open({ id: 9, tag: 'foo', text: lock.sealText('foo', 'x'), media_path: sealed, media_mime: 'text/plain' }));
        assert.equal(note.text, 'x');
        await inPrivate(() => lock.ensurePlain(note));
        assert.equal(fs.readFileSync(note.media_path, 'utf8'), 'conteudo secreto do arquivo');
        lock.lockNow('foo');
        assert.equal(fs.existsSync(note.media_path), false, 'a cópia aberta foi apagada');
        assert.equal(inPrivate(() => lock.open({ id: 9, tag: 'foo', text: 'enc:v1:x', media_path: sealed })).locked, true);
    });

    test('proteger uma tag que já tem várias mídias: todas cifradas, o original some e a nota abre depois', async () => {
        const dir = path.join(CACHE_DIR, 'notes');
        fs.mkdirSync(dir, { recursive: true });
        const files = ['foto.jpg', 'video.mp4', 'doc.pdf'].map((n, i) => path.join(dir, `${1000 + i}_abc${i}_${n}`));
        files.forEach((f, i) => fs.writeFileSync(f, `conteudo-secreto-${i}`));
        const insert = (text, file, mime, tag = 'foo') => bot.src('db').dbRun(
            'INSERT INTO notes (text, tag, media_path, media_mime, created_at) VALUES (?, ?, ?, ?, ?)', [text, tag, file, mime, Date.now()]);
        await insert('foto', files[0], 'image/jpeg');
        await insert('video', files[1], 'video/mp4');
        await insert('doc', files[2], 'application/pdf');
        await insert('de outra tag', null, null, 'bar');
        const other = path.join(dir, '2000_zzz_fora.jpg');
        fs.writeFileSync(other, 'fora da tag');
        await bot.src('db').dbRun('UPDATE notes SET media_path = ? WHERE tag = ?', [other, 'bar']);

        const [done] = await protectFoo();
        assert.match(done, /\(3 notas cifradas\)/);
        for (const f of files) {
            assert.equal(fs.existsSync(f), false, 'o original sumiu');
            assert.equal(fs.existsSync(`${f}.enc`), true);
            assert.doesNotMatch(fs.readFileSync(`${f}.enc`).toString('latin1'), /conteudo-secreto/);
        }
        assert.equal(fs.readFileSync(other, 'utf8'), 'fora da tag', 'a outra tag não foi tocada');
        const rows = await dbAll("SELECT media_path FROM notes WHERE tag = 'foo' ORDER BY id");
        assert.deepEqual(rows.map(r => r.media_path), files.map(f => `${f}.enc`));

        // Opens again: the content comes back byte by byte
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);
        await bot.replyAlt('/notes -lock #foo', PRIVATE);
        await bot.replyAlt(PASSWORD, PRIVATE);
        const notes = (await dbAll("SELECT * FROM notes WHERE tag = 'foo' ORDER BY id")).map(n => inPrivate(() => lock.open(n)));
        for (const [i, n] of notes.entries()) {
            await inPrivate(() => lock.ensurePlain(n));
            assert.equal(fs.readFileSync(n.media_path, 'utf8'), `conteudo-secreto-${i}`);
        }

        // What was left half done (an original that came back) is finished when the tag is unlocked
        fs.writeFileSync(files[0], 'conteudo-secreto-0');
        await bot.src('db').dbRun('UPDATE notes SET media_path = ? WHERE id = ?', [files[0], notes[0].id]);
        await bot.replyAlt('/notes -lock #foo -now', PRIVATE);
        await bot.replyAlt('/notes -lock #foo', PRIVATE);
        await bot.replyAlt(PASSWORD, PRIVATE);
        assert.equal(fs.existsSync(files[0]), false);
        assert.equal((await row(notes[0].id)).media_path, `${files[0]}.enc`);
    });

    test('alerta de nota protegida não leva o texto; -clean apaga os comandos antigos da tag (só com -yes)', async () => {
        await bot.replyAlt('/notes #foo velho 1', PRIVATE);
        await bot.replyAlt('/notes #bar fica', PRIVATE);
        await protectFoo();
        assert.match((await bot.replyAlt('/notes -lock #foo -clean', PRIVATE))[0], /^⚠️ 1 comandos antigos da #foo/);
        assert.match((await bot.replyAlt('/notes -lock #foo -clean -yes', PRIVATE))[0], /^🧹 1 comandos antigos apagados/);
        assert.equal((await dbAll("SELECT id FROM messages WHERE body LIKE '/notes #foo velho%'")).length, 0);
        assert.equal((await dbAll("SELECT id FROM messages WHERE body LIKE '/notes #bar%'")).length, 1);

        // Alert: the text does not go out
        await bot.replyAlt('/notes #foo -alert +1m', PRIVATE).catch(() => {});
        const sentBefore = bot.client.sent.length;
        const all = await dbAll('SELECT id FROM notes WHERE tag = ?', ['foo']);
        await bot.src('db').dbRun('UPDATE notes SET alert_at = ? WHERE id = ?', [Date.now() - 1000, all[0].id]);
        await checkNotes();
        const sent = bot.client.sent.slice(sentBefore).map(e => String(e.content)).join('\n');
        assert.match(sent, /🔒 Você tem uma nota na tag protegida #foo/);
        assert.doesNotMatch(sent, /velho/);
    });
});
