/*
 * /stats, /watch, /cache and /show in English (zapbot.lang = en_US). The other tests run in pt_BR.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP } = bot;
const { countStats } = bot.src('stats');
const { setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.restart();
    await setSetting('zapbot.lang', 'en_US');
});

const my = (line) => bot.replyAlt(line, { chat: OWNER.jid });

test('/stats em inglês: sem dados, ranking e os atalhos', async () => {
    assert.match((await my('/stats'))[0], /^📊 No statistics for this chat in the last 7 days\./);
    for (let i = 0; i < 3; i++) {
        await countStats({ chatId: GROUP, chatName: 'Family', isGroup: 1, senderId: 'a', senderName: 'Aunt', when: Date.now(), fields: { msgs: 1 } });
    }
    const [r] = await my('/stats /family/');
    assert.match(r, /📊 \*Statistics of Family\*\n_Last 7 days_/);
    assert.match(r, /💬 \*Messages:\* 3 _\(average 0\/day\)_/);
    assert.match(r, /🏆 \*Who talks the most\*/);
    assert.match(r, /⏰ \*Peak hour:\*[\s\S]*3 msgs/);
    assert.match(r, /💡 _\/stats -l for the other chats_/);
});

test('/watch em inglês: adicionar, listar, erro de opção e remover', async () => {
    assert.match((await my('/watch'))[0], /WATCH: RULES[\s\S]*No rules registered\./);
    assert.equal((await my('/watch promo'))[0],
        '✅ Rule *#1* added _(text)_: promo\n💡 _Alerts in your private chat._');
    assert.match((await my('/watch'))[0], /#1 {2}promo {2}\(0\)[\s\S]*\*Tips\*/);
    assert.match((await my('/watch -x'))[0], /^❌ unknown option: -x\./);
    assert.match((await my('/watch -s 9'))[0], /^❌ Rule #9 does not exist\.\n💡 _There are 1 rule: see \/watch -l_/);
    assert.match((await my('/watch -rm 1'))[0], /^🗑️ Rule \*#1\* removed: promo\n🗄️ Hits deleted: \*0\*/);
});

test('/cache em inglês: resumo do cache', async () => {
    const [r] = await my('/cache');
    assert.match(r, /🗂️ Showing contents of /);
    assert.match(r, /🗄️ \d+ messages? in the cache\./);
    assert.match(r, /📦 Backups: \d+ \(see \/backup\)\./);
});

test('/show em inglês: sem apagadas e o cache vazio', async () => {
    assert.match((await bot.replyAlt('/show', { chat: GROUP }))[0], /^♻️ No deleted messages recorded in this chat\./);
    assert.match((await my('/show -l'))[0], /^🗄️ \*Messages in the cache\*/);
});
