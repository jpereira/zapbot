/*
 * Comando /debug.
 */

const { client } = require('../client');
const { cleanCopiesDebug } = require('../debugCopy');
const { withContextDebug } = require('../debugContext');
const { compileFilterDebug, readOptionsDebug } = require('../debugOptions');
const { describeDestination, resolveOrChoose } = require('../destinations');
const { getSetting, isDebugMode, setSetting } = require('../settings');
const { t } = require('../i18n');

async function cmdDebug({ msg, args, chatId, chatName }) {
    let o;
    try {
        o = readOptionsDebug(args);
        if (o.off && Object.keys(o).length > 1) {
            throw new Error(t('adm.debug.offAlone'));
        }
        if (Object.hasOwn(o, 'level') && !/^[0-3]$/.test(o.level ?? '')) {
            throw new Error(t('adm.debug.levelRange'));
        }
        if (Object.hasOwn(o, 'filter')) compileFilterDebug(o.filter ?? '');
    } catch (err) {
        await msg.reply(t('adm.debug.error', { error: err.message }));
        return;
    }
    const change = ['level', 'filter', 'copyTo'].some(k => Object.hasOwn(o, k));
    if (change && !isDebugMode() && !o.on) {
        const level = o.level ?? getSetting('debug.level');
        await msg.reply(t('adm.debug.turnOnFirst', { level }));
        return;
    }
    let destination;
    if (Object.hasOwn(o, 'copyTo')) {
        destination = o.copyTo ? await resolveOrChoose(msg, o.copyTo, {
            noEmail: t('adm.debug.copyNoEmail')
        }) : { id: chatId, name: chatName, group: chatId.endsWith('@g.us') };
        if (!destination) return;
    }
    await withContextDebug({ noTrace: true }, async () => {
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
        await msg.reply(t('adm.debug.disabled'));
        return;
    }
    let textAlt = t('adm.debug.enabled', { level: getSetting('debug.level') });
    if (getSetting('debug.filter')) textAlt += t('adm.debug.filter', { filter: getSetting('debug.filter') });
    const id = getSetting('debug.copyTo');
    if (id) {
        if (!destination) {
            const chat = await client.getChatById(id).catch(() => null);
            destination = { id, name: chat?.name ?? id, group: id.endsWith('@g.us') };
        }
        textAlt += t('adm.debug.copy', { destination: describeDestination(destination) });
    }
    await msg.reply(textAlt);
}

module.exports = {
    cmdDebug
};
