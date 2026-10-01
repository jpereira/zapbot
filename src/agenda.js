/*
 * Agenda: os lembretes (/lembrete) e as mensagens agendadas (/cron), com a verificação periódica.
 */

const { estado } = require('./estado');
const { client } = require('./cliente');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { descreverDestino, extrairDestino, resolverOuEscolher } = require('./destinos');
const { printError, printInfo } = require('./log');
const { textoDoStatus } = require('./status');
const { getSetting } = require('./settings');
const { plural, resumirTexto, semAcentos } = require('./util/formatar');
const { REPETICOES, fmtQuando, lerQuando, partesEmBrasilia, proximaRepeticao } = require('./util/quando');

/*
 * O /cron (aliases /agenda e /lembrete) tem dois modos, na mesma tabela
 * `schedules` e no mesmo timer:
 *   agendar  → (modo mensagem) o texto puro, como se você digitasse, no chat atual ou no do -to;
 *   lembrete → "⏰ Lembrete" no chat onde foi criado (respondendo a mensagem do
 *              comando, ou a mensagem que ele respondeu), ou no seu privado com
 *              -pv. É o modo do /lembrete e do -lembrete.
 * Os dois aceitam -repetir (-r) diario|semanal|mensal. Sai da sua conta: só o dono usa.
 */
const TIPOS = {
    lembrete: {
        cmd: '/lembrete',
        icone: '⏰',
        criado: 'Lembrete criado',
        exemplo: '/lembrete 18:30 pagar o boleto',
        aceitaTo: false,
        aceitaPv: true
    },
    agendar: {
        cmd: '/cron',
        icone: '📅',
        criado: 'Mensagem agendada',
        exemplo: '/cron sexta 18h -to /Grupo L200/ Bom fim de semana!',
        aceitaTo: true,
        aceitaPv: false
    }
};
const EXEMPLOS = `💡 _Ex.: ${TIPOS.agendar.exemplo}\n${TIPOS.lembrete.exemplo}_`;

const MAX_DIAS = 366;
const ATRASO_TOLERADO_MS = 5 * 60_000;

/**
 * Lê "<quando> [opções] <texto>": as opções e o "quando" vêm no começo, em
 * qualquer ordem; o texto é o resto, como foi digitado (com as quebras de linha).
 * @returns {{ opt: {list?, lembrete?, rm?, repetir?, pv?}, quando: {ms}|null, texto: string,
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
        else if (nome === 'pv' || nome === 'lembrete') opt[nome] = true;
        else if (nome === 'rm') opt.rm = palavras[++i]?.[0] ?? '';
        else if (nome === 'repetir' || nome === 'r') opt.repetir = palavras[++i]?.[0] ?? '';
        else if (!quando && (quando = lerQuando(palavras.slice(i).map(m => m[0])))) i += quando.usadas - 1;
        else break;
    }

    const texto = i < palavras.length ? resto.slice(palavras[i].index).trim() : '';
    return { opt, quando, texto, destino, comDestino };
}

// Lembretes e mensagens juntos, na ordem em que saem (os números do -rm). O status diário (/bot -status) fica de fora
const listar = () => dbAll("SELECT * FROM schedules WHERE kind != 'status' ORDER BY due_at, id");

function linhaDaLista(s, i) {
    const repete = s.repeat ? ` 🔁 ${REPETICOES[s.repeat].rotulo}` : '';
    const onde = s.chat_id === client.info.wid._serialized ? 'seu privado' : `${s.is_group ? '👥' : '👤'} ${s.chat_name}`;
    return `${i + 1}. ${TIPOS[s.kind]?.icone ?? '📅'} *${fmtQuando(s.due_at)}*${repete} — ${resumirTexto(s.text, 60)}\n   → ${onde}`;
}

async function tratarAgenda({ msg, args, chatId, chatName, isGroup, quotedMsg }) {
    await dbPronto;

    const { opt, quando, texto: digitado, destino: destinoTexto, comDestino } = lerAgendamento(args);

    // Modo lembrete: chamado como /lembrete, ou com -lembrete
    const chamado = String(msg.body ?? '').trim().split(/\s+/, 1)[0].toLowerCase();
    const kind = chamado === '/lembrete' || opt.lembrete ? 'lembrete' : 'agendar';
    const t = TIPOS[kind];
    const sintaxe = `💡 _Ex.: ${t.exemplo}_`;
    const itens = await listar();

    if (opt.pv && !t.aceitaPv) {
        await msg.reply('❌ O -pv é do modo lembrete: use /lembrete (ou -lembrete) para lembrar no seu privado.');
        return;
    }

    if (comDestino && !t.aceitaTo) {
        await msg.reply('❌ O lembrete não tem -to: ele vem neste chat (ou no seu privado, com -pv). Para mandar uma mensagem a outro chat, use o /cron sem -lembrete.');
        return;
    }

    // -rm <nº|all>
    if (opt.rm !== undefined) {
        const alvo = semAcentos(opt.rm).trim();

        if (alvo === 'all') {
            await dbRun("DELETE FROM schedules WHERE kind != 'status'");
            await msg.reply(`🗑️ ${plural(itens.length, 'removido', 'removidos')}.`);
            return;
        }

        const item = /^\d+$/.test(alvo) ? itens[Number(alvo) - 1] : null;
        if (!item) {
            await msg.reply(`❌ Nº ${opt.rm || '?'} não existe. Veja a lista com /cron -l`);
            return;
        }

        await dbRun('DELETE FROM schedules WHERE id = ?', [item.id]);
        await msg.reply(`🗑️ Removido: *${fmtQuando(item.due_at)}* — ${resumirTexto(item.text, 60)}`);
        return;
    }

    // -l, ou nada: a lista (lembretes e mensagens)
    if (opt.list || (!quando && !digitado && !quotedMsg)) {
        if (!itens.length) {
            await msg.reply(`📅 Nada agendado.\n${EXEMPLOS}`);
            return;
        }

        await msg.reply(`📅 *Agenda* (${itens.length})\n\n${itens.map(linhaDaLista).join('\n')}\n\n` +
            '💡 _📅 mensagem · ⏰ lembrete. Remova com /cron -rm <nº|all>._');
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
            await msg.reply('❌ Use -repetir (-r) diario, semanal ou mensal.');
            return;
        }
    }

    const max = getSetting('agenda.max');
    const { n: total } = await dbGet("SELECT COUNT(*) AS n FROM schedules WHERE kind != 'status'");
    if (total >= max) {
        await msg.reply(`❌ Limite de ${max} lembretes e mensagens agendadas (setting agenda.max). Remova algum antes.`);
        return;
    }

    // Onde vai: -to (mensagem), -pv (lembrete) ou o chat atual
    const meuId = client.info.wid._serialized;
    let destino = { id: chatId, nome: chatName, grupo: Boolean(isGroup) };

    if (comDestino) {
        // Vários contatos ou grupos com o nome: espera você escolher na lista
        destino = await resolverOuEscolher(msg, destinoTexto);
        if (!destino) return;
    } else if (opt.pv) {
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

    if (s.kind === 'status') {
        // O relatório do /bot -status, montado na hora
        await client.sendMessage(s.chat_id, await textoDoStatus(agora));
    } else if (s.kind === 'agendar') {
        await client.sendMessage(s.chat_id, s.text);
    } else {
        const texto = `⏰ *Lembrete*\n\n${s.text}` +
            (atrasado ? `\n\n_(atrasado: era para ${fmtQuando(s.due_at)})_` : '');

        // A mensagem citada pode ter sumido: sem ela, vai sem citar
        await client.sendMessage(s.chat_id, texto, s.quoted_id ? { quotedMessageId: s.quoted_id } : {})
            .catch(() => client.sendMessage(s.chat_id, texto));
    }

    printInfo(`${TIPOS[s.kind]?.cmd ?? '/bot -status'}: enviado para ${s.chat_id}${atrasado ? ' (atrasado)' : ''}${s.repeat ? ` (${s.repeat})` : ''}`);
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
