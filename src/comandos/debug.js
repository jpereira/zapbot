/*
 * Comando /debug.
 */

const { client } = require('../cliente');
const { limparCopiasDebug } = require('../debugCopia');
const { comContextoDebug } = require('../debugContexto');
const { compilarFiltroDebug, lerOpcoesDebug } = require('../debugOpcoes');
const { descreverDestino, resolverOuEscolher } = require('../destinos');
const { getSetting, isDebugMode, setSetting } = require('../settings');
const { t } = require('../i18n');

async function cmdDebug({ msg, args, chatId, chatName }) {
    let o;
    try {
        o = lerOpcoesDebug(args);
        if (o.off && Object.keys(o).length > 1) {
            throw new Error(t('adm.debug.offAlone'));
        }
        if (Object.hasOwn(o, 'level') && !/^[0-3]$/.test(o.level ?? '')) {
            throw new Error(t('adm.debug.levelRange'));
        }
        if (Object.hasOwn(o, 'filter')) compilarFiltroDebug(o.filter ?? '');
    } catch (err) {
        await msg.reply(t('adm.debug.error', { erro: err.message }));
        return;
    }
    const altera = ['level', 'filter', 'copyTo'].some(k => Object.hasOwn(o, k));
    if (altera && !isDebugMode() && !o.on) {
        const nivel = o.level ?? getSetting('debug.level');
        await msg.reply(t('adm.debug.turnOnFirst', { nivel }));
        return;
    }
    let destino;
    if (Object.hasOwn(o, 'copyTo')) {
        destino = o.copyTo ? await resolverOuEscolher(msg, o.copyTo, {
            semEmail: t('adm.debug.copyNoEmail')
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
        await msg.reply(t('adm.debug.disabled'));
        return;
    }
    let texto = t('adm.debug.enabled', { nivel: getSetting('debug.level') });
    if (getSetting('debug.filter')) texto += t('adm.debug.filter', { filtro: getSetting('debug.filter') });
    const id = getSetting('debug.copyTo');
    if (id) {
        if (!destino) {
            const chat = await client.getChatById(id).catch(() => null);
            destino = { id, nome: chat?.name ?? id, grupo: id.endsWith('@g.us') };
        }
        texto += t('adm.debug.copy', { destino: descreverDestino(destino) });
    }
    await msg.reply(texto);
}

module.exports = {
    cmdDebug
};
