/*
 * Comando /bot.
 */

const { getCommandSyntax } = require('./base');
const { PAPEIS, ehODono, mudarListaDePessoas } = require('./set');
const { client } = require('../cliente');
const { idsDoChatAtual, resolverNomeDoGrupo } = require('../contatos');
const { descreverDestino } = require('../destinos');
const { SETTINGS_SCHEMA, getSetting, setSetting } = require('../settings');
const { textoDoInfo } = require('../sistema');
const { agendarStatusDiario, desligarStatusDiario, textoDoStatus } = require('../status');
const { fmtQuando, lerHora } = require('../util/quando');

/*
 * /bot: estado do bot (settings 'bot.paused', 'bot.admins' e 'bot.users', sobrevivem a reinícios)
 *   /bot        → mostra o estado e quem usa: admins (+o) e usuários (+v) numa lista só
 *   /bot -on    → ativa
 *   /bot -off   → desliga: TODOS os comandos são ignorados, inclusive os seus, exceto o /bot
 *   /bot +admin → só o dono (e o bot.admins) usa comandos: bot.users = false (a lista sai)
 *   /bot -admin → todos usam os comandos comuns: bot.users = true (o /bot mostra um aviso)
 *   /bot -reset → volta ao padrão: ligado, sem admins extras e sem usuários (só o dono)
 * Opções combinam: /bot -on +admin. A recuperação de apagadas e o /watch continuam funcionando.
 * O parser só reconhece opções com '-', então o '+admin' chega em opts.argv.
 *
 * Os atalhos do IRC (o: operador, manda; v: voz, só fala), só do dono, um de cada vez:
 *   /bot +o|-o <pessoa...>        → põe e tira admins (bot.admins)
 *   /bot +v|-v <pessoa|grupo...>  → põe e tira usuários (bot.users)
 * A pessoa é /Nome/, "Nome", @menção ou +número, como no -to. Sem ninguém, vale
 * o chat atual: no grupo, o grupo (que não vira admin); no privado de alguém, a pessoa.
 *
 * E o relatório do bot (src/status.js) e as versões (src/sistema.js), que não
 * combinam com as outras:
 *   /bot -status (-s)   → o relatório agora (últimas 24 h) e, no fim, o envio diário
 *   /bot -s 06h         → todo dia às 06:00 (Brasília), no seu privado ("6h", "06:00", "às 6h30"...)
 *   /bot -s off         → desliga o envio diário
 *   /bot -info (-i)     → versões (Node.js, whatsapp-web.js, Chromium, yt-dlp, ffmpeg...) e o sistema
 */
// Quem usa os comandos, pelo bot.users
function quemUsa() {
    const users = getSetting('bot.users');
    const admins = getSetting('bot.admins').length ? ' e os admins' : '';
    if (users.includes('all')) {
        return '🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /bot +admin (e depois /bot +v para liberar alguns)._';
    }
    if (!users.length) return `🔒 *Comandos:* só o dono${admins}`;
    return '👥 *Comandos:* o dono e quem está na lista abaixo';
}

/*
 * Um item do bot.admins/bot.users como o resto do bot mostra um destino:
 * "👤 Camila Gama · +5521988887777", "👤 +5521977777777" (sem nome) ou
 * "👥 Grupo Familia".
 */
async function descreverItem(item) {
    if (item.endsWith('@g.us')) {
        const nome = await resolverNomeDoGrupo(item).catch(() => null);
        return descreverDestino({ id: item, nome: nome || item, grupo: true });
    }

    // Você raramente está na própria agenda: vale o nome do seu perfil
    const contato = await client.getContactById(`${item}@c.us`).catch(() => null);
    const nome = contato?.name || contato?.pushname ||
        (ehODono(item) ? client.info.pushname : null);
    return nome ? `${descreverDestino({ nome, grupo: false })} · +${item}` : `👤 +${item}`;
}

/*
 * Admins (+o) e usuários (+v) numa lista só: quem está nas duas aparece uma
 * vez, com as duas marcas. Primeiro os admins, na ordem de cada setting.
 */
async function listaDeQuemUsa() {
    const admins = getSetting('bot.admins');
    const users = getSetting('bot.users').filter(i => i !== 'all');
    const itens = [...new Set([...admins, ...users])];
    if (!itens.length) return '';

    const linhas = await Promise.all(itens.map(async (item) => {
        const marcas = [
            ehODono(item) && `${PAPEIS.dono} dono`,
            admins.includes(item) && `${PAPEIS.admin} +o`,
            users.includes(item) && `${PAPEIS.usuario} +v`
        ].filter(Boolean);
        return `• ${marcas.join(' ')} · ${await descreverItem(item)}`;
    }));

    return `\n\n*Quem usa* (${itens.length})\n${linhas.join('\n')}\n` +
        (itens.some(ehODono) ? `💡 _${PAPEIS.dono} dono: você, que já usa tudo_\n` : '') +
        `💡 _${PAPEIS.admin} +o: admin, usa tudo (bot.admins) · ` +
        `${PAPEIS.usuario} +v: usuário, usa os comandos comuns (bot.users)_`;
}

async function estadoBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        quemUsa() +
        await listaDeQuemUsa();
}

// +o/-o (bot.admins) e +v/-v (bot.users)
const ATALHO = /^([+-])([ov])(?:\s+([\s\S]*))?$/;
const LISTA_DO_ATALHO = { o: 'bot.admins', v: 'bot.users' };

/*
 * Sem ninguém, o chat onde o comando foi digitado: no grupo, o grupo; no
 * privado de alguém, a pessoa (pelo telefone). No seu privado, não há quem.
 */
async function atalhoNoChat(msg, key, acrescentar, { chatId, isGroup }) {
    if (isGroup) {
        if (key === 'bot.admins') {
            await msg.reply('❌ Um grupo não pode ser admin (todos ali mandariam no bot).\n' +
                '💡 _Para liberar os comandos comuns neste grupo: /bot +v_');
            return;
        }
        await mudarListaDePessoas(msg, key, chatId, acrescentar, { itensProntos: true });
        return;
    }

    const ids = await idsDoChatAtual(chatId);
    if (ids.includes(client.info.wid._serialized)) {
        await msg.reply('❌ Este é o seu privado: você (o dono) já usa tudo.\n' +
            '💡 _Use num grupo ou no privado de alguém, ou informe quem: /bot +v /Nome/_');
        return;
    }

    const telefone = ids.find(i => i.endsWith('@c.us'));
    if (!telefone) {
        await msg.reply('❌ Não sei o telefone desta pessoa (o WhatsApp só informou o id interno): use o número, ex.: /bot +v +5521999999999.');
        return;
    }
    const numero = telefone.split('@')[0];
    await mudarListaDePessoas(msg, key, numero, acrescentar, { itensProntos: true });
}

async function tratarAtalho(msg, [, sinal, letra, texto], chat) {
    const key = LISTA_DO_ATALHO[letra];

    // Só o dono, como no /set: um admin extra não promove ninguém (nem a si mesmo)
    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot altera o *${key}*.`);
        return;
    }
    if (!texto?.trim()) {
        await atalhoNoChat(msg, key, sinal === '+', chat);
        return;
    }

    await mudarListaDePessoas(msg, key, texto.trim(), sinal === '+');
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

// O que o -reset volta ao padrão (o envio diário do -status fica)
const DO_RESET = ['bot.paused', 'bot.admins', 'bot.users'];

async function resetar(msg) {
    if (!msg.fromMe) {
        await msg.reply('⛔ Só o dono do bot volta o /bot ao padrão.');
        return;
    }

    for (const key of DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);
    await msg.reply('♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n' +
        await estadoBot());
}

async function cmdBot({ msg, opts, args, chatId, isGroup }) {
    const atalho = String(args ?? '').trim().match(ATALHO);
    if (atalho) {
        await tratarAtalho(msg, atalho, { chatId, isGroup });
        return;
    }

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

    // -reset: sozinho, como o -info
    if (opts.given.has('reset')) {
        if (outras || opts.given.has('status') || opts.argv.length) {
            await msg.reply('❌ O -reset não combina com as outras opções.\n💡 _/bot -reset_');
            return;
        }
        await resetar(msg);
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
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]  ou  /bot +o|-o|+v|-v [pessoa...]  ou  /bot -reset  ou  /bot -status [<hora>|off]  ou  /bot -info\n' +
            '💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    // +admin: só o dono e os admins (a lista do bot.users sai); -admin: todos
    if (adminOn || adminOff) await setSetting('bot.users', adminOn ? [] : ['all']);

    await msg.reply(await estadoBot());
}

module.exports = {
    cmdBot
};
