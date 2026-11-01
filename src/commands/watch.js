/*
 * Comando /watch.
 */

const { getCommandSyntax } = require('./base');
const { resolverMentions, channelResolverName, groupResolverName } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, recipientsDe,
    resolverDestinations, resolverOrChoose
} = require('../destinations');
const { printInfo } = require('../log');
const { getSetting, setSetting } = require('../settings');
const { formatData, plural, summarizeText, withoutAccents } = require('../util/format');
const { isChannelAlt } = require('../util/origin');
const { RULE_REGEX, compileSearch, compileRuleWatch } = require('../watch/rules');
const { readOptionsWatch } = require('../watch/options');

/*
 * Direct rules; -in restricts the origin and -to picks where the notice will be sent.
 * -N is the number of matches. -s/-r/-f take the rule number without a hyphen
 * or the rule itself (/watch -s /Jorge/). -q filters the matches by text or
 * /regex/flags (/watch -s 3 -q carro).
 */
// The notice destinations of a watch_destinations row
const lineDestinations = (r) => destinationsSaved(r.recipients, lineDestination(r));

// rule → the destinations of its notices (only those with -to)
async function rulesDestinations() {
    const linesAlt = await dbAll('SELECT * FROM watch_destinations');
    return new Map(linesAlt.map(r => [r.rule, lineDestinations(r)]));
}

// Without destinations ([]): the row goes away, and the notices go back to your private chat
async function recordDestinations(rule, destinations) {
    if (!destinations.length) {
        await dbRun('DELETE FROM watch_destinations WHERE rule = ?', [rule]);
        return;
    }

    const c = destinationColumns(destinations[0]);
    await dbRun(
        `INSERT INTO watch_destinations (rule, dest_id, dest_name, dest_is_group, dest_email, recipients) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(rule) DO UPDATE SET dest_id = excluded.dest_id, dest_name = excluded.dest_name,
            dest_is_group = excluded.dest_is_group, dest_email = excluded.dest_email, recipients = excluded.recipients`,
        [rule, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinations)]
    );
}

const whereWarn = (destinations) => (destinations.length ? describeDestinations(destinations) : 'seu privado');

/**
 * The -to destinations: "off" (or "privado") goes back to your private chat; otherwise, each one
 * is a contact, group, number or email (several with the name: you choose from the list).
 * @returns {Promise<{ destinos: object[] } | null>}  null: already replied the error
 */
async function toReadDestinations(msg, texts) {
    if (texts.some(t => /^(off|privado)$/i.test(String(t ?? '').trim()))) {
        if (texts.length > 1) {
            await msg.reply('❌ O -to off volta ao seu privado: use-o sozinho, sem outros -to.');
            return null;
        }
        return { destinos: [] };
    }
    const destinations = await resolverDestinations(msg, texts, { aceitaEmail: true });
    return destinations ? { destinos: destinations } : null;
}


/**
 * The rule no. by its text: equal; equal ignoring case and
 * accents; or contained in a single rule.
 * @returns {Promise<number|null>} null: already replied the error
 */
async function ruleNumber(msg, ref, rules) {
    const exact = rules.indexOf(ref);
    if (exact >= 0) return exact + 1;
    const equal = rules.findIndex(r => withoutAccents(r) === withoutAccents(ref));
    if (equal >= 0) return equal + 1;

    const contains = rules.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => withoutAccents(r).includes(withoutAccents(ref)));
    if (contains.length === 1) return contains[0].n;

    await msg.reply(contains.length
        ? `🔎 "${ref}" corresponde a ${contains.length} regras:\n\n` +
            contains.map(({ r, n }) => `#${n}  ${r}`).join('\n') +
            '\n\n💡 _Repita com o nº da regra (ex.: /watch -s N) ou com ela inteira._'
        : `❌ Nenhuma regra casa com "${ref}".\n💡 _Veja as regras com /watch -l_`);
    return null;
}

const TIPS = '\n\n💡 *Dicas* _(N: o nº ou a própria regra)_\n' +
    '/watch -s N mostra as mensagens completas.\n' +
    '/watch -s N -q <texto|/regex/> só as que casam.\n' +
    '/watch -s N -to <destino|off> troca os destinos.\n' +
    '/watch -f N limpa as ocorrências.';

async function listRules(rules) {
    const count = new Map((await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
        .map(r => [r.rule, r.total]));
    const destinations = await rulesDestinations();
    const origins = new Map((await dbAll('SELECT * FROM watch_sources')).map(r => [r.rule, r]));
    const width = String(rules.length).length + 1;
    const list = rules.map((r, i) => {
        const origin = origins.get(r);
        const only = origin ? ` apenas em ${origin.source_kind === 'canal' ? '📰'
            : origin.source_kind === 'grupo' ? '👥' : '👤'} ${origin.source_name}` : '';
        return `${`#${i + 1}`.padEnd(width)}  ${r}  (${count.get(r) ?? 0})${only}` +
            (destinations.get(r)?.length ? `  → ${describeDestinations(destinations.get(r))}` : '');
    });
    return `👀 *WATCH: REGRAS* (${rules.length}/${getSetting('watch.max')})\n\n` +
        (list.length ? list.join('\n') : '_Nenhuma regra cadastrada._\n' +
            '💡 _Adicione com /watch <texto|/regex/flags>_');
}

/*
 * The rule's occurrences (null: of all), most recent first. With a search, only the
 * that match: text, case and accent insensitive, or /regex/flags
 * (filtered here: SQLite neither ignores accents nor has regex).
 */
async function listOccurrences(rule, rules, limitAlt, complete = false, search = null) {
    const filter = rule === null ? '' : 'WHERE rule = ?';
    const params = rule === null ? [] : [rule];
    const max = Math.min(limitAlt ?? getSetting('watch.showMax'), getSetting('watch.showMax'));
    let total;
    let rows;
    if (search === null) {
        ({ total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filter}`, params));
        rows = await dbAll(
            `SELECT * FROM watch_hits ${filter} ORDER BY timestamp DESC, id DESC LIMIT ?`, [...params, max]);
    } else {
        const home = compileSearch(search);
        const allAlt = await dbAll(`SELECT * FROM watch_hits ${filter} ORDER BY timestamp DESC, id DESC`, params);
        const match = allAlt.filter(h => home(h.body));
        total = match.length;
        rows = match.slice(0, max);
    }
    let textAlt = '👀 *WATCH: OCORRÊNCIAS*\n' + (rule === null ? '🔎 *Regras:* todas\n'
        : `🔎 *Regra #${rules.indexOf(rule) + 1}:* ${rule}\n`);
    if (search !== null) textAlt += `🔍 *Busca:* "${search}"\n`;
    textAlt += `📦 *Total:* ${total}${total > rows.length
        ? ` _(exibindo as ${rows.length} mais recentes)_` : ''}\n`;
    if (!rows.length) {
        textAlt += search === null ? '\n_Nenhuma mensagem casou ainda._' : `\n_Nenhuma mensagem com "${search}"._`;
    }
    for (const [i, h] of rows.entries()) {
        const group = h.is_group ? (await groupResolverName(h.chat_id)) || h.chat_name : null;
        const channel = isChannelAlt(h.chat_id)
            ? (await channelResolverName(h.chat_id)) || h.chat_name : null;
        const whereAlt = channel ? `📰 ${channel}`
            : h.is_group ? `👥 ${group} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
        const n = rules.indexOf(h.rule) + 1;
        const which = rule === null ? ` · 🔎 ${n ? `#${n}` : '(removida)'}` : '';
        const body = await resolverMentions(h.body);
        textAlt += `\n${i + 1}. 📅 ${formatData(h.timestamp)}${which}\n` +
            `    ${whereAlt}\n    💬 "${complete ? body : summarizeText(body)}"\n`;
    }
    return { total, texto: textAlt };
}

async function cmdWatch({ msg, args }) {
    await dbReady;
    let o;
    try {
        o = readOptionsWatch(args);
    } catch (err) {
        await msg.reply(`❌ ${err.message}.\n\n` + '```' + getCommandSyntax('/watch') + '```');
        return;
    }
    const rules = getSetting('watch.rules');
    const help = () => msg.reply('```' + getCommandSyntax('/watch') + '```');
    if (o.regra) {
        if (o.limite !== null) { await help(); return; }
        try { compileRuleWatch(o.regra); } catch (err) {
            await msg.reply(`❌ Regra inválida: ${err.message}`);
            return;
        }
        if (rules.includes(o.regra)) {
            await msg.reply(`ℹ️ A regra #${rules.indexOf(o.regra) + 1} já existe: ${o.regra}`);
            return;
        }
        if (rules.length >= getSetting('watch.max')) {
            await msg.reply(`❌ Limite de ${getSetting('watch.max')} regras atingido (setting watch.max).\n💡 _Remova uma com /watch -rm N_`);
            return;
        }
        let origin;
        if (o.origem !== null) {
            origin = await resolverOrChoose(msg, o.origem, { aceitaCanal: true,
                semEmail: '❌ O -in aceita contato, grupo ou canal do WhatsApp, não e-mail.' });
            if (!origin) return;
        }
        const lido = o.destinos.length ? await toReadDestinations(msg, o.destinos) : { destinos: [] };
        if (!lido) return;
        await setSetting('watch.rules', [...rules, o.regra]);
        // A recreated rule does not inherit an old origin left by /set.
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [o.regra]);
        if (origin) {
            await dbRun('INSERT INTO watch_sources VALUES (?, ?, ?, ?)',
                [o.regra, origin.id, origin.nome, origin.canal ? 'canal' : origin.grupo
                    ? 'grupo' : 'contato']);
        }
        await recordDestinations(o.regra, lido.destinos);
        const type = RULE_REGEX.test(o.regra) ? 'regex' : 'texto';
        printInfo(`/watch: regra #${rules.length + 1} adicionada: ${o.regra}`);
        await msg.reply(`✅ Regra *#${rules.length + 1}* adicionada _(${type})_: ${o.regra}\n` +
            (origin ? `📍 Apenas em ${describeDestinations([origin])}.\n` : '') +
            `💡 _Avisos ${lido.destinos.length ? `em ${whereWarn(lido.destinos)}`
                : 'no seu privado'}._`);
        return;
    }
    if (o.busca !== null) {
        try { compileSearch(o.busca); } catch (err) {
            await msg.reply(`❌ Busca inválida: ${err.message}`);
            return;
        }
    }
    if (o.ref !== null) {
        o.n = await ruleNumber(msg, o.ref, rules);
        if (o.n === null) return;
    }
    const n = o.n ?? (o.destinos.length ? o.limite : null);
    const rule = n === null ? null : rules[n - 1];
    if (n !== null && !rule) {
        await msg.reply(`❌ A regra #${n} não existe.\n💡 _Existem ${plural(rules.length, 'regra', 'regras')}: veja /watch -l_`);
        return;
    }
    if (o.destinos.length) {
        if (!rule || (o.acao && o.acao !== 'show')) {
            await msg.reply('❌ Use o -to ao adicionar uma regra ou com o -s:\n' +
                '/watch <regra> -to <destino>\n' +
                '/watch -s <N ou regra> -to <destino|off>');
            return;
        }
        const lido = await toReadDestinations(msg, o.destinos);
        if (!lido) return;
        await recordDestinations(rule, lido.destinos);
        await msg.reply(`📣 Regra *#${n}* (${rule}): os avisos vão para *${whereWarn(lido.destinos)}*.`);
        return;
    }
    if (o.acao === 'rm') {
        if (!rule) { await help(); return; }
        await setSetting('watch.rules', rules.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);
        await recordDestinations(rule, []);
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [rule]);
        await msg.reply(`🗑️ Regra *#${n}* removida: ${rule}\n` +
            `🗄️ Ocorrências apagadas: *${res.changes}*` +
            (n < rules.length ? '\n💡 _As regras seguintes foram renumeradas: veja /watch -l_' : ''));
        return;
    }
    if (o.acao === 'flush') {
        const res = rule === null ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);
        await msg.reply((rule === null ? '🧹 *Flush das ocorrências de todas as regras*\n'
            : `🧹 *Flush das ocorrências da regra #${n}:* ${rule}\n`) +
            `🗄️ Ocorrências apagadas: *${res.changes}*\n` +
            '💡 _As regras continuam ativas: veja /watch -l_');
        return;
    }
    if (o.acao === 'show') {
        await msg.reply((await listOccurrences(rule, rules, o.limite, true, o.busca)).texto + TIPS);
        return;
    }
    let textAlt = await listRules(rules);
    if (o.acao !== 'list') {
        const occurrences = await listOccurrences(null, rules, o.limite, false, o.busca);
        if (occurrences.total || o.busca !== null) textAlt += '\n\n' + occurrences.texto;
    }
    await msg.reply(textAlt + TIPS);
}

module.exports = { cmdWatch };
