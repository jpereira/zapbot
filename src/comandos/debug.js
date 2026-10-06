/*
 * Comando /debug.
 */

const { client } = require('../cliente');
const { limparCopiasDebug } = require('../debugCopia');
const { comContextoDebug } = require('../debugContexto');
const { compilarFiltroDebug, lerOpcoesDebug } = require('../debugOpcoes');
const { descreverDestino, resolverOuEscolher } = require('../destinos');
const { getSetting, isDebugMode, setSetting } = require('../settings');

async function cmdDebug({ msg, args, chatId, chatName }) {
    let o;
    try {
        o = lerOpcoesDebug(args);
        if (o.off && Object.keys(o).length > 1) {
            throw new Error('use -off sozinho; ele desliga e limpa filtro e cópia');
        }
        if (Object.hasOwn(o, 'level') && !/^[0-3]$/.test(o.level ?? '')) {
            throw new Error('informe um nível de 0 a 3: -level <0|1|2|3>');
        }
        if (Object.hasOwn(o, 'filter')) compilarFiltroDebug(o.filter ?? '');
    } catch (err) {
        await msg.reply(`❌ ${err.message}.`);
        return;
    }
    const altera = ['level', 'filter', 'copyTo'].some(k => Object.hasOwn(o, k));
    if (altera && !isDebugMode() && !o.on) {
        const nivel = o.level ?? getSetting('debug.level');
        await msg.reply(`❌ Ligue o debug primeiro: /debug -on -level ${nivel}`);
        return;
    }
    let destino;
    if (Object.hasOwn(o, 'copyTo')) {
        destino = o.copyTo ? await resolverOuEscolher(msg, o.copyTo, {
            semEmail: '❌ A cópia dos logs só aceita chats do WhatsApp, não e-mail.'
        }) : { id: chatId, nome: chatName, grupo: chatId.endsWith('@g.us') };
        if (!destino) return;
    }
    await comContextoDebug({ semRastro: true }, async () => {
        if (o.off || o.on || altera) limparCopiasDebug();
        if (o.off) {
            await setSetting('debug.enabled', false);
            await setSetting('debug.filter', '');
            await setSetting('debug.copyTo', '');
        } else {
            if (Object.hasOwn(o, 'level')) await setSetting('debug.level', Number(o.level));
            if (Object.hasOwn(o, 'filter')) await setSetting('debug.filter', o.filter ?? '');
            if (destino) await setSetting('debug.copyTo', destino.id);
            if (o.on) await setSetting('debug.enabled', true);
        }
    });
    if (!isDebugMode()) {
        await msg.reply('🪲 Debug Desativado.');
        return;
    }
    let texto = `🪲 Debug Ativado. [DEBUG${getSetting('debug.level')}]`;
    if (getSetting('debug.filter')) texto += `\n🔎 Filtro: ${getSetting('debug.filter')}`;
    const id = getSetting('debug.copyTo');
    if (id) {
        if (!destino) {
            const chat = await client.getChatById(id).catch(() => null);
            destino = { id, nome: chat?.name ?? id, grupo: id.endsWith('@g.us') };
        }
        texto += `\n📋 Cópia: ${descreverDestino(destino)}`;
    }
    await msg.reply(texto);
}

module.exports = {
    cmdDebug
};
