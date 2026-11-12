/*
 * /notes e /monitor em inglês (zapbot.lang = en_US). Os outros testes rodam em pt_BR.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.reiniciar();
    await bot.dbRun('DELETE FROM notes');
    await bot.dbRun("DELETE FROM sqlite_sequence WHERE name = 'notes'");
    await setSetting('zapbot.lang', 'en_US');
});

test('/notes em inglês: vazio, anotar, listar, tags, remover e erro', async () => {
    assert.equal((await bot.responder('/notes'))[0], '📝 No notes.\n💡 _Add one with /notes #tag <text>_');
    assert.equal((await bot.responder('/notes #home buy milk'))[0], '📝 *#1* · #home · buy milk');
    await bot.responder('/notes #home call mom');
    assert.match((await bot.responder('/notes'))[0], /Notes \(2\)[\s\S]*TAGS \(1\)[\s\S]*#home: 2/);
    assert.match((await bot.responder('/notes #home'))[0], /\*NOTES\*/);
    assert.equal((await bot.responder('/notes -rm 1'))[0], '🗑️ 1 note removed.');
    assert.equal((await bot.responder('/notes -rm 9'))[0].split('\n')[0], "❌ ID 9 doesn't exist. See the list with /notes -l");
    assert.equal((await bot.responder('/notes -rm 7 8'))[0].split('\n')[0],
        "❌ IDs 7, 8 don't exist. Nothing was changed; see the list with /notes -l");
});

test('/notes -alerta em inglês: lista vazia e alerta no passado', async () => {
    assert.match((await bot.responder('/notes -alerta'))[0], /^🔔 No notes with an alert\./);
    await bot.responder('/notes #home buy milk');
    assert.match((await bot.responder('/notes -alerta 1 xyz'))[0], /^❌ Invalid time: "xyz"/);
});

test('/monitor em inglês: lista vazia e uso', async () => {
    assert.match((await bot.responder('/monitor'))[0], /MONITOR[\s\S]*No contacts registered\.[\s\S]*Frequent checks/);
    assert.match((await bot.responder('/monitor -add'))[0], /^❌ Give a contact:/);
});
