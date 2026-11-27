const { once } = require('events');

const { commandUsage } = require('./base');
const { client } = require('../client');
const { t } = require('../i18n');
const { isOwnPrivate } = require('../notesLock');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { activeSessions, destroySessions, isWebRunning, startWeb, stopWeb, webUrl } = require('../web/server');
const { cancelTotp, totpConfirm, totpSetup } = require('../webTotp');

let listedSessions = [];

async function cmdWeb({ msg, chatId, opts, args }) {
    if (!msg.fromMe || !(await isOwnPrivate(chatId))) {
        return client.sendMessage(chatId, t('web.totp.privateOnly'));
    }
    const say = text => client.sendMessage(chatId, text, { linkPreview: false });
    if (opts.given.size > 1 || opts.argv.length) return say(commandUsage('/web'));
    const { destroy, enable, disable, pass, login, '2fa': totp } = opts.opt;
    try {
        if (opts.given.has('destroy')) {
            if (destroy === null) {
                listedSessions = [];
                return say(t('web.command.revoked', { count: destroySessions() }));
            }
            const id = /^[1-9]\d*$/.test(destroy) ? listedSessions[Number(destroy) - 1] : null;
            if (!id || !destroySessions(id)) return say(t('web.command.sessionMissing'));
            return say(t('web.command.revoked', { count: 1 }));
        }
        if (enable || disable) {
            const env = process.env.ZAPBOT_WEB_ENABLED?.trim();
            if (env && envOuSetting('ZAPBOT_WEB_ENABLED', 'zapbot.web.enabled') !== Boolean(enable)) {
                return say(t('web.command.environment'));
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
        // A new setup link (the first setup, a forgotten password): the web has to be on to open it
        if (opts.given.has('setup')) {
            const server = isWebRunning() ? true : await startWeb();
            if (!server) return say(t('web.command.environment'));
            const { announceSetup } = require('../web/server');
            const link = announceSetup('/web -setup');
            return say(t('web.command.setup', { url: link.url }));
        }
        if (opts.given.has('pass') || opts.given.has('login')) {
            const changePassword = opts.given.has('pass');
            const value = changePassword && pass
                ? args.trim().replace(/^-(?:pass|pas|pa|p)\s+/i, '').replace(/^(["'])([\s\S]*)\1$/, '$2')
                : login;
            if (changePassword && value && value.length < 12) {
                return say(t('login.senhaCurta', { min: 12 }));
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
        if (opts.given.has('timeout')) {
            if (opts.opt.timeout !== null) {
                const value = opts.opt.timeout === 'off' ? 0 : opts.opt.timeout;
                await setSetting('zapbot.web.sessionTimeout', value);
                activeSessions();
            }
            const minutes = getSetting('zapbot.web.sessionTimeout');
            return say(minutes ? t('web.command.timeout', { minutes }) : t('web.command.timeoutOff'));
        }
        if (opts.given.has('list')) {
            const sessions = activeSessions();
            listedSessions = sessions.map(({ id }) => id);
            const lines = sessions.map(({ until }, i) => `${i + 1}. ${new Date(until).toISOString()}`);
            return say(lines.length ? lines.join('\n') : t('web.command.empty'));
        }
        return say(isWebRunning() ? t('web.command.started', { url: webUrl() }) : t('web.command.stopped'));
    } catch {
        return say(t('web.command.failed'));
    }
}

module.exports = { cmdWeb };
