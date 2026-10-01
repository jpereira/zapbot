/*
 * Comando /status.
 */

const { getCommandSyntax } = require('./base');
const { agendamentoDiario, agendarStatusDiario, desligarStatusDiario, horaDoItem, textoDoStatus } = require('../status');
const { fmtQuando, lerHora } = require('../util/quando');

/*
 * /status            → o relatório agora (últimas 24 h)
 * /status 06h        → todo dia às 06:00 (Brasília), no seu privado ("6h", "06:00", "às 6h30"...)
 * /status -l         → o horário do envio diário e o próximo
 * /status -off       → desliga o envio diário
 */
async function cmdStatus({ msg, opts }) {
    const extras = opts.argv.filter(Boolean);

    if (opts.opt.off) {
        await msg.reply(await desligarStatusDiario()
            ? '🔕 Status diário desligado.'
            : 'ℹ️ O status diário já estava desligado.');
        return;
    }

    if (opts.opt.list) {
        const diario = await agendamentoDiario();
        await msg.reply(diario
            ? `⏰ *Status diário:* todo dia às *${horaDoItem(diario)}*, no seu privado.\n📅 Próximo: ${fmtQuando(diario.due_at)}\n💡 _Mude com /status <hora> ou desligue com /status -off._`
            : '🔕 Status diário desligado.\n💡 _Ligue com /status 06h (no horário que quiser)._');
        return;
    }

    if (!extras.length) {
        await msg.reply(await textoDoStatus());
        return;
    }

    // "às 6h" ou "6h": a hora do envio diário
    const hora = lerHora(extras.filter(e => !/^[àa]s$/i.test(e)).join(''));
    if (!hora || extras.length > 2) {
        await msg.reply('❌ Não entendi a hora. Use 06h, 6h30, 06:00 ou às 18h.\n\n```' + getCommandSyntax('/status') + '```');
        return;
    }

    const proximo = await agendarStatusDiario(hora);
    const dois = (n) => String(n).padStart(2, '0');
    await msg.reply(`⏰ *Status diário:* todo dia às *${dois(hora.h)}:${dois(hora.m)}*, no seu privado.\n📅 Próximo: ${fmtQuando(proximo)}`);
}

module.exports = {
    cmdStatus
};
