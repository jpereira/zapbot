const { MessageMedia } = require('whatsapp-web.js');
const { resolverOuEscolher } = require('../destinos');
const { resolveLidToPhone } = require('../contatos');
const { getSetting } = require('../settings');
const { estado } = require('../estado');
const { semAcentos } = require('../util/formatar');
const { idioma, t } = require('../i18n');
const {
    ativarAlertaMonitor, cadastrarMonitorado, historicoMonitorado, listarMonitorados, removerMonitorado,
    removerTodosMonitorados
} = require('../monitor');

const risco = () => t('monitor.risk');
const quando = at => at ? new Date(at).toLocaleString(idioma() === 'pt_BR' ? 'pt-BR' : 'en-US',
    { timeZone: 'America/Sao_Paulo' }) : t('monitor.notChecked');
const semDelimitadores = texto => String(texto ?? '').trim()
    .replace(/^(?:\/([^/]*)\/|"([^"]*)"|'([^']*)')$/, '$1$2$3');

async function resolverPessoa(msg, texto) {
    const contato = await resolverOuEscolher(msg, semDelimitadores(texto), { tipo: 'contato' });
    if (contato?.id.endsWith('@lid')) {
        contato.id = await resolveLidToPhone(contato.id) ?? contato.id;
    }
    return contato;
}

async function buscarMonitorado(msg, valor) {
    const contatos = await listarMonitorados();
    if (/^#?\d{1,9}$/.test(valor)) {
        const id = Number(valor.replace(/^#/, ''));
        const contato = contatos.find(c => c.id === id);
        if (!contato) await msg.reply(t('monitor.idNotFound', { id }));
        return contato;
    }
    const pessoa = await resolverPessoa(msg, valor);
    if (!pessoa) return null;
    for (const c of contatos) {
        const phone = c.contact_id.endsWith('@lid')
            ? await resolveLidToPhone(c.contact_id) ?? c.contact_id : c.contact_id;
        if (phone === pessoa.id) return c;
    }
    await msg.reply(t('monitor.notRegistered', { name: pessoa.nome }));
    return null;
}

function filtrarMonitorados(contatos, msg, valor) {
    if (/^#?\d{1,9}$/.test(valor)) {
        return contatos.filter(c => c.id === Number(valor.replace(/^#/, '')));
    }
    if (valor.startsWith('@')) {
        return contatos.filter(c => (msg.mentionedIds ?? []).includes(c.contact_id));
    }
    if (/^\+?[\d\s().-]+$/.test(valor)) {
        const numero = valor.replace(/\D/g, '');
        return contatos.filter(c => c.contact_id.split('@')[0].split(':')[0] === numero);
    }
    const palavras = semAcentos(valor).split(/\s+/).filter(Boolean);
    return contatos.filter(c => palavras.every(p => semAcentos(c.contact_name).includes(p)));
}

function intervaloMonitor() {
    const s = getSetting('monitor.pool');
    return s % 60 === 0 ? `${s / 60} min (${s} s)` : `${s} s`;
}

async function responderLista(msg, valor = null) {
    const todos = await listarMonitorados();
    const contatos = valor ? filtrarMonitorados(todos, msg, valor) : todos;
    if (valor && !contatos.length) {
        await msg.reply(t('monitor.noneFound', { value: valor }));
        return;
    }
    const situacao = !getSetting('monitor.enabled') || getSetting('bot.paused') ? t('monitor.state.paused')
        : !estado.pronto || estado.reiniciando ? t('monitor.state.waiting') : t('monitor.state.active');
    const linhas = [
        t('monitor.list.title', { state: situacao }),
        t('monitor.list.interval', { interval: intervaloMonitor() }),
        t('monitor.list.contacts', { count: todos.length, max: getSetting('monitor.max') }), ''
    ];
    if (!contatos.length) linhas.push(t('monitor.list.empty'),
        t('monitor.list.addHint'));
    for (const c of contatos) {
        linhas.push(`📹 #${c.id} · ${c.contact_name}`,
            `   ${c.last_status ?? t('monitor.list.waitingFirst')}`,
            t('monitor.list.checked', { when: quando(c.last_checked_at) }),
            t('monitor.list.lastSeen', { when: c.last_seen ? quando(c.last_seen * 1000) : t('monitor.list.lastSeenNone') }));
        linhas.push(t(c.alert_enabled ? 'monitor.list.alertOn' : 'monitor.list.alertOff'));
        if (c.last_error) linhas.push(`   ⚠️ ${c.last_error}`);
        {
            const registros = await historicoMonitorado(c.id);
            linhas.push(t('monitor.list.history', { count: registros.length, max: getSetting('monitor.maxRecords') }));
            for (const h of registros) {
                linhas.push(t('monitor.list.entry', { seen: quando(h.last_seen * 1000), observed: quando(h.observed_at) }),
                    t('monitor.list.source'));
            }
            if (!registros.length) linhas.push(t('monitor.list.noHistory'));
        }
        linhas.push('');
    }
    linhas.push(risco());
    const texto = linhas.join('\n');
    if (texto.length <= 7000) {
        await msg.reply(texto, undefined, { linkPreview: false });
    } else {
        const media = new MessageMedia('text/plain', Buffer.from(texto).toString('base64'),
            'monitor-historico.txt');
        await msg.reply(media, undefined, {
            sendMediaAsDocument: true, caption: t('monitor.list.fileCaption', { interval: intervaloMonitor() })
        });
    }
}

async function cmdMonitor({ msg, args }) {
    const texto = String(args ?? '').trim();
    const listar = texto.match(/^-(?:list|l)(?:\s+([\s\S]+))?$/);
    if (!texto || listar) {
        const valor = semDelimitadores(listar?.[1]);
        await responderLista(msg, valor || null);
        return;
    }
    const alerta = texto.match(/^-alerta(?:\s+([\s\S]+))?$/);
    if (alerta) {
        const valor = semDelimitadores(alerta[1]);
        if (!valor) {
            await msg.reply(t('monitor.alert.usage'));
            return;
        }
        const contato = await buscarMonitorado(msg, valor);
        if (!contato) return;
        await ativarAlertaMonitor(contato.id);
        await msg.reply(t('monitor.alert.enabled', { name: contato.contact_name }));
        return;
    }
    const adicionar = texto.match(/^-(?:add|a)(?:\s+([\s\S]+))?$/);
    if (adicionar) {
        const comAlerta = /\s+-alerta$/.test(adicionar[1] ?? '');
        const valor = semDelimitadores(comAlerta
            ? adicionar[1].replace(/\s+-alerta$/, '') : adicionar[1]);
        if (!valor) {
            await msg.reply(t('monitor.add.usage'));
            return;
        }
        const contato = await resolverPessoa(msg, valor);
        if (!contato) return;
        const r = await cadastrarMonitorado(contato);
        const cadastrado = r.contato ?? r.existente;
        if (comAlerta && cadastrado) await ativarAlertaMonitor(cadastrado.id);
        if (r.existente) {
            await msg.reply(t('monitor.add.exists', { name: r.existente.contact_name, id: r.existente.id }));
        } else if (r.limite) {
            await msg.reply(t('monitor.add.limit', { max: getSetting('monitor.max') }));
        } else {
            await msg.reply(t('monitor.add.done', { id: r.contato.id, name: r.contato.contact_name,
                interval: intervaloMonitor(), risk: risco() }));
            if (!getSetting('monitor.enabled')) {
                await msg.reply(t('monitor.add.paused'));
            }
        }
        if (comAlerta && cadastrado) {
            await msg.reply(t('monitor.alert.enabled', { name: cadastrado.contact_name }));
        }
        return;
    }
    const remover = texto.match(/^-(?:rm|r)(?:\s+([\s\S]+))?$/);
    if (remover) {
        const valor = semDelimitadores(remover[1]);
        if (!valor) {
            await msg.reply(t('monitor.rm.usage'));
            return;
        }
        if (valor.toLowerCase() === 'all') {
            const total = await removerTodosMonitorados();
            await msg.reply(t('monitor.rm.all', { count: total }));
            return;
        }
        const contato = await buscarMonitorado(msg, valor);
        if (!contato) return;
        const id = contato.id;
        const c = await removerMonitorado(id);
        await msg.reply(c ? t('monitor.rm.done', { id: c.id, name: c.contact_name })
            : t('monitor.idNotFound', { id }));
        return;
    }
    await msg.reply(t('monitor.usage'));
}

module.exports = { cmdMonitor, intervaloMonitor, risco };
