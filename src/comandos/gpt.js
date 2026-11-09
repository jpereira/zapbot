/*
 * Comando /gpt.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { getCommandSyntax } = require('./base');
const { OPENAI_MODELOS } = require('../openai');
const {
    SEM_CHAVE, chaveAdminOpenAi, chaveOpenAi, consultarConsumo, consultarLimites, erroOpenAi, perguntarAoChat, sintetizarVoz,
    transcreverAudio, VOZ_MAX_CARACTERES
} = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { fmtNum } = require('../util/formatar');

/*
 * /gpt: pergunta ao ChatGPT (a chamada e os erros ficam no openaiChat.js).
 */
const GPT_INSTRUCOES = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

// /gpt -m: sem modelo lista o atual e os aceitos; com modelo, grava o setting
async function trocarModelo(msg, modelo) {
    const doEnv = process.env.OPENAI_MODEL?.trim();

    if (!modelo) {
        const atual = envOuSetting('OPENAI_MODEL', 'openai.api.model');
        await msg.reply(`🤖 *Modelo do /gpt:* ${atual}${doEnv ? ' _(do OPENAI_MODEL no .env)_' : ''}\n\n` +
            '*Aceitos:*\n' + OPENAI_MODELOS.map(m => `${m === atual ? '✅' : '▫️'} ${m}`).join('\n') +
            '\n\n💡 _/gpt -m <modelo> troca (setting openai.api.model)._');
        return;
    }

    try {
        await setSetting('openai.api.model', modelo);
    } catch (e) {
        await msg.reply(`❌ Modelo ${e.message}`);
        return;
    }
    await msg.reply(`✅ Modelo do /gpt: *${getSetting('openai.api.model')}*` +
        (doEnv ? `\n⚠️ _O OPENAI_MODEL do .env (${doEnv}) tem prioridade enquanto estiver definido._` : ''));
}

// A foto respondida: só as que a OpenAI lê, e até um tamanho que não estoure a requisição
const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const FOTO_MAX_BYTES = 15 * 1024 * 1024;
const PERGUNTA_DA_FOTO = 'Descreva esta imagem.';

/**
 * A imagem da mensagem respondida (foto ou figurinha), baixada em base64.
 * @returns {Promise<null | { imagem: { mimetype: string, data: string } } | { erro: string }>}
 *   null: a mensagem respondida não é imagem (segue só o texto)
 */
async function imagemDaResposta(quotedMsg) {
    if (!quotedMsg?.hasMedia || !['image', 'sticker'].includes(quotedMsg.type)) return null;

    const midia = await quotedMsg.downloadMedia().catch(() => null);
    if (!midia?.data) return { erro: '❌ Não consegui baixar a imagem (ela pode ter expirado no WhatsApp).' };
    if (!TIPOS_DE_FOTO.includes(midia.mimetype)) {
        return { erro: `❌ A OpenAI não lê imagem ${midia.mimetype}: só ${TIPOS_DE_FOTO.map(t => t.split('/')[1]).join(', ')}.` };
    }
    if (midia.data.length * 0.75 > FOTO_MAX_BYTES) {
        return { erro: `❌ A imagem tem mais de ${FOTO_MAX_BYTES / 1024 / 1024} MB: é grande demais para o /gpt.` };
    }
    return { imagem: { mimetype: midia.mimetype, data: midia.data } };
}

// O áudio respondido: a extensão certa para a OpenAI (o formato vem do nome do arquivo) e o teto dela
const EXTENSOES_DE_AUDIO = {
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/flac': 'flac'
};
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * O áudio da mensagem respondida (áudio ou nota de voz), baixado em base64.
 * @returns {Promise<null | { audio: { arquivo: string, mimetype: string, data: string } } | { erro: string }>}
 *   null: a mensagem respondida não é áudio
 */
async function audioDaResposta(quotedMsg) {
    if (!quotedMsg?.hasMedia || !['audio', 'ptt'].includes(quotedMsg.type)) return null;

    const midia = await quotedMsg.downloadMedia().catch(() => null);
    if (!midia?.data) return { erro: '❌ Não consegui baixar o áudio (ele pode ter expirado no WhatsApp).' };

    // "audio/ogg; codecs=opus" (a nota de voz do WhatsApp) → "audio/ogg"
    const tipo = String(midia.mimetype).split(';')[0].trim().toLowerCase();
    const extensao = EXTENSOES_DE_AUDIO[tipo];
    if (!extensao) {
        return { erro: `❌ A OpenAI não transcreve áudio ${tipo}: só ${[...new Set(Object.values(EXTENSOES_DE_AUDIO))].join(', ')}.` };
    }
    if (midia.data.length * 0.75 > AUDIO_MAX_BYTES) {
        return { erro: `❌ O áudio tem mais de ${AUDIO_MAX_BYTES / 1024 / 1024} MB: é grande demais para transcrever.` };
    }
    return { audio: { arquivo: `audio.${extensao}`, mimetype: tipo, data: midia.data } };
}

// "agora transcreva isso", "transcreve": é só a transcrição (sem pergunta para o chat)
const soTranscrever = (args) => !args.trim() ||
    (/^(agora\s+)?transcrev\w*/i.test(args.trim()) && args.trim().split(/\s+/).length <= 6);

/*
 * Respondendo um áudio: transcreve (v1/audio/transcriptions). Sem pergunta, ou só "transcreva", responde a
 * transcrição; com outra pergunta ("resuma", "traduza para o inglês"), manda a transcrição junto para o chat.
 */
async function responderAoAudio(msg, { audio, erro }, args) {
    if (erro) {
        await msg.reply(erro);
        return;
    }

    try {
        const transcricao = await transcreverAudio({ cmd: '/gpt', audio });
        if (!transcricao) {
            await msg.reply('🤖 Não ouvi fala nenhuma nesse áudio.');
            return;
        }
        if (soTranscrever(args)) {
            await msg.reply(`🤖 *Transcrição:*\n${transcricao}`);
            return;
        }

        const resposta = await perguntarAoChat({
            cmd: '/gpt', sistema: GPT_INSTRUCOES, texto: `${args.trim()}\n\nTranscrição do áudio:\n${transcricao}`
        });
        await msg.reply(`🤖 ${resposta}`);
    } catch (err) {
        await msg.reply(erroOpenAi(err, '/gpt'));
    }
}

/*
 * /gpt -voz [texto]: a voz do texto (v1/audio/speech), de robô por padrão, numa nota de voz. Sem
 * texto digitado, fala o da mensagem respondida.
 */
async function falarTexto(msg, args, quotedMsg) {
    const digitado = args.replace(/(^|\s)-(?:voz|v)(?=\s|$)/, '').trim();
    const texto = digitado || String(quotedMsg?.body ?? '').trim();

    if (!texto) {
        await msg.reply('❌ Use: /gpt -voz <texto> (ou responda uma mensagem de texto)');
        return;
    }
    if (texto.length > VOZ_MAX_CARACTERES) {
        await msg.reply(`❌ O texto tem ${texto.length} caracteres: a voz aceita até ${VOZ_MAX_CARACTERES}.`);
        return;
    }

    try {
        const voz = await sintetizarVoz({ cmd: '/gpt', texto });
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voz.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
    } catch (err) {
        await msg.reply(erroOpenAi(err, '/gpt'));
    }
}

const DIAS_PADRAO = 7;
const DIAS_MAX = 31;

const soma = () => ({ entrada: 0, saida: 0, cache: 0, requisicoes: 0 });
const tokens = (t) => t.entrada + t.saida;
const resumo = (t) => `${fmtNum(tokens(t))} tokens · ${fmtNum(t.requisicoes)} req`;

// Os buckets da Usage API → o texto do chat: o total, por dia e por modelo
function textoDoConsumo(buckets, dias) {
    const total = soma();
    const porDia = new Map();
    const porModelo = new Map();
    const acumular = (mapa, chave, r) => {
        const t = mapa.get(chave) ?? soma();
        t.entrada += r.input_tokens ?? 0;
        t.saida += r.output_tokens ?? 0;
        t.cache += r.input_cached_tokens ?? 0;
        t.requisicoes += r.num_model_requests ?? 0;
        mapa.set(chave, t);
    };

    for (const b of buckets) {
        for (const r of b.results ?? []) {
            acumular(new Map([[0, total]]), 0, r);
            acumular(porDia, b.start_time, r);
            acumular(porModelo, r.model ?? '(sem modelo)', r);
        }
    }

    const dia = (inicio) => new Date(inicio * 1000).toISOString().slice(5, 10).split('-').reverse().join('/');
    const linhas = [
        `📊 *Consumo da OpenAI* — ${dias === 1 ? 'hoje' : `últimos ${dias} dias`}`,
        `🔢 ${fmtNum(tokens(total))} tokens · entrada ${fmtNum(total.entrada)} (cache ${fmtNum(total.cache)}) · saída ${fmtNum(total.saida)}`,
        `🔁 ${fmtNum(total.requisicoes)} requisições`
    ];

    if (porDia.size) {
        linhas.push('', '📅 *Por dia* _(UTC)_');
        for (const [inicio, t] of [...porDia].sort((a, b) => a[0] - b[0])) linhas.push(`• ${dia(inicio)} · ${resumo(t)}`);
    }
    if (porModelo.size) {
        linhas.push('', '🧠 *Por modelo*');
        for (const [modelo, t] of [...porModelo].sort((a, b) => tokens(b[1]) - tokens(a[1])).slice(0, 8)) {
            linhas.push(`• ${modelo} · ${resumo(t)}`);
        }
    }
    if (!porDia.size && !porModelo.size) linhas.push('', 'ℹ️ Nenhum uso nesse período.');
    return linhas.join('\n');
}

// Os cabeçalhos x-ratelimit-* → o texto do chat
function textoDosLimites({ modelo, tokens: t, requisicoes: r }) {
    const linha = (nome, x) => (x.limite
        ? `• ${nome}: ${fmtNum(x.restante ?? 0)} de ${fmtNum(x.limite)}${x.reseta ? ` · reseta em ${x.reseta}` : ''}`
        : null);
    const linhas = [linha('tokens', t), linha('requisições', r)].filter(Boolean);
    return [`⏱️ *Limites agora* — ${modelo}`, ...(linhas.length ? linhas : ['• A OpenAI não informou os limites.'])].join('\n');
}

/*
 * /gpt -usage [dias]: o consumo (Usage API, com a chave de admin) e os limites de agora (cabeçalhos
 * de uma chamada mínima, com a chave normal). Só o dono e os admins (role no comandos).
 */
async function mostrarUso(msg, diasDigitado) {
    const dias = diasDigitado == null ? DIAS_PADRAO : Number(diasDigitado);
    if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAX) {
        await msg.reply(`❌ Use: /gpt -usage [dias] (de 1 a ${DIAS_MAX}; padrão ${DIAS_PADRAO})`);
        return;
    }

    const comAdmin = Boolean(chaveAdminOpenAi());
    const comChave = Boolean(chaveOpenAi());
    if (!comAdmin && !comChave) {
        await msg.reply(`${SEM_CHAVE('/gpt')}\n💡 _Para o consumo, a chave de admin: OPENAI_ADMIN_KEY ou /set openai.admin.key_`);
        return;
    }

    const partes = [];

    if (comAdmin) {
        try {
            partes.push(textoDoConsumo((await consultarConsumo({ cmd: '/gpt', dias })).buckets, dias));
        } catch (err) {
            const status = err.response?.status;
            partes.push(status === 401 || status === 403
                ? '🔑 A chave de admin foi recusada. A Usage API pede uma Admin key (sk-admin-...), criada em ' +
                    'platform.openai.com › Organization › Admin keys.'
                : erroOpenAi(err, '/gpt -usage'));
        }
    } else {
        partes.push('💡 _Para ver o consumo, defina a chave de admin: OPENAI_ADMIN_KEY no config/.env ou /set openai.admin.key <chave>_');
    }

    if (comChave) {
        try {
            partes.push(textoDosLimites(await consultarLimites({ cmd: '/gpt' })));
        } catch (err) {
            partes.push(erroOpenAi(err, '/gpt -usage'));
        }
    }

    await msg.reply(partes.join('\n\n'));
}

async function cmdGpt({ msg, args, opts, quotedMsg }) {
    if (opts?.given.has('usage')) {
        await mostrarUso(msg, opts.opt.usage);
        return;
    }

    if (opts?.given.has('model')) {
        await trocarModelo(msg, opts.opt.model);
        return;
    }

    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/gpt'));
        return;
    }

    // -voz: o texto vira uma nota de voz
    if (opts?.given.has('voz')) {
        await falarTexto(msg, args, quotedMsg);
        return;
    }

    // Respondendo um áudio: a transcrição (e, com uma pergunta, o chat em cima dela)
    const audio = await audioDaResposta(quotedMsg);
    if (audio) {
        await responderAoAudio(msg, audio, args);
        return;
    }

    // Respondendo uma mensagem, o texto dela (ou a legenda da foto) entra antes da pergunta
    let pergunta = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    // Respondendo uma foto, ela vai junto da pergunta (sem pergunta, o /gpt descreve a foto)
    const foto = await imagemDaResposta(quotedMsg);
    if (foto?.erro) {
        await msg.reply(foto.erro);
        return;
    }
    if (foto && !pergunta) pergunta = PERGUNTA_DA_FOTO;

    if (!pergunta) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    try {
        const resposta = await perguntarAoChat({
            cmd: '/gpt', sistema: GPT_INSTRUCOES, texto: pergunta, imagem: foto?.imagem
        });

        // O 🤖 na frente também garante que a resposta nunca começa com "/" (ver marcarEnviadaPeloBot)
        await msg.reply(`🤖 ${resposta}`);
    } catch (err) {
        await msg.reply(erroOpenAi(err, '/gpt'));
    }
}

module.exports = {
    cmdGpt
};
