/*
 * /bot -status: o relatório do bot (últimas 24 h) e o envio diário.
 */

const fs = require('fs');

const { estado } = require('./estado');
const { listarBackups, motivoTexto } = require('./backup');
const { client } = require('./cliente');
const { BOT_START_TIME, CACHE_DIR, DAY_MS, DB_PATH, MEDIA_DIR } = require('./constantes');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { t } = require('./i18n');
const { getBotUptime } = require('./log');
const { descreverDestinos, destinosParaSalvar, destinosSalvos } = require('./destinos');
const { getSetting } = require('./settings');
const { versaoDoBot } = require('./versao');
const { getDirSize, humanSize } = require('./util/arquivos');
const { fmtNum, plural } = require('./util/formatar');
const { fmtQuando, instanteEmBrasilia, partesEmBrasilia } = require('./util/quando');

/*
 * O envio diário é um item da agenda (tabela `schedules`, kind 'status',
 * repetir 'diario'): a agenda já cuida do horário, da repetição e do envio
 * atrasado quando o bot volta. Ele não aparece no /cron. Os destinos do -to
 * (pessoas, grupos, e-mails) ficam na coluna recipients; sem ela, o seu privado.
 */
const KIND = 'status';

// Ao lado da contagem, quando o setting do aviso está off: como ligar de novo
const desligado = (chave, oQue) => (getSetting(chave) ? '' : ' ' + t('status.offHint', { what: oQue, key: chave }));

const tamanho = (p) => (fs.existsSync(p) ? (fs.statSync(p).isDirectory() ? getDirSize(p) : fs.statSync(p).size) : 0);

/**
 * O relatório das últimas 24 h. O /bot coloca o estado dele no topo (estadoDoBot)
 * e a lista de usuários embaixo (usuarios); o envio diário vai sem a lista.
 */
async function textoDoStatus(agora = Date.now(), { estadoDoBot = '', usuarios = '' } = {}) {
    await dbPronto;
    const desde = agora - DAY_MS;
    const conta = async (sql, params) => (await dbGet(sql, params)).n;

    const apagadas = await conta(
        "SELECT COUNT(*) AS n FROM messages WHERE revoked = 1 AND revoked_at >= ? AND chat_id != 'status@broadcast'", [desde]);
    const statusApagados = await conta(
        "SELECT COUNT(*) AS n FROM messages WHERE revoked = 1 AND revoked_at >= ? AND chat_id = 'status@broadcast'", [desde]);
    const editadas = await conta('SELECT COUNT(*) AS n FROM message_edits WHERE edited_at >= ?', [desde]);
    const reacoes = await conta('SELECT COUNT(*) AS n FROM reaction_changes WHERE changed_at >= ?', [desde]);
    const mensagens = await conta('SELECT COUNT(*) AS n FROM messages', []);

    // /watch: ocorrências por regra (o nº é o da lista do /watch -l)
    const regras = getSetting('watch.rules');
    const porRegra = await dbAll('SELECT rule, COUNT(*) AS n FROM watch_hits WHERE timestamp >= ? GROUP BY rule ORDER BY n DESC', [desde]);
    const totalWatch = porRegra.reduce((s, r) => s + r.n, 0);
    const detalheWatch = porRegra.slice(0, 5).map(r => {
        const i = regras.indexOf(r.rule);
        return `${i >= 0 ? `#${i + 1} ` : ''}${r.rule}: ${fmtNum(r.n)}`;
    }).join(', ');

    // /mute: avisos cortados, por tipo
    const ignoradas = await dbAll('SELECT kind, COUNT(*) AS n FROM mute_hits WHERE at >= ? GROUP BY kind ORDER BY kind', [desde]);
    const totalIgnoradas = ignoradas.reduce((s, r) => s + r.n, 0);
    const ROTULOS = { apagada: t('status.kind.apagada'), editada: t('status.kind.editada'), status: t('status.kind.status'), reacao: t('status.kind.reacao'), watch: t('status.kind.watch') };
    const silenciados = await conta('SELECT COUNT(*) AS n FROM mutes', []);

    const [ultimoBackup] = await listarBackups();
    const conectado = estado.autenticadoEm ? getBotUptime(estado.autenticadoEm) : t('uptime.notConnected');
    const banco = tamanho(DB_PATH);

    let texto = t('status.title', { version: versaoDoBot(), when: fmtQuando(agora, agora) }) + '\n\n' +
        (estadoDoBot ? `${estadoDoBot}\n\n` : '') +
        t('status.up', { up: getBotUptime(BOT_START_TIME), connected: conectado }) + '\n' +
        t('status.cache', {
            size: humanSize(tamanho(CACHE_DIR)),
            db: humanSize(banco),
            media: humanSize(tamanho(MEDIA_DIR)),
            messages: `${fmtNum(mensagens)} ${t(mensagens === 1 ? 'status.message' : 'status.messages')}`
        }) + '\n' +
        t('status.watch', {
            count: `${fmtNum(totalWatch)} ${t(totalWatch === 1 ? 'status.hit' : 'status.hits')}`,
            detail: detalheWatch ? ` _(${detalheWatch})_` : ''
        }) + '\n' +
        t('status.deleted', { n: fmtNum(apagadas), off: desligado('show.alert.deleted', t('status.alertOff')) }) + '\n' +
        t('status.edited', { n: fmtNum(editadas), off: desligado('show.alert.edited', t('status.alertOff')) }) + '\n' +
        t('status.statusDeleted', { n: fmtNum(statusApagados), off: desligado('show.alert.status', t('status.recoveryOff')) }) + '\n' +
        t('status.reactions', { n: fmtNum(reacoes), off: desligado('show.alert.reaction', t('status.alertOff')) }) + '\n' +
        t('status.muted', { n: fmtNum(totalIgnoradas) }) +
        (totalIgnoradas ? ` _(${ignoradas.map(r => `${ROTULOS[r.kind] ?? r.kind} ${fmtNum(r.n)}`).join(', ')})_` : '') +
        (silenciados ? ` · ${plural(silenciados, t('status.mutedOne'), t('status.mutedMany'))}` : '') + '\n' +
        t('status.lastBackup', {
            value: ultimoBackup ? `${fmtQuando(ultimoBackup.criadoEm, agora)} (${motivoTexto(ultimoBackup.motivo)})` : t('status.none')
        });

    // Embaixo, os usuários (só no /bot) e, no fim, o envio diário
    return `${texto}${usuarios ? `\n\n${usuarios}` : ''}\n\n${await textoDoEnvioDiario(agora)}`;
}

/**
 * O horário do envio diário e o próximo, ou que ele está desligado.
 */
async function textoDoEnvioDiario(agora = Date.now()) {
    const diario = await agendamentoDiario();

    return diario
        ? t('status.daily', {
            time: horaDoItem(diario),
            where: ondeVai(destinosDoStatus(diario)),
            next: fmtQuando(diario.due_at, agora)
        })
        : t('status.dailyOff');
}

const agendamentoDiario = () => dbGet('SELECT * FROM schedules WHERE kind = ?', [KIND]);

// Para onde vai o envio diário: os do -to; [] = o seu privado
const destinosDoStatus = (item) => destinosSalvos(item?.recipients, null);

// " → 📧 a@b.com, 👥 Grupo" ou ", no seu privado."
const ondeVai = (destinos) => (destinos.length
    ? ` → ${descreverDestinos(destinos)}`
    : t('status.wherePrivate'));

const dois = (n) => String(n).padStart(2, '0');
const horaDoItem = (s) => {
    const p = partesEmBrasilia(s.due_at);
    return `${dois(p.h)}:${dois(p.m)}`;
};

/**
 * Agenda o status diário no horário (Brasília). Substitui o anterior.
 * @param {object[]} [destinos]  os do -to ([] = o seu privado); sem eles, ficam os de antes
 * @returns {Promise<number>} o próximo envio (ms)
 */
async function agendarStatusDiario({ h, m }, agora = Date.now(), destinos) {
    await dbPronto;
    const recipients = destinos
        ? destinosParaSalvar(destinos)
        : (await agendamentoDiario())?.recipients ?? null;
    const hoje = partesEmBrasilia(agora);
    let proximo = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia, h, m);
    if (proximo <= agora) proximo = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia + 1, h, m);

    await dbRun('DELETE FROM schedules WHERE kind = ?', [KIND]);
    await dbRun(
        `INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month,
            quoted_id, created_at, recipients)
         VALUES (?, ?, 'seu privado', 0, '', ?, 'diario', NULL, NULL, ?, ?)`,
        [KIND, client.info.wid._serialized, proximo, agora, recipients]
    );
    return proximo;
}

async function desligarStatusDiario() {
    await dbPronto;
    return (await dbRun('DELETE FROM schedules WHERE kind = ?', [KIND])).changes > 0;
}

module.exports = {
    KIND,
    agendamentoDiario,
    agendarStatusDiario,
    desligarStatusDiario,
    destinosDoStatus,
    horaDoItem,
    ondeVai,
    textoDoEnvioDiario,
    textoDoStatus
};
