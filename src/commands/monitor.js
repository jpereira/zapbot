const { MessageMedia } = require('whatsapp-web.js');
const { resolverOrChoose } = require('../destinations');
const { resolveLidToPhone } = require('../contacts');
const { getSetting } = require('../settings');
const { estado: stateAlt } = require('../state');
const { withoutAccents } = require('../util/format');
const {
    enableAlertMonitor, registerMonitored, historyMonitored, listMonitored, removeMonitored,
    removeAllMonitored
} = require('../monitor');

const RISK = '⚠️ Consultas frequentes e mais contatos podem contribuir para bloqueio pelo WhatsApp. Nenhum intervalo garante segurança.';
const when = at => at ? new Date(at).toLocaleString('pt-BR',
    { timeZone: 'America/Sao_Paulo' }) : 'ainda não verificado';
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
        if (!contactAlt) await msg.reply(`❌ Contato #${id} não cadastrado. Veja /monitor`);
        return contactAlt;
    }
    const person = await resolverPerson(msg, valueAlt);
    if (!person) return null;
    for (const c of contacts) {
        const phone = c.contact_id.endsWith('@lid')
            ? await resolveLidToPhone(c.contact_id) ?? c.contact_id : c.contact_id;
        if (phone === person.id) return c;
    }
    await msg.reply(`❌ ${person.nome} não está cadastrado no monitor. Veja /monitor -l`);
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
        await msg.reply(`❌ Nenhum contato monitorado encontrado para "${valueAlt}". Veja /monitor -l`);
        return;
    }
    const statusAlt = !getSetting('monitor.enabled') || getSetting('bot.paused') ? 'pausado'
        : !stateAlt.pronto || stateAlt.reiniciando ? 'aguardando conexão' : 'ativo';
    const linesAlt = [
        `👀 *MONITOR* · ${statusAlt}`,
        `⏱️ Verificação de cada contato a cada ${intervalMonitor()}, no mínimo.`,
        `👥 Contatos: ${allAlt2.length}/${getSetting('monitor.max')} · horários de São Paulo`, ''
    ];
    if (!contacts.length) linesAlt.push('👀 Nenhum contato cadastrado.',
        '💡 /monitor -add /Nome do Contato/');
    for (const c of contacts) {
        linesAlt.push(`📹 #${c.id} · ${c.contact_name}`,
            `   ${c.last_status ?? '⏳ aguardando primeira verificação'}`,
            `   🔎 Verificado: ${when(c.last_checked_at)}`,
            `   🕒 Último horário observado: ${c.last_seen ? when(c.last_seen * 1000) : 'nenhum'}`);
        linesAlt.push(`   🚨 Alerta online: ${c.alert_enabled ? 'ativado' : 'desativado'}`);
        if (c.last_error) linesAlt.push(`   ⚠️ ${c.last_error}`);
        {
            const records = await historyMonitored(c.id);
            linesAlt.push(`   📜 Histórico: ${records.length} horário(s) distinto(s) · limite: ${getSetting('monitor.maxRecords')}`);
            for (const h of records) {
                linesAlt.push(`   • ${when(h.last_seen * 1000)} · observado em ${when(h.observed_at)}`,
                    '     Origem: presença do WhatsApp · horário não confirmado');
            }
            if (!records.length) linesAlt.push('   Nenhum visto por último observado ainda.');
        }
        linesAlt.push('');
    }
    linesAlt.push(RISK);
    const textAlt = linesAlt.join('\n');
    if (textAlt.length <= 7000) {
        await msg.reply(textAlt, undefined, { linkPreview: false });
    } else {
        const media = new MessageMedia('text/plain', Buffer.from(textAlt).toString('base64'),
            'monitor-historico.txt');
        await msg.reply(media, undefined, {
            sendMediaAsDocument: true, caption: `👀 Histórico · a cada ${intervalMonitor()}`
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
    const alert = textAlt.match(/^-alerta(?:\s+([\s\S]+))?$/);
    if (alert) {
        const valueAlt = withoutDelimiters(alert[1]);
        if (!valueAlt) {
            await msg.reply('❌ Informe um contato cadastrado: /monitor -alerta /Maria/');
            return;
        }
        const contactAlt = await searchMonitored(msg, valueAlt);
        if (!contactAlt) return;
        await enableAlertMonitor(contactAlt.id);
        await msg.reply(`🚨 Alerta online ativado para "${contactAlt.contact_name}" no privado do dono do bot.`);
        return;
    }
    const addAlt = textAlt.match(/^-(?:add|a)(?:\s+([\s\S]+))?$/);
    if (addAlt) {
        const withAlert = /\s+-alerta$/.test(addAlt[1] ?? '');
        const valueAlt = withoutDelimiters(withAlert
            ? addAlt[1].replace(/\s+-alerta$/, '') : addAlt[1]);
        if (!valueAlt) {
            await msg.reply('❌ Informe um contato: /monitor -add /Jorge Pereira/');
            return;
        }
        const contactAlt = await resolverPerson(msg, valueAlt);
        if (!contactAlt) return;
        const r = await registerMonitored(contactAlt);
        const registered = r.contato ?? r.existente;
        if (withAlert && registered) await enableAlertMonitor(registered.id);
        if (r.existente) {
            await msg.reply(`👀 ${r.existente.contact_name} já está cadastrado: #${r.existente.id}.`);
        } else if (r.limite) {
            await msg.reply(`❌ Limite de ${getSetting('monitor.max')} contatos atingido. Remova um com /monitor -rem <id>.`);
        } else {
            await msg.reply(`👀 #${r.contato.id} · ${r.contato.contact_name} cadastrado.\n` +
                `⏱️ Verificação a cada ${intervalMonitor()}, um contato por vez.\n` +
                `💡 /monitor -list mostra o histórico; /monitor -rem ${r.contato.id} remove.\n${RISK}`);
            if (!getSetting('monitor.enabled')) {
                await msg.reply('⏸️ Monitor pausado. Retome com /set monitor.enabled true.');
            }
        }
        if (withAlert && registered) {
            await msg.reply(`🚨 Alerta online ativado para "${registered.contact_name}" no privado do dono do bot.`);
        }
        return;
    }
    const removeAlt2 = textAlt.match(/^-(?:rem|r)(?:\s+([\s\S]+))?$/);
    if (removeAlt2) {
        const valueAlt = withoutDelimiters(removeAlt2[1]);
        if (!valueAlt) {
            await msg.reply('❌ Informe o id da lista ou um contato: /monitor -rem 1 ou /monitor -r /Jorge Pereira/');
            return;
        }
        if (valueAlt.toLowerCase() === 'all') {
            const total = await removeAllMonitored();
            await msg.reply(`🗑️ Monitor limpo: ${total} contato(s) e seus históricos removidos.`);
            return;
        }
        const contactAlt = await searchMonitored(msg, valueAlt);
        if (!contactAlt) return;
        const id = contactAlt.id;
        const c = await removeMonitored(id);
        await msg.reply(c ? `🗑️ #${c.id} · ${c.contact_name}: cadastro e histórico removidos.`
            : `❌ Contato #${id} não cadastrado. Veja /monitor`);
        return;
    }
    await msg.reply('❌ Use /monitor, /monitor -add <contato> [-alerta], /monitor -alerta <contato>, /monitor -rem <id, contato ou all> ou /monitor -list [contato].');
}

module.exports = { cmdMonitor, intervalMonitor, RISK };
