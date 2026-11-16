const { MessageMedia } = require('whatsapp-web.js');
const { resolverOrChoose } = require('../destinations');
const { resolveLidToPhone } = require('../contacts');
const { getSetting } = require('../settings');
const { estado: stateAlt } = require('../state');
const { withoutAccents } = require('../util/format');
const { language, t } = require('../i18n');
const {
    enableAlertMonitor, registerMonitored, historyMonitored, listMonitored, removeMonitored,
    removeAllMonitored
} = require('../monitor');

const risk = () => t('monitor.risk');
const when = at => at ? new Date(at).toLocaleString(language() === 'pt_BR' ? 'pt-BR' : 'en-US',
    { timeZone: 'America/Sao_Paulo' }) : t('monitor.notChecked');
const withoutDelimiters = textAlt => String(textAlt ?? '').trim()
    .replace(/^(?:\/([^/]*)\/|"([^"]*)"|'([^']*)')$/, '$1$2$3');

async function resolverPerson(msg, textAlt) {
    const contactAlt = await resolverOrChoose(msg, withoutDelimiters(textAlt), { tipo: 'contato' });
    if (contactAlt?.id.endsWith('@lid')) {
        contactAlt.id = await resolveLidToPhone(contactAlt.id) ?? contactAlt.id;
    }
    return contactAlt;
}

async function searchMonitored(msg, valueAlt) {
    const contacts = await listMonitored();
    if (/^#?\d{1,9}$/.test(valueAlt)) {
        const id = Number(valueAlt.replace(/^#/, ''));
        const contactAlt = contacts.find(c => c.id === id);
        if (!contactAlt) await msg.reply(t('monitor.idNotFound', { id }));
        return contactAlt;
    }
    const person = await resolverPerson(msg, valueAlt);
    if (!person) return null;
    for (const c of contacts) {
        const phone = c.contact_id.endsWith('@lid')
            ? await resolveLidToPhone(c.contact_id) ?? c.contact_id : c.contact_id;
        if (phone === person.id) return c;
    }
    await msg.reply(t('monitor.notRegistered', { name: person.nome }));
    return null;
}

function filterMonitored(contacts, msg, valueAlt) {
    if (/^#?\d{1,9}$/.test(valueAlt)) {
        return contacts.filter(c => c.id === Number(valueAlt.replace(/^#/, '')));
    }
    if (valueAlt.startsWith('@')) {
        return contacts.filter(c => (msg.mentionedIds ?? []).includes(c.contact_id));
    }
    if (/^\+?[\d\s().-]+$/.test(valueAlt)) {
        const numberAlt = valueAlt.replace(/\D/g, '');
        return contacts.filter(c => c.contact_id.split('@')[0].split(':')[0] === numberAlt);
    }
    const words = withoutAccents(valueAlt).split(/\s+/).filter(Boolean);
    return contacts.filter(c => words.every(p => withoutAccents(c.contact_name).includes(p)));
}

function intervalMonitor() {
    const s = getSetting('monitor.pool');
    return s % 60 === 0 ? `${s / 60} min (${s} s)` : `${s} s`;
}

async function replyList(msg, valueAlt = null) {
    const allAlt2 = await listMonitored();
    const contacts = valueAlt ? filterMonitored(allAlt2, msg, valueAlt) : allAlt2;
    if (valueAlt && !contacts.length) {
        await msg.reply(t('monitor.noneFound', { value: valueAlt }));
        return;
    }
    const statusAlt = !getSetting('monitor.enabled') || getSetting('bot.paused') ? t('monitor.state.paused')
        : !stateAlt.pronto || stateAlt.reiniciando ? t('monitor.state.waiting') : t('monitor.state.active');
    const linesAlt = [
        t('monitor.list.title', { state: statusAlt }),
        t('monitor.list.interval', { interval: intervalMonitor() }),
        t('monitor.list.contacts', { count: allAlt2.length, max: getSetting('monitor.max') }), ''
    ];
    if (!contacts.length) linesAlt.push(t('monitor.list.empty'),
        t('monitor.list.addHint'));
    for (const c of contacts) {
        linesAlt.push(`📹 #${c.id} · ${c.contact_name}`,
            `   ${c.last_status ?? t('monitor.list.waitingFirst')}`,
            t('monitor.list.checked', { when: when(c.last_checked_at) }),
            t('monitor.list.lastSeen', { when: c.last_seen ? when(c.last_seen * 1000) : t('monitor.list.lastSeenNone') }));
        linesAlt.push(t(c.alert_enabled ? 'monitor.list.alertOn' : 'monitor.list.alertOff'));
        if (c.last_error) linesAlt.push(`   ⚠️ ${c.last_error}`);
        {
            const records = await historyMonitored(c.id);
            linesAlt.push(t('monitor.list.history', { count: records.length, max: getSetting('monitor.maxRecords') }));
            for (const h of records) {
                linesAlt.push(t('monitor.list.entry', { seen: when(h.last_seen * 1000), observed: when(h.observed_at) }),
                    t('monitor.list.source'));
            }
            if (!records.length) linesAlt.push(t('monitor.list.noHistory'));
        }
        linesAlt.push('');
    }
    linesAlt.push(risk());
    const textAlt = linesAlt.join('\n');
    if (textAlt.length <= 7000) {
        await msg.reply(textAlt, undefined, { linkPreview: false });
    } else {
        const media = new MessageMedia('text/plain', Buffer.from(textAlt).toString('base64'),
            'monitor-historico.txt');
        await msg.reply(media, undefined, {
            sendMediaAsDocument: true, caption: t('monitor.list.fileCaption', { interval: intervalMonitor() })
        });
    }
}

async function cmdMonitor({ msg, args }) {
    const textAlt = String(args ?? '').trim();
    const listAlt = textAlt.match(/^-(?:list|l)(?:\s+([\s\S]+))?$/);
    if (!textAlt || listAlt) {
        const valueAlt = withoutDelimiters(listAlt?.[1]);
        await replyList(msg, valueAlt || null);
        return;
    }
    const alert = textAlt.match(/^-alert(?:\s+([\s\S]+))?$/);
    if (alert) {
        const valueAlt = withoutDelimiters(alert[1]);
        if (!valueAlt) {
            await msg.reply(t('monitor.alert.usage'));
            return;
        }
        const contactAlt = await searchMonitored(msg, valueAlt);
        if (!contactAlt) return;
        await enableAlertMonitor(contactAlt.id);
        await msg.reply(t('monitor.alert.enabled', { name: contactAlt.contact_name }));
        return;
    }
    const addAlt = textAlt.match(/^-(?:add|a)(?:\s+([\s\S]+))?$/);
    if (addAlt) {
        const withAlert = /\s+-alert$/.test(addAlt[1] ?? '');
        const valueAlt = withoutDelimiters(withAlert
            ? addAlt[1].replace(/\s+-alert$/, '') : addAlt[1]);
        if (!valueAlt) {
            await msg.reply(t('monitor.add.usage'));
            return;
        }
        const contactAlt = await resolverPerson(msg, valueAlt);
        if (!contactAlt) return;
        const r = await registerMonitored(contactAlt);
        const registered = r.contato ?? r.existente;
        if (withAlert && registered) await enableAlertMonitor(registered.id);
        if (r.existente) {
            await msg.reply(t('monitor.add.exists', { name: r.existente.contact_name, id: r.existente.id }));
        } else if (r.limite) {
            await msg.reply(t('monitor.add.limit', { max: getSetting('monitor.max') }));
        } else {
            await msg.reply(t('monitor.add.done', { id: r.contato.id, name: r.contato.contact_name,
                interval: intervalMonitor(), risk: risk() }));
            if (!getSetting('monitor.enabled')) {
                await msg.reply(t('monitor.add.paused'));
            }
        }
        if (withAlert && registered) {
            await msg.reply(t('monitor.alert.enabled', { name: registered.contact_name }));
        }
        return;
    }
    const removeAlt2 = textAlt.match(/^-(?:rm|r)(?:\s+([\s\S]+))?$/);
    if (removeAlt2) {
        const valueAlt = withoutDelimiters(removeAlt2[1]);
        if (!valueAlt) {
            await msg.reply(t('monitor.rm.usage'));
            return;
        }
        if (valueAlt.toLowerCase() === 'all') {
            const total = await removeAllMonitored();
            await msg.reply(t('monitor.rm.all', { count: total }));
            return;
        }
        const contactAlt = await searchMonitored(msg, valueAlt);
        if (!contactAlt) return;
        const id = contactAlt.id;
        const c = await removeMonitored(id);
        await msg.reply(c ? t('monitor.rm.done', { id: c.id, name: c.contact_name })
            : t('monitor.idNotFound', { id }));
        return;
    }
    await msg.reply(t('monitor.usage'));
}

module.exports = { cmdMonitor, intervalMonitor, risk };
