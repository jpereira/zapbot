/*
 * Comando /backup.
 */

const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

const { MOTIVOS, contarEntradas, criarBackup, listarBackups, proximoBackupDiario, removerBackup, restaurarBackup } = require('../backup');
const { findCommand } = require('./base');
const { client } = require('../cliente');
const { BACKUP_DIR, CACHE_DIR } = require('../constantes');
const {
    descreverDestinos, emailsDoSmtpTo, extrairDestinos, resolverDestinos
} = require('../destinos');
const { enviarArquivoPorEmail } = require('../email');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
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
 * /backup -s [nº] [-to <destino>] → envia o arquivo (sem nº: o mais recente) no seu
 *                         privado ou no -to: por e-mail, como anexo pelo SMTP do bot ("email" =
 *                         QRCODE_EMAIL_SMTP_TO), ou noutro chat (contato, grupo ou número: pede -sim,
 *                         já que o banco tem as mensagens de todos os chats). Repita o -to para
 *                         vários. A forma antiga, com os e-mails direto no -s (/backup -s 2 email),
 *                         continua valendo
 * /backup -rm <nº|all>  → apaga
 */
// Anexo grande demais é recusado pela maioria dos provedores (Gmail: 25 MB)
const MAX_ANEXO_BYTES = 20 * 1024 * 1024;

const AJUDA = '💡 _-now cria um agora · -l lista · -i <nº> detalha · -r <nº> restaura · -s [nº] [-to <destino>] envia o arquivo · -rm <nº|all> apaga_';

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

async function cmdBackup({ msg, opts: optsDoComando, args }) {
    /*
     * O -to aceita espaços (/Jorge Pereira/), que o parser de opções
     * separaria: sai do texto antes, e o resto é lido de novo.
     */
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(args);
    const opts = comDestino ? GetOptFromCommand(resto, findCommand('/backup')) : optsDoComando;
    const o = opts.opt;

    if (comDestino && !opts.given.has('send')) {
        await msg.reply('❌ O -to é do -send: /backup -send [nº] -to <destino>');
        return;
    }

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

    // -send [nº] [-to <destino>]: no seu privado, por e-mail ou noutro chat
    if (opts.given.has('send')) {
        const valores = [o.send, ...opts.argv].filter(Boolean).flatMap(v => String(v).split(','))
            .map(v => v.trim()).filter(Boolean);
        const numero = valores.find(v => /^\d+$/.test(v));
        // A forma antiga: os e-mails direto no -send (/backup -s 2 email)
        const antigos = valores.filter(v => v !== numero);

        if (antigos.length && comDestino) {
            await msg.reply('❌ Informe o destino só no -to: /backup -send [nº] -to <destino>');
            return;
        }

        const emailsAntigos = antigos.flatMap(v => (/^e-?mail$/i.test(v) ? emailsDoSmtpTo() : [v]));
        const invalidos = emailsAntigos.filter(e => !e || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e));

        if (invalidos.length) {
            await msg.reply(`❌ E-mail inválido: ${invalidos.map(e => e || '(QRCODE_EMAIL_SMTP_TO vazio)').join(', ')}\n` +
                '💡 _/backup -s [nº] -to <destino>: sem -to, vai no seu privado; -to email usa o QRCODE_EMAIL_SMTP_TO._');
            return;
        }

        const b = numero ? acharBackup(lista, numero) : lista[0];
        if (!b) {
            await msg.reply(lista.length ? `❌ Backup ${numero} não existe. Veja a lista com /backup -l` : semBackups);
            return;
        }

        let destinos = emailsAntigos.length ? [{ email: emailsAntigos.join(', ') }] : [];
        if (comDestino) {
            // E-mail ou chat (vários -to: todos); vários contatos ou grupos com o nome, espera você
            // escolher na lista
            destinos = await resolverDestinos(msg, destinosTexto, { aceitaEmail: true });
            if (!destinos) return;
        }

        const meuId = client.info.wid._serialized;
        const outrosChats = destinos.filter(d => d.id && d.id !== meuId);

        // Noutro chat: o banco tem as mensagens guardadas de TODOS os chats, então pede -sim
        if (outrosChats.length && !o.sim) {
            const tos = destinosTexto.map(t => `-to ${/\s/.test(t) ? `/${t}/` : t}`).join(' ');
            await msg.reply(`⚠️ O backup tem o banco inteiro: as mensagens guardadas de todos os chats, as apagadas, os settings...\n` +
                `Para enviar mesmo em ${descreverDestinos(outrosChats)}, repita com -sim: ` +
                `/backup -send${numero ? ` ${numero}` : ''} ${tos} -sim`);
            return;
        }

        // Os e-mails de todos os -to num e-mail só; os chats (sem destino: o seu privado), um a um
        const emails = [...new Set(destinos.filter(d => d.email)
            .flatMap(d => d.email.split(/\s*,\s*/)))];
        const chats = destinos.length ? destinos.filter(d => d.id) : [{ id: meuId }];

        if (emails.length) {
            if (b.bytes > MAX_ANEXO_BYTES) {
                await msg.reply(`❌ O backup tem ${humanSize(b.bytes)}: grande demais para anexar (máx. ${humanSize(MAX_ANEXO_BYTES)}). Use /backup -s sem -to (vai no seu privado).`);
                return;
            }

            try {
                await enviarArquivoPorEmail({
                    para: emails,
                    assunto: `💾 Backup de ${fmtQuando(b.criadoEm)}`,
                    texto: `Backup do banco do ZapBot de ${fmtQuando(b.criadoEm)} (${b.motivo}, ZapBot ${b.versao}).\n` +
                        `Para restaurar: copie o arquivo para ${BACKUP_DIR} e use /backup -r ${b.nome} -sim.`,
                    arquivo: b.arquivo,
                    nomeArquivo: `${b.nome}.db.gz`
                });
                await msg.reply(`📧 Backup de ${fmtQuando(b.criadoEm)} enviado para ${emails.join(', ')}.`);
            } catch (err) {
                printError('/backup -send por e-mail:', err.message);
                await msg.reply(`❌ Não consegui enviar o e-mail: ${err.message}`);
            }
        }

        // Um chat que falha não segura os outros
        const enviados = [];
        for (const d of chats) {
            try {
                await client.sendMessage(d.id, MessageMedia.fromFilePath(b.arquivo), {
                    sendMediaAsDocument: true,
                    caption: `💾 Backup de ${fmtQuando(b.criadoEm)} (${b.motivo})`
                });
                enviados.push(d);
            } catch (err) {
                printError(`/backup -send para ${d.id}:`, err.message);
                const onde = d.id === meuId ? 'seu privado' : descreverDestinos([d]);
                await msg.reply(`❌ Não consegui enviar o backup em ${onde}: ${err.message}`);
            }
        }

        // "no seu privado" só se o comando não veio de lá (ou se foi junto com outros chats)
        const outros = enviados.filter(d => d.id !== meuId);
        const noPrivado = enviados.some(d => d.id === meuId) && (outros.length || msg.id?.remote !== meuId);
        const onde = [noPrivado && 'no seu privado', outros.length && `em ${descreverDestinos(outros)}`]
            .filter(Boolean);
        if (onde.length) await msg.reply(`💾 Backup enviado ${onde.join(' e ')}.`);
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
