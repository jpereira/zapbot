/*
 * Comando /backup.
 */

const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

const { MOTIVOS, contarEntradas, criarBackup, listarBackups, proximoBackupDiario, removerBackup, restaurarBackup } = require('../backup');
const { client } = require('../cliente');
const { BACKUP_DIR, CACHE_DIR } = require('../constantes');
const { getSetting } = require('../settings');
const { humanSize } = require('../util/arquivos');
const { fmtNum, plural } = require('../util/formatar');
const { fmtQuando, partesEmBrasilia } = require('../util/quando');

/*
 * /backup               → banco atual (tamanho e entradas), último backup e o próximo automático
 * /backup -now          → cria um backup agora
 * /backup -l            → lista os backups, numerados do mais novo para o mais antigo
 * /backup -i <nº>       → detalhes: data, motivo, versão e entradas (comparadas com o banco atual)
 * /backup -r <nº|nome>  → mostra o que vai acontecer; com -sim, restaura
 * /backup -s [nº]       → envia o arquivo no seu privado (sem nº: o mais recente)
 * /backup -rm <nº|all>  → apaga
 */
const AJUDA = '💡 _-now cria um agora · -l lista · -i <nº> detalha · -r <nº> restaura · -s [nº] envia o arquivo · -rm <nº|all> apaga_';

const entradasEmLinha = (entradas) => Object.entries(entradas)
    .map(([t, n]) => `${t} ${fmtNum(n)}`).join(' · ');

const linhaDoBackup = (b, i) => `${i + 1}. *${fmtQuando(b.criadoEm)}* · ${humanSize(b.bytes)} · ${b.motivo}`;

// "2" (nº da lista) ou o nome do arquivo (com ou sem .db.gz)
function acharBackup(lista, valor) {
    const v = String(valor ?? '').trim();
    if (/^\d+$/.test(v)) return lista[Number(v) - 1] ?? null;
    return lista.find(b => b.nome === v.replace(/\.db\.gz$/, '')) ?? null;
}

async function status(msg) {
    const lista = await listarBackups();
    const entradas = await contarEntradas();
    const banco = path.join(CACHE_DIR, 'bot_database.db');
    const bytesBanco = fs.existsSync(banco) ? fs.statSync(banco).size : null;
    const total = lista.reduce((s, b) => s + b.bytes, 0);
    const [ultimo] = lista;

    const hoje = partesEmBrasilia(Date.now());
    const feitoHoje = lista.some(b => {
        const p = partesEmBrasilia(b.criadoEm);
        return b.motivo === MOTIVOS.automatico && p.ano === hoje.ano && p.mes === hoje.mes && p.dia === hoje.dia;
    });

    let texto = '💾 *Backup*\n\n' +
        `🗄️ *Banco atual:* ${bytesBanco === null ? '—' : humanSize(bytesBanco)}\n` +
        `   _${entradasEmLinha(entradas)}_\n` +
        `📦 *Backups:* ${lista.length}${lista.length ? ` (${humanSize(total)})` : ''} em ${BACKUP_DIR}\n` +
        `🕐 *Último:* ${ultimo ? `${fmtQuando(ultimo.criadoEm)} (${ultimo.motivo}, ${humanSize(ultimo.bytes)})` : 'nenhum'}\n`;

    texto += getSetting('backup.enabled')
        ? `⏭️ *Próximo automático:* ${fmtQuando(proximoBackupDiario(Date.now(), feitoHoje))} ` +
          `_(todo dia às ${getSetting('backup.hour')}h, guarda ${getSetting('backup.keep')})_\n`
        : '⏭️ Backup automático desligado _(setting backup.enabled)_\n';

    await msg.reply(`${texto}\n${AJUDA}`, null, { linkPreview: false });
}

async function cmdBackup({ msg, opts }) {
    const o = opts.opt;
    const lista = await listarBackups();
    const semBackups = '💾 Nenhum backup ainda. Crie um com /backup -now';

    // -now
    if (o.now) {
        const b = await criarBackup(MOTIVOS.manual);
        await msg.reply(`💾 *Backup criado*\n📄 ${b.nome}\n📦 ${humanSize(b.bytes)}\n_${entradasEmLinha(b.entradas)}_`);
        return;
    }

    // -list
    if (o.list) {
        if (!lista.length) {
            await msg.reply(semBackups);
            return;
        }
        await msg.reply(`💾 *Backups* (${lista.length})\n\n${lista.map(linhaDoBackup).join('\n')}\n\n` +
            '💡 _/backup -i <nº> mostra as entradas; /backup -r <nº> restaura._');
        return;
    }

    // -info <nº>
    if (opts.given.has('info')) {
        const b = acharBackup(lista, o.info);
        if (!b) {
            await msg.reply(lista.length ? `❌ Backup ${o.info ?? '?'} não existe. Veja a lista com /backup -l` : semBackups);
            return;
        }

        const atual = await contarEntradas();
        const nomes = [...new Set([...Object.keys(b.entradas ?? {}), ...Object.keys(atual)])].sort();
        const linhas = nomes.map(t => `${t}: ${fmtNum(b.entradas?.[t] ?? 0)} → ${fmtNum(atual[t] ?? 0)}`);

        await msg.reply(`💾 *Backup ${lista.indexOf(b) + 1}*\n` +
            `📄 ${b.nome}\n🕐 ${fmtQuando(b.criadoEm)} · ${b.motivo} · ZapBot ${b.versao}\n📦 ${humanSize(b.bytes)}\n\n` +
            `*Entradas* _(backup → atual)_\n\`\`\`${linhas.join('\n')}\`\`\``);
        return;
    }

    // -restore <nº|nome> [-sim]
    if (opts.given.has('restore')) {
        const b = acharBackup(lista, o.restore);
        if (!b) {
            await msg.reply(lista.length ? `❌ Backup ${o.restore ?? '?'} não existe. Veja a lista com /backup -l` : semBackups);
            return;
        }

        if (!o.sim) {
            await msg.reply(`⚠️ *Restaurar o backup de ${fmtQuando(b.criadoEm)}?*\n` +
                `📄 ${b.nome} (${b.motivo}, ZapBot ${b.versao})\n\n` +
                'O banco inteiro volta a esse momento: mensagens guardadas, apagadas, editadas, settings, ' +
                'regras do /watch, alertas, lembretes, estatísticas... O que entrou depois se perde, mas ' +
                'antes o bot faz um backup do estado atual.\n\n' +
                `Para confirmar: /backup -r ${b.nome} -sim`);
            return;
        }

        const r = await restaurarBackup(b);
        await msg.reply(`♻️ *Backup restaurado:* ${fmtQuando(b.criadoEm)}\n` +
            `_${entradasEmLinha(r.entradas)}_\n\n` +
            `💾 O estado anterior ficou no backup ${r.seguranca.nome}: para desfazer, /backup -r ${r.seguranca.nome} -sim`);
        return;
    }

    // -send [nº]
    if (opts.given.has('send')) {
        const b = o.send ? acharBackup(lista, o.send) : lista[0];
        if (!b) {
            await msg.reply(lista.length ? `❌ Backup ${o.send} não existe. Veja a lista com /backup -l` : semBackups);
            return;
        }

        const meuId = client.info.wid._serialized;
        await client.sendMessage(meuId, MessageMedia.fromFilePath(b.arquivo), {
            sendMediaAsDocument: true,
            caption: `💾 Backup de ${fmtQuando(b.criadoEm)} (${b.motivo})`
        });
        if (msg.id?.remote !== meuId) await msg.reply('💾 Backup enviado no seu privado.');
        return;
    }

    // -rm <nº|all>
    if (opts.given.has('rm')) {
        if (String(o.rm ?? '').toLowerCase() === 'all') {
            for (const b of lista) await removerBackup(b);
            await msg.reply(`🗑️ ${plural(lista.length, 'backup removido', 'backups removidos')}.`);
            return;
        }

        const b = acharBackup(lista, o.rm);
        if (!b) {
            await msg.reply(lista.length ? `❌ Backup ${o.rm ?? '?'} não existe. Veja a lista com /backup -l` : semBackups);
            return;
        }

        await removerBackup(b);
        await msg.reply(`🗑️ Backup removido: ${fmtQuando(b.criadoEm)} (${b.motivo})`);
        return;
    }

    await status(msg);
}

module.exports = {
    cmdBackup
};
