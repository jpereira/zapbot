/*
 * /bot, /set, /backup, /alias, /batch, /debug and /cron in English (zapbot.lang = en_US). The other tests run in pt_BR.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { BACKUP_DIR } = bot.src('constants');
const { setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.restart();
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    await bot.dbRun('DELETE FROM schedules');
    await bot.dbRun('DELETE FROM command_aliases');
    await setSetting('zapbot.lang', 'en_US');
});

test('/set em inglês: desconhecido, valor inválido e detalhe da chave', async () => {
    assert.equal((await bot.replyAlt('/set nada.disso x'))[0], '❌ Unknown setting: nada.disso\n💡 _See them all with /set_');
    assert.match((await bot.replyAlt('/set ascii.defaultChar ab'))[0], /^❌ Invalid value for \*ascii\.defaultChar\*: must be a single character/);
    assert.match((await bot.replyAlt('/set ascii.defaultChar'))[0], /\*Value:\* #\n\*Default:\* #\n\*Type:\* string/);
});

test('/backup em inglês: vazio, criar e remover', async () => {
    assert.match((await bot.replyAlt('/backup -l'))[0], /^💾 No backups yet\./);
    assert.match((await bot.replyAlt('/backup -now'))[0], /^💾 \*Backup created\*/);
    assert.match((await bot.replyAlt('/backup -l'))[0], /\* · .* · manual/);
    assert.match((await bot.replyAlt('/backup -i 9'))[0], /^❌ Backup 9 does not exist\./);
    assert.equal((await bot.replyAlt('/backup -rm all'))[0], '🗑️ 1 backup removed.');
});

test('/alias, /batch e /debug em inglês: erros de uso', async () => {
    assert.match((await bot.replyAlt('/alias -move a'))[0], /^Usage: \/alias -move <current name> <new name>/);
    assert.equal((await bot.replyAlt('/alias -rm /x'))[0], '❌ Alias /x not found.');
    assert.match((await bot.replyAlt('/batch'))[0], /^```Usage: \/batch .*the commands go on the lines below/);
    assert.match((await bot.replyAlt('/debug -level 9'))[0], /^❌ provide a level from 0 to 3/);
});

test('/cron em inglês: lista vazia, criar lembrete e erro de nº', async () => {
    assert.match((await bot.replyAlt('/cron'))[0], /^📅 Nothing scheduled\.\n💡 _E\.g\.: \/cron friday 18h/);
    assert.match((await bot.replyAlt('/cron -reminder +2h pay the bill'))[0], /^⏰ \*Reminder created\* for \*.+\* in this chat\.\n📝 pay the bill$/);
    assert.match((await bot.replyAlt('/cron -rm 7'))[0], /^❌ No\. 7 does not exist\. Nothing was removed;/);
});

test('/bot em inglês: ligar e desligar, e quem usa', async () => {
    await setSetting('bot.users', []);
    assert.match((await bot.replyAlt('/bot -off'))[0], /^⏸️ \*Bot:\* off \(all commands are ignored\)\n🔒 \*Commands:\* owner only/);
    assert.match((await bot.replyAlt('/bot -on'))[0], /^▶️ \*Bot:\* on\n/);
    assert.match((await bot.replyAlt('/bot -list-users x'))[0], /^Usage: \/bot -list-users \[all\]/);
});
