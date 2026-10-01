/*
 * Agenda: os lembretes (/lembrete), com a verificação periódica.
 */

const { estado } = require('./estado');
const { client } = require('./cliente');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { descreverDestino, extrairDestino } = require('./destinos');
const { printError, printInfo } = require('./log');
const { getSetting } = require('./settings');
const { plural, resumirTexto, semAcentos } = require('./util/formatar');
const { REPETICOES, fmtQuando, lerQuando, partesEmBrasilia, proximaRepeticao } = require('./util/quando');

/*
 * Tabela `schedules`, verificada por um timer:
 *   lembrete → "⏰ Lembrete" no chat onde foi criado (respondendo a mensagem do
 *              comando, ou a mensagem que ele respondeu), ou no seu privado com -pv.
 * Aceita -repetir diario|semanal|mensal. Sai da sua conta: só o dono usa.
 */
const TIPOS = {
    lembrete: {
        cmd: '/lembrete',
        icone: '⏰',
        titulo: 'Lembretes',
        nenhum: 'Nenhum lembrete',
        criado: 'Lembrete criado',
        exemplo: '/lembrete 18:30 pagar o boleto',
        aceitaTo: false,
        aceitaPv: true
    }
};

const MAX_DIAS = 366;
const ATRASO_TOLERADO_MS = 5 * 60_000;

/**
 * Lê "<quando> [opções] <texto>": as opções e o "quando" vêm no começo, em
 * qualquer ordem; o texto é o resto, como foi digitado (com as quebras de linha).
 * @returns {{ opt: {list?, rm?, repetir?, pv?}, quando: {ms}|null, texto: string,
 *            destino: string|null, comDestino: boolean }}
 */
function lerAgendamento(args) {
    const { destino, informado: comDestino, resto } = extrairDestino(args);
    const palavras = [...resto.matchAll(/\S+/g)];
    const opt = {};
    let quando = null;
    let i = 0;

    for (; i < palavras.length; i++) {
        const p = palavras[i][0];
        const nome = p.startsWith('-') ? p.slice(1).toLowerCase() : null;

        if (nome === 'list' || nome === 'l') opt.list = true;
        else if (nome === 'pv') opt.pv = true;
        else if (nome === 'rm' || nome === 'repetir') opt[nome] = palavras[++i]?.[0] ?? '';
        else if (!quando && (quando = lerQuando(palavras.slice(i).map(m => m[0])))) i += quando.usadas - 1;
        else break;
    }

    const texto = i < palavras.length ? resto.slice(palavras[i].index).trim() : '';
    return { opt, quando, texto, destino, comDestino };
}

const listar = (kind) => dbAll('SELECT * FROM schedules WHERE kind = ? ORDER BY due_at, id', [kind]);

function linhaDaLista(s, i) {
    const repete = s.repeat ? ` 🔁 ${REPETICOES[s.repeat].rotulo}` : '';
    const onde = s.chat_id === client.info.wid._serialized ? 'seu privado' : `${s.is_group ? '👥' : '👤'} ${s.chat_name}`;
    return `${i + 1}. *${fmtQuando(s.due_at)}*${repete} — ${resumirTexto(s.text, 60)}\n   → ${onde}`;
}

async function tratarAgenda(kind, { msg, args, chatId, chatName, isGroup, quotedMsg }) {
    const t = TIPOS[kind];
    await dbPronto;

    const sintaxe = `💡 _Ex.: ${t.exemplo}_`;
    const { opt, quando, texto: digitado, comDestino } = lerAgendamento(args);
    const itens = await listar(kind);

    if (opt.pv && !t.aceitaPv) {
        await msg.reply(`❌ O ${t.cmd} não tem -pv: use -to @seu-número para mandar no seu privado.`);
        return;
    }

    if (comDestino && !t.aceitaTo) {
        await msg.reply(`❌ O ${t.cmd} não tem -to: o lembrete vem neste chat (ou no seu privado, com -pv).`);
        return;
    }

    // -rm <nº|all>
    if (opt.rm !== undefined) {
        const alvo = semAcentos(opt.rm).trim();

        if (alvo === 'all') {
            await dbRun('DELETE FROM schedules WHERE kind = ?', [kind]);
            await msg.reply(`🗑️ ${plural(itens.length, 'removido', 'removidos')}.`);
            return;
        }

        const item = /^\d+$/.test(alvo) ? itens[Number(alvo) - 1] : null;
        if (!item) {
            await msg.reply(`❌ Nº ${opt.rm || '?'} não existe. Veja a lista com ${t.cmd} -l`);
            return;
        }

        await dbRun('DELETE FROM schedules WHERE id = ?', [item.id]);
        await msg.reply(`🗑️ Removido: *${fmtQuando(item.due_at)}* — ${resumirTexto(item.text, 60)}`);
        return;
    }

    // -l, ou nada: a lista
    if (opt.list || (!quando && !digitado && !quotedMsg)) {
        if (!itens.length) {
            await msg.reply(`${t.icone} ${t.nenhum}.\n${sintaxe}`);
            return;
        }

        await msg.reply(`${t.icone} *${t.titulo}* (${itens.length})\n\n${itens.map(linhaDaLista).join('\n')}\n\n` +
            `💡 _Remova com ${t.cmd} -rm <nº|all>._`);
        return;
    }

    if (!quando) {
        await msg.reply(`❌ Não entendi quando. Use 30m, 2h, 18:30, às 18h, amanhã 9h, sexta 18h ou 25/12 10:00.\n${sintaxe}`);
        return;
    }

    // Lembrete respondendo uma mensagem: o texto dela, se não vier outro
    const texto = digitado || (kind === 'lembrete' ? quotedMsg?.body?.trim() : '') || '';

    if (!texto) {
        await msg.reply(`❌ Faltou o texto.\n${sintaxe}`);
        return;
    }

    const agora = Date.now();
    if (quando.ms <= agora) {
        await msg.reply(`❌ ${fmtQuando(quando.ms)} já passou.`);
        return;
    }
    if (quando.ms > agora + MAX_DIAS * 86400_000) {
        await msg.reply(`❌ No máximo ${MAX_DIAS} dias à frente.`);
        return;
    }

    let repetir = null;
    if (opt.repetir !== undefined) {
        repetir = semAcentos(opt.repetir).trim();
        if (!REPETICOES[repetir]) {
            await msg.reply('❌ Use -repetir diario, semanal ou mensal.');
            return;
        }
    }

    const max = getSetting('agenda.max');
    const { n: total } = await dbGet('SELECT COUNT(*) AS n FROM schedules');
    if (total >= max) {
        await msg.reply(`❌ Limite de ${max} lembretes (setting agenda.max). Remova algum antes.`);
        return;
    }

    // Onde vai: -pv ou o chat atual
    const meuId = client.info.wid._serialized;
    let destino = { id: chatId, nome: chatName, grupo: Boolean(isGroup) };

    if (opt.pv) {
        destino = { id: meuId, nome: 'seu privado', grupo: false };
    }

    // O lembrete responde a mensagem respondida pelo comando, ou o próprio comando (só no mesmo chat)
    const citada = kind === 'lembrete' && destino.id === chatId
        ? (quotedMsg?.id?._serialized ?? msg.id?._serialized ?? null)
        : null;

    await dbRun(
        `INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month, quoted_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [kind, destino.id, destino.nome, destino.grupo ? 1 : 0, texto, quando.ms, repetir,
            partesEmBrasilia(quando.ms).dia, citada, agora]
    );

    const onde = destino.id === meuId ? 'no seu privado' : destino.id === chatId ? 'neste chat' : `em ${descreverDestino(destino)}`;
    await msg.reply(`${t.icone} *${t.criado}* para *${fmtQuando(quando.ms)}*` +
        (repetir ? ` 🔁 ${REPETICOES[repetir].rotulo}` : '') + ` ${onde}.\n` +
        `📝 ${resumirTexto(texto, 100)}`);
}

// Envia um item vencido; com repetição, agenda o próximo
async function dispararItem(s, agora) {
    const atrasado = agora - s.due_at > ATRASO_TOLERADO_MS;

    if (s.repeat) {
        let proximo = s.due_at;
        while (proximo <= agora) proximo = proximaRepeticao(proximo, s.repeat, s.day_of_month);
        await dbRun('UPDATE schedules SET due_at = ? WHERE id = ?', [proximo, s.id]);
    } else {
        // Sai ANTES de enviar: se o envio falhar, não repete a cada verificação
        await dbRun('DELETE FROM schedules WHERE id = ?', [s.id]);
    }

    const texto = `⏰ *Lembrete*\n\n${s.text}` +
        (atrasado ? `\n\n_(atrasado: era para ${fmtQuando(s.due_at)})_` : '');

    // A mensagem citada pode ter sumido: sem ela, vai sem citar
    await client.sendMessage(s.chat_id, texto, s.quoted_id ? { quotedMessageId: s.quoted_id } : {})
        .catch(() => client.sendMessage(s.chat_id, texto));

    printInfo(`${TIPOS[s.kind].cmd}: enviado para ${s.chat_id}${atrasado ? ' (atrasado)' : ''}${s.repeat ? ` (${s.repeat})` : ''}`);
}

/*
 * Verificação periódica (a cada 30 s): envia o que venceu. Desconectado, espera;
 * ao voltar, envia o que venceu no meio tempo (os lembretes avisam o atraso).
 */
let verificando = false;

async function verificarAgenda() {
    if (verificando || !estado.pronto) return;
    verificando = true;

    try {
        await dbPronto;
        const agora = Date.now();
        const vencidos = await dbAll('SELECT * FROM schedules WHERE due_at <= ? ORDER BY due_at, id', [agora]);

        for (const s of vencidos) {
            await dispararItem(s, agora).catch(err => printError(`${TIPOS[s.kind]?.cmd ?? s.kind}: falha ao enviar ${s.id}:`, err.message));
        }
    } catch (err) {
        printError('Erro ao verificar a agenda:', err.message);
    } finally {
        verificando = false;
    }
}

// Chamada no app.js
function iniciarAgenda() {
    setInterval(verificarAgenda, 30 * 1000);
}

module.exports = {
    iniciarAgenda,
    lerAgendamento,
    tratarAgenda,
    verificarAgenda
};
