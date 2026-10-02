/*
 * Schedule: the reminders (/lembrete) and the scheduled messages (/cron), with the periodic check.
 */

const { estado: stateAlt } = require('./state');
const { client } = require('./client');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { describeDestination, extractDestinations, resolverOrChoose } = require('./destinations');
const { printError, printInfo } = require('./log');
const { statusText } = require('./status');
const { getSetting } = require('./settings');
const { plural, summarizeText, withoutAccents } = require('./util/format');
const { REPETITIONS, fmtWhen, readWhen, partsInBrasilia, nextRepetition } = require('./util/when');

/*
 * /cron (aliases /agenda and /lembrete) has two modes, in the same table
 * `schedules` and in the same timer:
 * agendar  → (message mode) the plain text, as if you typed it, in the current chat or in the -to one;
 * reminder → "⏰ Lembrete" in the chat where it was created (replying to the message of
 * command, or the message it replied to), or in your private chat with
 * -pv. It is the mode of /lembrete and of -lembrete.
 * Both accept -repetir (-r) diario|semanal|mensal. The message mode accepts
 * several -to (one item per destination). In the list, -edit <no.> changes the time, the text
 * or an item's repetition, and -pause/-resume <no.|all> hold and release it.
 * It comes out of your account: owner only.
 */
const TYPES = {
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
const EXAMPLES = `💡 _Ex.: ${TYPES.agendar.exemplo}\n${TYPES.lembrete.exemplo}_`;

const MAX_DAYS = 366;
const DELAY_TOLERATED_MS = 5 * 60_000;

/**
 * Reads "<when> [options] <text>": the options and the "when" come at the start, in
 * any order; the text is the rest, as typed (with the line breaks).
 * @returns {{ opt: {list?, lembrete?, rm?, repetir?, pv?, edit?, pause?, resume?}, quando: {ms}|null,
 *            texto: string, destinos: Array<string|null>, comDestino: boolean }}
 */
function readScheduling(args) {
    const { destinos: destinations, informado: withDestination, resto: rest } = extractDestinations(args);
    const words = [...rest.matchAll(/\S+/g)];
    const opt = {};
    let when = null;
    let i = 0;

    for (; i < words.length; i++) {
        const p = words[i][0];
        const nameAlt = p.startsWith('-') ? p.slice(1).toLowerCase() : null;

        if (nameAlt === 'list' || nameAlt === 'l') opt.list = true;
        else if (nameAlt === 'pv') opt.pv = true;
        else if (nameAlt === 'lembrete' || nameAlt === 'lem') opt.lembrete = true;
        else if (['rm', 'edit', 'pause', 'resume'].includes(nameAlt)) opt[nameAlt] = words[++i]?.[0] ?? '';
        else if (nameAlt === 'repetir' || nameAlt === 'r') opt.repetir = words[++i]?.[0] ?? '';
        else if (!when && (when = readWhen(words.slice(i).map(m => m[0])))) i += when.usadas - 1;
        else break;
    }

    const textAlt = i < words.length ? rest.slice(words[i].index).trim() : '';
    return { opt, quando: when, texto: textAlt, destinos: destinations, comDestino: withDestination };
}

// Reminders and messages together, in the order they go out (the -rm numbers). The daily status (/bot -status) is left out
const listAlt = () => dbAll("SELECT * FROM schedules WHERE kind != 'status' ORDER BY due_at, id");

function listLine(s, i) {
    const repeat = s.repeat ? ` 🔁 ${REPETITIONS[s.repeat].rotulo}` : '';
    const paused = s.paused ? ' ⏸️ _pausado_' : '';
    const whereAlt = s.chat_id === client.info.wid._serialized ? 'seu privado' : `${s.is_group ? '👥' : '👤'} ${s.chat_name}`;
    return `${i + 1}. ${TYPES[s.kind]?.icone ?? '📅'} *${fmtWhen(s.due_at)}*${repeat}${paused} — ${summarizeText(s.text, 60)}\n   → ${whereAlt}`;
}

// "2" → [item 2]; "all" → all; otherwise null
function numberItems(items, valueAlt) {
    const target = withoutAccents(valueAlt).trim();
    if (target === 'all') return items;
    const item = /^\d+$/.test(target) ? items[Number(target) - 1] : null;
    return item ? [item] : null;
}

// The "when" of a new or edited item: in the future and up to MAX_DAYS
function whenError(ms, nowAlt = Date.now()) {
    if (ms <= nowAlt) return `❌ ${fmtWhen(ms)} já passou.`;
    if (ms > nowAlt + MAX_DAYS * 86400_000) return `❌ No máximo ${MAX_DAYS} dias à frente.`;
    return null;
}

/*
 * -pause / -resume <no.|all>. When resuming, a repeated item that expired while
 * was paused jumps to the next time; a one-off goes out on the next check.
 */
async function pauseOrResume(msg, items, pause, valueAlt) {
    const optionAlt = pause ? '-pause' : '-resume';
    const targets = numberItems(items, valueAlt ?? '');

    if (!targets) {
        await msg.reply(`❌ Nº ${valueAlt || '?'} não existe. Veja a lista com /cron -l\n💡 _/cron ${optionAlt} <nº|all>_`);
        return;
    }

    const nowAlt = Date.now();
    const linesAlt = [];
    for (const s of targets.filter(s => Boolean(s.paused) !== pause)) {
        let dueAt = s.due_at;
        if (!pause && s.repeat) while (dueAt <= nowAlt) dueAt = nextRepetition(dueAt, s.repeat, s.day_of_month);

        await dbRun('UPDATE schedules SET paused = ?, due_at = ? WHERE id = ?', [pause ? 1 : 0, dueAt, s.id]);
        const expired = !pause && dueAt <= nowAlt ? ' _(já passou: sai agora)_' : '';
        linesAlt.push(`• *${fmtWhen(dueAt)}* — ${summarizeText(s.text, 60)}${expired}`);
    }

    if (!linesAlt.length) {
        await msg.reply(pause ? 'ℹ️ Já estava pausado.' : 'ℹ️ Não estava pausado.');
        return;
    }

    await msg.reply(`${pause ? '⏸️ *Pausado*' : '▶️ *Retomado*'} (${linesAlt.length})\n${linesAlt.join('\n')}` +
        (pause ? '\n💡 _Volta com /cron -resume <nº|all>._' : ''));
}

/*
 * -edit <no.> [when] [-repetir ...] [text]: replaces whatever comes. The destination and the
 * mode do not change (for that, remove and create again).
 */
async function edit(msg, items, { opt, quando: when, texto: textAlt }) {
    const [s] = numberItems(items, opt.edit ?? '') ?? [];

    if (!s || withoutAccents(opt.edit).trim() === 'all') {
        await msg.reply(`❌ Nº ${opt.edit || '?'} não existe. Veja a lista com /cron -l\n💡 _/cron -edit <nº> [quando] [texto]_`);
        return;
    }
    if (!when && !textAlt && opt.repetir === undefined) {
        await msg.reply('❌ Informe o que mudar: a hora, o texto e/ou o -repetir.\n💡 _/cron -edit 2 18h · /cron -edit 2 novo texto · /cron -edit 2 sexta 9h -r semanal outro texto_');
        return;
    }

    let repeatAlt = s.repeat;
    if (opt.repetir !== undefined) {
        repeatAlt = withoutAccents(opt.repetir).trim();
        if (['nao', 'off', 'no'].includes(repeatAlt)) repeatAlt = null;
        else if (!REPETITIONS[repeatAlt]) {
            await msg.reply('❌ Use -repetir (-r) diario, semanal, mensal ou nao.');
            return;
        }
    }

    const dueAt = when?.ms ?? s.due_at;
    if (when) {
        const errorAlt = whenError(dueAt);
        if (errorAlt) {
            await msg.reply(errorAlt);
            return;
        }
    }

    await dbRun('UPDATE schedules SET due_at = ?, day_of_month = ?, text = ?, repeat = ? WHERE id = ?',
        [dueAt, when ? partsInBrasilia(dueAt).dia : s.day_of_month, textAlt || s.text, repeatAlt, s.id]);

    await msg.reply(`✏️ *Editado:* ${TYPES[s.kind]?.icone ?? '📅'} *${fmtWhen(dueAt)}*` +
        (repeatAlt ? ` 🔁 ${REPETITIONS[repeatAlt].rotulo}` : '') + (s.paused ? ' ⏸️ _pausado_' : '') +
        `\n📝 ${summarizeText(textAlt || s.text, 100)}`);
}

async function handleSchedule({ msg, args, chatId, chatName, isGroup, quotedMsg }) {
    await dbReady;

    const { opt, quando: when, texto: typed, destinos: destinationsText, comDestino: withDestination } = readScheduling(args);

    // Reminder mode: called as /lembrete, or with -lembrete
    const called = String(msg.body ?? '').trim().split(/\s+/, 1)[0].toLowerCase();
    const kind = called === '/lembrete' || opt.lembrete ? 'lembrete' : 'agendar';
    const t = TYPES[kind];
    const syntax = `💡 _Ex.: ${t.exemplo}_`;
    const items = await listAlt();

    if (opt.pv && !t.aceitaPv) {
        await msg.reply('❌ O -pv é do modo lembrete: use /lembrete (ou -lembrete) para lembrar no seu privado.');
        return;
    }

    if (withDestination && !t.aceitaTo) {
        await msg.reply('❌ O lembrete não tem -to: ele vem neste chat (ou no seu privado, com -pv). Para mandar uma mensagem a outro chat, use o /cron sem -lembrete.');
        return;
    }

    // -rm <nº|all>
    if (opt.rm !== undefined) {
        const target = withoutAccents(opt.rm).trim();

        if (target === 'all') {
            await dbRun("DELETE FROM schedules WHERE kind != 'status'");
            await msg.reply(`🗑️ ${plural(items.length, 'removido', 'removidos')}.`);
            return;
        }

        const item = /^\d+$/.test(target) ? items[Number(target) - 1] : null;
        if (!item) {
            await msg.reply(`❌ Nº ${opt.rm || '?'} não existe. Veja a lista com /cron -l`);
            return;
        }

        await dbRun('DELETE FROM schedules WHERE id = ?', [item.id]);
        await msg.reply(`🗑️ Removido: *${fmtWhen(item.due_at)}* — ${summarizeText(item.text, 60)}`);
        return;
    }

    // -pause / -resume <nº|all>
    if (opt.pause !== undefined || opt.resume !== undefined) {
        await pauseOrResume(msg, items, opt.pause !== undefined, opt.pause ?? opt.resume);
        return;
    }

    // -edit <no.> [when] [-repetir ...] [text]
    if (opt.edit !== undefined) {
        if (withDestination || opt.pv || opt.lembrete) {
            await msg.reply('❌ O -edit troca só a hora, o texto e o -repetir. Para mudar o destino ou o modo, remova (-rm) e crie de novo.');
            return;
        }
        await edit(msg, items, { opt, quando: when, texto: typed });
        return;
    }

    // -l, or nothing: the list (reminders and messages)
    if (opt.list || (!when && !typed && !quotedMsg)) {
        if (!items.length) {
            await msg.reply(`📅 Nada agendado.\n${EXAMPLES}`);
            return;
        }

        await msg.reply(`📅 *Agenda* (${items.length})\n\n${items.map(listLine).join('\n')}\n\n` +
            '💡 _📅 mensagem · ⏰ lembrete. -edit <nº> muda, -pause/-resume <nº> segura e solta, -rm <nº|all> remove._');
        return;
    }

    if (!when) {
        await msg.reply(`❌ Não entendi quando. Use 6h, 18:30, às 18h (horário), +2h ou 30m (daqui a tanto tempo), amanhã 9h, sexta 18h ou 25/12 10:00.\n${syntax}`);
        return;
    }

    // Reminder replying to a message: its text, if no other comes
    const textAlt = typed || (kind === 'lembrete' ? quotedMsg?.body?.trim() : '') || '';

    if (!textAlt) {
        await msg.reply(`❌ Faltou o texto.\n${syntax}`);
        return;
    }

    const nowAlt = Date.now();
    const errorWhen = whenError(when.ms, nowAlt);
    if (errorWhen) {
        await msg.reply(errorWhen);
        return;
    }

    let repeatAlt = null;
    if (opt.repetir !== undefined) {
        repeatAlt = withoutAccents(opt.repetir).trim();
        if (!REPETITIONS[repeatAlt]) {
            await msg.reply('❌ Use -repetir (-r) diario, semanal ou mensal.');
            return;
        }
    }

    const max = getSetting('agenda.max');
    const freshAlt3 = Math.max(1, destinationsText.length);
    const { n: total } = await dbGet("SELECT COUNT(*) AS n FROM schedules WHERE kind != 'status'");
    if (total + freshAlt3 > max) {
        await msg.reply(`❌ Limite de ${max} lembretes e mensagens agendadas (setting agenda.max)` +
            (freshAlt3 > 1 ? `: estes ${freshAlt3} não cabem` : '') + '. Remova algum antes.');
        return;
    }

    // Where it goes: -to (message; one item per destination), -pv (reminder) or the current chat
    const myId = client.info.wid._serialized;
    let destinations = [{ id: chatId, nome: chatName, grupo: Boolean(isGroup) }];

    if (withDestination) {
        destinations = [];
        for (const destinationText of destinationsText) {
            // Several contacts or groups with the name: waits for you to choose from the list
            const destination = await resolverOrChoose(msg, destinationText, {
                semEmail: '❌ O /cron envia a mensagem como se você digitasse, no WhatsApp: o -to é um contato, um grupo ou um número, não um e-mail.'
            });
            if (!destination) return;
            if (!destinations.some(d => d.id === destination.id)) destinations.push(destination);
        }
    } else if (opt.pv) {
        destinations = [{ id: myId, nome: 'seu privado', grupo: false }];
    }

    for (const destination of destinations) {
        // The reminder replies to the message replied by the command, or the command itself (only in the same chat)
        const quoted = kind === 'lembrete' && destination.id === chatId
            ? (quotedMsg?.id?._serialized ?? msg.id?._serialized ?? null)
            : null;

        await dbRun(
            `INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month, quoted_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [kind, destination.id, destination.nome, destination.grupo ? 1 : 0, textAlt, when.ms, repeatAlt,
                partsInBrasilia(when.ms).dia, quoted, nowAlt]
        );
    }

    const whereAlt = (d) => (d.id === myId ? 'no seu privado' : d.id === chatId ? 'neste chat' : `em ${describeDestination(d)}`);
    await msg.reply(`${t.icone} *${t.criado}* para *${fmtWhen(when.ms)}*` +
        (repeatAlt ? ` 🔁 ${REPETITIONS[repeatAlt].rotulo}` : '') +
        (destinations.length > 1
            ? ` em ${destinations.length} chats _(um item para cada)_:\n${destinations.map(d => `• ${describeDestination(d)}`).join('\n')}\n`
            : ` ${whereAlt(destinations[0])}.\n`) +
        `📝 ${summarizeText(textAlt, 100)}`);
}

// Sends an expired item; with repetition, schedules the next one
async function triggerItem(s, nowAlt) {
    const late = nowAlt - s.due_at > DELAY_TOLERATED_MS;

    if (s.repeat) {
        let next = s.due_at;
        while (next <= nowAlt) next = nextRepetition(next, s.repeat, s.day_of_month);
        await dbRun('UPDATE schedules SET due_at = ? WHERE id = ?', [next, s.id]);
    } else {
        // Goes out BEFORE sending: if the send fails, it does not repeat on every check
        await dbRun('DELETE FROM schedules WHERE id = ?', [s.id]);
    }

    if (s.kind === 'status') {
        // The /bot -status report, built on the spot
        await client.sendMessage(s.chat_id, await statusText(nowAlt));
    } else if (s.kind === 'agendar') {
        await client.sendMessage(s.chat_id, s.text);
    } else {
        const textAlt = `⏰ *Lembrete*\n\n${s.text}` +
            (late ? `\n\n_(atrasado: era para ${fmtWhen(s.due_at)})_` : '');

        // The quoted message may be gone: without it, it goes without quoting
        await client.sendMessage(s.chat_id, textAlt, s.quoted_id ? { quotedMessageId: s.quoted_id } : {})
            .catch(() => client.sendMessage(s.chat_id, textAlt));
    }

    printInfo(`${TYPES[s.kind]?.cmd ?? '/bot -status'}: enviado para ${s.chat_id}${late ? ' (atrasado)' : ''}${s.repeat ? ` (${s.repeat})` : ''}`);
}

/*
 * Periodic check (every 30 s): sends what expired. Disconnected, waits;
 * on return, sends what expired in the meantime (reminders warn about the delay).
 */
let checking = false;

async function checkSchedule() {
    if (checking || !stateAlt.pronto) return;
    checking = true;

    try {
        await dbReady;
        const nowAlt = Date.now();
        const expiredAlt3 = await dbAll('SELECT * FROM schedules WHERE due_at <= ? AND paused = 0 ORDER BY due_at, id', [nowAlt]);

        for (const s of expiredAlt3) {
            await triggerItem(s, nowAlt).catch(err => printError(`${TYPES[s.kind]?.cmd ?? s.kind}: falha ao enviar ${s.id}:`, err.message));
        }
    } catch (err) {
        printError('Erro ao verificar a agenda:', err.message);
    } finally {
        checking = false;
    }
}

// Called in app.js
function startSchedule() {
    setInterval(checkSchedule, 30 * 1000);
}

module.exports = {
    startSchedule,
    readScheduling,
    handleSchedule,
    checkSchedule
};
