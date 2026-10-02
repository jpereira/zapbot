/*
 * Comando /watch.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { resolverMencoes, resolverNomeDoGrupo } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const {
    colunasDoDestino, descreverDestinos, destinoDaLinha, destinosSalvos, extrairDestinos, recipientsDe,
    resolverDestinos
} = require('../destinos');
const { printInfo } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { getSetting, setSetting } = require('../settings');
const { formatarData, plural, resumirTexto } = require('../util/formatar');
const { REGRA_REGEX } = require('../watch/regras');

/*
 * /watch (alias /w)
 *   /watch                     → o mesmo que /watch -s (ocorrências de todas as regras)
 *   /watch -l                  → lista as regras (nº, regra, ocorrências)
 *   /watch -s [-N]             → resumo das mensagens que casaram com a regra N (sem N: todas)
 *   /watch -a <texto|/regex/>  → adiciona regra
 *   /watch -r -N               → remove a regra N e as ocorrências dela
 *   /watch -f [-N]             → apaga as ocorrências da regra N (sem N: de todas); mantém as regras
 *   /watch -a <regra> -to <destino>  → a regra avisa noutro chat ou por e-mail (repita o -to
 *                                      para avisar em vários)
 *   /watch -N -to <destino|off>      → troca os destinos da regra N (off: volta ao seu privado)
 * As regras ficam no setting 'watch.rules'; as ocorrências na tabela watch_hits;
 * os destinos de cada regra, em watch_destinations (sem linha: o seu privado).
 * As respostas saem no chat onde o comando foi digitado.
 */

// "-2" ou "2" em argv → 2; senão null
function numeroDaRegra(argv) {
    const m = String(argv.filter(Boolean)[0] ?? '').match(/^-?(\d+)$/);
    return m ? Number(m[1]) : null;
}

// Os destinos dos avisos de uma linha de watch_destinations
const destinosDaLinha = (r) => destinosSalvos(r.recipients, destinoDaLinha(r));

// regra → os destinos dos avisos dela (só as que têm -to)
async function destinosDasRegras() {
    const linhas = await dbAll('SELECT * FROM watch_destinations');
    return new Map(linhas.map(r => [r.rule, destinosDaLinha(r)]));
}

// Sem destinos ([]): a linha sai, e os avisos voltam ao seu privado
async function gravarDestinos(regra, destinos) {
    if (!destinos.length) {
        await dbRun('DELETE FROM watch_destinations WHERE rule = ?', [regra]);
        return;
    }

    const c = colunasDoDestino(destinos[0]);
    await dbRun(
        `INSERT INTO watch_destinations (rule, dest_id, dest_name, dest_is_group, dest_email, recipients) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(rule) DO UPDATE SET dest_id = excluded.dest_id, dest_name = excluded.dest_name,
            dest_is_group = excluded.dest_is_group, dest_email = excluded.dest_email, recipients = excluded.recipients`,
        [regra, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinos)]
    );
}

const ondeAvisa = (destinos) => (destinos.length ? descreverDestinos(destinos) : 'seu privado');

/**
 * Os destinos dos -to: "off" (ou "privado") volta ao seu privado; senão, cada um
 * é contato, grupo, número ou e-mail (vários com o nome: você escolhe na lista).
 * @returns {Promise<{ destinos: object[] } | null>}  null: já respondeu o erro
 */
async function lerDestinosDoTo(msg, textos) {
    if (textos.some(t => /^(off|privado)$/i.test(String(t ?? '').trim()))) {
        if (textos.length > 1) {
            await msg.reply('❌ O -to off volta ao seu privado: use-o sozinho, sem outros -to.');
            return null;
        }
        return { destinos: [] };
    }
    const destinos = await resolverDestinos(msg, textos, { aceitaEmail: true });
    return destinos ? { destinos } : null;
}

async function cmdWatch({ msg, opts: optsDoComando, args: argsDoComando }) {
    await dbPronto;

    /*
     * O -to aceita espaços (/Grupo L200/), que o parser de opções separaria:
     * sai do texto antes, e o resto é lido de novo. A regra do -add não pode
     * ter um " -to " solto, então.
     */
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(argsDoComando);
    const args = comDestino ? resto : argsDoComando;
    const opts = comDestino ? GetOptFromCommand(resto, findCommand('/watch')) : optsDoComando;

    const regras = getSetting('watch.rules');
    const ajuda = () => msg.reply('```' + getCommandSyntax('/watch') + '```');

    // -add usa o texto cru: a regra pode ter espaços, aspas ou começar com "-"
    const add = args.match(/^-(?:add|a)(?:\s+([\s\S]*))?$/);

    if (add) {
        const regra = (add[1] ?? '').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();

        if (!regra) {
            await ajuda();
            return;
        }

        if (regras.includes(regra)) {
            await msg.reply(`ℹ️ A regra #${regras.indexOf(regra) + 1} já existe: ${regra}` +
                (comDestino ? `\n💡 _Para trocar o destino: /watch -${regras.indexOf(regra) + 1} -to <destino>_` : ''));
            return;
        }

        const max = getSetting('watch.max');
        if (regras.length >= max) {
            await msg.reply(`❌ Limite de ${max} regras atingido (setting watch.max).\n💡 _Remova uma com /watch -r -N_`);
            return;
        }

        // Os destinos antes da regra: se algum falhar (ou ninguém escolher na lista), nada é criado
        let destinos = [];
        if (comDestino) {
            const lido = await lerDestinosDoTo(msg, destinosTexto);
            if (!lido) return;
            destinos = lido.destinos;
        }

        try {
            await setSetting('watch.rules', [...regras, regra]);
        } catch (e) {
            await msg.reply(`❌ Regra inválida: ${e.message}`);
            return;
        }
        await gravarDestinos(regra, destinos);

        const tipo = REGRA_REGEX.test(regra) ? 'regex' : 'texto';
        printInfo(`/watch: regra #${regras.length + 1} adicionada: ${regra}` +
            (destinos.length ? ` → ${destinos.map(d => d.email ?? d.id).join(', ')}` : ''));
        await msg.reply(`✅ Regra *#${regras.length + 1}* adicionada _(${tipo})_: ${regra}\n` +
            `💡 _Avisos ${destinos.length ? `em ${ondeAvisa(destinos)}` : 'no seu privado'}._`);
        return;
    }

    // -N -to <destino|off>: troca os destinos de uma regra
    if (comDestino) {
        const n = numeroDaRegra(opts.argv);

        if (!n || n > regras.length || opts.opt.list || opts.opt.show || opts.opt.rem || opts.opt.flush) {
            await msg.reply(`❌ Use o -to ao adicionar (/watch -a <regra> -to <destino>) ou com o nº de uma regra: /watch -N -to <destino|off>.` +
                (n > regras.length ? ` A regra #${n} não existe: veja /watch -l` : ''));
            return;
        }

        const lido = await lerDestinosDoTo(msg, destinosTexto);
        if (!lido) return;

        const regra = regras[n - 1];
        await gravarDestinos(regra, lido.destinos);
        printInfo(`/watch: regra #${n} agora avisa em ` +
            (lido.destinos.length ? lido.destinos.map(d => d.email ?? d.id).join(', ') : 'privado'));
        await msg.reply(`📣 Regra *#${n}* (${regra}): os avisos vão para *${ondeAvisa(lido.destinos)}*.`);
        return;
    }

    if (opts.opt.list) {
        if (!regras.length) {
            await msg.reply('👀 Nenhuma regra cadastrada.\n💡 _Adicione com /watch -a <texto|/regex/>_');
            return;
        }

        const contagem = new Map(
            (await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
                .map(r => [r.rule, r.total])
        );
        const destinos = await destinosDasRegras();

        const width = String(regras.length).length + 1;
        const lista = regras
            .map((r, i) => `${`#${i + 1}`.padEnd(width)}  ${r}  (${contagem.get(r) ?? 0})` +
                (destinos.get(r)?.length ? `  → ${descreverDestinos(destinos.get(r))}` : ''))
            .join('\n');

        await msg.reply(
            `👀 *WATCH: REGRAS* (${regras.length}/${getSetting('watch.max')})\n\n` +
            '```\n' + lista + '\n```\n' +
            '_(entre parênteses: ocorrências guardadas; → o destino dos avisos, se não for o seu privado)_\n' +
            '💡 _/watch -s -N para ver as mensagens da regra N; /watch -N -to <destino|off> troca os destinos._');
        return;
    }

    // Sem nada: o mesmo que /watch -s (ocorrências de todas as regras)
    if (opts.opt.show || !args.trim()) {
        let regra = null;

        if (opts.argv.filter(Boolean).length) {
            const n = numeroDaRegra(opts.argv);

            if (!n || n > regras.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            regra = regras[n - 1];
        }

        const filtro = regra === null ? '' : 'WHERE rule = ?';
        const params = regra === null ? [] : [regra];
        const max = getSetting('watch.showMax');

        const { total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filtro}`, params);
        const rows = await dbAll(
            `SELECT * FROM watch_hits ${filtro} ORDER BY timestamp DESC LIMIT ?`,
            [...params, max]
        );

        let texto = '👀 *WATCH: OCORRÊNCIAS*\n';
        texto += regra === null
            ? '🔎 *Regras:* todas\n'
            : `🔎 *Regra #${regras.indexOf(regra) + 1}:* ${regra}\n`;
        texto += `📦 *Total:* ${total}${total > rows.length ? ` _(exibindo as ${rows.length} mais recentes)_` : ''}\n`;

        if (!rows.length) {
            texto += '\n_Nenhuma mensagem casou ainda._';
        }

        for (const [i, h] of rows.entries()) {
            // Nome do grupo atual (o gravado pode ser o fallback "Grupo <id>" ou estar desatualizado)
            const grupo = h.is_group ? (await resolverNomeDoGrupo(h.chat_id)) || h.chat_name : null;
            const onde = h.is_group ? `👥 ${grupo} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
            const n = regras.indexOf(h.rule) + 1;
            const qual = regra === null ? ` · 🔎 ${n ? `#${n}` : '(removida)'}` : '';

            texto += `\n${i + 1}. 📅 ${formatarData(h.timestamp)}${qual}\n`;
            texto += `    ${onde}\n`;
            texto += `    💬 "${resumirTexto(await resolverMencoes(h.body))}"\n`;
        }

        await msg.reply(texto);
        return;
    }

    if (opts.opt.rem) {
        const n = numeroDaRegra(opts.argv);

        if (!n) {
            await ajuda();
            return;
        }

        if (n > regras.length) {
            await msg.reply(`❌ A regra #${n} não existe. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
            return;
        }

        const regra = regras[n - 1];

        await setSetting('watch.rules', regras.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);
        await gravarDestinos(regra, []);

        printInfo(`/watch: regra #${n} removida: ${regra}`);
        await msg.reply(
            `🗑️ Regra *#${n}* removida: ${regra}\n` +
            `🗄️ Ocorrências apagadas: *${res.changes}*` +
            (n <= regras.length - 1 ? '\n💡 _As regras seguintes foram renumeradas: veja /watch -l_' : '')
        );
        return;
    }

    if (opts.opt.flush) {
        let regra = null;

        if (opts.argv.filter(Boolean).length) {
            const n = numeroDaRegra(opts.argv);

            if (!n || n > regras.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            regra = regras[n - 1];
        }

        // Sem -N apaga tudo, inclusive ocorrências de regras já removidas
        const res = regra === null
            ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);

        printInfo(`/watch -flush (${regra === null ? 'todas' : regra}): ${res.changes} ocorrências removidas`);
        await msg.reply(
            (regra === null
                ? '🧹 *Flush das ocorrências de todas as regras*\n'
                : `🧹 *Flush das ocorrências da regra #${regras.indexOf(regra) + 1}:* ${regra}\n`) +
            `🗄️ Ocorrências apagadas: *${res.changes}*\n` +
            '💡 _As regras continuam ativas: veja /watch -l_'
        );
        return;
    }

    await ajuda();
}

module.exports = {
    cmdWatch
};
