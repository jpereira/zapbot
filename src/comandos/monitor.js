const { MessageMedia } = require('whatsapp-web.js');
const { resolverOuEscolher } = require('../destinos');
const { resolveLidToPhone } = require('../contatos');
const { getSetting } = require('../settings');
const { estado } = require('../estado');
const { semAcentos } = require('../util/formatar');
const {
    ativarAlertaMonitor, cadastrarMonitorado, historicoMonitorado, listarMonitorados, removerMonitorado,
    removerTodosMonitorados
} = require('../monitor');

const RISCO = '⚠️ Consultas frequentes e mais contatos podem contribuir para bloqueio pelo WhatsApp. Nenhum intervalo garante segurança.';
const quando = at => at ? new Date(at).toLocaleString('pt-BR',
    { timeZone: 'America/Sao_Paulo' }) : 'ainda não verificado';
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
        if (!contato) await msg.reply(`❌ Contato #${id} não cadastrado. Veja /monitor`);
        return contato;
    }
    const pessoa = await resolverPessoa(msg, valor);
    if (!pessoa) return null;
    for (const c of contatos) {
        const phone = c.contact_id.endsWith('@lid')
            ? await resolveLidToPhone(c.contact_id) ?? c.contact_id : c.contact_id;
        if (phone === pessoa.id) return c;
    }
    await msg.reply(`❌ ${pessoa.nome} não está cadastrado no monitor. Veja /monitor -l`);
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
        await msg.reply(`❌ Nenhum contato monitorado encontrado para "${valor}". Veja /monitor -l`);
        return;
    }
    const situacao = !getSetting('monitor.enabled') || getSetting('bot.paused') ? 'pausado'
        : !estado.pronto || estado.reiniciando ? 'aguardando conexão' : 'ativo';
    const linhas = [
        `👀 *MONITOR* · ${situacao}`,
        `⏱️ Verificação de cada contato a cada ${intervaloMonitor()}, no mínimo.`,
        `👥 Contatos: ${todos.length}/${getSetting('monitor.max')} · horários de São Paulo`, ''
    ];
    if (!contatos.length) linhas.push('👀 Nenhum contato cadastrado.',
        '💡 /monitor -add /Nome do Contato/');
    for (const c of contatos) {
        linhas.push(`📹 #${c.id} · ${c.contact_name}`,
            `   ${c.last_status ?? '⏳ aguardando primeira verificação'}`,
            `   🔎 Verificado: ${quando(c.last_checked_at)}`,
            `   🕒 Último horário observado: ${c.last_seen ? quando(c.last_seen * 1000) : 'nenhum'}`);
        linhas.push(`   🚨 Alerta online: ${c.alert_enabled ? 'ativado' : 'desativado'}`);
        if (c.last_error) linhas.push(`   ⚠️ ${c.last_error}`);
        {
            const registros = await historicoMonitorado(c.id);
            linhas.push(`   📜 Histórico: ${registros.length} horário(s) distinto(s) · limite: ${getSetting('monitor.maxRecords')}`);
            for (const h of registros) {
                linhas.push(`   • ${quando(h.last_seen * 1000)} · observado em ${quando(h.observed_at)}`,
                    '     Origem: presença do WhatsApp · horário não confirmado');
            }
            if (!registros.length) linhas.push('   Nenhum visto por último observado ainda.');
        }
        linhas.push('');
    }
    linhas.push(RISCO);
    const texto = linhas.join('\n');
    if (texto.length <= 7000) {
        await msg.reply(texto, undefined, { linkPreview: false });
    } else {
        const media = new MessageMedia('text/plain', Buffer.from(texto).toString('base64'),
            'monitor-historico.txt');
        await msg.reply(media, undefined, {
            sendMediaAsDocument: true, caption: `👀 Histórico · a cada ${intervaloMonitor()}`
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
            await msg.reply('❌ Informe um contato cadastrado: /monitor -alerta /Maria/');
            return;
        }
        const contato = await buscarMonitorado(msg, valor);
        if (!contato) return;
        await ativarAlertaMonitor(contato.id);
        await msg.reply(`🚨 Alerta online ativado para "${contato.contact_name}" no privado do dono do bot.`);
        return;
    }
    const adicionar = texto.match(/^-(?:add|a)(?:\s+([\s\S]+))?$/);
    if (adicionar) {
        const comAlerta = /\s+-alerta$/.test(adicionar[1] ?? '');
        const valor = semDelimitadores(comAlerta
            ? adicionar[1].replace(/\s+-alerta$/, '') : adicionar[1]);
        if (!valor) {
            await msg.reply('❌ Informe um contato: /monitor -add /Jorge Pereira/');
            return;
        }
        const contato = await resolverPessoa(msg, valor);
        if (!contato) return;
        const r = await cadastrarMonitorado(contato);
        const cadastrado = r.contato ?? r.existente;
        if (comAlerta && cadastrado) await ativarAlertaMonitor(cadastrado.id);
        if (r.existente) {
            await msg.reply(`👀 ${r.existente.contact_name} já está cadastrado: #${r.existente.id}.`);
        } else if (r.limite) {
            await msg.reply(`❌ Limite de ${getSetting('monitor.max')} contatos atingido. Remova um com /monitor -rem <id>.`);
        } else {
            await msg.reply(`👀 #${r.contato.id} · ${r.contato.contact_name} cadastrado.\n` +
                `⏱️ Verificação a cada ${intervaloMonitor()}, um contato por vez.\n` +
                `💡 /monitor -list mostra o histórico; /monitor -rem ${r.contato.id} remove.\n${RISCO}`);
            if (!getSetting('monitor.enabled')) {
                await msg.reply('⏸️ Monitor pausado. Retome com /set monitor.enabled true.');
            }
        }
        if (comAlerta && cadastrado) {
            await msg.reply(`🚨 Alerta online ativado para "${cadastrado.contact_name}" no privado do dono do bot.`);
        }
        return;
    }
    const remover = texto.match(/^-(?:rem|r)(?:\s+([\s\S]+))?$/);
    if (remover) {
        const valor = semDelimitadores(remover[1]);
        if (!valor) {
            await msg.reply('❌ Informe o id da lista ou um contato: /monitor -rem 1 ou /monitor -r /Jorge Pereira/');
            return;
        }
        if (valor.toLowerCase() === 'all') {
            const total = await removerTodosMonitorados();
            await msg.reply(`🗑️ Monitor limpo: ${total} contato(s) e seus históricos removidos.`);
            return;
        }
        const contato = await buscarMonitorado(msg, valor);
        if (!contato) return;
        const id = contato.id;
        const c = await removerMonitorado(id);
        await msg.reply(c ? `🗑️ #${c.id} · ${c.contact_name}: cadastro e histórico removidos.`
            : `❌ Contato #${id} não cadastrado. Veja /monitor`);
        return;
    }
    await msg.reply('❌ Use /monitor, /monitor -add <contato> [-alerta], /monitor -alerta <contato>, /monitor -rem <id, contato ou all> ou /monitor -list [contato].');
}

module.exports = { cmdMonitor, intervaloMonitor, RISCO };
