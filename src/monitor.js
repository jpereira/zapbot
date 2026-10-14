/*
 * /monitor: contatos persistidos e horários distintos de presença observados.
 * Não tenta reconstruir intervalos online nem completar horários ausentes.
 */
const crypto = require('node:crypto');
const { messageToSelf } = require('./cliente');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { estado } = require('./estado');
const { getSetting } = require('./settings');
const { limitarHistoricoMonitor } = require('./monitorHistorico');
const { consultarPresenca } = require('./presenca');
const { printError } = require('./log');

let verificando = false;
let timer = null;
let espera = null;
let geracao = 0;

function embaralhar(contatos) {
    for (let i = contatos.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [contatos[i], contatos[j]] = [contatos[j], contatos[i]];
    }
    return contatos;
}

function esperarEntreContatos() {
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            espera = null;
            resolve();
        }, crypto.randomInt(1, 16) * 1000);
        espera = { timeout, resolve };
    });
}

const ativo = () => estado.pronto && !estado.reiniciando &&
    !getSetting('bot.paused') && getSetting('monitor.enabled') &&
    !getSetting('commands.disabled').includes('/monitor');

async function listarMonitorados() {
    await dbPronto;
    return dbAll('SELECT * FROM monitor_contacts ORDER BY id');
}

async function cadastrarMonitorado(contato) {
    await dbPronto;
    const existente = await dbGet('SELECT * FROM monitor_contacts WHERE contact_id = ?',
        [contato.id]);
    if (existente) return { existente };
    const r = await dbRun(`INSERT OR IGNORE INTO monitor_contacts
        (contact_id, contact_name, created_at)
        SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM monitor_contacts) < ?`,
    [contato.id, contato.nome, Date.now(), getSetting('monitor.max')]);
    if (!r.changes) {
        const repetido = await dbGet('SELECT * FROM monitor_contacts WHERE contact_id = ?',
            [contato.id]);
        return repetido ? { existente: repetido } : { limite: true };
    }
    return { contato: await dbGet('SELECT * FROM monitor_contacts WHERE id = ?', [r.lastID]) };
}

async function removerMonitorado(id) {
    await dbPronto;
    const contato = await dbGet('SELECT * FROM monitor_contacts WHERE id = ?', [id]);
    if (!contato) return null;
    await dbRun('DELETE FROM monitor_contacts WHERE id = ?', [id]);
    return contato;
}

async function ativarAlertaMonitor(id) {
    await dbPronto;
    return dbRun('UPDATE monitor_contacts SET alert_enabled = 1 WHERE id = ?', [id]);
}

async function removerTodosMonitorados() {
    await dbPronto;
    const resultado = await dbRun('DELETE FROM monitor_contacts');
    return resultado.changes;
}

async function historicoMonitorado(id) {
    await dbPronto;
    return dbAll(`SELECT * FROM monitor_history WHERE contact_id = ?
        ORDER BY last_seen DESC, id DESC LIMIT ?`, [id, getSetting('monitor.maxRecords')]);
}

function dadosDaPresenca(dados) {
    const p = dados.presenceData ?? {};
    const state = p.chatstate ?? {};
    const raw = typeof p.lastSeen === 'number' ||
        (typeof p.lastSeen === 'string' && /^\d+$/.test(p.lastSeen)) ? Number(p.lastSeen) : NaN;
    const segundos = raw >= 1e12 ? Math.floor(raw / 1000) : raw;
    const lastSeen = p.isOnline !== true && p.hasData !== false && state.deny !== true &&
        Number.isSafeInteger(segundos) && segundos > 0 &&
        Number.isFinite(new Date(segundos * 1000).getTime()) ? segundos : null;
    const status = p.isOnline === true ? '🟢 online'
        : p.hasData === false ? '❔ sem dados'
            : state.deny === true ? '🔒 horário indisponível'
                : lastSeen ? '⚫ offline · horário observado' : '❔ sem horário disponível';
    return { lastSeen, status };
}

async function verificarMonitor() {
    if (verificando || !ativo()) return;
    verificando = true;
    const atual = geracao;
    try {
        const contatos = embaralhar((await listarMonitorados()).filter(c =>
            Date.now() - c.last_attempt_at >= getSetting('monitor.pool') * 1000));
        let consultou = false;
        for (const candidato of contatos) {
            if (!ativo() || atual !== geracao) break;
            if (consultou) await esperarEntreContatos();
            if (!ativo() || atual !== geracao) break;
            const contato = await dbGet('SELECT * FROM monitor_contacts WHERE id = ?',
                [candidato.id]);
            if (!contato) continue;
            const agora = Date.now();
            if (agora - contato.last_attempt_at < getSetting('monitor.pool') * 1000) continue;
            const r = await dbRun(`UPDATE monitor_contacts SET last_attempt_at = ?
                WHERE id = ? AND last_attempt_at = ?`,
            [agora, contato.id, contato.last_attempt_at]);
            if (!r.changes) continue;
            try {
                const dados = await consultarPresenca(contato.contact_id, { monitor: true });
                if (!dados) {
                    await dbRun(`UPDATE monitor_contacts SET last_attempt_at = ?
                        WHERE id = ? AND last_attempt_at = ?`,
                    [contato.last_attempt_at, contato.id, agora]);
                    break;
                }
                consultou = true;
                const { lastSeen, status } = dadosDaPresenca(dados);
                const at = Date.now();
                if (lastSeen) {
                    await dbRun(`INSERT OR IGNORE INTO monitor_history
                        (contact_id, last_seen, observed_at, source, kind)
                        SELECT id, ?, ?, ?, ? FROM monitor_contacts WHERE id = ?`,
                    [lastSeen, at, dados.lastSeenSource ?? null, dados.lastSeenKind ?? null,
                        contato.id]);
                    await limitarHistoricoMonitor(getSetting('monitor.maxRecords'), contato.id);
                }
                const p = dados.presenceData ?? {};
                const online = p.hasData === true && p.chatstate?.deny !== true
                    ? (p.isOnline === true ? 1 : p.isOnline === false ? 0 : null) : null;
                const salvo = await dbGet('SELECT * FROM monitor_contacts WHERE id = ?',
                    [contato.id]);
                const resultado = await dbRun(`UPDATE monitor_contacts
                    SET online_state = COALESCE(?, online_state) WHERE id = ?`,
                [online, contato.id]);
                if (ativo() && atual === geracao && resultado.changes &&
                    salvo?.alert_enabled && online === 1 &&
                    salvo.online_state !== 1) {
                    const quando = new Date(at).toLocaleString('pt-BR',
                        { timeZone: 'America/Sao_Paulo' });
                    await messageToSelf(`🚨 O contato "${salvo.contact_name}" ficou online em "${quando}".\n` +
                        '💡 Para mais, digite /monitor -l');
                }
                await dbRun(`UPDATE monitor_contacts SET last_checked_at = ?, last_status = ?,
                    last_seen = CASE WHEN ? IS NULL THEN last_seen
                        ELSE MAX(COALESCE(last_seen, 0), ?) END,
                    last_error = NULL WHERE id = ?`,
                [at, status, lastSeen, lastSeen, contato.id]);
            } catch (err) {
                consultou = true;
                await dbRun(`UPDATE monitor_contacts SET last_checked_at = ?, last_status = ?,
                    last_error = ? WHERE id = ?`,
                [Date.now(), '⚠️ consulta falhou', String(err.message ?? err).slice(0, 300),
                    contato.id]);
            }
        }
    } catch (err) {
        printError('Monitor: falha na verificação:', err.message);
    } finally {
        verificando = false;
    }
}

function iniciarMonitor() {
    if (!timer) timer = setInterval(verificarMonitor, 10000);
    timer.unref?.();
}

function pararMonitor() {
    geracao++;
    if (espera) {
        clearTimeout(espera.timeout);
        espera.resolve();
        espera = null;
    }
    clearInterval(timer);
    timer = null;
}

module.exports = {
    ativarAlertaMonitor, cadastrarMonitorado, dadosDaPresenca, historicoMonitorado, iniciarMonitor,
    listarMonitorados, pararMonitor, removerMonitorado, removerTodosMonitorados, verificarMonitor
};
