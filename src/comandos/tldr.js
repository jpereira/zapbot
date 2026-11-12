/*
 * Comando /tldr (alias /resumo).
 */

const fs = require('fs');
const path = require('path');

const { client, concluirAviso } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { resolverAlvo } = require('./show');
const { HOUR_MS } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbPronto, dbRun } = require('../db');
const { idioma, t } = require('../i18n');
const { SEM_CHAVE, chaveOpenAi, erroOpenAi, medirConsumo, perguntarAoChat, rodapeDeConsumo, transcreverAudio } = require('../openaiChat');
const { getSetting } = require('../settings');
const { isCaminhoDeMidia } = require('../util/arquivos');
const { lerDuracao } = require('../util/quando');

/*
 * /tldr: resume a conversa de um chat pelo ChatGPT (mesma chave e modelo do /gpt).
 *   /tldr              → as últimas 100 mensagens deste chat
 *   /tldr 2h | 1d     → as do último tempo, como no /cron: 30m, 2h, 1d, 1h30m (o "-" na frente é opcional)
 *   /tldr 300          → as últimas 300 (máx. setting 'tldr.maxMsgs')
 *   /tldr -c família   → de outro chat: nome, /regex/ ou @contato
 *   /tldr -pv          → no seu privado em vez de expor no chat atual
 *   (respondendo)      → da mensagem respondida até agora (o período digitado ou o -c ganham)
 * Usa o texto já gravado no banco: as mensagens comuns ficam cache.messageRetentionHours (68 h). Ficam de
 * fora os comandos, as apagadas e as mídias sem legenda.
 */
const RESUMO_PADRAO = 100;
const RESUMO_MIN = 3;
const RESUMO_MAX_CHARS_MSG = 500;      // cada mensagem é cortada aqui
const RESUMO_MAX_CHARS = 60000;        // e o total, das mais antigas para as mais novas

const RESUMO_INSTRUCOES = () => t('tldr.instructions', { tag: t('tldr.audioTag') });

const AUDIOS_MAX = 10;                 // só os mais recentes são transcritos (custa a API)
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const AUDIO_EXTENSOES = new Set(['ogg', 'oga', 'opus', 'mpeg', 'mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac']);

/**
 * Período pedido, com a mesma duração do /cron: "30m", "2h", "1d", "1h30m", "2d4h" (janela de tempo, o "-"
 * na frente é opcional) ou "300" (quantidade de mensagens).
 * @returns {{ ms?: number, n?: number } | null} null se o texto não é um período
 */
function lerPeriodo(texto) {
    const t = String(texto).trim().toLowerCase().replace(/^-/, '').replace(/\s+/g, '');
    if (/^\d+$/.test(t)) return Number(t) >= 1 ? { n: Number(t) } : null;

    const ms = lerDuracao(t);
    return ms ? { ms } : null;
}

// "2 horas", "1 dia e 12 horas", "30 minutos"
function porExtenso(ms) {
    const minutos = Math.round(ms / 60_000);
    const partes = [
        [Math.floor(minutos / 1440), 'tldr.days'],
        [Math.floor((minutos % 1440) / 60), 'tldr.hours'],
        [minutos % 60, 'tldr.minutes']
    ].filter(([n]) => n).map(([n, chave]) => t(chave, { n }));
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')}${t('tldr.and')}${partes.at(-1)}` : partes[0];
}

const hora = (ms) => new Date(ms).toLocaleString(idioma() === 'pt_BR' ? 'pt-BR' : 'en-US', {
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

async function resumir({ msg, opts, chatId, chatName, quotedMsg }) {
    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/tldr'));
        return;
    }

    const extras = opts.argv.filter(Boolean);
    let periodo = extras.length ? lerPeriodo(extras.join('')) : { n: RESUMO_PADRAO };
    const avisos = [];

    // Respondendo uma mensagem (sem período digitado nem -c): resume dela até agora
    const desdeAResposta = !extras.length && !opts.opt.chat && quotedMsg?.timestamp;
    if (desdeAResposta) {
        periodo = { ms: Math.max(Date.now() - quotedMsg.timestamp * 1000, 0) };
        avisos.push(t('tldr.sinceReply'));
    }

    if (!periodo) {
        await msg.reply('```' + getCommandSyntax('/tldr') + '```');
        return;
    }

    const max = getSetting('tldr.maxMsgs');

    if (periodo.n > max) {
        avisos.push(t('tldr.limited', { max }));
        periodo.n = max;
    }

    // O banco guarda o texto das mensagens comuns por cache.messageRetentionHours
    const horasGuardadas = getSetting('cache.messageRetentionHours');
    const guardado = horasGuardadas * HOUR_MS;
    if (periodo.ms > guardado) {
        avisos.push(t('tldr.retention', { tempo: porExtenso(guardado), horas: horasGuardadas }));
        periodo.ms = guardado;
    }

    await dbPronto;

    // -c <nome>: outro chat (pelo nome guardado no banco)
    let ids = await idsDoChatAtual(chatId);
    let nome = chatName;

    if (opts.opt.chat) {
        // Como o /show: /regex/, @contato, nº do /show -l ou o nome; vários: lista e espera o nº
        const chats = await dbAll(
            `SELECT chat_id, MAX(chat_name) AS chat_name, MAX(is_group) AS is_group
               FROM messages GROUP BY chat_id ORDER BY MAX(timestamp) DESC`
        );
        const alvo = await resolverAlvo(msg, String(opts.opt.chat).trim(), { chats });
        if (!alvo) return;
        ids = alvo.ids;
        nome = alvo.nome;
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

    if (desdeAResposta && rows.length >= max) avisos.push(t('tldr.latest', { max }));

    // Os áudios (os AUDIOS_MAX mais recentes) viram texto; o que não deu para transcrever sai do resumo
    const audios = rows.filter(r => ['audio', 'ptt'].includes(r.type)).slice(-AUDIOS_MAX);
    for (const r of audios) r.body = (await transcricaoDoAudio(r)) ?? '';
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (!['audio', 'ptt'].includes(r.type)) continue;
        if (r.body && audios.includes(r)) r.body = `${t('tldr.audioTag')} ${r.body}`;
        else rows.splice(i, 1);
    }

    if (rows.length < RESUMO_MIN) {
        await msg.reply(t('tldr.few', { total: rows.length, nome, horas: getSetting('cache.messageRetentionHours') }));
        return;
    }

    // Uma linha por mensagem; acima do limite, saem as mais antigas. As suas vão com o nome do seu perfil.
    const meuNome = client.info.pushname || t('tldr.me');
    const autor = (r) => (r.from_me ? meuNome : r.sender_name || t('tldr.unknown'));
    const linhas = rows.map(r => `[${hora(r.timestamp)}] ${autor(r)}: ${r.body.replace(/\s+/g, ' ').slice(0, RESUMO_MAX_CHARS_MSG)}`);
    let tamanho = linhas.reduce((s, l) => s + l.length + 1, 0);
    while (tamanho > RESUMO_MAX_CHARS && linhas.length > RESUMO_MIN) tamanho -= linhas.shift().length + 1;

    const primeira = rows[rows.length - linhas.length].timestamp;
    const ultima = rows[rows.length - 1].timestamp;

    // O que está sendo resumido: a quantidade, a janela de tempo ou "desde a mensagem respondida"
    const mensagens = t('tldr.messages', { n: linhas.length });
    const escopo = desdeAResposta
        ? t('tldr.scopeReply', { mensagens, nome, tempo: porExtenso(periodo.ms) })
        : periodo.ms
            ? t('tldr.scopePeriod', { mensagens, nome, tempo: porExtenso(periodo.ms) })
            : t('tldr.scopeLast', { mensagens, nome });
    const aviso = await msg.reply(t('tldr.processing', { escopo }), null, { linkPreview: false });
    try {
        const resumo = await perguntarAoChat({
            cmd: '/tldr',
            sistema: RESUMO_INSTRUCOES(),
            texto: t('tldr.prompt', { nome, total: linhas.length, linhas: linhas.join('\n') })
        });

        const texto = t('tldr.header', { nome, mensagens, inicio: hora(primeira), fim: hora(ultima) }) +
            (avisos.length ? `\n_(${avisos.join('; ')})_` : '') +
            `\n\n${resumo}${await rodapeDeConsumo()}`;

        if (opts.opt.pv) {
            await concluirAviso(msg, aviso, t('tldr.sentPrivate'));
            await client.sendMessage(client.info.wid._serialized, texto);
        } else {
            await concluirAviso(msg, aviso, texto);
        }
    } catch (err) {
        await concluirAviso(msg, aviso, erroOpenAi(err, '/tldr'));
    }
}

// O -status|-s (ou o setting openai.status) mostra o consumo da chamada no rodapé
const cmdTldr = (ctx) => medirConsumo(ctx.opts?.given.has('status'), () => resumir(ctx));

module.exports = {
    cmdTldr,
    lerPeriodo
};
