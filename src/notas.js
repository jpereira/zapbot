/*
 * /notes: anotações (tabela notes) e o -alerta, que lembra de uma anotação numa data/hora.
 */

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { MessageMedia } = require('whatsapp-web.js');
const { client } = require('./cliente');
const { NOTES_DIR } = require('./constantes');
const { estado } = require('./estado');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const {
    colunasDoDestino, descreverDestinos, destinoDaLinha, destinosSalvos, enviarAosDestinos, extrairDestinos,
    recipientsDe, resolverDestinos
} = require('./destinos');
const { enviarEmail } = require('./email');
const { printError, printInfo } = require('./log');
const { formatarData, plural, resumirTexto } = require('./util/formatar');
const { gerarPdf } = require('./util/pdf');
const { compilarBusca } = require('./watch/regras');
const { fmtQuando, lerQuando } = require('./util/quando');
const packageJson = require('../package.json');

/*
 * /notes
 *   /notes | -list | -l [#tag...]       → lista as anotações, com o ID, agrupadas por #tag
 *   /notes #tag                         → só as dessa tag (o mesmo que -l #tag)
 *   -search | -s [#tag...] <texto|/regex/flags>
 *                                       → só as que casam (texto sem diferenciar maiúsculas/acentos;
 *                                         o mesmo -q do /show e do /watch); casa também a #tag
 *   -update | -u <id> [#tag] <texto>    → troca o texto (e a tag, se vier uma) da anotação
 *   -tags | -t                          → as tags e quantas anotações cada uma tem
 *   -export | -e [#tag...]              → manda as anotações (ou só as das tags) num PDF
 *   -list | #tag | -export ... -to <destino>...
 *                                       → a lista (ou o PDF) vai nos destinos, como nos outros comandos
 *   /notes [#tag] <texto>               → anota (o mesmo que -add, quando não começa com "-")
 *   (com uma imagem, ou em resposta a uma) /notes [#tag] [<texto>] → guarda a imagem em NOTES_DIR
 *   (em resposta a uma mensagem) /notes [#tag] | -add [#tag] [-alerta ...]
 *                                       → anota o texto da mensagem respondida, com o ↩️ na frente
 *   -add | -a [#tag] <texto>            → anota
 *   -add <texto> -alerta <quando> [-to <destino>]...
 *                                       → anota e avisa na data/hora (o -to funciona como nos outros -alerta)
 *   -rem | -r <id...|#tag...|all>       → remove (-r 1 2 3, -r 1,2,3, -r #casa ou all)
 *   -alerta                             → lista só as anotações com alerta
 *   -alerta <id|#tag...> <quando> [-to ...]
 *                                       → põe (ou troca) o alerta de uma anotação (ou de todas as da tag)
 *   -alerta #tag...                     → lista só os alertas dessas tags
 *   -alerta -rm <id...|#tag...|all>     → tira o alerta, mantendo a anotação
 * O alerta dispara UMA vez, na hora; a anotação continua. Só o dono (onlyAdmin).
 */
const MAX_DIAS = 365;
const ALERTA = /(^|\s)-alerta(?=\s|$)([\s\S]*)$/;

const destinosDaNota = (n) => destinosSalvos(n.recipients, destinoDaLinha(n));
const ondeDoAviso = (destinos) => (destinos.length ? descreverDestinos(destinos) : 'seu privado');
const recuar = (texto) => texto.replace(/\n/g, '\n   ');

const listarNotas = () => dbAll('SELECT * FROM notes ORDER BY id');

const SEM_TAG = 'sem tag';
const SEM_PREVIA = { linkPreview: false };  // listas não mostram thumbnail de link
const lerTag = (t) => t.replace(/^#/, '').toLowerCase();

// "#casa Lembrar do pão" → { tag: 'casa', texto: 'Lembrar do pão' } (a tag só vale no começo)
function separarTag(texto) {
    const m = texto.match(/^#([^\s#]+)(?:\s+([\s\S]*))?$/);
    return m ? { tag: lerTag(m[1]), texto: (m[2] ?? '').trim() } : { tag: null, texto };
}

// "#casa #duvidas" → ['casa', 'duvidas']; null se sobrar algo que não é tag
function soTags(texto) {
    const partes = texto.split(/[\s,]+/).filter(Boolean);
    return partes.length && partes.every(p => /^#[^\s#]+$/.test(p)) ? [...new Set(partes.map(lerTag))] : null;
}

function linhaDaNota(n) {
    const alerta = n.alert_at
        ? `\n   ⏰ ${fmtQuando(n.alert_at)} → ${ondeDoAviso(destinosDaNota(n))}`
        : '';
    const corpo = [n.text, n.media_path && '🖼️ _imagem_'].filter(Boolean).join('\n');
    return `*#${n.id}* ${recuar(corpo)}${alerta}\n   _(${formatarData(n.created_at)})_`;
}

// Os ids do -rem / -alerta -rm: 1 2 3, 1,2,3 ou all. Algum não existe? Nenhum é mexido
function lerIds(texto, notas) {
    const partes = texto.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (partes.includes('all')) return { todos: true, ids: notas.map(n => n.id) };

    const tags = partes.filter(p => p.startsWith('#')).map(lerTag);
    const outras = [...new Set(partes.filter(p => !p.startsWith('#')))].sort((a, b) => a - b);
    const faltando = [
        ...tags.filter(t => !notas.some(n => n.tag === t)).map(t => `#${t}`),
        ...outras.filter(i => !/^\d+$/.test(i) || !notas.some(n => n.id === Number(i)))
    ];
    const ids = new Set([...outras.filter(i => /^\d+$/.test(i)).map(Number),
        ...notas.filter(n => tags.includes(n.tag)).map(n => n.id)]);
    return { ids: [...ids].sort((a, b) => a - b), faltando };
}

async function removerNotas(msg, textoIds, soAlerta) {
    const notas = await listarNotas();
    const { ids, faltando, todos } = lerIds(textoIds, notas);
    const cmd = soAlerta ? '/notes -alerta -rm' : '/notes -rem';

    if (!todos && (!ids.length || faltando.length)) {
        const rotulo = faltando?.every(f => !f.startsWith('#')) ? 'ID' : '';
        await msg.reply(faltando?.length > 1
            ? `❌ ${rotulo}${rotulo ? 's ' : ''}${faltando.join(', ')} não existem. Nada foi mexido; veja a lista com /notes -l`
            : `❌ ${rotulo ? 'ID ' : ''}${faltando?.[0] ?? '?'} não existe. Veja a lista com /notes -l\n💡 _Uso: ${cmd} <id...|#tag...|all>_`);
        return;
    }

    if (soAlerta) {
        const comAlerta = notas.filter(n => ids.includes(n.id) && n.alert_at);
        for (const n of comAlerta) await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);
        await msg.reply(`🔕 ${plural(comAlerta.length, 'alerta removido', 'alertas removidos')}.`);
        return;
    }

    for (const n of notas.filter(x => ids.includes(x.id))) {
        await dbRun('DELETE FROM notes WHERE id = ?', [n.id]);
        if (n.media_path) await fs.remove(n.media_path).catch(err => printError('/notes: imagem não apagada:', err.message));
    }
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

const MARCA_RESPOSTA = '↩️';

// Os 35 primeiros caracteres (numa linha só), com … se tinha mais
function comecoDoTexto(texto) {
    const t = texto.replace(/\s+/g, ' ').trim();
    return t.length > 35 ? `${t.slice(0, 35).trimEnd()}…` : t;
}
const EXTENSOES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// A imagem da própria mensagem ou, em resposta, a da mensagem respondida
const origemDaImagem = (msg, quotedMsg) => [msg, quotedMsg].find(m => m?.hasMedia);

// Baixa e guarda a imagem em NOTES_DIR: { path, mime }, ou { erro } para responder
async function guardarImagem(origem) {
    const media = await origem.downloadMedia().catch(() => null);
    if (!media?.data) return { erro: '❌ Não consegui baixar a mídia.' };
    if (!String(media.mimetype).startsWith('image/')) return { erro: '❌ O /notes guarda só imagens.' };

    const ext = EXTENSOES[media.mimetype] ?? media.mimetype.split('/')[1].replace(/[^a-z0-9]/gi, '') ?? 'img';
    const arquivo = path.join(NOTES_DIR, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
    await fs.outputFile(arquivo, Buffer.from(media.data, 'base64'));
    return { path: arquivo, mime: media.mimetype };
}

// "\n" digitado vira quebra de linha ("\\n" fica como texto)
const comQuebras = (t) => t.replace(/(?<!\\)\\n/g, '\n').replace(/\\\\n/g, '\\n');

async function adicionar(msg, textoDigitado, quotedMsg) {
    const resto = comQuebras(textoDigitado);
    const { destinos: destinosTexto, informado: comDestino, resto: semDestino } = extrairDestinos(resto);
    const m = semDestino.match(ALERTA);
    const separado = separarTag((m ? semDestino.slice(0, m.index) : semDestino).trim());
    const { tag } = separado;
    let { texto } = separado;

    // Sem texto, mas em resposta a uma mensagem: anota o texto dela (se tiver; a imagem vale sozinha)
    const origem = origemDaImagem(msg, quotedMsg);
    if (!texto && quotedMsg) {
        const citado = String(quotedMsg.body ?? '').trim();
        if (!citado && !origem) {
            await msg.reply('❌ A mensagem respondida não tem texto.');
            return;
        }
        if (citado) texto = `${MARCA_RESPOSTA} ${citado}`;
    }

    if (!texto && !origem) {
        await msg.reply('❌ Use: /notes -add [#tag] <texto> [-alerta <quando> [-to <destino>]...]');
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

    let imagem = null;
    if (origem) {
        imagem = await guardarImagem(origem);
        if (imagem.erro) {
            await msg.reply(imagem.erro);
            return;
        }
    }

    const c = colunasDoDestino(destinos[0]);
    const r = await dbRun(
        `INSERT INTO notes (text, tag, media_path, media_mime, created_at, alert_at, dest_id, dest_name, dest_is_group,
                            dest_email, recipients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [texto, tag, imagem?.path ?? null, imagem?.mime ?? null, Date.now(), alerta, c.dest_id, c.dest_name,
            c.dest_is_group, c.dest_email, recipientsDe(destinos)]
    );

    // Só o aviso de que anotou (nº, #tag, o começo do texto): o corpo você já mandou
    const resumo = [`📝 *#${r.lastID}*`, tag && `#${tag}`, imagem && '🖼️', texto && comecoDoTexto(texto)]
        .filter(Boolean).join(' · ');
    await msg.reply(resumo + (alerta ? `\n⏰ ${fmtQuando(alerta)} → ${ondeDoAviso(destinos)}` : ''),
        undefined, SEM_PREVIA);
}

async function atualizar(msg, resto, quotedMsg) {
    const m = resto.match(/^#?(\d+)(?:\s+([\s\S]*))?$/);
    if (!m) {
        await msg.reply('❌ Use: /notes -update <id> [#tag] <novo texto>');
        return;
    }

    const nota = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
    if (!nota) {
        await msg.reply(`❌ ID ${m[1]} não existe. Veja a lista com /notes -l`);
        return;
    }

    let { tag, texto } = separarTag(comQuebras(m[2] ?? '').trim());
    if (!texto && quotedMsg?.body?.trim()) texto = `${MARCA_RESPOSTA} ${quotedMsg.body.trim()}`;
    if (!texto) {
        await msg.reply('❌ Use: /notes -update <id> [#tag] <novo texto>');
        return;
    }

    tag ??= nota.tag;
    await dbRun('UPDATE notes SET text = ?, tag = ? WHERE id = ?', [texto, tag, nota.id]);
    await msg.reply(`✏️ *#${nota.id}*${tag ? ` · #${tag}` : ''} · ${comecoDoTexto(texto)}`, undefined, SEM_PREVIA);
}

async function alertar(msg, resto) {
    const { destinos: destinosTexto, informado: comDestino, resto: semDestino } = extrairDestinos(resto);
    const texto = semDestino.trim();

    if (/^-(rm|rem|r)(\s|$)/.test(texto)) {
        await removerNotas(msg, texto.replace(/^-\S+/, ''), true);
        return;
    }

    // "#tag [#tag...] [<quando>]" mira as anotações dessas tags; "<id> <quando>", uma só
    const porTag = texto.match(/^(#[^\s#]+(?:[\s,]+#[^\s#]+)*)(?:\s+([\s\S]+))?$/);
    const tags = porTag ? [...new Set(porTag[1].split(/[\s,]+/).map(lerTag))] : [];
    const quandoTexto = porTag ? (porTag[2] ?? '').trim() : '';

    if (!texto || (porTag && !quandoTexto)) {
        if (comDestino) {
            await msg.reply('❌ O -to só vale ao criar o alerta: /notes -alerta <id|#tag> amanhã 9h -to /Grupo L200/');
            return;
        }
        const comAlerta = (await listarNotas()).filter(n => n.alert_at && (!tags.length || tags.includes(n.tag)));
        const rotulo = tags.length ? ` ${tags.map(t => `#${t}`).join(' ')}` : '';
        await msg.reply(comAlerta.length
            ? `🔔 *ALERTAS DAS ANOTAÇÕES${rotulo}*\n\n${comAlerta.map(linhaDaNota).join('\n\n')}\n\n` +
              '💡 _Tire com /notes -alerta -rm <id...|#tag...|all>_'
            : `🔔 Nenhuma anotação${rotulo ? ` em${rotulo}` : ''} com alerta.\n💡 _Crie com /notes -alerta <id|#tag> <quando>_`,
        undefined, SEM_PREVIA);
        return;
    }

    const m = porTag ? null : texto.match(/^(\d+)\s+([\s\S]+)$/);
    if (!porTag && !m) {
        await msg.reply('❌ Use: /notes -alerta <id|#tag> <quando> [-to <destino>]...');
        return;
    }

    let alvos;
    if (porTag) {
        const todas = await listarNotas();
        const semNotas = tags.filter(t => !todas.some(n => n.tag === t));
        if (semNotas.length) {
            await msg.reply(`❌ Nenhuma anotação em ${semNotas.map(t => `#${t}`).join(' ')}. Veja as tags com /notes -tags`);
            return;
        }
        alvos = todas.filter(n => tags.includes(n.tag));
    } else {
        const nota = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
        if (!nota) {
            await msg.reply(`❌ ID ${m[1]} não existe. Veja a lista com /notes -l`);
            return;
        }
        alvos = [nota];
    }

    const quando = lerDataDoAlerta((porTag ? quandoTexto : m[2]).trim());
    if (quando.erro) {
        await msg.reply(quando.erro);
        return;
    }

    const destinos = await destinosDoComando(msg, destinosTexto, comDestino);
    if (!destinos) return;

    const c = colunasDoDestino(destinos[0]);
    for (const n of alvos) {
        await dbRun(
            `UPDATE notes SET alert_at = ?, dest_id = ?, dest_name = ?, dest_is_group = ?, dest_email = ?, recipients = ?
             WHERE id = ?`,
            [quando.ms, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinos), n.id]
        );
    }

    const onde = `⏰ ${fmtQuando(quando.ms)} → ${ondeDoAviso(destinos)}`;
    await msg.reply(alvos.length === 1 && !porTag
        ? `🔔 *Alerta criado* na anotação #${alvos[0].id}\n${resumirTexto(alvos[0].text, 80)}\n${onde}`
        : `🔔 *Alerta criado* em ${plural(alvos.length, 'anotação', 'anotações')} de ` +
          `${tags.map(t => `#${t}`).join(' ')} (${alvos.map(n => `#${n.id}`).join(', ')})\n${onde}`,
    undefined, SEM_PREVIA);
}

// Agrupa pela tag (ordem alfabética), com as sem tag por último
function agruparPorTag(notas) {
    const grupos = new Map();
    for (const n of notas) grupos.set(n.tag ?? '', [...(grupos.get(n.tag ?? '') ?? []), n]);

    const chaves = [...grupos.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const soSemTag = chaves.length === 1 && chaves[0] === '';
    return chaves.map(k => {
        const itens = grupos.get(k).map(linhaDaNota).join('\n\n');
        return soSemTag ? itens : `*${k ? `#${k}` : SEM_TAG}* (${grupos.get(k).length})\n\n${itens}`;
    }).join('\n\n──────────\n\n');
}

// Os destinos do -to de uma lista/exportação: undefined sem -to, null se não resolveu (já respondeu)
async function destinosDoEnvio(msg, destinosTexto, comDestino) {
    if (!comDestino) return undefined;
    return resolverDestinos(msg, destinosTexto, { aceitaEmail: true });
}

const DICAS = '\n\n💡 *Dicas*\n' +
    '/notes -a [#tag] <texto> anota\n' +
    '/notes -r <id...|#tag...|all> remove\n' +
    '-alerta <quando> avisa.';

// Responde no chat ou, com -to, manda nos destinos (e responde que mandou)
async function entregarTexto(msg, destinos, texto, assunto, dica = '') {
    if (!destinos) {
        await msg.reply(`${texto}${dica}`, undefined, SEM_PREVIA);
        return;
    }
    await enviarAosDestinos(destinos, texto, { assunto, opcoes: SEM_PREVIA })
        .then(() => msg.reply(`📝 Anotações enviadas em ${descreverDestinos(destinos)}.`))
        .catch(err => msg.reply(`❌ Não consegui enviar as anotações: ${err.message}`));
}

// "[#tag...] <texto|/regex/flags>" do -search → { tags, busca }
function lerBusca(texto) {
    const m = texto.trim().match(/^((?:#[^\s#]+\s+)*)([\s\S]*)$/);
    return {
        tags: m[1].split(/\s+/).filter(Boolean).map(lerTag),
        busca: m[2].trim().replace(/^"([\s\S]*)"$/, '$1')
    };
}

async function listar(msg, filtro = '', comBusca = false) {
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(filtro);
    let tags = resto.trim() ? soTags(resto) : [];
    let busca = '';
    let testar = null;

    if (comBusca) {
        ({ tags, busca } = lerBusca(resto));
        if (!busca) {
            await msg.reply('❌ Use: /notes -search [#tag...] <texto|/regex/flags> [-to <destino>]...');
            return;
        }
        try {
            testar = compilarBusca(busca);
        } catch (err) {
            await msg.reply(`❌ ${err.message}`);
            return;
        }
    } else if (!tags) {
        await msg.reply('❌ Use: /notes -l [#tag...] [-to <destino>]...');
        return;
    }

    const destinos = await destinosDoEnvio(msg, destinosTexto, comDestino);
    if (destinos === null) return;

    // A busca olha o texto e também a #tag (/notes -s casa acha as da #casa)
    const todas = await listarNotas();
    const notas = todas.filter(n => (!tags.length || tags.includes(n.tag)) &&
        (!testar || testar(n.text) || (n.tag && testar(`#${n.tag}`))));
    const rotulo = tags.length ? ` ${tags.map(t => `#${t}`).join(' ')}` : '';
    const achado = busca ? ` 🔎 ${resumirTexto(busca, 40)}` : '';

    if (!notas.length) {
        await msg.reply(tags.length || busca
            ? `📝 Nenhuma anotação${rotulo ? ` em${rotulo}` : ''}${busca ? ` com 🔎 ${resumirTexto(busca, 40)}` : ''}.`
            : '📝 Nenhuma anotação.\n💡 _Anote com /notes -a [#tag] <texto>_', undefined, SEM_PREVIA);
        return;
    }

    await entregarTexto(msg, destinos, `📝 *ANOTAÇÕES${rotulo}${achado}* (${notas.length})\n\n${agruparPorTag(notas)}`,
        `📝 Anotações${rotulo}${achado}`, DICAS);
}

// -tags: cada tag com a quantidade de anotações (as sem tag por último)
async function listarTags(msg, filtro = '') {
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(filtro);
    if (resto.trim()) {
        await msg.reply('❌ Use: /notes -tags [-to <destino>]...');
        return;
    }

    const destinos = await destinosDoEnvio(msg, destinosTexto, comDestino);
    if (destinos === null) return;

    const notas = await listarNotas();
    if (!notas.length) {
        await msg.reply('📝 Nenhuma anotação.\n💡 _Anote com /notes -a [#tag] <texto>_');
        return;
    }

    const contagem = new Map();
    for (const n of notas) contagem.set(n.tag ?? '', (contagem.get(n.tag ?? '') ?? 0) + 1);
    const chaves = [...contagem.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const linhas = chaves.map(k => `${k ? `#${k}` : SEM_TAG}: ${contagem.get(k)}`);

    await entregarTexto(msg, destinos,
        `🏷️ *TAGS* (${chaves.filter(Boolean).length})\n\n${linhas.join('\n')}\n\n📝 ${plural(notas.length, 'anotação', 'anotações')}`,
        '🏷️ Tags das anotações', '\n\n💡 _/notes #tag mostra as de uma tag_');
}

// 20261027_1530, na hora de Brasília (a mesma do formatarData)
function carimboDeArquivo(ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(ms).map(x => [x.type, x.value]));
    return `${p.year}${p.month}${p.day}_${p.hour}${p.minute}`;
}

async function exportar(msg, filtro = '') {
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(filtro);
    const tags = resto.trim() ? soTags(resto) : [];
    if (!tags) {
        await msg.reply('❌ Use: /notes -export [#tag...] [-to <destino>]...');
        return;
    }

    const destinos = await destinosDoEnvio(msg, destinosTexto, comDestino);
    if (destinos === null) return;

    const todas = await listarNotas();
    const notas = tags.length ? todas.filter(n => tags.includes(n.tag)) : todas;
    if (!notas.length) {
        await msg.reply(tags.length ? `📝 Nenhuma anotação em ${tags.map(t => `#${t}`).join(' ')}.` : '📝 Nenhuma anotação.');
        return;
    }

    const agora = Date.now();
    const rotulo = tags.length ? ` ${tags.map(t => `#${t}`).join(' ')}` : '';
    const grupos = new Map();
    for (const n of notas) grupos.set(n.tag ?? '', [...(grupos.get(n.tag ?? '') ?? []), n]);
    const chaves = [...grupos.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));

    const blocos = [{
        tipo: 'texto',
        texto: `${plural(notas.length, 'anotação', 'anotações')}${rotulo ? ` em${rotulo}` : ''}`
    }];
    for (const k of chaves) {
        const itens = grupos.get(k);
        if (!(chaves.length === 1 && k === '')) {
            blocos.push({ tipo: 'titulo', texto: `${k ? `#${k}` : SEM_TAG} (${itens.length})` });
        }
        for (const n of itens) {
            const alerta = (n.media_path ? ' · com imagem' : '') + (n.alert_at ? ` · alerta ${fmtQuando(n.alert_at)}` : '');
            blocos.push({ tipo: 'texto', texto: `#${n.id}  ${n.text.replace(MARCA_RESPOSTA, '[resp.]')}`, recuo: 0 });
            blocos.push({ tipo: 'meta', texto: `Anotada em ${formatarData(n.created_at)}${alerta}` });
            blocos.push({ tipo: 'espaco', altura: 8 });
        }
    }

    const pdf = gerarPdf({
        titulo: `ZapBot · Anotações${rotulo}`,
        direita: formatarData(agora),
        rodape: `ZapBot ${packageJson.version} · ${os.hostname()} · gerado em ${formatarData(agora)}`,
        blocos
    });
    const sufixo = tags.length ? `tag-${tags.map(t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/gi, '_')).join('-')}_` : '';
    const nome = `ZapBot_notes_${sufixo}${carimboDeArquivo(agora)}.pdf`;

    const caption = `📝 *ANOTAÇÕES${rotulo}* (${notas.length}) em PDF`;
    const media = new MessageMedia('application/pdf', pdf.toString('base64'), nome);

    if (!destinos) {
        await msg.reply(media, undefined, { sendMediaAsDocument: true, caption });
        return;
    }

    // Os e-mails de todos os -to num e-mail só; os chats, um a um (um que falha não segura os outros)
    const emails = [...new Set(destinos.filter(d => d.email).flatMap(d => d.email.split(/\s*,\s*/)))];
    const falhas = [];
    const enviados = [];

    if (emails.length) {
        await enviarEmail({
            para: emails, assunto: `📝 Anotações${rotulo}`, texto: caption.replace(/\*/g, ''),
            anexos: [{ filename: nome, content: pdf, contentType: 'application/pdf' }]
        }).then(() => enviados.push(...destinos.filter(d => d.email)))
            .catch(err => falhas.push(`e-mail: ${err.message}`));
    }
    for (const d of destinos.filter(x => x.id)) {
        await client.sendMessage(d.id, media, { sendMediaAsDocument: true, caption })
            .then(() => enviados.push(d))
            .catch(err => falhas.push(`${descreverDestinos([d])}: ${err.message}`));
    }

    if (enviados.length) await msg.reply(`📝 PDF das anotações enviado em ${descreverDestinos(enviados)}.`);
    if (falhas.length) await msg.reply(`❌ Não consegui enviar o PDF: ${falhas.join('; ')}`);
}

async function cmdNote({ msg, args, quotedMsg }) {
    await dbPronto;
    const texto = String(args ?? '').trim();
    const [opcao = '', ...palavras] = texto.split(/\s+/);
    const resto = texto.slice(opcao.length).trim();
    const nome = opcao.toLowerCase();

    // O -to das listas/PDF: "/notes -to X", "/notes #casa -to X", "-l ... -to X", "-e ... -to X"
    const { informado: comDestino, resto: semDestino } = extrairDestinos(texto);
    const tagsDoTexto = soTags(semDestino);

    if (!texto) return quotedMsg || msg.hasMedia ? adicionar(msg, '', quotedMsg) : listar(msg);
    if (nome === '-list' || nome === '-l') return listar(msg, resto);
    if (nome === '-update' || nome === '-u') return atualizar(msg, resto, quotedMsg);
    if (nome === '-search' || nome === '-s') return listar(msg, resto, true);
    if (nome === '-tags' || nome === '-t') return listarTags(msg, resto);
    if (nome === '-export' || nome === '-e') return exportar(msg, resto);
    if (comDestino && !semDestino.trim()) return listar(msg, texto);
    // Respondendo uma mensagem, "/notes #tag" anota o texto dela nessa tag em vez de filtrar
    if (tagsDoTexto) return (quotedMsg || msg.hasMedia) && tagsDoTexto.length === 1 ? adicionar(msg, texto, quotedMsg) : listar(msg, texto);
    if (nome === '-add' || nome === '-a') return adicionar(msg, resto, quotedMsg);
    if (comDestino && (nome === '-rem' || nome === '-rm' || nome === '-r')) {
        return msg.reply('❌ O -to não vale ao remover. Ele serve para -list, #tag e -export (e, no -add, para o -alerta).');
    }
    if (nome === '-rem' || nome === '-rm' || nome === '-r') return removerNotas(msg, palavras.join(' '), false);
    if (nome === '-alerta') return alertar(msg, resto);

    // Opção que não existe: erro. Sem "-" na frente, o texto todo é uma anotação nova (o mesmo que -add)
    if (nome.startsWith('-')) {
        return msg.reply('❌ Use: /notes [-list] [#tag] [-to ...] | -search <texto|/regex/> | -tags | -update <id> <texto> | -export [#tag] [-to ...] | -add [#tag] <texto> [-alerta <quando>] | -rem <id...|#tag...|all> | -alerta ...');
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
                { assunto: `🔔 Anotação #${n.id}: ${resumirTexto(n.text, 60)}`, opcoes: SEM_PREVIA }
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
