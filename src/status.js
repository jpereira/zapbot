/*
 * /status: o relatório do bot (últimas 24 h) e o envio diário.
 */

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const { estado } = require('./estado');
const { listarBackups } = require('./backup');
const { client } = require('./cliente');
const { BOT_START_TIME, CACHE_DIR, DAY_MS, MEDIA_DIR } = require('./constantes');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { getBotUptime } = require('./log');
const { getSetting } = require('./settings');
const { getDirSize, humanSize } = require('./util/arquivos');
const { fmtNum } = require('./util/formatar');
const { fmtQuando, instanteEmBrasilia, partesEmBrasilia } = require('./util/quando');

/*
 * O envio diário é um item da agenda (tabela `schedules`, kind 'status',
 * repetir 'diario'), no seu privado: a agenda já cuida do horário, da
 * repetição e do envio atrasado quando o bot volta. Ele não aparece no /cron.
 */
const KIND = 'status';

const tamanho = (p) => (fs.existsSync(p) ? (fs.statSync(p).isDirectory() ? getDirSize(p) : fs.statSync(p).size) : 0);

/**
 * O relatório das últimas 24 h.
 */
async function textoDoStatus(agora = Date.now()) {
    await dbPronto;
    const desde = agora - DAY_MS;
    const conta = async (sql, params) => (await dbGet(sql, params)).n;

    const apagadas = await conta(
        "SELECT COUNT(*) AS n FROM messages WHERE revoked = 1 AND revoked_at >= ? AND chat_id != 'status@broadcast'", [desde]);
    const statusApagados = await conta(
        "SELECT COUNT(*) AS n FROM messages WHERE revoked = 1 AND revoked_at >= ? AND chat_id = 'status@broadcast'", [desde]);
    const editadas = await conta('SELECT COUNT(*) AS n FROM message_edits WHERE edited_at >= ?', [desde]);
    const mensagens = await conta('SELECT COUNT(*) AS n FROM messages', []);

    // /watch: ocorrências por regra (o nº é o da lista do /watch -l)
    const regras = getSetting('watch.rules');
    const porRegra = await dbAll('SELECT rule, COUNT(*) AS n FROM watch_hits WHERE timestamp >= ? GROUP BY rule ORDER BY n DESC', [desde]);
    const totalWatch = porRegra.reduce((s, r) => s + r.n, 0);
    const detalheWatch = porRegra.slice(0, 5).map(r => {
        const i = regras.indexOf(r.rule);
        return `${i >= 0 ? `#${i + 1} ` : ''}${r.rule}: ${fmtNum(r.n)}`;
    }).join(', ');

    // /mudo: avisos cortados, por tipo
    const ignoradas = await dbAll('SELECT kind, COUNT(*) AS n FROM mute_hits WHERE at >= ? GROUP BY kind ORDER BY kind', [desde]);
    const totalIgnoradas = ignoradas.reduce((s, r) => s + r.n, 0);
    const ROTULOS = { apagada: 'apagadas', editada: 'editadas', status: 'status' };

    const [ultimoBackup] = await listarBackups();
    const conectado = estado.autenticadoEm ? getBotUptime(estado.autenticadoEm) : 'não conectado';
    const banco = tamanho(path.join(CACHE_DIR, 'bot_database.db'));

    let texto = `📊 *Status do ZapBot ${packageJson.version}* · últimas 24 h\n_${fmtQuando(agora, agora)}_\n\n` +
        `🤖 *No ar:* ${getBotUptime(BOT_START_TIME)} · conectado: ${conectado}\n` +
        `🗄️ *Cache:* ${humanSize(tamanho(CACHE_DIR))} _(banco ${humanSize(banco)} · mídias ${humanSize(tamanho(MEDIA_DIR))})_ · ${fmtNum(mensagens)} mensagens\n` +
        `👀 *Watch:* ${fmtNum(totalWatch)} ocorrência${totalWatch === 1 ? '' : 's'}${detalheWatch ? ` _(${detalheWatch})_` : ''}\n` +
        `🗑️ *Apagadas:* ${fmtNum(apagadas)}\n` +
        `✏️ *Editadas:* ${fmtNum(editadas)}\n` +
        `📸 *Status apagados:* ${fmtNum(statusApagados)}\n` +
        `🔇 *Ignoradas (/mudo):* ${fmtNum(totalIgnoradas)}` +
        (totalIgnoradas ? ` _(${ignoradas.map(r => `${ROTULOS[r.kind] ?? r.kind} ${fmtNum(r.n)}`).join(', ')})_` : '') + '\n' +
        `💾 *Último backup:* ${ultimoBackup ? `${fmtQuando(ultimoBackup.criadoEm, agora)} (${ultimoBackup.motivo})` : 'nenhum'}`;

    const diario = await agendamentoDiario();
    texto += diario
        ? `\n\n⏰ _Próximo status: ${fmtQuando(diario.due_at, agora)} (todo dia às ${horaDoItem(diario)})_`
        : '\n\n💡 _Receba todo dia com /status 06h (no horário que quiser)._';

    return texto;
}

const agendamentoDiario = () => dbGet('SELECT * FROM schedules WHERE kind = ?', [KIND]);

const dois = (n) => String(n).padStart(2, '0');
const horaDoItem = (s) => {
    const p = partesEmBrasilia(s.due_at);
    return `${dois(p.h)}:${dois(p.m)}`;
};

/**
 * Agenda o status diário no horário (Brasília), no seu privado. Substitui o anterior.
 * @returns {Promise<number>} o próximo envio (ms)
 */
async function agendarStatusDiario({ h, m }, agora = Date.now()) {
    await dbPronto;
    const hoje = partesEmBrasilia(agora);
    let proximo = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia, h, m);
    if (proximo <= agora) proximo = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia + 1, h, m);

    await dbRun('DELETE FROM schedules WHERE kind = ?', [KIND]);
    await dbRun(
        `INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month, quoted_id, created_at)
         VALUES (?, ?, 'seu privado', 0, '', ?, 'diario', NULL, NULL, ?)`,
        [KIND, client.info.wid._serialized, proximo, agora]
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
    horaDoItem,
    textoDoStatus
};
