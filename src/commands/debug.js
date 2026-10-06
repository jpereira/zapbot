/*
 * Comando /debug.
 */

const { client } = require('../client');
const { cleanCopiesDebug } = require('../debugCopy');
const { withContextDebug } = require('../debugContext');
const { compileFilterDebug, readOptionsDebug } = require('../debugOptions');
const { describeDestination, resolverOrChoose } = require('../destinations');
const { getSetting, isDebugMode, setSetting } = require('../settings');

async function cmdDebug({ msg, args, chatId, chatName }) {
    let o;
    try {
        o = readOptionsDebug(args);
        if (o.off && Object.keys(o).length > 1) {
            throw new Error('use -off sozinho; ele desliga e limpa filtro e cópia');
        }
        if (Object.hasOwn(o, 'level') && !/^[0-3]$/.test(o.level ?? '')) {
            throw new Error('informe um nível de 0 a 3: -level <0|1|2|3>');
        }
        if (Object.hasOwn(o, 'filter')) compileFilterDebug(o.filter ?? '');
    } catch (err) {
        await msg.reply(`❌ ${err.message}.`);
        return;
    }
    const change = ['level', 'filter', 'copyTo'].some(k => Object.hasOwn(o, k));
    if (change && !isDebugMode() && !o.on) {
        const level = o.level ?? getSetting('debug.level');
        await msg.reply(`❌ Ligue o debug primeiro: /debug -on -level ${level}`);
        return;
    }
    let destination;
    if (Object.hasOwn(o, 'copyTo')) {
        destination = o.copyTo ? await resolverOrChoose(msg, o.copyTo, {
            semEmail: '❌ A cópia dos logs só aceita chats do WhatsApp, não e-mail.'
        }) : { id: chatId, nome: chatName, grupo: chatId.endsWith('@g.us') };
        if (!destination) return;
    }
    await withContextDebug({ semRastro: true }, async () => {
        if (o.off || o.on || change) cleanCopiesDebug();
        if (o.off) {
            await setSetting('debug.enabled', false);
            await setSetting('debug.filter', '');
            await setSetting('debug.copyTo', '');
        } else {
            if (Object.hasOwn(o, 'level')) await setSetting('debug.level', Number(o.level));
            if (Object.hasOwn(o, 'filter')) await setSetting('debug.filter', o.filter ?? '');
            if (destination) await setSetting('debug.copyTo', destination.id);
            if (o.on) await setSetting('debug.enabled', true);
        }
    });
    if (!isDebugMode()) {
        await msg.reply('🪲 Debug Desativado.');
        return;
    }
    let textAlt = `🪲 Debug Ativado. [DEBUG${getSetting('debug.level')}]`;
    if (getSetting('debug.filter')) textAlt += `\n🔎 Filtro: ${getSetting('debug.filter')}`;
    const id = getSetting('debug.copyTo');
    if (id) {
        if (!destination) {
            const chat = await client.getChatById(id).catch(() => null);
            destination = { id, nome: chat?.name ?? id, grupo: id.endsWith('@g.us') };
        }
        textAlt += `\n📋 Cópia: ${describeDestination(destination)}`;
    }
    await msg.reply(textAlt);
}

module.exports = {
    cmdDebug
};
