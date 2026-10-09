/*
 * Comando /watch.
 */

const { getCommandSyntax } = require('./base');
const { resolverMencoes, resolverNomeDoCanal, resolverNomeDoGrupo } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const {
    colunasDoDestino, descreverDestinos, destinoDaLinha, destinosSalvos, recipientsDe,
    resolverDestinos, resolverOuEscolher
} = require('../destinos');
const { printInfo } = require('../log');
const { getSetting, setSetting } = require('../settings');
const { formatarData, plural, resumirTexto, semAcentos } = require('../util/formatar');
const { ehCanal } = require('../util/origem');
const { REGRA_REGEX, compilarBusca, compilarRegraWatch } = require('../watch/regras');
const { lerOpcoesWatch } = require('../watch/opcoes');

/*
 * Regras diretas; -in restringe a origem e -to escolhe onde o aviso será enviado.
 * -N é a quantidade de matches. -s/-r/-f recebem o número da regra sem hífen
 * ou a própria regra (/watch -s /Jorge/).
 */
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


/**
 * O nº da regra pelo texto dela: igual; igual sem diferenciar maiúsculas nem
 * acentos; ou contida em uma só regra.
 * @returns {Promise<number|null>} null: já respondeu o erro
 */
async function numeroDaRegra(msg, ref, regras) {
    const exata = regras.indexOf(ref);
    if (exata >= 0) return exata + 1;
    const igual = regras.findIndex(r => semAcentos(r) === semAcentos(ref));
    if (igual >= 0) return igual + 1;

    const contem = regras.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => semAcentos(r).includes(semAcentos(ref)));
    if (contem.length === 1) return contem[0].n;

    await msg.reply(contem.length
        ? `🔎 "${ref}" corresponde a ${contem.length} regras:\n\n` +
            contem.map(({ r, n }) => `#${n}  ${r}`).join('\n') +
            '\n\n💡 _Repita com o nº da regra (ex.: /watch -s N) ou com ela inteira._'
        : `❌ Nenhuma regra casa com "${ref}": veja /watch -l`);
    return null;
}

const DICAS = '\n\n💡 *Dicas*\n' +
    '/watch -f N limpa as ocorrências da regra N.\n' +
    '/watch -s <N ou regra> mostra as mensagens completas.\n' +
    '/watch -s <N ou regra> -q <texto|/regex/> só as que casam.\n' +
    '/watch -s N -to <destino|off> troca os destinos.';

async function listarRegras(regras) {
    const contagem = new Map((await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
        .map(r => [r.rule, r.total]));
    const destinos = await destinosDasRegras();
    const origens = new Map((await dbAll('SELECT * FROM watch_sources')).map(r => [r.rule, r]));
    const width = String(regras.length).length + 1;
    const lista = regras.map((r, i) => {
        const origem = origens.get(r);
        const apenas = origem ? ` apenas em ${origem.source_kind === 'canal' ? '📰'
            : origem.source_kind === 'grupo' ? '👥' : '👤'} ${origem.source_name}` : '';
        return `${`#${i + 1}`.padEnd(width)}  ${r}  (${contagem.get(r) ?? 0})${apenas}` +
            (destinos.get(r)?.length ? `  → ${descreverDestinos(destinos.get(r))}` : '');
    });
    return `👀 *WATCH: REGRAS* (${regras.length}/${getSetting('watch.max')})\n\n` +
        (lista.length ? lista.join('\n') : '_Nenhuma regra cadastrada._\n' +
            '💡 _Adicione com /watch <texto|/regex/flags>_');
}

/*
 * As ocorrências da regra (null: de todas), das mais recentes. Com busca, só as
 * que casam: texto, sem diferenciar maiúsculas nem acentos, ou /regex/flags
 * (filtrada aqui: o SQLite não ignora acentos nem tem regex).
 */
async function listarOcorrencias(regra, regras, limite, completa = false, busca = null) {
    const filtro = regra === null ? '' : 'WHERE rule = ?';
    const params = regra === null ? [] : [regra];
    const max = Math.min(limite ?? getSetting('watch.showMax'), getSetting('watch.showMax'));
    let total;
    let rows;
    if (busca === null) {
        ({ total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filtro}`, params));
        rows = await dbAll(
            `SELECT * FROM watch_hits ${filtro} ORDER BY timestamp DESC, id DESC LIMIT ?`, [...params, max]);
    } else {
        const casa = compilarBusca(busca);
        const todas = await dbAll(`SELECT * FROM watch_hits ${filtro} ORDER BY timestamp DESC, id DESC`, params);
        const casam = todas.filter(h => casa(h.body));
        total = casam.length;
        rows = casam.slice(0, max);
    }
    let texto = '👀 *WATCH: OCORRÊNCIAS*\n' + (regra === null ? '🔎 *Regras:* todas\n'
        : `🔎 *Regra #${regras.indexOf(regra) + 1}:* ${regra}\n`);
    if (busca !== null) texto += `🔍 *Busca:* "${busca}"\n`;
    texto += `📦 *Total:* ${total}${total > rows.length
        ? ` _(exibindo as ${rows.length} mais recentes)_` : ''}\n`;
    if (!rows.length) {
        texto += busca === null ? '\n_Nenhuma mensagem casou ainda._' : `\n_Nenhuma mensagem com "${busca}"._`;
    }
    for (const [i, h] of rows.entries()) {
        const grupo = h.is_group ? (await resolverNomeDoGrupo(h.chat_id)) || h.chat_name : null;
        const canal = ehCanal(h.chat_id)
            ? (await resolverNomeDoCanal(h.chat_id)) || h.chat_name : null;
        const onde = canal ? `📰 ${canal}`
            : h.is_group ? `👥 ${grupo} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
        const n = regras.indexOf(h.rule) + 1;
        const qual = regra === null ? ` · 🔎 ${n ? `#${n}` : '(removida)'}` : '';
        const body = await resolverMencoes(h.body);
        texto += `\n${i + 1}. 📅 ${formatarData(h.timestamp)}${qual}\n` +
            `    ${onde}\n    💬 "${completa ? body : resumirTexto(body)}"\n`;
    }
    return { total, texto };
}

async function cmdWatch({ msg, args }) {
    await dbPronto;
    let o;
    try {
        o = lerOpcoesWatch(args);
    } catch (err) {
        await msg.reply(`❌ ${err.message}.\n\n` + '```' + getCommandSyntax('/watch') + '```');
        return;
    }
    const regras = getSetting('watch.rules');
    const ajuda = () => msg.reply('```' + getCommandSyntax('/watch') + '```');
    if (o.regra) {
        if (o.limite !== null) { await ajuda(); return; }
        try { compilarRegraWatch(o.regra); } catch (err) {
            await msg.reply(`❌ Regra inválida: ${err.message}`);
            return;
        }
        if (regras.includes(o.regra)) {
            await msg.reply(`ℹ️ A regra #${regras.indexOf(o.regra) + 1} já existe: ${o.regra}`);
            return;
        }
        if (regras.length >= getSetting('watch.max')) {
            await msg.reply(`❌ Limite de ${getSetting('watch.max')} regras atingido (setting watch.max).\n💡 _Remova uma com /watch -rem N_`);
            return;
        }
        let origem;
        if (o.origem !== null) {
            origem = await resolverOuEscolher(msg, o.origem, { aceitaCanal: true,
                semEmail: '❌ O -in aceita contato, grupo ou canal do WhatsApp, não e-mail.' });
            if (!origem) return;
        }
        const lido = o.destinos.length ? await lerDestinosDoTo(msg, o.destinos) : { destinos: [] };
        if (!lido) return;
        await setSetting('watch.rules', [...regras, o.regra]);
        // Uma regra recriada não herda uma origem antiga deixada pelo /set.
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [o.regra]);
        if (origem) {
            await dbRun('INSERT INTO watch_sources VALUES (?, ?, ?, ?)',
                [o.regra, origem.id, origem.nome, origem.canal ? 'canal' : origem.grupo
                    ? 'grupo' : 'contato']);
        }
        await gravarDestinos(o.regra, lido.destinos);
        const tipo = REGRA_REGEX.test(o.regra) ? 'regex' : 'texto';
        printInfo(`/watch: regra #${regras.length + 1} adicionada: ${o.regra}`);
        await msg.reply(`✅ Regra *#${regras.length + 1}* adicionada _(${tipo})_: ${o.regra}\n` +
            (origem ? `📍 Apenas em ${descreverDestinos([origem])}.\n` : '') +
            `💡 _Avisos ${lido.destinos.length ? `em ${ondeAvisa(lido.destinos)}`
                : 'no seu privado'}._`);
        return;
    }
    if (o.busca !== null) {
        try { compilarBusca(o.busca); } catch (err) {
            await msg.reply(`❌ Busca inválida: ${err.message}`);
            return;
        }
    }
    if (o.ref !== null) {
        o.n = await numeroDaRegra(msg, o.ref, regras);
        if (o.n === null) return;
    }
    const n = o.n ?? (o.destinos.length ? o.limite : null);
    const regra = n === null ? null : regras[n - 1];
    if (n !== null && !regra) {
        await msg.reply(`❌ A regra #${n} não existe. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
        return;
    }
    if (o.destinos.length) {
        if (!regra || (o.acao && o.acao !== 'show')) {
            await msg.reply('❌ Use o -to ao adicionar (/watch <regra> -to <destino>) ou com /watch -s N -to <destino|off>.');
            return;
        }
        const lido = await lerDestinosDoTo(msg, o.destinos);
        if (!lido) return;
        await gravarDestinos(regra, lido.destinos);
        await msg.reply(`📣 Regra *#${n}* (${regra}): os avisos vão para *${ondeAvisa(lido.destinos)}*.`);
        return;
    }
    if (o.acao === 'rem') {
        if (!regra) { await ajuda(); return; }
        await setSetting('watch.rules', regras.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);
        await gravarDestinos(regra, []);
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [regra]);
        await msg.reply(`🗑️ Regra *#${n}* removida: ${regra}\n` +
            `🗄️ Ocorrências apagadas: *${res.changes}*` +
            (n < regras.length ? '\n💡 _As regras seguintes foram renumeradas: veja /watch -l_' : ''));
        return;
    }
    if (o.acao === 'flush') {
        const res = regra === null ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);
        await msg.reply((regra === null ? '🧹 *Flush das ocorrências de todas as regras*\n'
            : `🧹 *Flush das ocorrências da regra #${n}:* ${regra}\n`) +
            `🗄️ Ocorrências apagadas: *${res.changes}*\n` +
            '💡 _As regras continuam ativas: veja /watch -l_');
        return;
    }
    if (o.acao === 'show') {
        await msg.reply((await listarOcorrencias(regra, regras, o.limite, true, o.busca)).texto + DICAS);
        return;
    }
    let texto = await listarRegras(regras);
    if (o.acao !== 'list') {
        const ocorrencias = await listarOcorrencias(null, regras, o.limite, false, o.busca);
        if (ocorrencias.total || o.busca !== null) texto += '\n\n' + ocorrencias.texto;
    }
    await msg.reply(texto + DICAS);
}

module.exports = { cmdWatch };
