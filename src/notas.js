/*
 * /notes: anotações (tabela notes) e o -alerta, que lembra de uma anotação numa data/hora.
 */

const { estado } = require('./estado');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const {
    colunasDoDestino, descreverDestinos, destinoDaLinha, destinosSalvos, enviarAosDestinos, extrairDestinos,
    recipientsDe, resolverDestinos
} = require('./destinos');
const { printError, printInfo } = require('./log');
const { formatarData, plural, resumirTexto } = require('./util/formatar');
const { fmtQuando, lerQuando } = require('./util/quando');

/*
 * /notes
 *   /notes | -list | -l                 → lista as anotações, com o ID
 *   /notes <texto>                      → anota (o mesmo que -add, quando não começa com "-")
 *   -add | -a <texto>                   → anota
 *   -add <texto> -alerta <quando> [-to <destino>]...
 *                                       → anota e avisa na data/hora (o -to funciona como nos outros -alerta)
 *   -rem | -r <id...|all>               → remove (-r 1 2 3, -r 1,2,3 ou all)
 *   -alerta                             → lista só as anotações com alerta
 *   -alerta <id> <quando> [-to ...]     → põe (ou troca) o alerta de uma anotação
 *   -alerta -rm <id...|all>             → tira o alerta, mantendo a anotação
 * O alerta dispara UMA vez, na hora; a anotação continua. Só o dono (onlyAdmin).
 */
const MAX_DIAS = 365;
const ALERTA = /(^|\s)-alerta(?=\s|$)([\s\S]*)$/;

const destinosDaNota = (n) => destinosSalvos(n.recipients, destinoDaLinha(n));
const ondeDoAviso = (destinos) => (destinos.length ? descreverDestinos(destinos) : 'seu privado');
const recuar = (texto) => texto.replace(/\n/g, '\n   ');

const listarNotas = () => dbAll('SELECT * FROM notes ORDER BY id');

function linhaDaNota(n) {
    const alerta = n.alert_at
        ? `\n   ⏰ ${fmtQuando(n.alert_at)} → ${ondeDoAviso(destinosDaNota(n))}`
        : '';
    return `*#${n.id}* ${recuar(n.text)}${alerta}\n   _(${formatarData(n.created_at)})_`;
}

// Os ids do -rem / -alerta -rm: 1 2 3, 1,2,3 ou all. Algum não existe? Nenhum é mexido
function lerIds(texto, notas) {
    const partes = texto.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (partes.includes('all')) return { todos: true, ids: notas.map(n => n.id) };

    const ids = [...new Set(partes)].sort((a, b) => a - b);
    const faltando = ids.filter(i => !/^\d+$/.test(i) || !notas.some(n => n.id === Number(i)));
    return { ids: ids.map(Number), faltando };
}

async function removerNotas(msg, textoIds, soAlerta) {
    const notas = await listarNotas();
    const { ids, faltando, todos } = lerIds(textoIds, notas);
    const cmd = soAlerta ? '/notes -alerta -rm' : '/notes -rem';

    if (!todos && (!ids.length || faltando.length)) {
        await msg.reply(faltando?.length > 1
            ? `❌ IDs ${faltando.join(', ')} não existem. Nada foi mexido; veja a lista com /notes -l`
            : `❌ ID ${faltando?.[0] ?? '?'} não existe. Veja a lista com /notes -l\n💡 _Uso: ${cmd} <id...|all>_`);
        return;
    }

    if (soAlerta) {
        const comAlerta = notas.filter(n => ids.includes(n.id) && n.alert_at);
        for (const n of comAlerta) await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);
        await msg.reply(`🔕 ${plural(comAlerta.length, 'alerta removido', 'alertas removidos')}.`);
        return;
    }

    for (const id of ids) await dbRun('DELETE FROM notes WHERE id = ?', [id]);
    await msg.reply(`🗑️ ${plural(ids.length, 'anotação removida', 'anotações removidas')}.`);
}

// "<quando>" inteiro (sem sobra) → ms, ou o erro para responder
function lerDataDoAlerta(texto) {
    const palavras = texto.split(/\s+/).filter(Boolean);
    const q = palavras.length ? lerQuando(palavras) : null;
    const agora = Date.now();

    if (!q || q.usadas !== palavras.length) {
        return { erro: `❌ Quando inválido: "${texto}"\n💡 _Ex.: +2h, 30m, 18h, amanhã 9h, sexta 18:30, 25/12 10h_` };
    }
    if (q.ms <= agora) return { erro: `❌ ${fmtQuando(q.ms)} já passou.` };
    if (q.ms > agora + MAX_DIAS * 86400_000) return { erro: `❌ No máximo ${MAX_DIAS} dias à frente.` };
    return { ms: q.ms };
}

async function destinosDoComando(msg, destinosTexto, comDestino) {
    if (!comDestino) return [];
    return resolverDestinos(msg, destinosTexto, { aceitaEmail: true });
}

async function adicionar(msg, resto) {
    const { destinos: destinosTexto, informado: comDestino, resto: semDestino } = extrairDestinos(resto);
    const m = semDestino.match(ALERTA);
    const texto = (m ? semDestino.slice(0, m.index) : semDestino).trim();

    if (!texto) {
        await msg.reply('❌ Use: /notes -add <texto> [-alerta <quando> [-to <destino>]...]');
        return;
    }

    if (comDestino && !m) {
        await msg.reply('❌ O -to só vale com o -alerta: /notes -add <texto> -alerta amanhã 9h -to /Grupo L200/');
        return;
    }

    let alerta = null;
    let destinos = [];

    if (m) {
        const quando = lerDataDoAlerta(m[2].trim());
        if (quando.erro) {
            await msg.reply(quando.erro);
            return;
        }
        alerta = quando.ms;
        destinos = await destinosDoComando(msg, destinosTexto, comDestino);
        if (!destinos) return;
    }

    const c = colunasDoDestino(destinos[0]);
    const r = await dbRun(
        `INSERT INTO notes (text, created_at, alert_at, dest_id, dest_name, dest_is_group, dest_email, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [texto, Date.now(), alerta, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinos)]
    );

    await msg.reply(`📝 *Anotação #${r.lastID}*\n${recuar(texto)}` +
        (alerta ? `\n⏰ ${fmtQuando(alerta)} → ${ondeDoAviso(destinos)}` : ''));
}

async function alertar(msg, resto) {
    const { destinos: destinosTexto, informado: comDestino, resto: semDestino } = extrairDestinos(resto);
    const texto = semDestino.trim();

    if (/^-(rm|rem|r)(\s|$)/.test(texto)) {
        await removerNotas(msg, texto.replace(/^-\S+/, ''), true);
        return;
    }

    if (!texto) {
        if (comDestino) {
            await msg.reply('❌ O -to só vale ao criar o alerta: /notes -alerta <id> amanhã 9h -to /Grupo L200/');
            return;
        }
        const comAlerta = (await listarNotas()).filter(n => n.alert_at);
        await msg.reply(comAlerta.length
            ? `🔔 *ALERTAS DAS ANOTAÇÕES*\n\n${comAlerta.map(linhaDaNota).join('\n\n')}\n\n` +
              '💡 _Tire com /notes -alerta -rm <id...|all>_'
            : '🔔 Nenhuma anotação com alerta.\n💡 _Crie com /notes -alerta <id> <quando>_');
        return;
    }

    const m = texto.match(/^(\d+)\s+([\s\S]+)$/);
    if (!m) {
        await msg.reply('❌ Use: /notes -alerta <id> <quando> [-to <destino>]...');
        return;
    }

    const nota = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
    if (!nota) {
        await msg.reply(`❌ ID ${m[1]} não existe. Veja a lista com /notes -l`);
        return;
    }

    const quando = lerDataDoAlerta(m[2].trim());
    if (quando.erro) {
        await msg.reply(quando.erro);
        return;
    }

    const destinos = await destinosDoComando(msg, destinosTexto, comDestino);
    if (!destinos) return;

    const c = colunasDoDestino(destinos[0]);
    await dbRun(
        `UPDATE notes SET alert_at = ?, dest_id = ?, dest_name = ?, dest_is_group = ?, dest_email = ?, recipients = ?
         WHERE id = ?`,
        [quando.ms, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinos), nota.id]
    );

    await msg.reply(`🔔 *Alerta criado* na anotação #${nota.id}\n${recuar(resumirTexto(nota.text, 80))}\n` +
        `⏰ ${fmtQuando(quando.ms)} → ${ondeDoAviso(destinos)}`);
}

async function listar(msg) {
    const notas = await listarNotas();
    await msg.reply(notas.length
        ? `📝 *ANOTAÇÕES* (${notas.length})\n\n${notas.map(linhaDaNota).join('\n\n')}\n\n` +
          '💡 _/notes -a <texto> anota; /notes -r <id...|all> remove; -alerta <quando> avisa._'
        : '📝 Nenhuma anotação.\n💡 _Anote com /notes -a <texto>_');
}

async function cmdNote({ msg, args }) {
    await dbPronto;
    const texto = String(args ?? '').trim();
    const [opcao = '', ...palavras] = texto.split(/\s+/);
    const resto = texto.slice(opcao.length).trim();
    const nome = opcao.toLowerCase();

    if (!texto || nome === '-list' || nome === '-l') return listar(msg);
    if (nome === '-add' || nome === '-a') return adicionar(msg, resto);
    if (nome === '-rem' || nome === '-rm' || nome === '-r') return removerNotas(msg, palavras.join(' '), false);
    if (nome === '-alerta') return alertar(msg, resto);

    // Opção que não existe: erro. Sem "-" na frente, o texto todo é uma anotação nova (o mesmo que -add)
    if (nome.startsWith('-')) {
        return msg.reply('❌ Use: /notes [-list] | -add <texto> [-alerta <quando>] | -rem <id...|all> | -alerta ...');
    }

    return adicionar(msg, texto);
}

/*
 * Verificação: um tique por minuto avisa as anotações cujo alerta venceu. Limpa o alerta
 * ANTES de avisar: se o envio falhar, não repete a cada tique.
 */
let verificando = false;

async function verificarNotas() {
    if (verificando || !estado.pronto) return;
    verificando = true;

    try {
        await dbPronto;
        const vencidas = await dbAll('SELECT * FROM notes WHERE alert_at IS NOT NULL AND alert_at <= ? ORDER BY alert_at, id',
            [Date.now()]);

        for (const n of vencidas) {
            await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);

            const destinos = destinosDaNota(n);
            await enviarAosDestinos(destinos,
                `🔔 *ANOTAÇÃO #${n.id}*\n\n${n.text}\n\n📅 Anotada em ${formatarData(n.created_at)}`,
                { assunto: `🔔 Anotação #${n.id}: ${resumirTexto(n.text, 60)}` }
            ).catch(err => printError('/notes -alerta: falha ao avisar:', err.message));

            printInfo(`/notes -alerta disparado: #${n.id}` +
                (destinos.length ? ` → ${destinos.map(d => d.email ?? d.id).join(', ')}` : ''));
        }
    } catch (err) {
        printError('Erro ao verificar os alertas do /notes:', err.message);
    } finally {
        verificando = false;
    }
}

// Chamada no app.js
function iniciarNotas() {
    setInterval(verificarNotas, 60 * 1000);
}

module.exports = {
    cmdNote,
    iniciarNotas,
    verificarNotas
};
