/*
 * /bot -status: the report of the last 24 h and the daily send (by the schedule).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { checkSchedule } = bot.src('schedule');
const { fmtWhen } = bot.src('util/when');

const DAY = 86400_000;

beforeEach(() => bot.restart());

async function deleted(textAlt, optionsAlt = {}) {
    const msg = bot.createMessage({ texto: textAlt, de: OTHERAlt.jid, ...optionsAlt });
    await bot.deliver(msg);
    return bot.apagar(msg);
}

describe('/bot -status', () => {
    test('relatório das últimas 24 h, com cada contagem', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await bot.deliver(bot.createMessage({ texto: 'manda o pix', de: OTHERAlt.jid }));
        await bot.deliver(bot.createMessage({ texto: 'outro pix', de: OTHERAlt.jid }));
        await bot.deliver(bot.createMessage({ texto: 'paga o boleto', de: OTHERAlt.jid }));

        await deleted('uma');
        await deleted('duas');
        await deleted('meu status', { chat: 'status@broadcast' });
        const edited = bot.createMessage({ texto: 'a', de: OTHERAlt.jid });
        await bot.deliver(edited);
        await bot.edit(edited, 'b');

        // An old deleted one does not enter the 24 h
        await bot.dbRun("UPDATE messages SET revoked_at = ? WHERE body = 'duas'", [Date.now() - 2 * DAY]);

        // /mudo: an ignored notice
        await bot.replyAlt('/mudo -d +5521911111111');
        await deleted('silenciada');

        const [r] = await bot.replyAlt('/bot -status');
        assert.match(r, /^📊 \*Status do ZapBot [\d.]+\* · últimas 24 h\n_\w{3} \d\d\/\d\d \d\d:\d\d_\n\n/);
        assert.match(r, /🤖 \*No ar:\* .* · conectado: /);
        assert.match(r, /🗄️ \*Cache:\* [\d.]+ \w+ _\(banco [\d.]+ \w+ · mídias [\d.]+ \w+\)_ · \d+ mensagens/);
        assert.match(r, /👀 \*Watch:\* 3 ocorrências _\(#1 pix: 2, #2 boleto: 1\)_/);
        assert.match(r, /🗑️ \*Apagadas:\* 2\n/);   // "one" and the muted one (the "two" is old)
        assert.match(r, /✏️ \*Editadas:\* 1\n/);
        assert.match(r, /📸 \*Status apagados:\* 1\n/);
        assert.match(r, /🔇 \*Ignoradas \(\/mudo\):\* 1 _\(apagadas 1\)_/);
        assert.match(r, /💾 \*Último backup:\* nenhum/);
        assert.match(r, /\n\n🔕 Status diário desligado\.\n💡 _Ligue com \/bot -status 06h \(no horário que quiser\)\._$/);
    });

    test('com o aviso desligado, a linha diz como ligar de novo', async () => {
        await bot.setSetting('show.alert.deleted', false);
        await bot.setSetting('show.alert.edited', false);
        await bot.setSetting('show.alert.status', false);

        const [r] = await bot.replyAlt('/bot -status');
        assert.match(r, /🗑️ \*Apagadas:\* 0 _\(aviso desligado; ligue com \/set show\.alert\.deleted on\)_\n/);
        assert.match(r, /✏️ \*Editadas:\* 0 _\(aviso desligado; ligue com \/set show\.alert\.edited on\)_\n/);
        assert.match(r, /📸 \*Status apagados:\* 0 _\(recuperação desligada; ligue com \/set show\.alert\.status on\)_\n/);
    });

    test('-status 06h agenda no seu privado; o relatório mostra no fim; o envio sai pela agenda, todo dia', async () => {
        const [r] = await bot.replyAlt('/bot -status 06h');
        assert.match(r, /^⏰ \*Status diário:\* todo dia às \*06:00\*, no seu privado\.\n📅 Próximo: \w{3} \d\d\/\d\d 06:00$/);

        assert.match((await bot.replyAlt('/bot -status'))[0], /\n\n⏰ \*Status diário:\* todo dia às \*06:00\*, no seu privado\.\n📅 Próximo: \w{3} \d\d\/\d\d 06:00\n💡 _Mude com \/bot -status <hora> ou desligue com \/bot -status off\._$/);

        // Does not appear in the /cron schedule, nor count toward the limit
        assert.match((await bot.replyAlt('/cron'))[0], /📅 Nada agendado/);

        // Trocar a hora substitui; formatos aceitos
        await bot.replyAlt('/bot -status às 18h30');
        const items = await bot.dbAll("SELECT * FROM schedules WHERE kind = 'status'");
        assert.equal(items.length, 1);
        assert.equal(fmtWhen(items[0].due_at).slice(-5), '18:30');

        // At once: the report goes to your private chat, and the next one is left for tomorrow
        await bot.dbRun("UPDATE schedules SET due_at = ? WHERE kind = 'status'", [Date.now() - 1000]);
        const beforeAlt = bot.client.enviadas.length;
        await checkSchedule();
        const [sentAlt] = bot.client.enviadas.slice(beforeAlt);
        assert.equal(sentAlt.chatId, OWNER.jid);
        assert.match(sentAlt.content, /^📊 \*Status do ZapBot/);
        const [next] = await bot.dbAll("SELECT due_at FROM schedules WHERE kind = 'status'");
        assert.ok(next.due_at > Date.now() && next.due_at <= Date.now() + DAY);
    });

    test('-status off desliga; hora inválida; não combina; o /cron -rm all não apaga o status diário', async () => {
        await bot.replyAlt('/bot -status 7h');
        await bot.replyAlt('/cron +1h -to +5521911111111 oi');
        await bot.replyAlt('/cron -rm all');
        assert.equal((await bot.dbAll("SELECT * FROM schedules WHERE kind = 'status'")).length, 1);

        assert.deepEqual(await bot.replyAlt('/bot -status off'), ['🔕 Status diário desligado.']);
        assert.deepEqual(await bot.replyAlt('/bot -status OFF'), ['ℹ️ O status diário já estava desligado.']);
        assert.match((await bot.replyAlt('/bot -s'))[0], /🔕 Status diário desligado/);
        assert.match((await bot.replyAlt('/bot -status 25h'))[0], /❌ Não entendi a hora/);
        assert.match((await bot.replyAlt('/bot -on -status'))[0], /❌ O -status não combina com as outras opções/);
        assert.equal(bot.getSetting('bot.paused'), false);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt('/bot -status', { de: OTHERAlt.jid, chat: GROUP }), []);
        assert.deepEqual(await bot.replyAlt('/status'), [], 'o /status virou /bot -status');
    });
});
