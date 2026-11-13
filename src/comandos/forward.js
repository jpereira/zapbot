/*
 * Comando /forward: encaminha mensagens (texto, mídia, localização...) para os destinatários.
 *   /forward /Fulano de Tal/ @Maria Beltrano   → a mensagem respondida, para contatos e grupos
 *   /forward -to fulano@exemplo.com            → e-mail (vários -to valem)
 *   /forward -1 /Fulano/                       → sem resposta: a mensagem logo acima (-1)
 *   /forward -1 -4 -6 /Fulano/                 → as mensagens nas posições -1, -4 e -6 (também -1,-4,-6)
 *   /forward -3..-1 /Fulano/                   → da -3 até a -1, em sequência
 * Só envia se todos os destinatários forem encontrados. Com -quiet|-q não mostra o aviso nem o status
 * (só as falhas). O cabeçalho "encaminhada pelo ZapBot" vem do setting forward.header (padrão ligado):
 * com várias mensagens, ele vai uma vez só, antes delas.
 */

const { getCommandSyntax } = require('./base');
const { pessoasDoTexto, semDelimitadores } = require('./block');
const { client, concluirAviso, enviadaPeloBot } = require('../cliente');
const { descreverDestino, extrairDestinos, resolverDestinos } = require('../destinos');
const { enviarEmail } = require('../email');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { esperar } = require('../util/formatar');

// O que enviar de uma mensagem: { texto, midia, tipo } ou { erro }
async function conteudoDe(m) {
    const tipo = m.type;
    let texto = String(m.body ?? '').trim();
    let midia = null;

    if (m.hasMedia) {
        midia = await m.downloadMedia().catch(() => null);
        if (!midia?.data) return { erro: t('forward.download') };
    } else if (tipo === 'location' && m.location) {
        const { latitude, longitude, description } = m.location;
        texto = [description, `https://maps.google.com/?q=${latitude},${longitude}`].filter(Boolean).join('\n');
    } else if (m.pollName) {
        texto = `📊 ${m.pollName}\n${(m.pollOptions ?? []).map(o => `• ${o.name ?? o}`).join('\n')}`;
    }

    if (!texto && !midia) return { erro: t('forward.empty') };
    return { texto, midia, tipo };
}

// Áudio, nota de voz e figurinha não aceitam legenda: o texto vai antes, em outra mensagem
const SEM_LEGENDA = new Set(['audio', 'ptt', 'sticker']);

async function enviarAoChat(id, { texto, midia, tipo }) {
    if (!midia) {
        await client.sendMessage(id, texto);
    } else if (SEM_LEGENDA.has(tipo)) {
        if (texto) await client.sendMessage(id, texto);
        await client.sendMessage(id, midia, { sendAudioAsVoice: tipo === 'ptt', sendMediaAsSticker: tipo === 'sticker' });
    } else {
        await client.sendMessage(id, midia, texto ? { caption: texto } : {});
    }
}

// Um e-mail só, com o cabeçalho (se houver), os textos em sequência e todas as mídias em anexo
async function enviarPorEmail(email, conteudos, cabecalho) {
    const anexos = conteudos.filter(c => c.midia).map(({ midia }, i) => {
        const extensao = String(midia.mimetype ?? '').split(';')[0].split('/')[1] || 'bin';
        return { filename: midia.filename || `anexo${i ? `-${i + 1}` : ''}.${extensao}`, content: Buffer.from(midia.data, 'base64'), contentType: midia.mimetype };
    });
    await enviarEmail({
        para: email.split(/\s*,\s*/),
        assunto: t('forward.subject'),
        texto: [cabecalho, ...conteudos.map(c => c.texto)].filter(Boolean).join('\n\n') || t('forward.noText'),
        anexos
    });
}

/*
 * As posições logo no começo do comando: -1, -1 -4 -6, -1,-4,-6, -3..-1 (e misturas). Devolve as posições
 * (1 = a mensagem logo acima) e o resto do texto.
 */
const SELECAO = /^(?:-\d+(?:\.\.-?\d+)?(?:\s*,\s*|\s+|$))+/;

function lerPosicoes(texto) {
    const m = texto.match(SELECAO);
    if (!m) return { posicoes: [], resto: texto };

    const posicoes = new Set();
    for (const [, de, ate] of m[0].matchAll(/-(\d+)(?:\.\.-?(\d+))?/g)) {
        const [a, b] = [Number(de), Number(ate ?? de)];
        for (let p = Math.min(a, b); p <= Math.max(a, b); p++) posicoes.add(p);
    }
    return { posicoes: [...posicoes].sort((x, y) => x - y), resto: texto.slice(m[0].length).trim() };
}

// Não são mensagens de gente: avisos do WhatsApp (entrou, saiu...), chamadas, apagadas
const TIPOS_DE_SISTEMA = new Set(['gp2', 'notification', 'notification_template', 'e2e_notification', 'call_log', 'protocol', 'ciphertext', 'revoked']);

/**
 * As mensagens nas posições pedidas (1 = a logo acima do comando), da mais antiga para a mais nova.
 * Pula os avisos do WhatsApp e o que o próprio bot enviou (respostas, status).
 * @returns {Promise<{ mensagens: object[] } | { erro: string }>}
 */
async function mensagensAcima(msg, posicoes) {
    const maior = posicoes.at(-1);
    let buscadas;
    try {
        const chat = await msg.getChat();
        buscadas = await chat.fetchMessages({ limit: Math.min(maior + 50, 300) });
    } catch (err) {
        printError('/forward: não li as mensagens do chat:', err.message);
        return { erro: t('forward.fetchFailed', { error: err.message }) };
    }

    // Só o que veio antes do comando
    const idComando = msg.id?._serialized;
    const antes = buscadas.findIndex(m => m.id?._serialized === idComando);
    const candidatas = (antes >= 0 ? buscadas.slice(0, antes) : buscadas)
        .filter(m => !TIPOS_DE_SISTEMA.has(m.type) && !enviadaPeloBot(m));

    const escolhidas = [];
    for (const p of posicoes) {
        const m = candidatas[candidatas.length - p];
        if (!m) return { erro: t('forward.notEnough', { n: candidatas.length, pos: p }) };
        escolhidas.push({ pos: p, m });
    }
    // Da mais antiga (posição maior) para a mais nova
    return { mensagens: escolhidas.reverse() };
}

async function cmdForward({ msg, args: digitado, opts, quotedMsg }) {
    const silencioso = Boolean(opts?.given.has('quiet'));
    const semQuiet = digitado.replace(/(^|\s)-(?:quiet|q)(?=\s|$)/g, ' ').trim();
    const { posicoes, resto: semPosicoes } = lerPosicoes(semQuiet);

    // Os -to (e-mails e também chats) e, no resto, os destinatários: /Nome/, "Nome", @menção, +número, palavras
    const { destinos: porTo, resto } = extrairDestinos(semPosicoes);
    const textos = [...pessoasDoTexto(resto).map(semDelimitadores), ...porTo];

    if (!textos.length) {
        await msg.reply('```' + getCommandSyntax('/forward') + '```');
        return;
    }
    if (quotedMsg && posicoes.length) {
        await msg.reply(t('forward.replyAndNumbers'));
        return;
    }
    if (!quotedMsg && !posicoes.length) {
        await msg.reply(t('forward.needReply'));
        return;
    }
    if (posicoes[0] === 0) {
        await msg.reply(t('forward.badPosition'));
        return;
    }
    const max = getSetting('forward.max');
    if (posicoes.length > max) {
        await msg.reply(t('forward.tooMany', { n: posicoes.length, max }));
        return;
    }

    // Só envia se todos forem encontrados (o erro de quem falhou já foi respondido)
    const destinos = await resolverDestinos(msg, textos, { aceitaEmail: true });
    if (!destinos) return;

    // Avisa na hora para quem vai (baixar a mídia e enviar pode demorar) e, quando termina, esse mesmo
    // aviso é editado com o status de cada um
    const total = posicoes.length || 1;
    const aviso = silencioso ? null : await msg.reply(t('forward.processing', { n: total }));

    // As mensagens, da mais antiga para a mais nova
    let origem = [{ pos: null, m: quotedMsg }];
    if (posicoes.length) {
        const r = await mensagensAcima(msg, posicoes);
        if (r.erro) {
            await concluirAviso(msg, aviso, r.erro);
            return;
        }
        origem = r.mensagens;
    }

    const conteudos = [];
    for (const { pos, m } of origem) {
        const c = await conteudoDe(m);
        if (c.erro) {
            await concluirAviso(msg, aviso, pos ? t('forward.errorAt', { pos, error: c.erro }) : c.erro);
            return;
        }
        conteudos.push(c);
    }

    // Uma mensagem: o cabeçalho abre o texto (ou a legenda). Várias: ele vai uma vez, antes de todas
    const cabecalho = getSetting('forward.header') ? t('forward.header') : '';
    if (cabecalho && conteudos.length === 1) conteudos[0].texto = [cabecalho, conteudos[0].texto].filter(Boolean).join('\n\n');
    const cabecalhoAparte = conteudos.length > 1 ? cabecalho : '';
    const pausa = getSetting('forward.delayMs');

    const linhas = [];
    let falhou = 0;
    for (const d of destinos) {
        const nome = d.email ?? d.nome;
        const quem = descreverDestino(d);
        try {
            if (d.email) {
                await enviarPorEmail(d.email, conteudos, cabecalhoAparte);
            } else {
                if (cabecalhoAparte) await client.sendMessage(d.id, cabecalhoAparte);
                for (const [i, c] of conteudos.entries()) {
                    if (i && pausa) await esperar(pausa);
                    await enviarAoChat(d.id, c);
                }
            }
            linhas.push(quem);
            printInfo(`/forward: ${conteudos.length} mensagem(ns) para ${nome}`);
        } catch (err) {
            falhou++;
            printError(`/forward: falhou para ${nome}:`, err.message);
            linhas.push(`${quem} · ❌ ${err.message}`);
        }
    }

    // Silencioso: nada de status quando tudo foi enviado; falha, o bot avisa
    if (silencioso && !falhou) return;

    // Deu certo: "✉️ ... com sucesso!" e, com o setting forward.header ligado, a lista de quem recebeu
    if (!falhou) {
        const chave = getSetting('forward.header') ? 'forward.doneList' : 'forward.done';
        await concluirAviso(msg, aviso, t(chave, { n: conteudos.length, list: linhas.join('\n') }));
        return;
    }
    const chave = falhou === destinos.length ? 'forward.allFailed' : 'forward.partial';
    await concluirAviso(msg, aviso, t(chave, { n: destinos.length, ok: destinos.length - falhou, list: linhas.join('\n') }));
}

module.exports = { cmdForward, lerPosicoes };
