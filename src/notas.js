/*
 * /notes: anotações (tabela notes) e o -alerta, que lembra de uma anotação numa data/hora.
 */

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
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
const { formatarData, paraMs, resumirTexto } = require('./util/formatar');
const { idioma, t } = require('./i18n');
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
 *   -move | -m #tag #nova               → renomeia a tag (se #nova já existe, junta as duas)
 *   -desc | -d #tag [<texto>]           → descrição da tag (sem texto, mostra; -d #tag -rm, apaga)
 *   -view | -v <id...|#tag...> [-to ...] → mostra a anotação com a imagem (texto, se não tiver)
 *   -export | -e [#tag...]              → manda as anotações (ou só as das tags) num PDF, com as imagens
 *   -list | #tag | -export ... -to <destino>...
 *                                       → a lista (ou o PDF) vai nos destinos, como nos outros comandos
 *   /notes #tag <texto>                 → anota (o mesmo que -add, quando não começa com "-"); a #tag é obrigatória
 *   (com uma imagem, ou em resposta a uma) /notes #tag [<texto>] → guarda a mídia em NOTES_DIR
 *   (em resposta a uma mensagem) /notes #tag | -add #tag [-alerta ...]
 *                                       → anota o texto da mensagem respondida, com o ↩️ na frente
 *   -add | -a #tag <texto>            → anota
 *   -add <texto> -alerta <quando> [-to <destino>]...
 *                                       → anota e avisa na data/hora (o -to funciona como nos outros -alerta)
 *   -rm | -r <id...|#tag...|all>       → remove (-r 1 2 3, -r 1,2,3, -r #casa ou all)
 *   -alerta                             → lista só as anotações com alerta
 *   -alerta <id|#tag...> <quando> [-to ...]
 *                                       → coloca (ou troca) o alerta de uma anotação (ou de todas as da tag)
 *   -alerta #tag...                     → lista só os alertas dessas tags
 *   -alerta -rm <id...|#tag...|all>     → tira o alerta, mantendo a anotação
 * O alerta dispara UMA vez, na hora; a anotação continua. Só o dono (role owner).
 */
const MAX_DIAS = 365;
const ALERTA = /(^|\s)-alerta(?=\s|$)([\s\S]*)$/;

const destinosDaNota = (n) => destinosSalvos(n.recipients, destinoDaLinha(n));
const ondeDoAviso = (destinos) => (destinos.length ? descreverDestinos(destinos) : t('notes.yourPrivate'));
// Plural pelo n === 1 (o Intl do pt trata o 0 como singular): {count} é o número mostrado
const contar = (chave, n, vars = {}) => t(chave, { ...vars, n: n === 1 ? 1 : 2, count: n });
const recuar = (texto) => texto.replace(/\n(?=[^\n])/g, '\n   ');

const listarNotas = () => dbAll('SELECT * FROM notes ORDER BY id');

const semTag = () => t('notes.noTag');
const SEM_PREVIA = { linkPreview: false };  // listas não mostram thumbnail de link
const lerTag = (t) => t.replace(/^#/, '').toLowerCase();

// "#casa Lembrar do pão" → { tag: 'casa', texto: 'Lembrar do pão' } (a tag só vale no começo)
function separarTag(texto) {
    const m = texto.match(/^#([^\s#]+)(?:\s+([\s\S]*))?$/);
    return m ? { tag: lerTag(m[1]), texto: (m[2] ?? '').trim() } : { tag: null, texto };
}

// Tag parcial vale: #idei acha #ideias (a exata ganha; senão começa com; senão contém).
// Só para ler (lista, busca, PDF): remover e alertar pedem a tag inteira
function resolverTags(tags, notas) {
    const existentes = [...new Set(notas.map(n => n.tag).filter(Boolean))];
    const achar = (t) => {
        if (existentes.includes(t)) return [t];
        const comeca = existentes.filter(e => e.startsWith(t));
        return comeca.length ? comeca : existentes.filter(e => e.includes(t));
    };
    return [...new Set(tags.flatMap(t => { const r = achar(t); return r.length ? r : [t]; }))];
}

// "#casa #duvidas" → ['casa', 'duvidas']; null se sobrar algo que não é tag
function soTags(texto) {
    const partes = texto.split(/[\s,]+/).filter(Boolean);
    return partes.length && partes.every(p => /^#[^\s#]+$/.test(p)) ? [...new Set(partes.map(lerTag))] : null;
}

/*
 * O texto da anotação em partes: o título (a primeira linha), o resto e os links. Todo link
 * http(s) sai de onde estava (e o "Leia mais em:" que ficou pendurado) e vai para o fim.
 */
function partesDoTexto(texto) {
    const links = [];
    const linhas = String(texto ?? '').split('\n').map(linha => {
        if (!/https?:\/\//i.test(linha)) return linha.trimEnd();
        const sem = linha.replace(/\(?(https?:\/\/\S+)/gi, (_, achado) => {
            let url = achado;
            // Pontuação colada no fim não é do link (o ")" é, se abriu um "(" na própria URL)
            while (/[.,;:!?)”"'’]$/.test(url) && !(url.endsWith(')') && url.includes('('))) url = url.slice(0, -1);
            links.push(url);
            return '';
        });
        return sem.replace(/\s*(?:[-–—.…]+\s*)*(?:veja mais|leia mais|leia a mat[eé]ria completa)[^\n]*$/i, '')
            .replace(/[\s:]+$/, '').replace(/ {2,}/g, ' ');
    });
    const corpo = linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const [titulo = '', ...resto] = corpo.split('\n');
    return {
        // Um *negrito* que já veio no texto não dobra
        titulo: titulo.trim().replace(/^\*(.+)\*$/, '$1'),
        corpo: resto.join('\n').trim(),
        links: [...new Set(links)]
    };
}

/*
 * A primeira linha vira o título em negrito (o único), o resto vem como estava e os links
 * ficam no fim, sob "🔗 Links". plano: sem o *negrito* (bloco ``` e e-mail).
 */
function formatarTexto(texto, plano = false) {
    const { titulo, corpo, links } = partesDoTexto(texto);
    return [titulo && (plano ? titulo : `*${titulo}*`), corpo, links.length && `🔗 Links\n${links.map(l => `• ${l}`).join('\n')}`]
        .filter(Boolean).join('\n\n');
}

// 10:30 04/11/2026 (hora, depois dia/mês/ano, sem os segundos)
function dataCurta(valor) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(paraMs(valor)).map(x => [x.type, x.value]));
    const dia = idioma() === 'pt_BR' ? `${p.day}/${p.month}/${p.year}` : `${p.month}/${p.day}/${p.year}`;
    return `${p.hour}:${p.minute} ${dia}`;
}

function linhaDaNota(n, plano = false, posicao = 0) {
    const alerta = n.alert_at
        ? `\n   ⏰ ${fmtQuando(n.alert_at)} → ${ondeDoAviso(destinosDaNota(n))}`
        : '';
    const corpo = [formatarTexto(n.text, plano), n.media_path && rotuloDaMidia(n, plano)].filter(Boolean).join('\n');
    // plano: dentro do bloco ``` o *negrito* e o _italico_ aparecem como estão
    // Com posição (lista): "1. ..." no começo e o id no rodapé, "🕐 data, #id"
    const ini = posicao ? `${posicao}.` : `#${n.id}`;
    const fim = posicao ? `${dataCurta(n.created_at)}, #${n.id}` : dataCurta(n.created_at);
    return plano ? `${ini} ${recuar(corpo)}${alerta}\n   🕐 ${fim}`
        : `${ini} ${corpo}${alerta.replace(/\n {3}/, '\n')}\n🕐 _${fim}_`;
}

// Os ids do -rm / -alerta -rm: 1 2 3, 1,2,3 ou all. Algum não existe? Nenhum é mexido
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
    const cmd = soAlerta ? '/notes -alerta -rm' : '/notes -rm';

    if (!todos && (!ids.length || faltando.length)) {
        const rotulo = faltando?.every(f => !f.startsWith('#')) ? 'ID' : '';
        await msg.reply(faltando?.length > 1
            ? t('notes.rm.missingMany', { what: rotulo ? t('notes.idsLabel', { list: faltando.join(', ') }) : faltando.join(', ') })
            : t('notes.rm.missingOne', { what: rotulo ? t('notes.idLabel', { id: faltando?.[0] ?? '?' }) : (faltando?.[0] ?? '?'), cmd }));
        return;
    }

    if (soAlerta) {
        const comAlerta = notas.filter(n => ids.includes(n.id) && n.alert_at);
        for (const n of comAlerta) await dbRun('UPDATE notes SET alert_at = NULL WHERE id = ?', [n.id]);
        await msg.reply(contar('notes.rm.alertsRemoved', comAlerta.length));
        return;
    }

    for (const n of notas.filter(x => ids.includes(x.id))) {
        await dbRun('DELETE FROM notes WHERE id = ?', [n.id]);
        if (n.media_path) await fs.remove(n.media_path).catch(err => printError('/notes: imagem não apagada:', err.message));
    }
    await msg.reply(contar('notes.rm.removed', ids.length));
}

// "<quando>" inteiro (sem sobra) → ms, ou o erro para responder
function lerDataDoAlerta(texto) {
    const palavras = texto.split(/\s+/).filter(Boolean);
    const q = palavras.length ? lerQuando(palavras) : null;
    const agora = Date.now();

    if (!q || q.usadas !== palavras.length) {
        return { erro: t('notes.when.invalid', { text: texto }) };
    }
    if (q.ms <= agora) return { erro: t('notes.when.past', { when: fmtQuando(q.ms) }) };
    if (q.ms > agora + MAX_DIAS * 86400_000) return { erro: t('notes.when.tooFar', { days: MAX_DIAS }) };
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

// Qualquer mídia da própria mensagem ou, em resposta, a da mensagem respondida
const origemDaMidia = (msg, quotedMsg) => [msg, quotedMsg].find(m => m?.hasMedia);

const ehImagem = (mime) => String(mime ?? '').startsWith('image/');

// O arquivo guardado é "<hora>_<sorteio>_<nome>": o nome original volta ao enviar
const nomeOriginal = (arquivo) => path.basename(arquivo).replace(/^\d+_[a-z0-9]+_/, '');

// 🖼️ imagem, 🎬 vídeo, 🎵 áudio ou 📎 nome do arquivo (documento e o resto)
function rotuloDaMidia(n, plano = false) {
    const mime = String(n.media_mime ?? '');
    const italico = (t) => (plano ? t : `_${t}_`);
    if (ehImagem(mime)) return `🖼️ ${italico(t('notes.media.image'))}`;
    if (mime.startsWith('video/')) return `🎬 ${italico(t('notes.media.video'))}`;
    if (mime.startsWith('audio/')) return `🎵 ${italico(t('notes.media.audio'))}`;
    return `📎 ${italico(nomeOriginal(n.media_path))}`;
}

// Baixa e guarda a mídia em NOTES_DIR: { path, mime }, ou { erro } para responder
async function guardarMidia(origem) {
    const media = await origem.downloadMedia().catch(() => null);
    if (!media?.data) return { erro: t('notes.media.downloadFail') };

    const mime = String(media.mimetype ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
    // O nome do documento, se veio (sem caminho e sem caracteres estranhos); senão, "arquivo.<ext>"
    const ext = EXTENSOES[mime] ?? ((mime.split('/')[1] ?? '').replace(/[^a-z0-9]/g, '') || 'bin');
    const nome = path.basename(String(media.filename ?? '')).replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
    const arquivo = path.join(NOTES_DIR,
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${nome || `arquivo.${ext}`}`);
    await fs.outputFile(arquivo, Buffer.from(media.data, 'base64'));
    return { path: arquivo, mime };
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

    // A sintaxe é sempre /notes #tag <texto>: sem tag não anota
    if (!tag) {
        await msg.reply(`${t('notes.add.syntax')}\n${t('notes.add.missingTag')}`, undefined, SEM_PREVIA);
        return;
    }

    // Sem texto, mas em resposta a uma mensagem: anota o texto dela (se tiver; a mídia vale sozinha)
    const origem = origemDaMidia(msg, quotedMsg);
    if (!texto && quotedMsg) {
        const citado = String(quotedMsg.body ?? '').trim();
        if (!citado && !origem) {
            await msg.reply(t('notes.add.quotedNoText'));
            return;
        }
        if (citado) texto = `${MARCA_RESPOSTA} ${citado}`;
    }

    if (!texto && !origem) {
        await msg.reply(t('notes.add.noText'), undefined, SEM_PREVIA);
        return;
    }

    if (comDestino && !m) {
        await msg.reply(t('notes.add.toNeedsAlert'));
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
        imagem = await guardarMidia(origem);
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
    const resumo = [`📝 *#${r.lastID}*`, tag && `#${tag}`, imagem && rotuloDaMidia({ media_mime: imagem.mime, media_path: imagem.path }, true).split(' ')[0], texto && comecoDoTexto(texto)]
        .filter(Boolean).join(' · ');
    await msg.reply(resumo + (alerta ? `\n⏰ ${fmtQuando(alerta)} → ${ondeDoAviso(destinos)}` : ''),
        undefined, SEM_PREVIA);
}

async function atualizar(msg, resto, quotedMsg) {
    const m = resto.match(/^#?(\d+)(?:\s+([\s\S]*))?$/);
    if (!m) {
        await msg.reply(t('notes.update.usage'));
        return;
    }

    const nota = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
    if (!nota) {
        await msg.reply(t('notes.idNotFound', { id: m[1] }));
        return;
    }

    let { tag, texto } = separarTag(comQuebras(m[2] ?? '').trim());
    if (!texto && quotedMsg?.body?.trim()) texto = `${MARCA_RESPOSTA} ${quotedMsg.body.trim()}`;
    if (!texto) {
        await msg.reply(t('notes.update.usage'));
        return;
    }

    tag ??= nota.tag;
    await dbRun('UPDATE notes SET text = ?, tag = ? WHERE id = ?', [texto, tag, nota.id]);
    await msg.reply(`✏️ *#${nota.id}*${tag ? ` · #${tag}` : ''} · ${comecoDoTexto(texto)}`, undefined, SEM_PREVIA);
}

async function alertar(msg, resto) {
    const { destinos: destinosTexto, informado: comDestino, resto: semDestino } = extrairDestinos(resto);
    const texto = semDestino.trim();

    if (/^-(rm|r)(\s|$)/.test(texto)) {
        await removerNotas(msg, texto.replace(/^-\S+/, ''), true);
        return;
    }

    // "#tag [#tag...] [<quando>]" mira as anotações dessas tags; "<id> <quando>", uma só
    const porTag = texto.match(/^(#[^\s#,]+(?:[\s,]+#[^\s#,]+)*)(?:\s+([\s\S]+))?$/);
    const tags = porTag ? [...new Set(porTag[1].split(/[\s,]+/).map(lerTag))] : [];
    const quandoTexto = porTag ? (porTag[2] ?? '').trim() : '';

    if (!texto || (porTag && !quandoTexto)) {
        if (comDestino) {
            await msg.reply(t('notes.alert.toOnlyCreate'));
            return;
        }
        const todasNotas = await listarNotas();
        const tagsAchadas = resolverTags(tags, todasNotas);
        const comAlerta = todasNotas.filter(n => n.alert_at && (!tags.length || tagsAchadas.includes(n.tag)));
        const rotulo = tags.length ? ` ${tagsAchadas.map(t => `#${t}`).join(' ')}` : '';
        await msg.reply(comAlerta.length
            ? `${t('notes.alert.listTitle', { tags: rotulo })}\n\n${comAlerta.map(linhaDaNota).join('\n\n')}\n\n` +
              t('notes.alert.listHint')
            : `${rotulo ? t('notes.alert.noneIn', { tags: rotulo }) : t('notes.alert.none')}\n${t('notes.alert.createHint')}`,
        undefined, SEM_PREVIA);
        return;
    }

    const m = porTag ? null : texto.match(/^(\d+)\s+([\s\S]+)$/);
    if (!porTag && !m) {
        await msg.reply(t('notes.alert.usage'));
        return;
    }

    let alvos;
    if (porTag) {
        const todas = await listarNotas();
        const semNotas = tags.filter(t => !todas.some(n => n.tag === t));
        if (semNotas.length) {
            await msg.reply(t('notes.alert.noNotesInTags', { tags: semNotas.map(x => `#${x}`).join(' ') }));
            return;
        }
        alvos = todas.filter(n => tags.includes(n.tag));
    } else {
        const nota = await dbGet('SELECT * FROM notes WHERE id = ?', [Number(m[1])]);
        if (!nota) {
            await msg.reply(t('notes.idNotFound', { id: m[1] }));
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
        ? t('notes.alert.createdOne', { id: alvos[0].id, text: resumirTexto(alvos[0].text, 80), where: onde })
        : t('notes.alert.createdMany', { notes: contar('notes.countNotes', alvos.length), tags: tags.map(x => `#${x}`).join(' '),
            ids: alvos.map(n => `#${n.id}`).join(', '), where: onde }),
    undefined, SEM_PREVIA);
}

// Agrupa pela tag (ordem alfabética), com as sem tag por último
const descricoesDasTags = async () => new Map((await dbAll('SELECT tag, description FROM note_tags'))
    .map(r => [r.tag, r.description]));

// Quantas têm 🖼️ mídia, ⏰ alerta e 🔗 link: "· 🖼️ 2 · ⏰ 1 · 🔗 98" (só o que tem)
function resumoDasNotas(notas) {
    const conta = [['🖼️', n => n.media_path], ['⏰', n => n.alert_at], ['🔗', n => partesDoTexto(n.text).links.length]]
        .map(([icone, tem]) => [icone, notas.filter(tem).length]).filter(([, qtd]) => qtd);
    return conta.map(([icone, qtd]) => ` · ${icone} ${qtd}`).join('');
}

// Uma linha por nota, por dia: "#5 Título 🔗 · 19:15" (a mídia, o alerta e os links viram ícones)
function linhasCompactas(notas) {
    const saida = [];
    let diaAtual = '';
    for (const n of notas) {
        const [hora, data] = dataCurta(n.created_at).split(' ');
        if (data !== diaAtual) {
            diaAtual = data;
            saida.push(`${saida.length ? '\n' : ''}📆 ${data}`);
        }
        const { titulo, links } = partesDoTexto(n.text);
        const base = titulo || links[0]?.replace(/^https?:\/\/(www\.)?/, '') || (n.media_path ? rotuloDaMidia(n, true).replace(/^\S+ /, '') : '');
        const marcas = [n.media_path && '🖼️', n.alert_at && '⏰', links.length && '🔗'].filter(Boolean).join(' ');
        saida.push(`#${n.id} ${resumirTexto(base, 60)}${marcas && ` ${marcas}`} · ${hora}`);
    }
    return saida.join('\n');
}

/*
 * Um texto por tag (cada uma vai numa mensagem). plano: dentro do bloco ```; limpo: sem o bloco,
 * com o resumo (🖼️ ⏰ 🔗) no cabeçalho da tag; compacto: uma linha por nota, agrupadas por dia.
 */
function agruparPorTag(notas, descricoes = new Map(), { plano = true, limpo = false, compacto = false } = {}) {
    const grupos = new Map();
    for (const n of notas) grupos.set(n.tag ?? '', [...(grupos.get(n.tag ?? '') ?? []), n]);

    const chaves = [...grupos.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const soSemTag = chaves.length === 1 && chaves[0] === '';
    return chaves.map(k => {
        const doGrupo = grupos.get(k);
        const itens = compacto ? linhasCompactas(doGrupo) : doGrupo.map((n, i) => linhaDaNota(n, plano, i + 1)).join('\n\n');
        const desc = descricoes.get(k);
        if (soSemTag && !limpo) return itens;
        const resumo = limpo || compacto ? resumoDasNotas(doGrupo) : '';
        return `🏷️ ${k ? (limpo || compacto ? k : `#${k}`) : semTag()} (${doGrupo.length})${resumo}` +
            `${desc ? `\n${limpo || compacto ? '👉 ' : ''}${desc}` : ''}\n\n${itens}`;
    });
}

// Os destinos do -to de uma lista/exportação: undefined sem -to, null se não resolveu (já respondeu)
async function destinosDoEnvio(msg, destinosTexto, comDestino) {
    if (!comDestino) return undefined;
    return resolverDestinos(msg, destinosTexto, { aceitaEmail: true });
}


// Responde no chat ou, com -to, manda nos destinos (e responde que mandou).
// `texto` pode ser uma lista: cada item vai numa mensagem, e a dica só depois do último
async function entregarTexto(msg, destinos, texto, assunto, dica = '', semBloco = false) {
    // Cada listagem vai num bloco ``` (monoespaçado), salvo a limpa; a dica fica fora
    const partes = [].concat(texto).map(t => (semBloco ? t : '```\n' + t + '\n```'));
    if (!destinos) {
        for (const [i, parte] of partes.entries()) {
            await msg.reply(i === partes.length - 1 ? `${parte}${dica}` : parte, undefined, SEM_PREVIA);
        }
        return;
    }
    try {
        for (const parte of partes) await enviarAosDestinos(destinos, parte, { assunto, opcoes: SEM_PREVIA });
        await msg.reply(t('notes.sentTo', { where: descreverDestinos(destinos) }));
    } catch (err) {
        await msg.reply(t('notes.sendFail', { error: err.message }));
    }
}

// "[#tag...] <texto|/regex/flags>" do -search → { tags, busca }
function lerBusca(texto) {
    const m = texto.trim().match(/^((?:#[^\s#]+\s+)*)([\s\S]*)$/);
    return {
        tags: m[1].split(/\s+/).filter(Boolean).map(lerTag),
        busca: m[2].trim().replace(/^"([\s\S]*)"$/, '$1')
    };
}

// "#pt -c" → { texto: '#pt', compacto: true }
function tirarCompacto(texto) {
    const m = String(texto).match(/^([\s\S]*?)\s*-(?:c|compact)\s*$/i);
    return m ? { texto: m[1], compacto: true } : { texto, compacto: false };
}

async function listar(msg, filtro = '', comBusca = false, compacto = false) {
    const { destinos: destinosTexto, informado: comDestino, resto: restoComC } = extrairDestinos(filtro);
    // -c|-compact no fim: uma linha por nota
    const { texto: resto, compacto: pediuCompacto } = tirarCompacto(restoComC);
    compacto ||= pediuCompacto;
    let tags = resto.trim() ? soTags(resto) : [];
    let busca = '';
    let testar = null;

    if (comBusca) {
        ({ tags, busca } = lerBusca(resto));
        if (!busca) {
            await msg.reply(t('notes.list.searchUsage'));
            return;
        }
        try {
            testar = compilarBusca(busca);
        } catch (err) {
            await msg.reply(`❌ ${err.message}`);
            return;
        }
    } else if (!tags) {
        await msg.reply(t('notes.list.usage'));
        return;
    }

    const destinos = await destinosDoEnvio(msg, destinosTexto, comDestino);
    if (destinos === null) return;

    // A busca olha o texto e também a #tag (/notes -s casa acha as da #casa)
    const todas = await listarNotas();
    tags = resolverTags(tags, todas);
    const notas = todas.filter(n => (!tags.length || tags.includes(n.tag)) &&
        (!testar || testar(n.text) || (n.tag && testar(`#${n.tag}`))));
    const rotulo = tags.length ? ` ${tags.map(x => `#${x}`).join(' ')}` : '';
    const achado = busca ? ` 🔎 ${resumirTexto(busca, 40)}` : '';

    if (!notas.length) {
        await msg.reply(tags.length || busca
            ? t('notes.list.none', {
                inTags: rotulo ? t('notes.inTags', { tags: rotulo }) : '',
                withSearch: busca ? t('notes.withSearch', { search: resumirTexto(busca, 40) }) : ''
            })
            : `${t('notes.none')}\n${t('notes.addHint')}`, undefined, SEM_PREVIA);
        return;
    }

    // Uma mensagem por tag; o título (com o total) vai no começo da primeira
    const limpa = tags.length === 1 || compacto;
    const partes = agruparPorTag(notas, await descricoesDasTags(),
        { plano: !limpa, limpo: tags.length === 1, compacto });
    partes[0] = limpa ? `${t('notes.list.titleClean', { found: achado, count: tags.length === 1 ? '' : ` (${notas.length})` })}\n\n${partes[0]}`
        : `${t('notes.list.titleFull', { tags: rotulo, found: achado, total: notas.length })}\n\n${partes[0]}`;
    await entregarTexto(msg, destinos, partes, t('notes.subject.list', { tags: rotulo, found: achado }),
        t(compacto ? 'notes.tipsCompact' : 'notes.tips'), limpa);
}

// -move: renomeia a tag em todas as anotações (se a nova já existe, elas se juntam)
async function moverTag(msg, texto) {
    const m = texto.trim().match(/^#([^\s#]+)\s+#([^\s#]+)$/);
    if (!m) {
        await msg.reply(t('notes.move.usage'));
        return;
    }

    const [de, para] = [lerTag(m[1]), lerTag(m[2])];
    if (de === para) {
        await msg.reply(t('notes.move.same'));
        return;
    }

    const r = await dbRun('UPDATE notes SET tag = ? WHERE tag = ?', [para, de]);
    if (!r.changes) {
        await msg.reply(t('notes.move.notFound', { tag: de }));
        return;
    }
    // A descrição vai junto (se a nova já tinha uma, fica a dela)
    await dbRun('INSERT OR IGNORE INTO note_tags (tag, description) SELECT ?, description FROM note_tags WHERE tag = ?', [para, de]);
    await dbRun('DELETE FROM note_tags WHERE tag = ?', [de]);

    await msg.reply(contar('notes.move.done', r.changes, { from: de, to: para }));
}

// -desc: descrição da tag. "-d #tag texto" grava, "-d #tag" mostra, "-d #tag -rm" apaga
async function descreverTag(msg, texto) {
    const m = texto.trim().match(/^#([^\s#]+)(?:\s+([\s\S]+))?$/);
    if (!m) {
        await msg.reply(t('notes.desc.usage'));
        return;
    }

    const notas = await listarNotas();
    const pedida = lerTag(m[1]);
    const achadas = resolverTags([pedida], notas);
    const tag = achadas.length === 1 ? achadas[0] : pedida; // parcial só vale se for uma tag só
    const desc = (m[2] ?? '').trim();
    const atual = (await dbGet('SELECT description FROM note_tags WHERE tag = ?', [tag]))?.description;

    if (!desc) {
        await msg.reply(atual ? t('notes.desc.shown', { tag, desc: atual })
            : `${t('notes.desc.none', { tag })}\n${t('notes.desc.createHint', { tag })}`,
            undefined, SEM_PREVIA);
        return;
    }

    if (/^-rm$/i.test(desc)) {
        if (!atual) {
            await msg.reply(t('notes.desc.noneToRemove', { tag }));
            return;
        }
        await dbRun('DELETE FROM note_tags WHERE tag = ?', [tag]);
        await msg.reply(t('notes.desc.removed', { tag }));
        return;
    }

    await dbRun('INSERT INTO note_tags (tag, description) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET description = excluded.description',
        [tag, desc]);
    await msg.reply(t(atual ? 'notes.desc.replaced' : 'notes.desc.saved', { tag }), undefined, SEM_PREVIA);
}

// -view: manda cada anotação (a imagem com o texto na legenda; sem imagem, só o texto)
async function verNotas(msg, filtro) {
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(filtro);
    if (!resto.trim()) {
        await msg.reply(t('notes.view.usage'));
        return;
    }

    const todas = await listarNotas();
    const partes = resto.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const pedidas = partes.filter(p => p.startsWith('#')).map(lerTag);
    const tags = resolverTags(pedidas, todas);
    const ids = partes.filter(p => !p.startsWith('#'));
    const faltando = [...ids.filter(i => !/^\d+$/.test(i) || !todas.some(n => n.id === Number(i))),
        ...pedidas.filter(t => !resolverTags([t], todas).some(x => todas.some(n => n.tag === x))).map(t => `#${t}`)];
    if (faltando.length) {
        await msg.reply(t(faltando.length > 1 ? 'notes.view.missingMany' : 'notes.view.missingOne', { list: faltando.join(', ') }));
        return;
    }

    const alvos = todas.filter(n => ids.map(Number).includes(n.id) || tags.includes(n.tag));
    const destinos = await destinosDoEnvio(msg, destinosTexto, comDestino);
    if (destinos === null) return;

    const cabecalho = (n) => [`📝 *#${n.id}*`, n.tag && `#${n.tag}`, `_${formatarData(n.created_at)}_`].filter(Boolean).join(' · ');
    const semMarcas = (t) => t.replace(/[*_]/g, '');
    const falhas = [];

    for (const n of alvos) {
        const texto = [cabecalho(n), n.text && formatarTexto(n.text)].filter(Boolean).join('\n');
        let media = null;
        let comBorda = null;
        if (n.media_path) {
            comBorda = await imagemComBorda(n.media_path, n.media_mime);
            media = await Promise.resolve().then(() => {
                const m = comBorda ? new MessageMedia(n.media_mime, comBorda.toString('base64'))
                    : MessageMedia.fromFilePath(n.media_path);
                m.filename = nomeOriginal(n.media_path);
                return m;
            }).catch(() => null);
            if (!media) falhas.push(t('notes.view.fileNotFound', { id: n.id }));
        }

        // Áudio não tem legenda: o texto vai em outra mensagem
        const semLegenda = media && String(n.media_mime).startsWith('audio/');

        if (!destinos) {
            if (media) await msg.reply(media, undefined, semLegenda ? {} : { caption: texto });
            if (!media || semLegenda) await msg.reply(texto, undefined, SEM_PREVIA);
            continue;
        }

        for (const d of destinos.filter(x => x.id)) {
            await (async () => {
                if (media) await client.sendMessage(d.id, media, semLegenda ? {} : { caption: texto });
                if (!media || semLegenda) await client.sendMessage(d.id, texto, SEM_PREVIA);
            })().catch(err => falhas.push(`${descreverDestinos([d])}: ${err.message}`));
        }
        const emails = [...new Set(destinos.filter(d => d.email).flatMap(d => d.email.split(/\s*,\s*/)))];
        if (emails.length) {
            await enviarEmail({
                para: emails, assunto: t('notes.subject.note', { id: n.id }),
                texto: [semMarcas(cabecalho(n)), n.text && formatarTexto(n.text, true)].filter(Boolean).join('\n'),
                anexos: media ? [{ filename: nomeOriginal(n.media_path), contentType: n.media_mime,
                    ...(comBorda ? { content: comBorda } : { path: n.media_path }) }] : []
            }).catch(err => falhas.push(t('notes.failEmail', { error: err.message })));
        }
    }

    if (destinos && alvos.length && !falhas.length) {
        await msg.reply(contar('notes.view.sent', alvos.length, { where: descreverDestinos(destinos) }));
    }
    if (falhas.length) await msg.reply(`❌ ${falhas.join('; ')}`);
}

// /notes sozinho: cada tag com a quantidade de anotações (as sem tag por último)
async function listarTags(msg) {
    const notas = await listarNotas();
    if (!notas.length) {
        await msg.reply(`${t('notes.none')}\n${t('notes.addHint')}`);
        return;
    }

    const contagem = new Map();
    for (const n of notas) contagem.set(n.tag ?? '', (contagem.get(n.tag ?? '') ?? 0) + 1);
    const chaves = [...contagem.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const descricoes = await descricoesDasTags();
    const linhas = chaves.map(k => `${k ? `#${k}` : semTag()}: ${contagem.get(k)}${descricoes.has(k) ? ` · ${descricoes.get(k)}` : ''}`);

    await entregarTexto(msg, undefined,
        t('notes.tags.title', { total: notas.length, tags: chaves.filter(Boolean).length, lines: linhas.join('\n') }),
        t('notes.subject.tags'), t('notes.tipsTags'));
}

// 20261027_1530, na hora de Brasília (a mesma do formatarData)
function carimboDeArquivo(ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(ms).map(x => [x.type, x.value]));
    return `${p.year}${p.month}${p.day}_${p.hour}${p.minute}`;
}

/*
 * A imagem com uma borda preta fina, para se ver que é uma imagem (jpeg, png e webp; no formato
 * de origem). Devolve null se não dá (gif, erro): vale o arquivo como está.
 */
async function imagemComBorda(arquivo, mime) {
    if (!/^image\/(jpeg|png|webp)$/.test(String(mime))) return null;
    try {
        const { data, info } = await sharp(arquivo).rotate().toBuffer({ resolveWithObject: true });
        const borda = Math.max(2, Math.round(Math.max(info.width, info.height) / 300));
        return await sharp(data).extend({ top: borda, bottom: borda, left: borda, right: borda, background: '#000000' })
            .toBuffer();
    } catch (err) {
        printError('/notes: borda da imagem:', err.message);
        return null;
    }
}

// A imagem da anotação como JPEG RGB sobre fundo branco, no tamanho que o PDF aproveita
async function imagemParaPdf(arquivo) {
    try {
        const { data, info } = await sharp(arquivo).rotate().resize({ width: 900, withoutEnlargement: true })
            .flatten({ background: '#ffffff' }).extend({ top: 2, bottom: 2, left: 2, right: 2, background: '#000000' })
            .toColourspace('srgb').jpeg({ quality: 80 })
            .toBuffer({ resolveWithObject: true });
        return { jpeg: data, largura: info.width, altura: info.height };
    } catch (err) {
        printError('/notes: imagem fora do PDF:', err.message);
        return null;
    }
}

async function exportar(msg, filtro = '') {
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(filtro);
    let tags = resto.trim() ? soTags(resto) : [];
    if (!tags) {
        await msg.reply(t('notes.export.usage'));
        return;
    }

    const destinos = await destinosDoEnvio(msg, destinosTexto, comDestino);
    if (destinos === null) return;

    const todas = await listarNotas();
    tags = resolverTags(tags, todas);
    const notas = tags.length ? todas.filter(n => tags.includes(n.tag)) : todas;
    if (!notas.length) {
        await msg.reply(tags.length ? t('notes.list.none', { inTags: t('notes.inTags', { tags: ` ${tags.map(x => `#${x}`).join(' ')}` }), withSearch: '' })
            : t('notes.none'));
        return;
    }

    const agora = Date.now();
    const rotulo = tags.length ? ` ${tags.map(x => `#${x}`).join(' ')}` : '';
    const grupos = new Map();
    for (const n of notas) grupos.set(n.tag ?? '', [...(grupos.get(n.tag ?? '') ?? []), n]);
    const chaves = [...grupos.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));

    const blocos = [{
        tipo: 'texto', icone: 'nota',
        texto: `${contar('notes.countNotes', notas.length)}${rotulo ? t('notes.inTags', { tags: rotulo }) : ''}`
    }];

    const descricoes = await descricoesDasTags();

    for (const k of chaves) {
        const itens = grupos.get(k);
        if (!(chaves.length === 1 && k === '')) {
            // "#tag (n)" com o resumo em texto (o PDF não tem emoji) e a descrição da tag embaixo
            const resumo = [[itens.filter(n => n.media_path).length, t('notes.pdf.withMedia')], [itens.filter(n => n.alert_at).length, t('notes.pdf.withAlert')],
                [itens.filter(n => partesDoTexto(n.text).links.length).length, t('notes.pdf.withLink')]]
                .filter(([qtd]) => qtd).map(([qtd, rotuloItem]) => `${qtd} ${rotuloItem}`).join(', ');
            blocos.push({ tipo: 'titulo', icone: 'tag', texto: `${k ? `#${k}` : semTag()} (${itens.length})${resumo ? ` · ${resumo}` : ''}` });
            if (descricoes.get(k)) blocos.push({ tipo: 'texto', texto: descricoes.get(k) });
            blocos.push({ tipo: 'espaco', altura: 6 });
        }
        for (const [pos, n] of itens.entries()) {
            const imagem = n.media_path && ehImagem(n.media_mime) ? await imagemParaPdf(n.media_path) : null;
            const alerta = (n.media_path && !imagem
                ? (ehImagem(n.media_mime) ? t('notes.pdf.imageNotIncluded') : t('notes.pdf.fileNotIncluded', { name: nomeOriginal(n.media_path) })) : '') +
                (n.alert_at ? t('notes.pdf.alert', { when: fmtQuando(n.alert_at) }) : '');
            const { titulo, corpo, links } = partesDoTexto(n.text.replace(MARCA_RESPOSTA, t('notes.pdf.replyMark')));
            blocos.push({ tipo: titulo ? 'negrito' : 'texto', texto: `${pos + 1}.  ${titulo}`, recuo: 0 });
            // O título vem primeiro e a imagem depois dele, com uma quebra de linha antes
            if (imagem) {
                blocos.push({ tipo: 'espaco', altura: 6 });
                blocos.push({ tipo: 'imagem', ...imagem });
            }
            if (corpo) {
                blocos.push({ tipo: 'espaco', altura: 6 });
                blocos.push({ tipo: 'texto', texto: corpo });
            }
            if (links.length) {
                blocos.push({ tipo: 'espaco', altura: 6 });
                blocos.push({ tipo: 'negrito', icone: 'link', texto: 'Links' });
                blocos.push({ tipo: 'texto', texto: links.map(l => `• ${l}`).join('\n') });
            }
            blocos.push({ tipo: 'espaco', altura: 3 });
            blocos.push({ tipo: 'meta', icone: 'relogio', texto: `${dataCurta(n.created_at)}, #${n.id}${alerta}` });
            blocos.push({ tipo: 'espaco', altura: 8 });
        }
    }

    const pdf = gerarPdf({
        titulo: t('notes.pdf.title', { tags: rotulo }),
        direita: formatarData(agora),
        rodape: t('notes.pdf.footer', { version: packageJson.version, host: os.hostname(), date: formatarData(agora) }),
        blocos
    });
    const sufixo = tags.length ? `tag-${tags.map(t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/gi, '_')).join('-')}_` : '';
    const nome = `ZapBot_notes_${sufixo}${carimboDeArquivo(agora)}.pdf`;

    const caption = t('notes.export.caption', { tags: rotulo, total: notas.length });
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
            para: emails, assunto: t('notes.subject.export', { tags: rotulo }), texto: caption.replace(/\*/g, ''),
            anexos: [{ filename: nome, content: pdf, contentType: 'application/pdf' }]
        }).then(() => enviados.push(...destinos.filter(d => d.email)))
            .catch(err => falhas.push(t('notes.failEmail', { error: err.message })));
    }
    for (const d of destinos.filter(x => x.id)) {
        await client.sendMessage(d.id, media, { sendMediaAsDocument: true, caption })
            .then(() => enviados.push(d))
            .catch(err => falhas.push(`${descreverDestinos([d])}: ${err.message}`));
    }

    if (enviados.length) await msg.reply(t('notes.export.sent', { where: descreverDestinos(enviados) }));
    if (falhas.length) await msg.reply(t('notes.export.fail', { list: falhas.join('; ') }));
}

async function cmdNote({ msg, args, quotedMsg }) {
    await dbPronto;
    const texto = String(args ?? '').trim();
    const [opcao = '', ...palavras] = texto.split(/\s+/);
    const resto = texto.slice(opcao.length).trim();
    const nome = opcao.toLowerCase();

    // O -to das listas/PDF: "/notes -to X", "/notes #casa -to X", "-l ... -to X", "-e ... -to X"
    const { informado: comDestino, resto: semDestino } = extrairDestinos(texto);
    const tagsDoTexto = soTags(tirarCompacto(semDestino).texto);

    // Sem nada: as tags (numa resposta ou com mídia, é uma anotação sem tag: erro)
    if (!texto) return quotedMsg || msg.hasMedia ? adicionar(msg, '', quotedMsg) : listarTags(msg);
    if (nome === '-list' || nome === '-l') return listar(msg, resto);
    if (nome === '-compact' || nome === '-c') return listar(msg, resto, false, true);
    if (nome === '-update' || nome === '-u') return atualizar(msg, resto, quotedMsg);
    if (nome === '-search' || nome === '-s') return listar(msg, resto, true);
    if (nome === '-view' || nome === '-v') return verNotas(msg, resto);
    if (nome === '-desc' || nome === '-d') return descreverTag(msg, resto);
    if (nome === '-move' || nome === '-m') return moverTag(msg, resto);
    if (nome === '-export' || nome === '-e') return exportar(msg, resto);
    if (comDestino && !semDestino.trim()) return listar(msg, texto);
    if (tagsDoTexto && tirarCompacto(semDestino).compacto) return listar(msg, texto);
    // Só #tag, sem texto: lista as dela. Numa resposta ou com mídia, anota o que veio nessa tag
    if (tagsDoTexto) return (quotedMsg || msg.hasMedia) && tagsDoTexto.length === 1 ? adicionar(msg, texto, quotedMsg) : listar(msg, texto);
    if (nome === '-add' || nome === '-a') return adicionar(msg, resto, quotedMsg);
    if (comDestino && (nome === '-rm' || nome === '-rm' || nome === '-r')) {
        return msg.reply(t('notes.rm.noTo'));
    }
    if (nome === '-rm' || nome === '-rm' || nome === '-r') return removerNotas(msg, palavras.join(' '), false);
    if (nome === '-alerta') return alertar(msg, resto);

    // Opção que não existe: erro. Sem "-" na frente, o texto todo é uma anotação nova (o mesmo que -add)
    if (nome.startsWith('-')) {
        return msg.reply(t('notes.usage'));
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
                t('notes.alert.fired', { id: n.id, text: n.text, date: formatarData(n.created_at) }),
                { assunto: t('notes.subject.alert', { id: n.id, text: resumirTexto(n.text, 60) }), opcoes: SEM_PREVIA }
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
