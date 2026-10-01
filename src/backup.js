/*
 * Backup do banco: cópia compactada em cache/backups, o backup diário automático e a restauração.
 */

const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const fs = require('fs-extra');
const packageJson = require('../package.json');

const { BACKUP_DIR, TMP_DIR } = require('./constantes');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { alertarPorEmail } = require('./email');
const { printError, printInfo } = require('./log');
const { carregarSettings, getSetting } = require('./settings');
const { instanteEmBrasilia, partesEmBrasilia } = require('./util/quando');

/*
 * Cada backup é um par de arquivos em BACKUP_DIR:
 *   zapbot-AAAAMMDD-HHMMSS.db.gz  → o banco inteiro (VACUUM INTO: cópia consistente
 *                                   sem parar o bot), compactado
 *   zapbot-AAAAMMDD-HHMMSS.json   → data, motivo, versão do bot e as entradas de cada tabela
 * As mídias (cache/media) não entram: só o banco.
 *
 * Motivos: 'automático' (o diário, setting 'backup.hour'), 'manual' (/backup -now)
 * e 'antes de restaurar'. Os automáticos e os de antes de restaurar além dos
 * 'backup.keep' mais recentes são apagados; os manuais ficam até um /backup -rm.
 */
const PREFIXO = 'zapbot-';
const EXT = '.db.gz';

const MOTIVOS = {
    automatico: 'automático',
    manual: 'manual',
    restaurar: 'antes de restaurar'
};

const dois = (n) => String(n).padStart(2, '0');

// Tabelas do banco (sem as internas do SQLite)
async function tabelas(esquema = 'main') {
    const rows = await dbAll(`SELECT name FROM ${esquema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
    return rows.map(r => r.name);
}

// Entradas (linhas) de cada tabela: { tabela: n }
async function contarEntradas(esquema = 'main') {
    const contagem = {};
    for (const t of await tabelas(esquema)) {
        contagem[t] = (await dbGet(`SELECT COUNT(*) AS n FROM ${esquema}."${t}"`)).n;
    }
    return contagem;
}

// Nome livre para um backup criado agora (horário de Brasília no nome)
function nomeNovo(agora) {
    const p = partesEmBrasilia(agora);
    const base = `${PREFIXO}${p.ano}${dois(p.mes)}${dois(p.dia)}-${dois(p.h)}${dois(p.m)}${dois(p.s)}`;

    let nome = base;
    for (let i = 2; fs.existsSync(path.join(BACKUP_DIR, nome + EXT)); i++) nome = `${base}-${i}`;
    return nome;
}

/**
 * Os backups, do mais novo para o mais antigo.
 * @returns {Promise<Array<{nome, arquivo, bytes, criadoEm, motivo, versao, entradas}>>}
 */
async function listarBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const lista = [];
    for (const f of await fs.readdir(BACKUP_DIR)) {
        if (!f.startsWith(PREFIXO) || !f.endsWith(EXT)) continue;

        const nome = f.slice(0, -EXT.length);
        const arquivo = path.join(BACKUP_DIR, f);
        const stat = await fs.stat(arquivo);
        const meta = await fs.readJson(path.join(BACKUP_DIR, `${nome}.json`)).catch(() => ({}));

        lista.push({
            nome,
            arquivo,
            bytes: stat.size,
            criadoEm: meta.criadoEm ?? stat.mtimeMs,
            motivo: meta.motivo ?? '?',
            versao: meta.versao ?? '?',
            entradas: meta.entradas ?? null
        });
    }

    return lista.sort((a, b) => b.criadoEm - a.criadoEm || b.nome.localeCompare(a.nome));
}

/**
 * Cria um backup agora.
 * @param {string} motivo  um dos MOTIVOS
 */
async function criarBackup(motivo = MOTIVOS.manual, agora = Date.now()) {
    await dbPronto;
    await fs.ensureDir(BACKUP_DIR);
    await fs.ensureDir(TMP_DIR);

    const nome = nomeNovo(agora);
    const copia = path.join(TMP_DIR, `${nome}.db`);
    const arquivo = path.join(BACKUP_DIR, nome + EXT);

    try {
        await dbRun('VACUUM INTO ?', [copia]);
        const entradas = await contarEntradas();
        const bytesBanco = (await fs.stat(copia)).size;

        await pipeline(fs.createReadStream(copia), zlib.createGzip(), fs.createWriteStream(arquivo));
        await fs.writeJson(path.join(BACKUP_DIR, `${nome}.json`),
            { criadoEm: agora, motivo, versao: packageJson.version, bytesBanco, entradas }, { spaces: 2 });

        printInfo(`Backup ${nome} criado (${motivo})`);
    } finally {
        await fs.remove(copia);
    }

    await aplicarRetencao();
    return (await listarBackups()).find(b => b.nome === nome);
}

// Apaga os automáticos e os de antes de restaurar além dos 'backup.keep' mais recentes
async function aplicarRetencao() {
    const keep = getSetting('backup.keep');
    const descartaveis = (await listarBackups()).filter(b => b.motivo !== MOTIVOS.manual);

    for (const b of descartaveis.slice(keep)) {
        await removerBackup(b);
        printInfo(`Backup ${b.nome} removido (retenção: ${keep})`);
    }
}

async function removerBackup(b) {
    await fs.remove(b.arquivo);
    await fs.remove(path.join(BACKUP_DIR, `${b.nome}.json`));
}

/**
 * Restaura um backup por cima do banco atual. Antes, faz um backup do estado
 * atual ('antes de restaurar'). Copia tabela por tabela, só as colunas que
 * existem nos dois bancos (um backup de uma versão anterior também serve), e
 * recarrega os settings.
 * @returns {Promise<{ seguranca: object, entradas: object }>}
 */
async function restaurarBackup(b) {
    await dbPronto;
    const seguranca = await criarBackup(MOTIVOS.restaurar);
    const copia = path.join(TMP_DIR, `restaurar-${b.nome}.db`);

    await pipeline(fs.createReadStream(b.arquivo), zlib.createGunzip(), fs.createWriteStream(copia));
    await dbRun('ATTACH DATABASE ? AS bk', [copia]);

    try {
        const doBackup = new Set(await tabelas('bk'));
        await dbRun('BEGIN');

        try {
            for (const t of await tabelas('main')) {
                await dbRun(`DELETE FROM main."${t}"`);
                if (!doBackup.has(t)) continue;

                const colunas = (c) => dbAll(`PRAGMA ${c}.table_info("${t}")`).then(r => r.map(x => x.name));
                const noBackup = new Set(await colunas('bk'));
                const comuns = (await colunas('main')).filter(c => noBackup.has(c)).map(c => `"${c}"`).join(', ');

                await dbRun(`INSERT INTO main."${t}" (${comuns}) SELECT ${comuns} FROM bk."${t}"`);
            }
            await dbRun('COMMIT');
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => {});
            throw err;
        }
    } finally {
        await dbRun('DETACH DATABASE bk').catch(() => {});
        await fs.remove(copia);
    }

    await carregarSettings();
    printInfo(`Backup ${b.nome} restaurado (o estado anterior ficou em ${seguranca.nome})`);

    return { seguranca, entradas: await contarEntradas() };
}

/*
 * Backup diário: a cada 10 minutos, se já passou do 'backup.hour' (Brasília)
 * e ainda não há um automático de hoje, cria um. Bot fora do ar no horário:
 * o backup sai assim que ele volta, no mesmo dia.
 */
let fazendoBackup = false;

async function verificarBackupDiario(agora = Date.now()) {
    if (fazendoBackup || !getSetting('backup.enabled')) return null;

    const hoje = partesEmBrasilia(agora);
    if (hoje.h < getSetting('backup.hour')) return null;

    const mesmoDia = (ms) => {
        const p = partesEmBrasilia(ms);
        return p.ano === hoje.ano && p.mes === hoje.mes && p.dia === hoje.dia;
    };

    fazendoBackup = true;
    try {
        const jaFeito = (await listarBackups()).some(b => b.motivo === MOTIVOS.automatico && mesmoDia(b.criadoEm));
        if (jaFeito) return null;

        return await criarBackup(MOTIVOS.automatico, agora);
    } catch (err) {
        printError('Backup diário falhou:', err.message);
        alertarPorEmail('💾 Backup falhou', `O backup diário do banco falhou: ${err.message}`);
        return null;
    } finally {
        fazendoBackup = false;
    }
}

// Próximo backup automático (para o /backup)
function proximoBackupDiario(agora = Date.now(), feitoHoje = false) {
    const p = partesEmBrasilia(agora);
    const hora = getSetting('backup.hour');
    const hoje = instanteEmBrasilia(p.ano, p.mes, p.dia, hora, 0);

    if (!feitoHoje && agora < hoje) return hoje;
    if (!feitoHoje) return agora; // já passou da hora: sai na próxima verificação
    return instanteEmBrasilia(p.ano, p.mes, p.dia + 1, hora, 0);
}

// Chamada no app.js
function iniciarBackup() {
    setInterval(() => verificarBackupDiario(), 10 * 60 * 1000);
}

module.exports = {
    MOTIVOS,
    contarEntradas,
    criarBackup,
    iniciarBackup,
    listarBackups,
    proximoBackupDiario,
    removerBackup,
    restaurarBackup,
    verificarBackupDiario
};
