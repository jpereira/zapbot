/*
 * Comando /bot.
 */

const { getCommandSyntax } = require('./base');
const { getSetting, setSetting } = require('../settings');
const { textoDoInfo } = require('../sistema');
const { agendarStatusDiario, desligarStatusDiario, textoDoStatus } = require('../status');
const { fmtQuando, lerHora } = require('../util/quando');

/*
 * /bot: estado do bot (settings 'bot.paused' e 'bot.adminMode', sobrevivem a reinícios)
 *   /bot        → mostra o estado
 *   /bot -on    → ativa
 *   /bot -off   → desliga: TODOS os comandos são ignorados, inclusive os seus, exceto o /bot
 *   /bot +admin → modo admin: só o dono usa comandos (os dos outros são ignorados em silêncio)
 *   /bot -admin → desliga o modo admin (cada comando volta a seguir o seu onlyAdmin)
 * Opções combinam: /bot -on +admin. A recuperação de apagadas e o /watch continuam funcionando.
 * O parser só reconhece opções com '-', então o '+admin' chega em opts.argv.
 *
 * E o relatório do bot (src/status.js) e as versões (src/sistema.js), que não
 * combinam com as outras:
 *   /bot -status (-s)   → o relatório agora (últimas 24 h) e, no fim, o envio diário
 *   /bot -s 06h         → todo dia às 06:00 (Brasília), no seu privado ("6h", "06:00", "às 6h30"...)
 *   /bot -s off         → desliga o envio diário
 *   /bot -info (-i)     → versões (Node.js, whatsapp-web.js, Chromium, yt-dlp, ffmpeg...) e o sistema
 */
function estadoBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        (getSetting('bot.adminMode')
            ? `🔒 *Modo admin:* ligado (só o dono${getSetting('bot.admins').length ? ' e os admins do bot.admins usam' : ' usa'} comandos)`
            : '🔓 *Modo admin:* desligado');
}

async function tratarStatus(msg, valores) {
    if (!valores.length) {
        await msg.reply(await textoDoStatus());
        return;
    }

    if (valores.length === 1 && valores[0].toLowerCase() === 'off') {
        await msg.reply(await desligarStatusDiario()
            ? '🔕 Status diário desligado.'
            : 'ℹ️ O status diário já estava desligado.');
        return;
    }

    // "às 6h" ou "6h": a hora do envio diário
    const hora = lerHora(valores.filter(e => !/^[àa]s$/i.test(e)).join(''));
    if (!hora || valores.length > 2) {
        await msg.reply('❌ Não entendi a hora. Use 06h, 6h30, 06:00 ou às 18h (ou off para desligar).\n\n```' + getCommandSyntax('/bot') + '```');
        return;
    }

    const proximo = await agendarStatusDiario(hora);
    const dois = (n) => String(n).padStart(2, '0');
    await msg.reply(`⏰ *Status diário:* todo dia às *${dois(hora.h)}:${dois(hora.m)}*, no seu privado.\n📅 Próximo: ${fmtQuando(proximo)}`);
}

async function cmdBot({ msg, opts }) {
    const { on, off, admin: adminOff } = opts.opt;
    const adminOn = opts.argv.includes('+admin');
    const outras = on || off || adminOn || adminOff;

    // -info: versões e sistema
    if (opts.given.has('info')) {
        if (outras || opts.given.has('status') || opts.argv.length) {
            await msg.reply('❌ O -info não combina com as outras opções.\n💡 _/bot -info_');
            return;
        }
        await msg.reply(await textoDoInfo());
        return;
    }

    // -status [<hora>|off]: o parser pega um valor; "às 18h" deixa o resto em argv
    if (opts.given.has('status')) {
        if (outras) {
            await msg.reply('❌ O -status não combina com as outras opções.\n💡 _/bot -status [<hora>|off]_');
            return;
        }
        await tratarStatus(msg, [opts.opt.status, ...opts.argv].filter(Boolean));
        return;
    }

    const desconhecidos = opts.argv.filter(a => a !== '+admin');

    if (desconhecidos.length || (on && off) || (adminOn && adminOff)) {
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]  ou  /bot -status [<hora>|off]  ou  /bot -info\n💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    if (adminOn || adminOff) await setSetting('bot.adminMode', adminOn);

    await msg.reply(estadoBot());
}

module.exports = {
    cmdBot
};
