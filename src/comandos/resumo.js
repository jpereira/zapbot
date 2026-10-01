/*
 * Comando /resumo.
 */

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { MAX_DELETE_WINDOW } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbPronto } = require('../db');
const { SEM_CHAVE, chaveOpenAi, erroOpenAi, perguntarAoChat } = require('../openaiChat');
const { getSetting } = require('../settings');
const { plural, semAcentos } = require('../util/formatar');

/*
 * /resumo: resume a conversa de um chat pelo ChatGPT (mesma chave e modelo do /gpt).
 *   /resumo              → as últimas 100 mensagens deste chat
 *   /resumo 2h | 30m     → as das últimas 2 horas | 30 minutos (o "-" na frente é opcional)
 *   /resumo 300          → as últimas 300 (máx. setting 'resumo.maxMsgs')
 *   /resumo -c família   → de outro chat, buscado pelo nome
 *   /resumo -pv          → no seu privado em vez de expor no chat atual
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
    'nas mensagens e não use títulos nem markdown além de *negrito*.';

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

async function cmdResumo({ msg, opts, chatId, chatName }) {
    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/resumo'));
        return;
    }

    const extras = opts.argv.filter(Boolean);
    const periodo = extras.length ? lerPeriodo(extras.join('')) : { n: RESUMO_PADRAO };

    if (!periodo) {
        await msg.reply('```' + getCommandSyntax('/resumo') + '```');
        return;
    }

    const max = getSetting('resumo.maxMsgs');
    const avisos = [];

    if (periodo.n > max) {
        avisos.push(`limitado a ${max} mensagens (setting resumo.maxMsgs)`);
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
        `SELECT sender_name, from_me, body, timestamp
           FROM messages
          WHERE chat_id IN (${ids.map(() => '?').join(', ')})
            AND revoked = 0
            AND TRIM(body) != ''
            AND body NOT LIKE '/%'
            ${filtroTempo}
          ORDER BY timestamp DESC, rowid DESC
          LIMIT ?`,
        params
    )).reverse();

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

    try {
        msg.getChat().then(chat => chat.sendStateTyping()).catch(() => {});

        const resumo = await perguntarAoChat({
            cmd: '/resumo',
            sistema: RESUMO_INSTRUCOES,
            texto: `Conversa "${nome}" (${linhas.length} mensagens):\n\n${linhas.join('\n')}`
        });

        const texto = `📝 *Resumo de ${nome}*\n` +
            `_${plural(linhas.length, 'mensagem', 'mensagens')} · ${hora(primeira)} a ${hora(ultima)}_` +
            (avisos.length ? `\n_(${avisos.join('; ')})_` : '') +
            `\n\n${resumo}`;

        if (opts.opt.pv) {
            await msg.reply('📝 Resumo enviado no seu privado.');
            await client.sendMessage(client.info.wid._serialized, texto);
        } else {
            await msg.reply(texto);
        }
    } catch (err) {
        await msg.reply(erroOpenAi(err, '/resumo'));
    }
}

module.exports = {
    cmdResumo,
    lerPeriodo
};
