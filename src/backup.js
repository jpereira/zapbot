/*
 * Backup do banco: cópia compactada em cache/backups, o backup diário automático e a restauração.
 */

const { execFile } = require('child_process');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { promisify } = require('util');
const fs = require('fs-extra');
const { MessageMedia } = require('whatsapp-web.js');

const { client } = require('./cliente');
const { BACKUP_DIR, NOTES_DIR, TMP_DIR } = require('./constantes');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { descreverDestino, extrairDestinos, resolverDestino } = require('./destinos');
const { alertarPorEmail, enviarArquivoPorEmail } = require('./email');
const { printError, printInfo } = require('./log');
const { carregarSettings, getSetting } = require('./settings');
const { fmtQuando, instanteEmBrasilia, partesEmBrasilia } = require('./util/quando');
const { versaoComCommit } = require('./versao');
const { t } = require('./i18n');

/*
 * Cada backup é um par de arquivos em BACKUP_DIR:
 *   zapbot-AAAAMMDD-HHMMSS.db.gz  → o banco inteiro (VACUUM INTO: cópia consistente
 *                                   sem parar o bot), compactado
 *   zapbot-AAAAMMDD-HHMMSS.json   → data, motivo, versão do bot e as entradas de cada tabela
 *   zapbot-AAAAMMDD-HHMMSS.notes.tar.gz → as imagens do /notes (NOTES_DIR); só existe se houver
 *                                   alguma imagem (o tar do sistema)
 * As mídias (cache/media) não entram.
 *
 * Motivos: 'automático' (o diário, setting 'backup.hour'), 'manual' (/backup -now)
 * e 'antes de restaurar'. Os automáticos e os de antes de restaurar além dos
 * 'backup.keep' mais recentes são apagados; os manuais ficam até um /backup -rm.
 */
const PREFIXO = 'zapbot-';
const EXT = '.db.gz';
const EXT_NOTAS = '.notes.tar.gz';
const tar = promisify(execFile);
// Anexo acima disso costuma voltar do provedor antes de chegar ao destinatário.
const MAX_ANEXO_BYTES = 20 * 1024 * 1024;

const MOTIVOS = {
    automatico: 'automático',
    manual: 'manual',
    restaurar: 'antes de restaurar'
};

// O motivo fica guardado em português (MOTIVOS): na tela, no idioma atual
const MOTIVOS_NA_TELA = {
    [MOTIVOS.automatico]: 'adm.backup.reasonAuto',
    [MOTIVOS.manual]: 'adm.backup.reasonManual',
    [MOTIVOS.restaurar]: 'adm.backup.reasonRestore'
};
const motivoTexto = (motivo) => (MOTIVOS_NA_TELA[motivo] ? t(MOTIVOS_NA_TELA[motivo]) : motivo);

const dois = (n) => String(n).padStart(2, '0');

async function enviarBackupPorEmail(b, emails) {
    if (b.bytes > MAX_ANEXO_BYTES) {
        throw new Error(t('adm.backup.tooBigEmail'));
    }
    await enviarArquivoPorEmail({
        para: emails,
        assunto: t('adm.backup.emailSubject', { quando: fmtQuando(b.criadoEm) }),
        texto: t('adm.backup.emailBody', {
            quando: fmtQuando(b.criadoEm), motivo: motivoTexto(b.motivo), versao: b.versao, dir: BACKUP_DIR, nome: b.nome
        }),
        arquivo: b.arquivo,
        nomeArquivo: `${b.nome}.db.gz`
    });
}

async function enviarBackupAoChat(b, id) {
    await client.sendMessage(id, MessageMedia.fromFilePath(b.arquivo), {
        sendMediaAsDocument: true,
        caption: t('adm.backup.caption', { quando: fmtQuando(b.criadoEm), motivo: motivoTexto(b.motivo) })
    });
}

async function enviarBackupAutomatico(b, valor) {
    const lista = /^-to(?:\s|$)/.test(valor) ? extrairDestinos(valor) : null;
    if (lista?.resto) throw new Error(t('adm.backup.toUsage'));
    const textos = lista ? lista.destinos : [valor.replace(/^(["'/])(.*)\1$/, '$2')];
    const destinos = [];
    const falhas = [];

    for (const texto of textos) {
        try {
            const d = await resolverDestino(texto, { aceitaEmail: true });
            if (d.erro) throw new Error(d.erro);
            // Sem alguém para escolher um número: nome ambíguo não ganha no cara ou coroa.
            if (d.opcoes) throw new Error(t('adm.backup.ambiguous'));
            if (!destinos.some(x => d.email ? x.email === d.email : x.id === d.id)) destinos.push(d);
        } catch (err) {
            falhas.push(`${texto ?? t('adm.backup.emptyTo')}: ${err.message}`);
        }
    }

    const emails = [...new Set(destinos.filter(d => d.email)
        .flatMap(d => d.email.split(/\s*,\s*/)))];
    if (emails.length) {
        await enviarBackupPorEmail(b, emails)
            .catch(err => falhas.push(`${t('adm.backup.emailWord')}: ${err.message}`));
    }
    for (const d of destinos.filter(d => d.id)) {
        await enviarBackupAoChat(b, d.id)
            .catch(err => falhas.push(`${descreverDestino(d)}: ${err.message}`));
    }
    if (falhas.length) throw new Error(falhas.join('; '));
    printInfo(`Backup diário ${b.nome} enviado para ${valor}`);
}

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

// Quantas imagens há em NOTES_DIR (sem entrar em subpastas)
async function imagensDasNotas() {
    if (!fs.existsSync(NOTES_DIR)) return [];
    const itens = await fs.readdir(NOTES_DIR, { withFileTypes: true });
    return itens.filter(i => i.isFile()).map(i => i.name);
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
        const arquivoNotas = path.join(BACKUP_DIR, nome + EXT_NOTAS);
        const stat = await fs.stat(arquivo);
        const meta = await fs.readJson(path.join(BACKUP_DIR, `${nome}.json`)).catch(() => ({}));

        lista.push({
            nome,
            arquivo,
            bytes: stat.size,
            criadoEm: meta.criadoEm ?? stat.mtimeMs,
            motivo: meta.motivo ?? '?',
            versao: meta.versao ?? '?',
            entradas: meta.entradas ?? null,
            ...(fs.existsSync(arquivoNotas)
                ? { arquivoNotas, bytesNotas: (await fs.stat(arquivoNotas)).size, imagens: meta.imagens ?? null }
                : {})
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
        const imagens = await imagensDasNotas();
        if (imagens.length) {
            await tar('tar', ['-czf', path.join(BACKUP_DIR, nome + EXT_NOTAS), '-C', NOTES_DIR, '.']);
        }
        await fs.writeJson(path.join(BACKUP_DIR, `${nome}.json`),
            { criadoEm: agora, motivo, versao: versaoComCommit(), bytesBanco, entradas, imagens: imagens.length },
            { spaces: 2 });

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
    await fs.remove(path.join(BACKUP_DIR, b.nome + EXT_NOTAS));
    await fs.remove(path.join(BACKUP_DIR, `${b.nome}.json`));
}

// Apaga todos os backups (/cache -backup e /cache -all)
async function apagarTodosBackups() {
    const lista = await listarBackups();
    for (const b of lista) await removerBackup(b);
    return { backups: lista.length, bytes: lista.reduce((s, b) => s + b.bytes + (b.bytesNotas ?? 0), 0) };
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

    // As imagens do backup voltam para NOTES_DIR (as que já estão lá e não vieram ficam)
    if (b.arquivoNotas) {
        await fs.ensureDir(NOTES_DIR);
        await tar('tar', ['-xzf', b.arquivoNotas, '-C', NOTES_DIR]);
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

        const b = await criarBackup(MOTIVOS.automatico, agora);
        const destino = getSetting('backup.to').trim();
        if (destino) {
            try {
                await enviarBackupAutomatico(b, destino);
            } catch (err) {
                printError('Envio do backup diário falhou:', err.message);
                await alertarPorEmail(t('adm.backup.sendFailAlertSubject'),
                    t('adm.backup.sendFailAlert', { nome: b.nome, erro: err.message }));
            }
        }
        return b;
    } catch (err) {
        printError('Backup diário falhou:', err.message);
        alertarPorEmail(t('adm.backup.failAlertSubject'), t('adm.backup.failAlert', { erro: err.message }));
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
    MAX_ANEXO_BYTES,
    MOTIVOS,
    apagarTodosBackups,
    contarEntradas,
    criarBackup,
    enviarBackupAoChat,
    enviarBackupPorEmail,
    iniciarBackup,
    listarBackups,
    motivoTexto,
    proximoBackupDiario,
    removerBackup,
    restaurarBackup,
    verificarBackupDiario
};
