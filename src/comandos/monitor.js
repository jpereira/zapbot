const { MessageMedia } = require('whatsapp-web.js');
const { resolverOuEscolher } = require('../destinos');
const { resolveLidToPhone } = require('../contatos');
const { getSetting } = require('../settings');
const { estado } = require('../estado');
const {
    cadastrarMonitorado, historicoMonitorado, listarMonitorados, removerMonitorado
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

function intervaloMonitor() {
    const s = getSetting('monitor.pool');
    return s % 60 === 0 ? `${s / 60} min (${s} s)` : `${s} s`;
}

async function responderLista(msg) {
    const contatos = await listarMonitorados();
    const situacao = !getSetting('monitor.enabled') || getSetting('bot.paused') ? 'pausado'
        : !estado.pronto || estado.reiniciando ? 'aguardando conexão' : 'ativo';
    const linhas = [
        `👀 *MONITOR* · ${situacao}`,
        `⏱️ Verificação de cada contato a cada ${intervaloMonitor()}, no mínimo.`,
        `👥 Contatos: ${contatos.length}/${getSetting('monitor.max')} · horários de São Paulo`, ''
    ];
    if (!contatos.length) linhas.push('👀 Nenhum contato cadastrado.',
        '💡 /monitor -add /Nome do Contato/');
    for (const c of contatos) {
        linhas.push(`📹 #${c.id} · ${c.contact_name}`,
            `   ${c.last_status ?? '⏳ aguardando primeira verificação'}`,
            `   🔎 Verificado: ${quando(c.last_checked_at)}`,
            `   🕒 Último horário observado: ${c.last_seen ? quando(c.last_seen * 1000) : 'nenhum'}`);
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
    if (!texto || /^-(?:list|l)$/.test(texto)) {
        await responderLista(msg);
        return;
    }
    const adicionar = texto.match(/^-(?:add|a)(?:\s+([\s\S]+))?$/);
    if (adicionar) {
        const valor = semDelimitadores(adicionar[1]);
        if (!valor) {
            await msg.reply('❌ Informe um contato: /monitor -add /Jorge Pereira/');
            return;
        }
        const contato = await resolverPessoa(msg, valor);
        if (!contato) return;
        const r = await cadastrarMonitorado(contato);
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
        return;
    }
    const remover = texto.match(/^-(?:rem|r)(?:\s+([\s\S]+))?$/);
    if (remover) {
        const valor = semDelimitadores(remover[1]);
        if (!valor) {
            await msg.reply('❌ Informe o id da lista ou um contato: /monitor -rem 1 ou /monitor -r /Jorge Pereira/');
            return;
        }
        let id;
        if (/^#?\d{1,9}$/.test(valor)) {
            id = Number(valor.replace(/^#/, ''));
        } else {
            const pessoa = await resolverPessoa(msg, valor);
            if (!pessoa) return;
            for (const c of await listarMonitorados()) {
                const phone = c.contact_id.endsWith('@lid')
                    ? await resolveLidToPhone(c.contact_id) ?? c.contact_id : c.contact_id;
                if (phone === pessoa.id) { id = c.id; break; }
            }
            if (id === undefined) {
                await msg.reply(`❌ ${pessoa.nome} não está cadastrado no monitor. Veja /monitor -l`);
                return;
            }
        }
        const c = await removerMonitorado(id);
        await msg.reply(c ? `🗑️ #${c.id} · ${c.contact_name}: cadastro e histórico removidos.`
            : `❌ Contato #${id} não cadastrado. Veja /monitor`);
        return;
    }
    await msg.reply('❌ Use /monitor, /monitor -add <contato>, /monitor -rem <id ou contato> ou /monitor -list.');
}

module.exports = { cmdMonitor, intervaloMonitor, RISCO };
