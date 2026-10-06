/*
 * Comando /watch.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { resolverMentions, channelResolverName, groupResolverName } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, extractDestinations, recipientsDe,
    resolverDestinations
} = require('../destinations');
const { printInfo } = require('../log');
const { GetOptFromCommand } = require('../options');
const { getSetting, setSetting } = require('../settings');
const { formatData, plural, summarizeText } = require('../util/format');
const { isChannelAlt } = require('../util/origin');
const { RULE_REGEX } = require('../watch/rules');

/*
 * /watch (alias /w)
 * /watch                     → the same as /watch -s (occurrences of all the rules)
 * /watch -l                  → lists the rules (no., rule, occurrences)
 * /watch -s [-N]             → summary of the messages that matched rule N (without N: all)
 *   /watch -a <texto|/regex/>  → adiciona regra
 * /watch -r -N               → removes rule N and its occurrences
 * /watch -f [-N]             → deletes rule N's occurrences (without N: of all); keeps the rules
 * /watch -a <rule> -to <destination>  → the rule notifies another chat or by email (repeat -to
 * to notify several)
 * /watch -N -to <destination|off>      → changes rule N's destinations (off: back to your private chat)
 * The rules stay in the 'watch.rules' setting; the occurrences in the watch_hits table;
 * each rule's destinations, in watch_destinations (no row: your private chat).
 * The replies go out in the chat where the command was typed.
 */

// "-2" or "2" in argv → 2; otherwise null
function ruleNumber(argv) {
    const m = String(argv.filter(Boolean)[0] ?? '').match(/^-?(\d+)$/);
    return m ? Number(m[1]) : null;
}

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

async function cmdWatch({ msg, opts: commandOpts, args: commandArgs }) {
    await dbReady;

    /*
     * -to accepts spaces (/Grupo L200/), which the option parser would split:
     * goes out of the text first, and the rest is read again. The -add rule cannot
     * have a loose " -to ", then.
     */
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(commandArgs);
    const args = withDestination ? rest : commandArgs;
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/watch')) : commandOpts;

    const rules = getSetting('watch.rules');
    const help = () => msg.reply('```' + getCommandSyntax('/watch') + '```');

    // -add uses the raw text: the rule can have spaces, quotes or start with "-"
    const add = args.match(/^-(?:add|a)(?:\s+([\s\S]*))?$/);

    if (add) {
        const rule = (add[1] ?? '').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();

        if (!rule) {
            await help();
            return;
        }

        if (rules.includes(rule)) {
            await msg.reply(`ℹ️ A regra #${rules.indexOf(rule) + 1} já existe: ${rule}` +
                (withDestination ? `\n💡 _Para trocar o destino: /watch -${rules.indexOf(rule) + 1} -to <destino>_` : ''));
            return;
        }

        const max = getSetting('watch.max');
        if (rules.length >= max) {
            await msg.reply(`❌ Limite de ${max} regras atingido (setting watch.max).\n💡 _Remova uma com /watch -r -N_`);
            return;
        }

        // The destinations before the rule: if any fails (or nobody picks from the list), nothing is created
        let destinations = [];
        if (withDestination) {
            const lido = await toReadDestinations(msg, destinationsText);
            if (!lido) return;
            destinations = lido.destinos;
        }

        try {
            await setSetting('watch.rules', [...rules, rule]);
        } catch (e) {
            await msg.reply(`❌ Regra inválida: ${e.message}`);
            return;
        }
        await recordDestinations(rule, destinations);

        const type = RULE_REGEX.test(rule) ? 'regex' : 'texto';
        printInfo(`/watch: regra #${rules.length + 1} adicionada: ${rule}` +
            (destinations.length ? ` → ${destinations.map(d => d.email ?? d.id).join(', ')}` : ''));
        await msg.reply(`✅ Regra *#${rules.length + 1}* adicionada _(${type})_: ${rule}\n` +
            `💡 _Avisos ${destinations.length ? `em ${whereWarn(destinations)}` : 'no seu privado'}._`);
        return;
    }

    // -N -to <destination|off>: changes the destinations of a rule
    if (withDestination) {
        const n = ruleNumber(opts.argv);

        if (!n || n > rules.length || opts.opt.list || opts.opt.show || opts.opt.rem || opts.opt.flush) {
            await msg.reply(`❌ Use o -to ao adicionar (/watch -a <regra> -to <destino>) ou com o nº de uma regra: /watch -N -to <destino|off>.` +
                (n > rules.length ? ` A regra #${n} não existe: veja /watch -l` : ''));
            return;
        }

        const lido = await toReadDestinations(msg, destinationsText);
        if (!lido) return;

        const rule = rules[n - 1];
        await recordDestinations(rule, lido.destinos);
        printInfo(`/watch: regra #${n} agora avisa em ` +
            (lido.destinos.length ? lido.destinos.map(d => d.email ?? d.id).join(', ') : 'privado'));
        await msg.reply(`📣 Regra *#${n}* (${rule}): os avisos vão para *${whereWarn(lido.destinos)}*.`);
        return;
    }

    if (opts.opt.list) {
        if (!rules.length) {
            await msg.reply('👀 Nenhuma regra cadastrada.\n💡 _Adicione com /watch -a <texto|/regex/>_');
            return;
        }

        const count = new Map(
            (await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
                .map(r => [r.rule, r.total])
        );
        const destinations = await rulesDestinations();

        const width = String(rules.length).length + 1;
        const list = rules
            .map((r, i) => `${`#${i + 1}`.padEnd(width)}  ${r}  (${count.get(r) ?? 0})` +
                (destinations.get(r)?.length ? `  → ${describeDestinations(destinations.get(r))}` : ''))
            .join('\n');

        await msg.reply(
            `👀 *WATCH: REGRAS* (${rules.length}/${getSetting('watch.max')})\n\n` +
            '```\n' + list + '\n```\n' +
            '_(entre parênteses: ocorrências guardadas; → o destino dos avisos, se não for o seu privado)_\n' +
            '💡 _/watch -s -N para ver as mensagens da regra N; /watch -N -to <destino|off> troca os destinos._');
        return;
    }

    // With nothing: the same as /watch -s (occurrences of all the rules)
    if (opts.opt.show || !args.trim()) {
        let rule = null;

        if (opts.argv.filter(Boolean).length) {
            const n = ruleNumber(opts.argv);

            if (!n || n > rules.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(rules.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            rule = rules[n - 1];
        }

        const filter = rule === null ? '' : 'WHERE rule = ?';
        const params = rule === null ? [] : [rule];
        const max = getSetting('watch.showMax');

        const { total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filter}`, params);
        const rows = await dbAll(
            `SELECT * FROM watch_hits ${filter} ORDER BY timestamp DESC LIMIT ?`,
            [...params, max]
        );

        let textAlt = '👀 *WATCH: OCORRÊNCIAS*\n';
        textAlt += rule === null
            ? '🔎 *Regras:* todas\n'
            : `🔎 *Regra #${rules.indexOf(rule) + 1}:* ${rule}\n`;
        textAlt += `📦 *Total:* ${total}${total > rows.length ? ` _(exibindo as ${rows.length} mais recentes)_` : ''}\n`;

        if (!rows.length) {
            textAlt += '\n_Nenhuma mensagem casou ainda._';
        }

        for (const [i, h] of rows.entries()) {
            // Current group name (the stored one may be the "Grupo <id>" fallback or out of date)
            const group = h.is_group ? (await groupResolverName(h.chat_id)) || h.chat_name : null;
            const channel = isChannelAlt(h.chat_id)
                ? (await channelResolverName(h.chat_id)) || h.chat_name : null;
            const whereAlt = channel ? `📰 ${channel}`
                : h.is_group ? `👥 ${group} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
            const n = rules.indexOf(h.rule) + 1;
            const which = rule === null ? ` · 🔎 ${n ? `#${n}` : '(removida)'}` : '';

            textAlt += `\n${i + 1}. 📅 ${formatData(h.timestamp)}${which}\n`;
            textAlt += `    ${whereAlt}\n`;
            textAlt += `    💬 "${summarizeText(await resolverMentions(h.body))}"\n`;
        }

        await msg.reply(textAlt);
        return;
    }

    if (opts.opt.rem) {
        const n = ruleNumber(opts.argv);

        if (!n) {
            await help();
            return;
        }

        if (n > rules.length) {
            await msg.reply(`❌ A regra #${n} não existe. Existem ${plural(rules.length, 'regra', 'regras')}: veja /watch -l`);
            return;
        }

        const rule = rules[n - 1];

        await setSetting('watch.rules', rules.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);
        await recordDestinations(rule, []);

        printInfo(`/watch: regra #${n} removida: ${rule}`);
        await msg.reply(
            `🗑️ Regra *#${n}* removida: ${rule}\n` +
            `🗄️ Ocorrências apagadas: *${res.changes}*` +
            (n <= rules.length - 1 ? '\n💡 _As regras seguintes foram renumeradas: veja /watch -l_' : '')
        );
        return;
    }

    if (opts.opt.flush) {
        let rule = null;

        if (opts.argv.filter(Boolean).length) {
            const n = ruleNumber(opts.argv);

            if (!n || n > rules.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(rules.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            rule = rules[n - 1];
        }

        // Without -N deletes everything, including occurrences of already removed rules
        const res = rule === null
            ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);

        printInfo(`/watch -flush (${rule === null ? 'todas' : rule}): ${res.changes} ocorrências removidas`);
        await msg.reply(
            (rule === null
                ? '🧹 *Flush das ocorrências de todas as regras*\n'
                : `🧹 *Flush das ocorrências da regra #${rules.indexOf(rule) + 1}:* ${rule}\n`) +
            `🗄️ Ocorrências apagadas: *${res.changes}*\n` +
            '💡 _As regras continuam ativas: veja /watch -l_'
        );
        return;
    }

    await help();
}

module.exports = {
    cmdWatch
};
