/*
 * /bot, /set, /backup, /alias, /batch, /debug e /cron em inglês (zapbot.lang = en_US). Os outros testes rodam em pt_BR.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { BACKUP_DIR } = bot.src('constantes');
const { setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.reiniciar();
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    await bot.dbRun('DELETE FROM schedules');
    await bot.dbRun('DELETE FROM command_aliases');
    await setSetting('zapbot.lang', 'en_US');
});

test('/set em inglês: desconhecido, valor inválido e detalhe da chave', async () => {
    assert.equal((await bot.responder('/set nada.disso x'))[0], '❌ Unknown setting: nada.disso\n💡 _See them all with /set_');
    assert.match((await bot.responder('/set ascii.defaultChar ab'))[0], /^❌ Invalid value for \*ascii\.defaultChar\*: must be a single character/);
    assert.match((await bot.responder('/set ascii.defaultChar'))[0], /\*Value:\* #\n\*Default:\* #\n\*Type:\* string/);
});

test('/backup em inglês: vazio, criar e remover', async () => {
    assert.match((await bot.responder('/backup -l'))[0], /^💾 No backups yet\./);
    assert.match((await bot.responder('/backup -now'))[0], /^💾 \*Backup created\*/);
    assert.match((await bot.responder('/backup -l'))[0], /\* · .* · manual/);
    assert.match((await bot.responder('/backup -i 9'))[0], /^❌ Backup 9 does not exist\./);
    assert.equal((await bot.responder('/backup -rm all'))[0], '🗑️ 1 backup removed.');
});

test('/alias, /batch e /debug em inglês: erros de uso', async () => {
    assert.match((await bot.responder('/alias -move a'))[0], /^❌ Use: \/alias -move <current name> <new name>/);
    assert.equal((await bot.responder('/alias -rm /x'))[0], '❌ Alias /x not found.');
    assert.match((await bot.responder('/batch'))[0], /^❌ Use: \/batch .* and, on the lines below/);
    assert.match((await bot.responder('/debug -level 9'))[0], /^❌ provide a level from 0 to 3/);
});

test('/cron em inglês: lista vazia, criar lembrete e erro de nº', async () => {
    assert.match((await bot.responder('/cron'))[0], /^📅 Nothing scheduled\.\n💡 _E\.g\.: \/cron friday 18h/);
    assert.match((await bot.responder('/cron -lembrete +2h pay the bill'))[0], /^⏰ \*Reminder created\* for \*.+\* in this chat\.\n📝 pay the bill$/);
    assert.match((await bot.responder('/cron -rm 7'))[0], /^❌ No\. 7 does not exist\. Nothing was removed;/);
});

test('/bot em inglês: ligar e desligar, e quem usa', async () => {
    await setSetting('bot.users', []);
    assert.match((await bot.responder('/bot -off'))[0], /^⏸️ \*Bot:\* off \(all commands are ignored\)\n🔒 \*Commands:\* owner only/);
    assert.match((await bot.responder('/bot -on'))[0], /^▶️ \*Bot:\* on\n/);
    assert.match((await bot.responder('/bot -list-users x'))[0], /^❌ Use: \/bot -list-users \[all\]/);
});
