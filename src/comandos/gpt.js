/*
 * Comando /gpt.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sharp = require('sharp');
const { MessageMedia } = require('whatsapp-web.js');

const { concluirAviso } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { BIN_FFMPEG, TMP_DIR } = require('../constantes');
const { OPENAI_MODELOS } = require('../openai');
const {
    SEM_CHAVE, chaveAdminOpenAi, chaveOpenAi, consultarConsumo, consultarLimites, erroOpenAi, gerarImagem,
    listarModelos, perguntarAoChat, sintetizarVoz, transcreverAudio, VOZ_MAX_CARACTERES
} = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { runCommand } = require('../util/processos');
const { fmtNum } = require('../util/formatar');

/*
 * /gpt: pergunta ao ChatGPT (a chamada e os erros ficam no openaiChat.js).
 */
const GPT_INSTRUCOES = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma. ' +
    'Formate para o WhatsApp, que não é Markdown: *negrito* com um asterisco só, _itálico_, ~tachado~, ' +
    'listas com "- " ou "1. ", código entre crases (``` para blocos). Não use títulos com #, tabelas, ' +
    'linhas "---" nem **dois asteriscos**.';

/*
 * /gpt -m: os modelos por uso e a troca de cada um. Sem modelo, lista (com o -gif, o -audio ou o -voz, só
 * aquele uso); com modelo, grava o do uso pedido: sem opção, o das perguntas; com -img/-gif, o da imagem;
 * com -audio, o da transcrição; com -voz, o da voz. A lista é a da chave (GET /v1/models), com a fixa do
 * código de reserva quando a chave não responde.
 */
const USOS_DE_MODELO = [
    {
        nome: 'Padrão', detalhe: 'perguntas', opcoes: [], setting: 'openai.api.model',
        exemplo: '/gpt -m <modelo>', daConta: (id) => OPENAI_MODELOS.includes(id), reserva: OPENAI_MODELOS
    },
    {
        nome: '-img, -gif', detalhe: 'imagens e GIF', opcoes: ['img', 'gif'], setting: 'openai.image.model',
        exemplo: '/gpt -m <modelo> -gif', daConta: (id) => /image|dall-e/i.test(id)
    },
    {
        nome: '-audio', detalhe: 'transcrição de áudio', opcoes: ['audio'], setting: 'openai.transcribe.model',
        exemplo: '/gpt -m <modelo> -audio', daConta: (id) => /transcribe|whisper/i.test(id)
    },
    {
        nome: '-voz', detalhe: 'voz', opcoes: ['voz'], setting: 'openai.tts.model',
        exemplo: '/gpt -m <modelo> -voz', daConta: (id) => /tts/i.test(id)
    }
];

// O uso que o -m pede: o das opções que vieram junto (a 1ª que casar) ou o padrão
const usoPedido = (opts) => USOS_DE_MODELO.find(u => u.opcoes.some(o => opts?.given.has(o))) ?? null;

// Os modelos da chave, ou null (sem chave ou sem resposta)
async function modelosDaConta() {
    if (!chaveOpenAi()) return null;
    try {
        return await listarModelos({ cmd: '/gpt' });
    } catch {
        return null;
    }
}

// O modelo em uso: o do .env (só o padrão) ou o setting
const modeloAtual = (uso) => (uso.setting === 'openai.api.model'
    ? envOuSetting('OPENAI_MODEL', 'openai.api.model')
    : getSetting(uso.setting));

async function trocarModelo(msg, modelo, opts) {
    const doEnv = process.env.OPENAI_MODEL?.trim();
    const pedido = usoPedido(opts);
    const ids = await modelosDaConta();

    if (!modelo) {
        const usos = pedido ? [pedido] : USOS_DE_MODELO;
        const blocos = usos.map(uso => {
            const atual = modeloAtual(uso);
            const doUso = ids ? ids.filter(uso.daConta) : (uso.reserva ?? []);
            const lista = [...new Set([atual, ...(doUso.length ? doUso : (uso.reserva ?? []))])];
            const linhas = lista.map(m => `${m === atual ? '✅' : '▫️'} ${m}${ids && !ids.includes(m) ? ' ⚠️ a sua chave não vê' : ''}`);
            const origem = uso.setting === 'openai.api.model' && doEnv ? ' _(o atual vem do OPENAI_MODEL no .env)_' : '';
            return `*${uso.nome}* (${uso.detalhe}) — ${uso.exemplo}${origem}\n${linhas.join('\n')}`;
        });
        await msg.reply(`🤖 *Modelos do /gpt*\n\n${blocos.join('\n\n')}\n\n` + (ids
            ? '💡 _A lista é a da sua chave (GET /v1/models)._'
            : '💡 _Sem a lista da sua chave (sem chave ou sem resposta da OpenAI): só os padrões._'));
        return;
    }

    // Um modelo que a chave não vê não adianta gravar (os de imagem, áudio e voz são livres, sem lista fixa)
    if (pedido && ids && !ids.includes(modelo)) {
        const candidatos = ids.filter(pedido.daConta);
        await msg.reply(`❌ A sua chave não vê o modelo ${modelo} (${pedido.detalhe}).` +
            (candidatos.length ? `\n💡 _Os que ela vê: ${candidatos.join(', ')}_` : ''));
        return;
    }

    const setting = pedido?.setting ?? 'openai.api.model';
    try {
        await setSetting(setting, modelo);
    } catch (e) {
        await msg.reply(`❌ Modelo ${e.message}`);
        return;
    }

    if (pedido) {
        await msg.reply(`✅ Modelo de ${pedido.detalhe} do /gpt: *${getSetting(setting)}*`);
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
 * Como no /get: o "⏳ Processando…" sai antes da chamada e vira a resposta (o WhatsApp edita a mensagem).
 * Mídia não dá para editar: nela o aviso é apagado quando a mídia sai.
 */
const avisarProcessando = (msg) => msg.reply('⏳ Processando o /gpt, aguarde.', null, { linkPreview: false });

async function apagarAviso(aviso) {
    try {
        await aviso?.delete?.(true);
    } catch { /* fica o aviso: não atrapalha a resposta */ }
}

/*
 * Respondendo um áudio: transcreve (v1/audio/transcriptions). Sem pergunta, ou só "transcreva", responde a
 * transcrição; com outra pergunta ("resuma", "traduza para o inglês"), manda a transcrição junto para o chat.
 */
async function responderAoAudio(msg, { audio, erro }, args) {
    if (erro) {
        await msg.reply(erro);
        return;
    }

    const aviso = await avisarProcessando(msg);
    let transcrevendo = true;
    try {
        const transcricao = await transcreverAudio({ cmd: '/gpt', audio });
        transcrevendo = false;
        if (!transcricao) {
            await concluirAviso(msg, aviso, '🤖 Não ouvi fala nenhuma nesse áudio.');
            return;
        }
        if (soTranscrever(args)) {
            await concluirAviso(msg, aviso, `🤖 *Transcrição:*\n${transcricao}`);
            return;
        }

        const resposta = await perguntarAoChat({
            cmd: '/gpt', sistema: GPT_INSTRUCOES, texto: `${args.trim()}\n\nTranscrição do áudio:\n${transcricao}`
        });
        await concluirAviso(msg, aviso, `🤖 ${resposta}`);
    } catch (err) {
        await concluirAviso(msg, aviso, (transcrevendo && await erroDoModelo(err, MODELO_DE_AUDIO)) || erroOpenAi(err, '/gpt'));
    }
}

// Para o erro de modelo: o setting, o filtro da lista de modelos da conta e o nome do recurso
const MODELO_DE_AUDIO = { setting: 'openai.transcribe.model', tipo: /whisper|transcribe|audio/i, nome: 'transcrição' };
const MODELO_DE_VOZ = { setting: 'openai.tts.model', tipo: /tts|speech|audio/i, nome: 'voz' };
const MODELO_DE_IMAGEM = { setting: 'openai.image.model', tipo: /image|dall/i, nome: 'imagem' };

/*
 * "The model 'x' does not exist": o setting aponta para um modelo que a conta não tem. Em vez do erro cru,
 * lista os que a chave vê (GET /v1/models) parecidos com o tipo pedido e diz como trocar.
 * @param {object} err
 * @param {{ setting: string, tipo: RegExp, nome: string }} o  o setting do modelo, o filtro da lista e o nome do recurso
 */
async function erroDoModelo(err, { setting, tipo, nome }) {
    const mensagem = err.response?.data?.error?.message ?? '';
    if (!/does not exist|model_not_found|not found/i.test(`${mensagem} ${err.response?.data?.error?.code ?? ''}`)
        || !/model/i.test(mensagem)) {
        return null;
    }

    const modelo = getSetting(setting);
    let candidatos = [];
    try {
        candidatos = (await listarModelos({ cmd: '/gpt' })).filter(id => tipo.test(id));
    } catch { /* sem a lista, só o aviso */ }

    return `❌ O modelo ${modelo} não existe na sua conta da OpenAI (${nome}).\n` +
        (candidatos.length ? `💡 _A sua chave vê: ${candidatos.join(', ')}_\n` : '💡 _Não achei na lista da sua chave nenhum modelo parecido._\n') +
        `💡 _Troque com /set ${setting} <modelo>_`;
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

    const aviso = await avisarProcessando(msg);
    try {
        const voz = await sintetizarVoz({ cmd: '/gpt', texto });
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voz.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
        await apagarAviso(aviso);
    } catch (err) {
        await concluirAviso(msg, aviso, (await erroDoModelo(err, MODELO_DE_VOZ)) || erroOpenAi(err, '/gpt'));
    }
}

/*
 * /gpt -img [pedido] e /gpt -gif [pedido]: criam uma imagem e um GIF animado (os dois pela API de imagens,
 * v1/images; o GIF é o output_format gif dos modelos gpt-image-2.6-*). Respondendo uma foto, ela é a base:
 * a edição. Os dois custam dinheiro, então são só do dono e dos admins.
 */

// "gere um gif animado de ...", "faça uma animação...": o pedido de GIF sem o -gif (só respondendo uma foto)
const PEDIU_GIF = /\b(gif|anima[çc][ãa]o|animad[oa]|v[ií]deo)\b/i;
const VERBO_DE_CRIAR = /\b(ger[ae]r?|cri[ae]r?|fa[çc]a|fazer|faz|anim[ae]r?|transform\w*)\b/i;
const pedeGif = (texto) => PEDIU_GIF.test(texto) && VERBO_DE_CRIAR.test(texto);

const ehFoto = (quotedMsg) => Boolean(quotedMsg?.hasMedia) && ['image', 'sticker'].includes(quotedMsg.type);

// O texto do pedido sem a opção (-img, -gif)
const semOpcao = (args, nomes) => args.replace(new RegExp(`(^|\\s)-(?:${nomes})(?=\\s|$)`), '').trim();

// A mensagem para quem não é dono nem admin
const SO_DONO_GERAR = (o) => `⛔ Apenas o dono do bot (ou um admin) pode ${o}.`;

// A foto respondida em PNG (a edição da OpenAI pede png, jpeg ou webp; o gif e a figurinha viram png)
const fotoEmPng = async (foto) => sharp(Buffer.from(foto.imagem.data, 'base64')).png().toBuffer();

async function criarImagem(msg, args, quotedMsg) {
    const pedido = semOpcao(args, 'img');
    const foto = await imagemDaResposta(quotedMsg);
    if (foto?.erro) {
        await msg.reply(foto.erro);
        return;
    }
    if (!pedido) {
        await msg.reply('❌ Use: /gpt -img <o que criar> (respondendo uma foto, ela é editada)');
        return;
    }

    const aviso = await avisarProcessando(msg);
    try {
        const b64 = await gerarImagem({ cmd: '/gpt', prompt: pedido, imagem: foto ? await fotoEmPng(foto) : null });
        await msg.reply(new MessageMedia('image/png', b64, 'imagem.png'));
        await apagarAviso(aviso);
    } catch (err) {
        await concluirAviso(msg, aviso, (await erroDoModelo(err, MODELO_DE_IMAGEM)) || erroOpenAi(err, '/gpt'));
    }
}

// O GIF da OpenAI vira um MP4 sem áudio: é assim que o WhatsApp toca um GIF (como o /giphy manda)
async function gifParaMp4(gif) {
    const pasta = path.join(TMP_DIR, `gif-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(pasta, { recursive: true });

    try {
        const entrada = path.join(pasta, 'entrada.gif');
        const saida = path.join(pasta, 'saida.mp4');
        fs.writeFileSync(entrada, gif);
        await runCommand(BIN_FFMPEG, [
            '-y', '-loglevel', 'error', '-i', entrada,
            '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an',
            saida
        ], 'ignore', 60_000);
        return fs.readFileSync(saida);
    } finally {
        fs.rmSync(pasta, { recursive: true, force: true });
    }
}

async function criarGif(msg, args, quotedMsg) {
    const pedido = semOpcao(args, 'gif');
    const foto = await imagemDaResposta(quotedMsg);
    if (foto?.erro) {
        await msg.reply(foto.erro);
        return;
    }
    if (!pedido && !foto) {
        await msg.reply('❌ Use: /gpt -gif <o que animar> (respondendo uma foto, ela é animada)');
        return;
    }

    const aviso = await avisarProcessando(msg);
    try {
        const b64 = await gerarImagem({
            cmd: '/gpt',
            prompt: foto ? `Anime esta imagem em um GIF. ${pedido || 'Com um movimento sutil e natural.'}` : pedido,
            imagem: foto ? await fotoEmPng(foto) : null,
            gif: { frames: getSetting('openai.gif.frames'), frameMs: getSetting('openai.gif.frameMs') }
        });
        const mp4 = await gifParaMp4(Buffer.from(b64, 'base64'));
        await msg.reply(new MessageMedia('video/mp4', mp4.toString('base64'), 'gif.mp4'), null, { sendVideoAsGif: true });
        await apagarAviso(aviso);
    } catch (err) {
        const mensagem = err.response?.data?.error?.message ?? '';
        await concluirAviso(msg, aviso, await erroDoModelo(err, MODELO_DE_IMAGEM) ||
            (/gif|preview/i.test(mensagem)
                ? `🔒 A sua conta/modelo não faz GIF animado: ${mensagem}\n💡 _Só os gpt-image-2.6-* fazem GIF, e pedem acesso à prévia. Troque com /set openai.image.model <modelo>_`
                : erroOpenAi(err, '/gpt')));
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

async function cmdGpt({ msg, args, opts, quotedMsg, admin }) {
    if (opts?.given.has('usage')) {
        await mostrarUso(msg, opts.opt.usage);
        return;
    }

    if (opts?.given.has('model')) {
        await trocarModelo(msg, opts.opt.model, opts);
        return;
    }

    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/gpt'));
        return;
    }

    // -img: cria (ou, respondendo uma foto, edita) uma imagem; -gif: um GIF (respondendo uma foto, anima).
    // Sem o -gif, "gere um gif animado..." respondendo uma foto também vale (e também é só do dono e dos admins).
    if (opts?.given.has('img')) {
        await criarImagem(msg, args, quotedMsg);
        return;
    }
    if (opts?.given.has('gif') || (ehFoto(quotedMsg) && pedeGif(args))) {
        if (!admin) {
            await msg.reply(SO_DONO_GERAR('gerar GIF'));
            return;
        }
        await criarGif(msg, args, quotedMsg);
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

    const aviso = await avisarProcessando(msg);
    try {
        const resposta = await perguntarAoChat({
            cmd: '/gpt', sistema: GPT_INSTRUCOES, texto: pergunta, imagem: foto?.imagem
        });

        // O 🤖 na frente também garante que a resposta nunca começa com "/" (ver marcarEnviadaPeloBot)
        await concluirAviso(msg, aviso, `🤖 ${resposta}`);
    } catch (err) {
        await concluirAviso(msg, aviso, erroOpenAi(err, '/gpt'));
    }
}

module.exports = {
    cmdGpt
};
