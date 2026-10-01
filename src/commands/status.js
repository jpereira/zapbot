/*
 * Comando /status.
 */

const { getCommandSyntax } = require('./base');
const { schedulingDaily, scheduleStatusDaily, turnOffStatusDaily, itemHour, statusText } = require('../status');
const { fmtWhen, readHour } = require('../util/when');

/*
 * /status            → the report now (last 24 h)
 * /status 06h        → every day at 06:00 (Brasília), in your private chat ("6h", "06:00", "às 6h30"...)
 * /status -l         → the daily send time and the next one
 * /status -off       → turns off the daily send
 */
async function cmdStatus({ msg, opts }) {
    const extras = opts.argv.filter(Boolean);

    if (opts.opt.off) {
        await msg.reply(await turnOffStatusDaily()
            ? '🔕 Status diário desligado.'
            : 'ℹ️ O status diário já estava desligado.');
        return;
    }

    if (opts.opt.list) {
        const daily = await schedulingDaily();
        await msg.reply(daily
            ? `⏰ *Status diário:* todo dia às *${itemHour(daily)}*, no seu privado.\n📅 Próximo: ${fmtWhen(daily.due_at)}\n💡 _Mude com /status <hora> ou desligue com /status -off._`
            : '🔕 Status diário desligado.\n💡 _Ligue com /status 06h (no horário que quiser)._');
        return;
    }

    if (!extras.length) {
        await msg.reply(await statusText());
        return;
    }

    // "at 6h" or "6h": the time of the daily send
    const hour = readHour(extras.filter(e => !/^[àa]s$/i.test(e)).join(''));
    if (!hour || extras.length > 2) {
        await msg.reply('❌ Não entendi a hora. Use 06h, 6h30, 06:00 ou às 18h.\n\n```' + getCommandSyntax('/status') + '```');
        return;
    }

    const next = await scheduleStatusDaily(hour);
    const two = (n) => String(n).padStart(2, '0');
    await msg.reply(`⏰ *Status diário:* todo dia às *${two(hour.h)}:${two(hour.m)}*, no seu privado.\n📅 Próximo: ${fmtWhen(next)}`);
}

module.exports = {
    cmdStatus
};
