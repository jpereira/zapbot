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
const { t } = require('../i18n');
const { getSetting, setSetting } = require('../settings');
const { contar } = require('../util/contar');
const { formatarData, resumirTexto, semAcentos } = require('../util/formatar');
const { ehCanal } = require('../util/origem');
const { mascararTelefones } = require('../util/telefone');
const { REGRA_REGEX, compilarBusca, compilarRegraWatch } = require('../watch/regras');
const { lerOpcoesWatch } = require('../watch/opcoes');

/*
 * Regras diretas; -in restringe a origem e -to escolhe onde o aviso será enviado.
 * -N é a quantidade de matches. -s/-r/-f recebem o número da regra sem hífen
 * ou a própria regra (/watch -s /Jorge/). -q filtra os matches por texto ou
 * /regex/flags (/watch -s 3 -q carro).
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

// As regras com o 🔒 (-mask N): avisos e ocorrências saem com os telefones ofuscados
async function regrasTravadas() {
    return new Set((await dbAll('SELECT rule FROM watch_masks')).map(r => r.rule));
}

const ondeAvisa = (destinos) => (destinos.length ? descreverDestinos(destinos) : t('watch.yourPrivate'));

/**
 * Os destinos dos -to: "off" (ou "privado") volta ao seu privado; senão, cada um
 * é contato, grupo, número ou e-mail (vários com o nome: você escolhe na lista).
 * @returns {Promise<{ destinos: object[] } | null>}  null: já respondeu o erro
 */
async function lerDestinosDoTo(msg, textos) {
    if (textos.some(x => /^(off|privado|private)$/i.test(String(x ?? '').trim()))) {
        if (textos.length > 1) {
            await msg.reply(t('watch.toOffAlone'));
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
        ? t('watch.multiMatch', { ref, count: contem.length }) +
            contem.map(({ r, n }) => `#${n}  ${r}`).join('\n') +
            t('watch.multiMatchFooter')
        : t('watch.noRuleMatches', { ref }));
    return null;
}

const dicas = () => t('watch.tips');

async function listarRegras(regras) {
    const contagem = new Map((await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
        .map(r => [r.rule, r.total]));
    const destinos = await destinosDasRegras();
    const origens = new Map((await dbAll('SELECT * FROM watch_sources')).map(r => [r.rule, r]));
    const travadas = await regrasTravadas();
    const width = String(regras.length).length + 1;
    const lista = regras.map((r, i) => {
        const origem = origens.get(r);
        const apenas = origem ? t('watch.onlyIn', { icon: origem.source_kind === 'canal' ? '📰'
            : origem.source_kind === 'grupo' ? '👥' : '👤', name: origem.source_name }) : '';
        return `${`#${i + 1}`.padEnd(width)}  ${r}  (${contagem.get(r) ?? 0})${travadas.has(r) ? ' 🔒' : ''}${apenas}` +
            (destinos.get(r)?.length ? `  → ${descreverDestinos(destinos.get(r))}` : '');
    });
    return t('watch.listTitle', { count: regras.length, max: getSetting('watch.max') }) +
        (lista.length ? lista.join('\n') : t('watch.noRules'));
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
    const travadas = await regrasTravadas();
    let texto = t('watch.hitsTitle') + (regra === null ? t('watch.rulesAll')
        : t('watch.ruleLine', { n: regras.indexOf(regra) + 1, rule: regra }));
    if (busca !== null) texto += t('watch.searchLine', { query: busca });
    texto += t('watch.total', { total, shown: total > rows.length ? t('watch.showingLatest', { count: rows.length }) : '' });
    if (!rows.length) {
        texto += busca === null ? t('watch.noneYet') : t('watch.noneWith', { query: busca });
    }
    for (const [i, h] of rows.entries()) {
        const grupo = h.is_group ? (await resolverNomeDoGrupo(h.chat_id)) || h.chat_name : null;
        const canal = ehCanal(h.chat_id)
            ? (await resolverNomeDoCanal(h.chat_id)) || h.chat_name : null;
        const onde = canal ? `📰 ${canal}`
            : h.is_group ? `👥 ${grupo} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
        const n = regras.indexOf(h.rule) + 1;
        const qual = regra === null ? ` · 🔎 ${n ? `#${n}` : t('watch.removed')}` : '';
        const resolvido = await resolverMencoes(h.body);
        const body = travadas.has(h.rule) ? mascararTelefones(resolvido) : resolvido;
        texto += t('watch.hitLine', { i: i + 1, date: formatarData(h.timestamp), which: qual, where: onde,
            body: completa ? body : resumirTexto(body) });
    }
    return { total, texto };
}

async function cmdWatch({ msg, args }) {
    await dbPronto;
    let o;
    try {
        o = lerOpcoesWatch(args);
    } catch (err) {
        await msg.reply(t('watch.optionError', { error: err.message }) + '```' + getCommandSyntax('/watch') + '```');
        return;
    }
    const regras = getSetting('watch.rules');
    const ajuda = () => msg.reply('```' + getCommandSyntax('/watch') + '```');
    if (o.trava) {
        const { n, ligar } = o.trava;
        const alvo = regras[n - 1];
        if (!alvo) {
            await msg.reply(t('watch.ruleMissing', { n, rules: contar('watch.rules', regras.length) }));
            return;
        }
        if (ligar) await dbRun('INSERT OR IGNORE INTO watch_masks (rule) VALUES (?)', [alvo]);
        else await dbRun('DELETE FROM watch_masks WHERE rule = ?', [alvo]);
        await msg.reply(ligar
            ? t('watch.maskOn', { n, rule: alvo })
            : t('watch.maskOff', { n, rule: alvo }));
        return;
    }
    if (o.regra) {
        if (o.limite !== null) { await ajuda(); return; }
        try { compilarRegraWatch(o.regra); } catch (err) {
            await msg.reply(t('watch.invalidRule', { error: err.message }));
            return;
        }
        if (regras.includes(o.regra)) {
            await msg.reply(t('watch.exists', { n: regras.indexOf(o.regra) + 1, rule: o.regra }));
            return;
        }
        if (regras.length >= getSetting('watch.max')) {
            await msg.reply(t('watch.limitReached', { max: getSetting('watch.max') }));
            return;
        }
        let origem;
        if (o.origem !== null) {
            origem = await resolverOuEscolher(msg, o.origem, { aceitaCanal: true,
                semEmail: t('watch.inNoEmail') });
            if (!origem) return;
        }
        const lido = o.destinos.length ? await lerDestinosDoTo(msg, o.destinos) : { destinos: [] };
        if (!lido) return;
        await setSetting('watch.rules', [...regras, o.regra]);
        // Uma regra recriada não herda uma origem antiga deixada pelo /set.
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [o.regra]);
        await dbRun('DELETE FROM watch_masks WHERE rule = ?', [o.regra]);
        // /watch /regra/ -mask: já nasce com o 🔒
        if (o.mask) await dbRun('INSERT INTO watch_masks (rule) VALUES (?)', [o.regra]);
        if (origem) {
            await dbRun('INSERT INTO watch_sources VALUES (?, ?, ?, ?)',
                [o.regra, origem.id, origem.nome, origem.canal ? 'canal' : origem.grupo
                    ? 'grupo' : 'contato']);
        }
        await gravarDestinos(o.regra, lido.destinos);
        const tipo = t(REGRA_REGEX.test(o.regra) ? 'watch.kindRegex' : 'watch.kindText');
        printInfo(`/watch: regra #${regras.length + 1} adicionada: ${o.regra}`);
        await msg.reply(t('watch.added', { n: regras.length + 1, kind: tipo, rule: o.regra }) +
            (origem ? t('watch.addedOnlyIn', { where: descreverDestinos([origem]) }) : '') +
            (o.mask ? t('watch.addedMask') : '') +
            t('watch.addedAlerts', { where: lido.destinos.length ? t('watch.alertsIn', { where: ondeAvisa(lido.destinos) })
                : t('watch.alertsPrivate') }));
        return;
    }
    if (o.busca !== null) {
        try { compilarBusca(o.busca); } catch (err) {
            await msg.reply(t('watch.queryInvalid', { error: err.message }));
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
        await msg.reply(t('watch.ruleMissing', { n, rules: contar('watch.rules', regras.length) }));
        return;
    }
    if (o.destinos.length) {
        if (!regra || (o.acao && o.acao !== 'show')) {
            await msg.reply(t('watch.badTo'));
            return;
        }
        const lido = await lerDestinosDoTo(msg, o.destinos);
        if (!lido) return;
        await gravarDestinos(regra, lido.destinos);
        await msg.reply(t('watch.toSet', { n, rule: regra, where: ondeAvisa(lido.destinos) }));
        return;
    }
    if (o.acao === 'rm') {
        if (!regra) { await ajuda(); return; }
        await setSetting('watch.rules', regras.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);
        await gravarDestinos(regra, []);
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [regra]);
        await dbRun('DELETE FROM watch_masks WHERE rule = ?', [regra]);
        await msg.reply(t('watch.removedRule', { n, rule: regra }) +
            t('watch.deletedHits', { count: res.changes }) +
            (n < regras.length ? t('watch.renumbered') : ''));
        return;
    }
    if (o.acao === 'flush') {
        const res = regra === null ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);
        await msg.reply((regra === null ? t('watch.flushAll') : t('watch.flushOne', { n, rule: regra })) +
            t('watch.deletedHits', { count: res.changes }) + '\n' +
            t('watch.flushFooter'));
        return;
    }
    if (o.acao === 'show') {
        await msg.reply((await listarOcorrencias(regra, regras, o.limite, true, o.busca)).texto + dicas());
        return;
    }
    let texto = await listarRegras(regras);
    if (o.acao !== 'list') {
        const ocorrencias = await listarOcorrencias(null, regras, o.limite, false, o.busca);
        if (ocorrencias.total || o.busca !== null) texto += '\n\n' + ocorrencias.texto;
    }
    await msg.reply(texto + dicas());
}

module.exports = { cmdWatch };
