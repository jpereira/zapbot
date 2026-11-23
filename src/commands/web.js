const { once } = require('events');

const { commandUsage } = require('./base');
const { client } = require('../client');
const { t } = require('../i18n');
const { isOwnPrivate } = require('../notesLock');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { activeSessions, destroySessions, isWebRunning, startWeb, stopWeb, webUrl } = require('../web/server');
const { cancelTotp, totpConfirm, totpSetup } = require('../webTotp');

async function cmdWeb({ msg, chatId, opts, args }) {
    if (!msg.fromMe || !(await isOwnPrivate(chatId))) {
        return client.sendMessage(chatId, t('web.totp.privateOnly'));
    }
    const say = text => client.sendMessage(chatId, text, { linkPreview: false });
    if (opts.given.size > 1 || opts.argv.length) return say(commandUsage('/web'));
    const { destroy, enable, disable, pass, login, '2fa': totp } = opts.opt;
    try {
        if (opts.given.has('destroy')) {
            const count = destroySessions(destroy);
            return say(t('web.command.revoked', { count }));
        }
        if (enable || disable) {
            const env = process.env.ZAPBOT_WEB_ENABLED?.trim();
            if (env && envOuSetting('ZAPBOT_WEB_ENABLED', 'zapbot.web.enabled') !== Boolean(enable)) {
                return say(t('web.command.environment'));
            }
            if (enable && (!getSetting('zapbot.web.login') || !getSetting('zapbot.web.password'))) {
                return say(t('web.command.credentials'));
            }
            await setSetting('zapbot.web.enabled', Boolean(enable));
            if (disable) {
                await stopWeb();
                return say(t('web.command.stopped'));
            }
            const server = await startWeb();
            if (!server) return say(t('web.command.credentials'));
            if (!isWebRunning()) await once(server, 'listening');
            return say(t('web.command.started', { url: webUrl() }));
        }
        if (opts.given.has('pass') || opts.given.has('login')) {
            const changePassword = opts.given.has('pass');
            const value = changePassword && pass
                ? args.trim().replace(/^-(?:pass|pas|pa|p)\s+/i, '').replace(/^(["'])([\s\S]*)\1$/, '$2')
                : login;
            if (changePassword && value && value.length < 8) {
                return say(t('login.senhaCurta', { min: 8 }));
            }
            if (!value) return say(commandUsage('/web'));
            await setSetting(changePassword ? 'zapbot.web.password' : 'zapbot.web.login', value);
            destroySessions();
            return say(t('web.command.saved'));
        }
        if (opts.given.has('2fa')) {
            if (totp === 'new' || totp === 'qr') return await totpSetup({ msg, chatId, mode: totp, command: '/web -2fa' });
            if (/^\d{6}$/.test(totp ?? '')) {
                await totpConfirm({ msg, chatId, code: totp });
                return;
            }
            if (totp !== 'off') return say(commandUsage('/web'));
            await cancelTotp();
            await setSetting('zapbot.web.totp', '');
            destroySessions();
            return say(t('web.command.saved'));
        }
        if (opts.given.has('list')) {
            const lines = activeSessions().map(({ id, until }) => `${id} · ${new Date(until).toISOString()}`);
            return say(lines.length ? lines.join('\n') : t('web.command.empty'));
        }
        return say(isWebRunning() ? t('web.command.started', { url: webUrl() }) : t('web.command.stopped'));
    } catch {
        return say(t('web.command.failed'));
    }
}

module.exports = { cmdWeb };
