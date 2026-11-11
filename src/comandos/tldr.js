/*
 * Comando /tldr (alias /resumo).
 */

const fs = require('fs');
const path = require('path');

const { client, concluirAviso } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { MAX_DELETE_WINDOW } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbPronto, dbRun } = require('../db');
const { SEM_CHAVE, chaveOpenAi, erroOpenAi, perguntarAoChat, transcreverAudio } = require('../openaiChat');
const { getSetting } = require('../settings');
const { isCaminhoDeMidia } = require('../util/arquivos');
const { plural, semAcentos } = require('../util/formatar');

/*
 * /tldr: resume a conversa de um chat pelo ChatGPT (mesma chave e modelo do /gpt).
 *   /tldr              → as últimas 100 mensagens deste chat
 *   /tldr 2h | 30m     → as das últimas 2 horas | 30 minutos (o "-" na frente é opcional)
 *   /tldr 300          → as últimas 300 (máx. setting 'tldr.maxMsgs')
 *   /tldr -c família   → de outro chat, buscado pelo nome
 *   /tldr -pv          → no seu privado em vez de expor no chat atual
 * Usa o texto já gravado no banco: as mensagens comuns ficam 68 h. Ficam de
 * fora os comandos, as apagadas e as mídias sem legenda.
 */
const RESUMO_PADRAO = 100;
const RESUMO_MIN = 3;
const RESUMO_MAX_CHARS_MSG = 500;      // cada mensagem é cortada aqui
const RESUMO_MAX_CHARS = 60000;        // e o total, das mais antigas para as mais novas

const RESUMO_INSTRUCOES =
    'Você resume conversas de WhatsApp em português do Brasil. Escreva um resumo curto, em tópicos ' +
    'começados por "• ", com os assuntos principais, as decisões, os combinados e as pendências, ' +
    'citando quem disse quando for relevante. No máximo 15 tópicos. Não invente nada que não esteja ' +
    'nas mensagens e não use títulos nem markdown além de *negrito*. As linhas "[ÁUDIO]" são ' +
    'transcrições de áudios: resuma cada um (ou os de um mesmo assunto) num tópico no formato ' +
    '"🎤 *Fulano* enviou áudio DD/MM HH:mm falando sobre ...", com quem enviou e quando.';

const AUDIOS_MAX = 10;                 // só os mais recentes são transcritos (custa a API)
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const AUDIO_EXTENSOES = new Set(['ogg', 'oga', 'opus', 'mpeg', 'mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac']);

/**
 * Período pedido: "2h", "-2h", "30m" (janela de tempo) ou "300", "-300" (quantidade).
 * @returns {{ ms?: number, n?: number } | null} null se o texto não é um período
 */
function lerPeriodo(texto) {
    const m = String(texto).trim().match(/^-?(\d+)\s*(h|m|min)?$/i);
    if (!m || Number(m[1]) < 1) return null;

    const n = Number(m[1]);
    if (!m[2]) return { n };
    return { ms: n * (m[2].toLowerCase() === 'h' ? 3600_000 : 60_000) };
}

// Chats com mensagens no banco cujo nome tem todas as palavras da busca
async function buscarChat(busca) {
    const chats = await dbAll(
        `SELECT chat_id, MAX(chat_name) AS chat_name, COUNT(*) AS total
           FROM messages GROUP BY chat_id ORDER BY MAX(timestamp) DESC`
    );
    const palavras = semAcentos(busca).trim().split(/\s+/);
    const encontrados = chats.filter(c => palavras.every(p => semAcentos(c.chat_name).includes(p)));
    const exato = encontrados.find(c => semAcentos(c.chat_name) === semAcentos(busca).trim());

    if (exato || encontrados.length === 1) return { chat: exato || encontrados[0] };
    if (!encontrados.length) return { erro: `❌ Nenhum chat com mensagens guardadas tem "${busca}" no nome.` };

    return {
        erro: `🔎 "${busca}" corresponde a ${encontrados.length} chats. Seja mais específico:\n` +
            encontrados.slice(0, 10).map(c => `• ${c.chat_name}`).join('\n')
    };
}

const hora = (ms) => new Date(ms).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

/*
 * A transcrição de um áudio guardado em disco: a já feita (coluna transcription) ou a da OpenAI, que
 * fica gravada. Sem arquivo, grande demais, formato fora ou erro: null (o áudio fica de fora).
 */
async function transcricaoDoAudio(r) {
    if (r.transcription) return r.transcription;

    const extensao = path.extname(String(r.media_path ?? '')).slice(1).toLowerCase();
    if (!AUDIO_EXTENSOES.has(extensao) || !isCaminhoDeMidia(r.media_path) || !fs.existsSync(r.media_path)) return null;
    if (fs.statSync(r.media_path).size > AUDIO_MAX_BYTES) return null;

    try {
        const texto = await transcreverAudio({
            cmd: '/tldr',
            audio: {
                arquivo: `audio.${extensao === 'oga' || extensao === 'opus' ? 'ogg' : extensao}`,
                mimetype: `audio/${extensao === 'oga' || extensao === 'opus' ? 'ogg' : extensao}`,
                data: fs.readFileSync(r.media_path).toString('base64')
            }
        });
        await dbRun('UPDATE messages SET transcription = ? WHERE id = ?', [texto, r.id]).catch(() => {});
        return texto || null;
    } catch {
        return null;
    }
}

async function cmdTldr({ msg, opts, chatId, chatName }) {
    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/tldr'));
        return;
    }

    const extras = opts.argv.filter(Boolean);
    const periodo = extras.length ? lerPeriodo(extras.join('')) : { n: RESUMO_PADRAO };

    if (!periodo) {
        await msg.reply('```' + getCommandSyntax('/tldr') + '```');
        return;
    }

    const max = getSetting('tldr.maxMsgs');
    const avisos = [];

    if (periodo.n > max) {
        avisos.push(`limitado a ${max} mensagens (setting tldr.maxMsgs)`);
        periodo.n = max;
    }

    if (periodo.ms > MAX_DELETE_WINDOW) {
        avisos.push('as mensagens comuns ficam só 68 h no banco');
        periodo.ms = MAX_DELETE_WINDOW;
    }

    await dbPronto;

    // -c <nome>: outro chat (pelo nome guardado no banco)
    let ids = await idsDoChatAtual(chatId);
    let nome = chatName;

    if (opts.opt.chat) {
        const r = await buscarChat(String(opts.opt.chat));
        if (r.erro) {
            await msg.reply(r.erro);
            return;
        }
        ids = [r.chat.chat_id];
        nome = r.chat.chat_name;
    }

    const params = [...ids];
    let filtroTempo = '';
    if (periodo.ms) {
        filtroTempo = 'AND timestamp >= ?';
        params.push(Date.now() - periodo.ms);
    }
    params.push(periodo.ms ? max : periodo.n);

    const rows = (await dbAll(
        `SELECT id, sender_name, from_me, body, timestamp, type, media_path, transcription
           FROM messages
          WHERE chat_id IN (${ids.map(() => '?').join(', ')})
            AND revoked = 0
            AND ((TRIM(body) != '' AND body NOT LIKE '/%')
                 OR (type IN ('audio', 'ptt') AND (media_path IS NOT NULL OR transcription IS NOT NULL)))
            ${filtroTempo}
          ORDER BY timestamp DESC, rowid DESC
          LIMIT ?`,
        params
    )).reverse();

    // Os áudios (os AUDIOS_MAX mais recentes) viram texto; o que não deu para transcrever sai do resumo
    const audios = rows.filter(r => ['audio', 'ptt'].includes(r.type)).slice(-AUDIOS_MAX);
    for (const r of audios) r.body = (await transcricaoDoAudio(r)) ?? '';
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (!['audio', 'ptt'].includes(r.type)) continue;
        if (r.body && audios.includes(r)) r.body = `[ÁUDIO] ${r.body}`;
        else rows.splice(i, 1);
    }

    if (rows.length < RESUMO_MIN) {
        await msg.reply(`📝 Poucas mensagens para resumir (${rows.length}) em ${nome}.\n` +
            '💡 _O resumo usa o texto guardado no banco: as mensagens comuns ficam 68 h, e comandos e mídias sem legenda não entram._');
        return;
    }

    // Uma linha por mensagem; acima do limite, saem as mais antigas. As suas vão com o nome do seu perfil.
    const meuNome = client.info.pushname || 'Você';
    const autor = (r) => (r.from_me ? meuNome : r.sender_name || 'Desconhecido');
    const linhas = rows.map(r => `[${hora(r.timestamp)}] ${autor(r)}: ${r.body.replace(/\s+/g, ' ').slice(0, RESUMO_MAX_CHARS_MSG)}`);
    let tamanho = linhas.reduce((s, l) => s + l.length + 1, 0);
    while (tamanho > RESUMO_MAX_CHARS && linhas.length > RESUMO_MIN) tamanho -= linhas.shift().length + 1;

    const primeira = rows[rows.length - linhas.length].timestamp;
    const ultima = rows[rows.length - 1].timestamp;

    const aviso = await msg.reply('⏳ Processando o /tldr, aguarde.', null, { linkPreview: false });
    try {
        const resumo = await perguntarAoChat({
            cmd: '/tldr',
            sistema: RESUMO_INSTRUCOES,
            texto: `Conversa "${nome}" (${linhas.length} mensagens):\n\n${linhas.join('\n')}`
        });

        const texto = `🤖 *Resumo de ${nome}*\n` +
            `_${plural(linhas.length, 'mensagem', 'mensagens')} · ${hora(primeira)} a ${hora(ultima)}_` +
            (avisos.length ? `\n_(${avisos.join('; ')})_` : '') +
            `\n\n${resumo}`;

        if (opts.opt.pv) {
            await concluirAviso(msg, aviso, '🤖 Resumo enviado no seu privado.');
            await client.sendMessage(client.info.wid._serialized, texto);
        } else {
            await concluirAviso(msg, aviso, texto);
        }
    } catch (err) {
        await concluirAviso(msg, aviso, erroOpenAi(err, '/tldr'));
    }
}

module.exports = {
    cmdTldr,
    lerPeriodo
};
