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
    SEM_CHAVE, atualizarPrecos, chaveAdminOpenAi, chaveOpenAi, consultarConsumo, consultarCustos, consultarLimites, consultarServicos, erroOpenAi, gerarImagem,
    listarModelos, medirConsumo, perguntarAoChat, rodapeDeConsumo, sintetizarVoz, transcreverAudio, VOZ_MAX_CARACTERES
} = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { capturarSaida, runCommand } = require('../util/processos');
const { fmtNum, plural } = require('../util/formatar');

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

/*
 * O documento respondido: texto puro (txt, md, csv, json, código...) e PDF (pelo pdftotext). O conteúdo
 * vai para o chat como texto, depois da pergunta. Outros formatos (docx, xlsx...) não são lidos.
 */
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_MAX_CARACTERES = 60000;
const DOC_TIPOS_DE_TEXTO = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|x-sh|sql|csv))/i;
const DOC_EXTENSOES_DE_TEXTO = /\.(txt|md|csv|tsv|json|xml|ya?ml|log|ini|conf|sh|js|ts|py|rb|go|rs|c|h|cpp|java|sql|html?|css)$/i;

/**
 * @returns {Promise<null | { documento: { nome: string, texto: string } } | { erro: string }>}
 *   null: a mensagem respondida não é um documento
 */
async function documentoDaResposta(quotedMsg) {
    if (!quotedMsg?.hasMedia || quotedMsg.type !== 'document') return null;

    const midia = await quotedMsg.downloadMedia().catch(() => null);
    if (!midia?.data) return { erro: '❌ Não consegui baixar o documento (ele pode ter expirado no WhatsApp).' };
    if (midia.data.length * 0.75 > DOC_MAX_BYTES) {
        return { erro: `❌ O documento tem mais de ${DOC_MAX_BYTES / 1024 / 1024} MB: é grande demais para o /gpt.` };
    }

    const nome = midia.filename || 'documento';
    const tipo = String(midia.mimetype).split(';')[0].trim().toLowerCase();
    const bytes = Buffer.from(midia.data, 'base64');
    let texto;

    if (tipo === 'application/pdf' || /\.pdf$/i.test(nome)) {
        const pasta = path.join(TMP_DIR, `doc-${crypto.randomBytes(6).toString('hex')}`);
        fs.mkdirSync(pasta, { recursive: true });
        try {
            const arquivo = path.join(pasta, 'doc.pdf');
            fs.writeFileSync(arquivo, bytes);
            texto = await capturarSaida('pdftotext', ['-layout', arquivo, '-'], 60_000);
        } catch {
            return { erro: '❌ Não consegui ler o PDF (o pdftotext, do poppler-utils, precisa estar instalado).' };
        } finally {
            fs.rmSync(pasta, { recursive: true, force: true });
        }
    } else if (DOC_TIPOS_DE_TEXTO.test(tipo) || DOC_EXTENSOES_DE_TEXTO.test(nome)) {
        texto = bytes.toString('utf8');
    } else {
        return { erro: `❌ O /gpt lê documento de texto e PDF, não ${tipo || nome}.` };
    }

    texto = texto.trim();
    if (!texto) return { erro: '❌ Não achei texto nesse documento (um PDF escaneado, talvez).' };
    return { documento: { nome, texto: texto.slice(0, DOC_MAX_CARACTERES) } };
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
            await concluirAviso(msg, aviso, `🤖 *Transcrição:*\n${transcricao}${await rodapeDeConsumo()}`);
            return;
        }

        const resposta = await perguntarAoChat({
            cmd: '/gpt', sistema: GPT_INSTRUCOES, texto: `${args.trim()}\n\nTranscrição do áudio:\n${transcricao}`
        });
        await concluirAviso(msg, aviso, `🤖 ${resposta}${await rodapeDeConsumo()}`);
    } catch (err) {
        await concluirAviso(msg, aviso, (transcrevendo && await erroDoModelo(err, MODELO_DE_AUDIO)) || erroOpenAi(err, '/gpt'));
    }
}

// Mídia (voz, imagem, GIF) não tem rodapé: com o status ligado, o consumo vai numa mensagem à parte
async function responderConsumo(msg) {
    const rodape = (await rodapeDeConsumo()).trim();
    if (rodape) await msg.reply(rodape);
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
 * O que o /gpt -voz fala da mensagem respondida: o texto dela ou, se for áudio, a transcrição.
 * @returns {Promise<{ texto?: string, erro?: string }>}  sem texto: não há o que falar na resposta
 */
async function conteudoParaFalar(quotedMsg) {
    const audio = await audioDaResposta(quotedMsg);
    if (!audio) return { texto: String(quotedMsg?.body ?? '').trim() };
    if (audio.erro) return { erro: audio.erro };

    try {
        const transcricao = await transcreverAudio({ cmd: '/gpt', audio: audio.audio });
        return transcricao ? { texto: transcricao } : { erro: '🤖 Não ouvi fala nenhuma nesse áudio.' };
    } catch (err) {
        return { erro: (await erroDoModelo(err, MODELO_DE_AUDIO)) || erroOpenAi(err, '/gpt') };
    }
}

/*
 * /gpt -voz [texto]: a voz do texto (v1/audio/speech), de robô por padrão, numa nota de voz. Sem
 * texto digitado, fala o da mensagem respondida.
 */
async function falarTexto(msg, args, quotedMsg) {
    const digitado = args.replace(/(^|\s)-(?:voz|v)(?=\s|$)/, '').trim();
    let texto = digitado;
    let estilo = null;

    // Respondendo um texto (ou um áudio, que é transcrito): o que foi digitado é o estilo da fala
    // ("/gpt -voz fale como um robô metálico") e o conteúdo respondido é o que se fala.
    const respondido = await conteudoParaFalar(quotedMsg);
    if (respondido.erro) {
        await msg.reply(respondido.erro);
        return;
    }
    if (respondido.texto) {
        texto = respondido.texto;
        estilo = digitado || null;
    }

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
        const voz = await sintetizarVoz({ cmd: '/gpt', texto, estilo });
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voz.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
        await apagarAviso(aviso);
        await responderConsumo(msg);
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
        await responderConsumo(msg);
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
        await responderConsumo(msg);
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

// Dólares em pt-BR: centavos, ou 4 casas quando é menos de 1 centavo ($0,0012)
const usd = (v) => `$${v.toLocaleString('pt-BR', v === 0 || v >= 0.01
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const somaCustos = (buckets) => buckets.reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0), 0);
const dataCurta = (inicio) => new Date(inicio * 1000).toISOString().slice(5, 10).split('-').reverse().join('/');

// O uso de imagens, voz, transcrição e embeddings (o que não veio ou está zerado não aparece)
function linhasDosServicos(servicos) {
    const somar = (buckets, campo) => (buckets ?? []).reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + (r[campo] ?? 0), 0), 0);
    const defs = [
        ['images', '🖼️ Imagens', 'images', 'imagens'],
        ['audio_speeches', '🔊 Voz', 'characters', 'caracteres'],
        ['audio_transcriptions', '🎙️ Transcrição', 'seconds', 's de áudio'],
        ['embeddings', '🧬 Embeddings', 'input_tokens', 'tokens']
    ];
    return defs.flatMap(([nome, rotulo, campo, unidade]) => {
        const req = somar(servicos?.[nome], 'num_model_requests');
        return req ? [`• ${rotulo} · ${fmtNum(somar(servicos[nome], campo))} ${unidade} · ${fmtNum(req)} req`] : [];
    });
}

/*
 * Os buckets da Usage API (+ os custos e os outros usos) → o texto do chat: o dinheiro, o total, por dia,
 * por modelo, por serviço. Os custos e os serviços são extras: sem eles, só os tokens.
 */
function textoDoConsumo(buckets, dias, { custos = null, servicos = null } = {}) {
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

    // Os custos do período (o item é "modelo, input"; o prefixo é o modelo) por dia e por modelo
    const doPeriodo = custos ?? [];
    const custoDia = new Map();
    const custoItem = new Map();
    for (const b of doPeriodo) {
        for (const r of b.results ?? []) {
            const v = Number(r.amount?.value ?? 0);
            custoDia.set(b.start_time, (custoDia.get(b.start_time) ?? 0) + v);
            const item = String(r.line_item ?? '(outros)').split(', ')[0];
            custoItem.set(item, (custoItem.get(item) ?? 0) + v);
        }
    }
    const comCusto = custos !== null;
    const custo = (v) => (comCusto ? ` · ${usd(v ?? 0)}` : '');

    const linhas = [`📊 *Consumo da OpenAI* — ${dias === 1 ? 'hoje' : `últimos ${dias} dias`}`];
    if (comCusto) linhas.push(`💵 Gasto: *${usd(somaCustos(doPeriodo))}*`);
    linhas.push(
        `🔢 ${fmtNum(tokens(total))} tokens · entrada ${fmtNum(total.entrada)} (cache ${fmtNum(total.cache)}) · saída ${fmtNum(total.saida)}`,
        `🔁 ${fmtNum(total.requisicoes)} requisições`
    );

    if (porDia.size) {
        linhas.push('', '📅 *Por dia* _(UTC)_');
        for (const [dia, t] of [...porDia].sort((a, b) => a[0] - b[0])) {
            linhas.push(`• ${dataCurta(dia)} · ${resumo(t)}${custo(custoDia.get(dia))}`);
        }
    }
    if (porModelo.size) {
        linhas.push('', '🧠 *Por modelo*');
        for (const [modelo, t] of [...porModelo].sort((a, b) => tokens(b[1]) - tokens(a[1])).slice(0, 8)) {
            linhas.push(`• ${modelo} · ${resumo(t)}${custo(custoItem.get(modelo))}`);
        }
    }

    // O que gastou e não é chat (imagem, voz, transcrição...): os itens de custo sem modelo de chat
    const outros = [...custoItem].filter(([item, v]) => !porModelo.has(item) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const extras = linhasDosServicos(servicos);
    if (outros.length) {
        linhas.push('', '🧾 *Outros custos*', ...outros.map(([item, v]) => `• ${item} · ${usd(v)}`));
    }
    if (extras.length) linhas.push('', '🧰 *Outros usos*', ...extras);

    if (!porDia.size && !porModelo.size && !extras.length) linhas.push('', 'ℹ️ Nenhum uso nesse período.');
    return linhas.join('\n');
}

/*
 * O saldo em dólares: $usado/$total. A API não informa o saldo, então o total é o openai.credit.total
 * (o que foi comprado) e o usado é o gasto desde o openai.credit.since (sem ele, os últimos 180 dias).
 */
function textoDoSaldo(usado, total, desde) {
    const resta = total - usado;
    return `💰 *Créditos:* ${usd(usado)}/${usd(total)} · ${resta >= 0 ? `restam *${usd(resta)}*` : `*${usd(-resta)} acima do total*`}` +
        ` _(gasto ${desde ? `desde ${desde.split('-').reverse().join('/')}` : 'nos últimos 180 dias'})_`;
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
            const total = getSetting('openai.credit.total');
            const desdeData = getSetting('openai.credit.since');
            const agora = Math.floor(Date.now() / 1000);
            const inicioSaldo = desdeData ? Math.floor(Date.parse(desdeData) / 1000) : agora - 180 * 86400;

            // O consumo é obrigatório (o erro dele é o da chave); o custo, o saldo e os outros usos são extras
            const [consumo, custos, custosDoSaldo, servicos] = await Promise.all([
                consultarConsumo({ cmd: '/gpt', dias }),
                consultarCustos({ cmd: '/gpt', desde: agora - dias * 86400 }).catch(() => null),
                total ? consultarCustos({ cmd: '/gpt', desde: inicioSaldo }).catch(() => null) : null,
                consultarServicos({ cmd: '/gpt', dias })
            ]);

            if (custosDoSaldo) partes.push(textoDoSaldo(somaCustos(custosDoSaldo), total, desdeData));
            partes.push(textoDoConsumo(consumo.buckets, dias, { custos, servicos }));
            if (!total && custos) {
                partes.push('💡 _Para ver $usado/$total: /set openai.credit.total <dólares comprados> e ' +
                    '/set openai.credit.since AAAA-MM-DD (a API da OpenAI não informa o saldo)._');
            }
        } catch (err) {
            const status = err.response?.status;
            const motivo = err.response?.data?.error?.message ?? '';
            const escopo = /api\.usage\.read/.test(motivo);
            partes.push(status === 401 || status === 403
                ? '🔑 A chave de admin foi recusada' + (escopo ? ': ela não tem o escopo api.usage.read.' : '.') +
                    '\n💡 _A Usage API pede uma Admin key (sk-admin-..., em platform.openai.com › Organization › ' +
                    'Admin keys) ou uma chave com o escopo Usage em Read. Uma chave de projeto (sk-proj-...) comum não serve._'
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

/*
 * /gpt -prices: busca a tabela de preços no site da OpenAI e atualiza o openai.pricing (o custo estimado
 * do -status). Os modelos que você adicionou à mão e a página não tem ficam como estão.
 */
async function mostrarPrecos(msg) {
    const aviso = await avisarProcessando(msg);
    try {
        const { novos, mudados, iguais } = await atualizarPrecos({ cmd: '/gpt' });
        const linhas = [
            ...mudados.map(m => `🔄 ${m.modelo}: ${m.antes} → *${m.depois}*`),
            ...novos.map(m => `➕ ${m}`)
        ];
        const resumo = linhas.length
            ? `✅ *Preços atualizados* (${plural(mudados.length, 'alterado', 'alterados')}, ${plural(novos.length, 'novo', 'novos')}, ${iguais} sem mudança)\n${linhas.slice(0, 20).join('\n')}` +
                (linhas.length > 20 ? `\n_…e mais ${linhas.length - 20}_` : '')
            : `✅ Os ${iguais} preços já estão em dia.`;
        await concluirAviso(msg, aviso, `${resumo}\n💡 _Dólares por 1M de tokens, entrada/saída (openai.pricing)._`);
    } catch (err) {
        await concluirAviso(msg, aviso, `❌ Não consegui atualizar os preços: ${err.message}`);
    }
}

async function perguntar({ msg, args, opts, quotedMsg, admin }) {
    if (opts?.given.has('usage')) {
        await mostrarUso(msg, opts.opt.usage);
        return;
    }

    if (opts?.given.has('model')) {
        await trocarModelo(msg, opts.opt.model, opts);
        return;
    }

    if (opts?.given.has('prices')) {
        await mostrarPrecos(msg);
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

    // Respondendo um documento: o conteúdo dele entra junto da pergunta
    const doc = await documentoDaResposta(quotedMsg);
    if (doc?.erro) {
        await msg.reply(doc.erro);
        return;
    }

    // Respondendo uma mensagem, o texto dela (ou a legenda da foto, ou o documento) entra antes da pergunta
    const respondido = doc
        ? `Documento "${doc.documento.nome}":\n${doc.documento.texto}`
        : String(quotedMsg?.body ?? '').trim();
    let pergunta = [respondido, args.trim()].filter(Boolean).join('\n\n');

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
        await concluirAviso(msg, aviso, `🤖 ${resposta}${await rodapeDeConsumo()}`);
    } catch (err) {
        await concluirAviso(msg, aviso, erroOpenAi(err, '/gpt'));
    }
}

// O -status|-s (ou o setting openai.status) mostra o consumo da chamada no rodapé
const cmdGpt = (ctx) => medirConsumo(ctx.opts?.given.has('status'), () => perguntar(ctx));

module.exports = {
    cmdGpt
};
