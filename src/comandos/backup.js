/*
 * Comando /backup.
 */

const fs = require('fs');

const {
    MAX_ANEXO_BYTES, MOTIVOS, contarEntradas, criarBackup, enviarBackupAoChat,
    enviarBackupPorEmail, listarBackups, motivoTexto, proximoBackupDiario, removerBackup, restaurarBackup
} = require('../backup');
const { findCommand } = require('./base');
const { client } = require('../cliente');
const { BACKUP_DIR, DB_PATH } = require('../constantes');
const {
    descreverDestinos, emailsDoSmtpTo, extrairDestinos, resolverDestinos
} = require('../destinos');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { getSetting } = require('../settings');
const { humanSize } = require('../util/arquivos');
const { fmtNum } = require('../util/formatar');
const { t } = require('../i18n');
const { fmtQuando, partesEmBrasilia } = require('../util/quando');

/*
 * /backup               → banco atual (tamanho e entradas), último backup e o próximo automático
 * /backup -now          → cria um backup agora
 * /backup -l            → lista os backups, numerados do mais novo para o mais antigo
 * /backup -i <nº>       → detalhes: data, motivo, versão e entradas (comparadas com o banco atual)
 * /backup -r <nº|nome>  → mostra o que vai acontecer; com -sim, restaura
 * /backup -s [nº] [-to <destino>]... → envia o arquivo (sem nº: o mais recente) no
 *                         seu privado ou nos destinos do -to: por e-mail, como anexo pelo
 *                         SMTP do bot ("email" = QRCODE_EMAIL_SMTP_TO), ou noutro chat
 *                         (contato, grupo ou número: pede -sim, já que o banco tem as
 *                         mensagens de todos os chats). Repita o -to para vários. A forma
 *                         antiga, com os e-mails direto no -s (/backup -s 2 email), vale
 * /backup -rm <nº|all>  → apaga
 */
const entradasEmLinha = (entradas) => Object.entries(entradas)
    .map(([tabela, n]) => `${tabela} ${fmtNum(n)}`).join(' · ');

const linhaDoBackup = (b, i) => `${i + 1}. *${fmtQuando(b.criadoEm)}* · ${humanSize(b.bytes)}` +
    `${b.bytesNotas ? ` + 🖼️ ${humanSize(b.bytesNotas)}` : ''} · ${motivoTexto(b.motivo)}`;

// "2" (nº da lista) ou o nome do arquivo (com ou sem .db.gz)
function acharBackup(lista, valor) {
    const v = String(valor ?? '').trim();
    if (/^\d+$/.test(v)) return lista[Number(v) - 1] ?? null;
    return lista.find(b => b.nome === v.replace(/\.db\.gz$/, '')) ?? null;
}

async function status(msg) {
    const lista = await listarBackups();
    const entradas = await contarEntradas();
    const banco = DB_PATH;
    const bytesBanco = fs.existsSync(banco) ? fs.statSync(banco).size : null;
    const total = lista.reduce((s, b) => s + b.bytes + (b.bytesNotas ?? 0), 0);
    const [ultimo] = lista;

    const hoje = partesEmBrasilia(Date.now());
    const feitoHoje = lista.some(b => {
        const p = partesEmBrasilia(b.criadoEm);
        return b.motivo === MOTIVOS.automatico && p.ano === hoje.ano && p.mes === hoje.mes && p.dia === hoje.dia;
    });

    // Um item por bullet; as entradas do banco, um sub-bullet por tabela
    const itens = [
        t('adm.backup.dbNow', { tamanho: bytesBanco === null ? '—' : humanSize(bytesBanco) }) + '\n' +
            Object.entries(entradas).map(([tabela, n]) => `   ◦ ${tabela}: ${fmtNum(n)}`).join('\n'),
        t('adm.backup.count', { n: lista.length, total: lista.length ? ` (${humanSize(total)})` : '', dir: BACKUP_DIR }),
        t('adm.backup.last', {
            valor: ultimo
                ? t('adm.backup.lastValue', { quando: fmtQuando(ultimo.criadoEm), motivo: motivoTexto(ultimo.motivo), tamanho: humanSize(ultimo.bytes) })
                : t('adm.backup.none')
        }),
        getSetting('backup.enabled')
            ? t('adm.backup.next', {
                quando: fmtQuando(proximoBackupDiario(Date.now(), feitoHoje)),
                hora: getSetting('backup.hour'),
                keep: getSetting('backup.keep')
            })
            : t('adm.backup.autoOff'),
        t('adm.backup.autoTo', { valor: getSetting('backup.to') || t('adm.backup.localOnly') })
    ];
    const texto = `${t('adm.backup.title')}\n\n${itens.map(i => `• ${i}`).join('\n')}\n`;

    await msg.reply(`${texto}\n${t('adm.backup.tips')}`, null, { linkPreview: false });
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
        await msg.reply(t('adm.backup.toIsSend'));
        return;
    }

    const lista = await listarBackups();
    const semBackups = t('adm.backup.noBackups');

    // -now
    if (o.now) {
        const b = await criarBackup(MOTIVOS.manual);
        await msg.reply(t('adm.backup.created', {
            nome: b.nome,
            tamanho: humanSize(b.bytes),
            notas: b.bytesNotas ? t('adm.backup.createdNotes', { tamanho: humanSize(b.bytesNotas) }) : '',
            entradas: entradasEmLinha(b.entradas)
        }));
        return;
    }

    // -list
    if (o.list) {
        if (!lista.length) {
            await msg.reply(semBackups);
            return;
        }
        await msg.reply(`${t('adm.backup.listTitle', { n: lista.length })}\n\n${lista.map(linhaDoBackup).join('\n')}\n\n` +
            t('adm.backup.listHints'));
        return;
    }

    // -info <nº>
    if (opts.given.has('info')) {
        const b = acharBackup(lista, o.info);
        if (!b) {
            await msg.reply(lista.length ? t('adm.backup.notFound', { n: o.info ?? '?' }) : semBackups);
            return;
        }

        const atual = await contarEntradas();
        const nomes = [...new Set([...Object.keys(b.entradas ?? {}), ...Object.keys(atual)])].sort();
        const linhas = nomes.map(tabela => `${tabela}: ${fmtNum(b.entradas?.[tabela] ?? 0)} → ${fmtNum(atual[tabela] ?? 0)}`);

        await msg.reply(`${t('adm.backup.infoHead', { n: lista.indexOf(b) + 1 })}\n` +
            `📄 ${b.nome}\n🕐 ${fmtQuando(b.criadoEm)} · ${motivoTexto(b.motivo)} · ZapBot ${b.versao}\n📦 ${humanSize(b.bytes)}\n` +
            `${b.bytesNotas ? t('adm.backup.infoNotes', { tamanho: humanSize(b.bytesNotas), imagens: b.imagens ? ` (${b.imagens})` : '' }) : ''}\n` +
            `${t('adm.backup.infoEntries')}\n\`\`\`${linhas.join('\n')}\`\`\``);
        return;
    }

    // -restore <nº|nome> [-sim]
    if (opts.given.has('restore')) {
        const b = acharBackup(lista, o.restore);
        if (!b) {
            await msg.reply(lista.length ? t('adm.backup.notFound', { n: o.restore ?? '?' }) : semBackups);
            return;
        }

        if (!o.sim) {
            await msg.reply(t('adm.backup.restoreAsk', {
                quando: fmtQuando(b.criadoEm),
                nome: b.nome,
                motivo: motivoTexto(b.motivo),
                versao: b.versao,
                notas: t(b.arquivoNotas ? 'adm.backup.restoreNotesYes' : 'adm.backup.restoreNotesNo')
            }));
            return;
        }

        const r = await restaurarBackup(b);
        await msg.reply(t('adm.backup.restored', {
            quando: fmtQuando(b.criadoEm),
            entradas: entradasEmLinha(r.entradas),
            seguranca: r.seguranca.nome
        }));
        return;
    }

    // -send [nº] [-to <destino>]...: no seu privado, por e-mail ou noutros chats
    if (opts.given.has('send')) {
        const valores = [o.send, ...opts.argv].filter(Boolean).flatMap(v => String(v).split(','))
            .map(v => v.trim()).filter(Boolean);
        const numero = valores.find(v => /^\d+$/.test(v));
        // A forma antiga: os e-mails direto no -send (/backup -s 2 email)
        const antigos = valores.filter(v => v !== numero);

        if (antigos.length && comDestino) {
            await msg.reply(t('adm.backup.destOnlyTo'));
            return;
        }

        const emailsAntigos = antigos.flatMap(v => (/^e-?mail$/i.test(v) ? emailsDoSmtpTo() : [v]));
        const invalidos = emailsAntigos.filter(e => !e || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e));

        if (invalidos.length) {
            await msg.reply(t('adm.backup.badEmail', {
                lista: invalidos.map(e => e || t('adm.backup.smtpToEmpty')).join(', ')
            }));
            return;
        }

        const b = numero ? acharBackup(lista, numero) : lista[0];
        if (!b) {
            await msg.reply(lista.length ? t('adm.backup.notFound', { n: numero }) : semBackups);
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
            const tos = destinosTexto.map(d => `-to ${/\s/.test(d) ? `/${d}/` : d}`).join(' ');
            await msg.reply(t('adm.backup.sendConfirm', {
                onde: descreverDestinos(outrosChats),
                numero: numero ? ` ${numero}` : '',
                tos
            }));
            return;
        }

        // Os e-mails de todos os -to num e-mail só; os chats (sem destino: o seu privado), um a um
        const emails = [...new Set(destinos.filter(d => d.email)
            .flatMap(d => d.email.split(/\s*,\s*/)))];
        const chats = destinos.length ? destinos.filter(d => d.id) : [{ id: meuId }];

        if (emails.length) {
            if (b.bytes > MAX_ANEXO_BYTES) {
                await msg.reply(t('adm.backup.tooBigAttach', { tamanho: humanSize(b.bytes), max: humanSize(MAX_ANEXO_BYTES) }));
                return;
            }

            try {
                await enviarBackupPorEmail(b, emails);
                await msg.reply(t('adm.backup.emailSent', { quando: fmtQuando(b.criadoEm), emails: emails.join(', ') }));
            } catch (err) {
                printError('/backup -send por e-mail:', err.message);
                await msg.reply(t('adm.backup.emailFail', { erro: err.message }));
            }
        }

        // Um chat que falha não segura os outros
        const enviados = [];
        for (const d of chats) {
            try {
                await enviarBackupAoChat(b, d.id);
                enviados.push(d);
            } catch (err) {
                printError(`/backup -send para ${d.id}:`, err.message);
                const onde = d.id === meuId ? t('adm.backup.myPrivate') : descreverDestinos([d]);
                await msg.reply(t('adm.backup.chatFail', { onde, erro: err.message }));
            }
        }

        // "no seu privado" só se o comando não veio de lá (ou se foi junto com outros chats)
        const outros = enviados.filter(d => d.id !== meuId);
        const noPrivado = enviados.some(d => d.id === meuId) && (outros.length || msg.id?.remote !== meuId);
        const onde = [noPrivado && t('adm.backup.inPrivate'), outros.length && t('adm.backup.inChats', { onde: descreverDestinos(outros) })]
            .filter(Boolean);
        if (onde.length) await msg.reply(t('adm.backup.sent', { onde: onde.join(t('adm.backup.and')) }));
        return;
    }

    // -rm <nº|all>
    if (opts.given.has('rm')) {
        if (String(o.rm ?? '').toLowerCase() === 'all') {
            for (const b of lista) await removerBackup(b);
            await msg.reply(t('adm.backup.removedAll', { n: lista.length === 1 ? 1 : 2, total: lista.length }));
            return;
        }

        const b = acharBackup(lista, o.rm);
        if (!b) {
            await msg.reply(lista.length ? t('adm.backup.notFound', { n: o.rm ?? '?' }) : semBackups);
            return;
        }

        await removerBackup(b);
        await msg.reply(t('adm.backup.removed', { quando: fmtQuando(b.criadoEm), motivo: motivoTexto(b.motivo) }));
        return;
    }

    await status(msg);
}

module.exports = {
    cmdBackup
};
