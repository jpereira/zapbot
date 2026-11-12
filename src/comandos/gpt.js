/*
 * Comando /gpt.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { MessageMedia } = require('whatsapp-web.js');

const { concluirAviso } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { desenhar } = require('./draw');
const {
    MODELO_DE_AUDIO, MODELO_DE_VOZ, SO_DONO_GERAR, USOS_DO_GPT, USO_DE_PERGUNTA, apagarAviso, avisarProcessando, ehFoto,
    erroDoModelo, imagemDaMensagem, responderConsumo, semOpcao, trocarModelo
} = require('./openaiComum');
const { TMP_DIR } = require('../constantes');
const { idioma, t } = require('../i18n');
const {
    SEM_CHAVE, atualizarPrecos, chaveAdminOpenAi, chaveOpenAi, consultarConsumo, consultarCustos, consultarLimites, consultarServicos, erroOpenAi,
    medirConsumo, perguntarAoChat, rodapeDeConsumo, sintetizarVoz, transcreverAudio, VOZ_MAX_CARACTERES
} = require('../openaiChat');
const { getSetting } = require('../settings');
const { capturarSaida } = require('../util/processos');

/*
 * /gpt: pergunta ao ChatGPT (a chamada e os erros ficam no openaiChat.js).
 */
const GPT_INSTRUCOES = () => t('gpt.instructions');

const PERGUNTA_DA_FOTO = () => t('gpt.describePhoto');

// Número e dinheiro no formato do idioma (pt-BR: 1.234,50; en-US: 1,234.50)
const loc = () => (idioma() === 'pt_BR' ? 'pt-BR' : 'en-US');
const fmtNum = (n) => Number(n).toLocaleString(loc());

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
    if (!midia?.data) return { erro: t('gpt.docDownload') };
    if (midia.data.length * 0.75 > DOC_MAX_BYTES) {
        return { erro: t('gpt.docTooBig', { mb: DOC_MAX_BYTES / 1024 / 1024 }) };
    }

    const nome = midia.filename || t('gpt.docName');
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
            return { erro: t('gpt.pdfRead') };
        } finally {
            fs.rmSync(pasta, { recursive: true, force: true });
        }
    } else if (DOC_TIPOS_DE_TEXTO.test(tipo) || DOC_EXTENSOES_DE_TEXTO.test(nome)) {
        texto = bytes.toString('utf8');
    } else {
        return { erro: t('gpt.docType', { tipo: tipo || nome }) };
    }

    texto = texto.trim();
    if (!texto) return { erro: t('gpt.docEmpty') };
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
    if (!midia?.data) return { erro: t('gpt.audioDownload') };

    // "audio/ogg; codecs=opus" (a nota de voz do WhatsApp) → "audio/ogg"
    const tipo = String(midia.mimetype).split(';')[0].trim().toLowerCase();
    const extensao = EXTENSOES_DE_AUDIO[tipo];
    if (!extensao) {
        return { erro: t('gpt.audioFormat', { tipo, formatos: [...new Set(Object.values(EXTENSOES_DE_AUDIO))].join(', ') }) };
    }
    if (midia.data.length * 0.75 > AUDIO_MAX_BYTES) {
        return { erro: t('gpt.audioTooBig', { mb: AUDIO_MAX_BYTES / 1024 / 1024 }) };
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

    const aviso = await avisarProcessando(msg, '/gpt');
    let transcrevendo = true;
    try {
        const transcricao = await transcreverAudio({ cmd: '/gpt', audio });
        transcrevendo = false;
        if (!transcricao) {
            await concluirAviso(msg, aviso, t('gpt.noSpeech'));
            return;
        }
        if (soTranscrever(args)) {
            await concluirAviso(msg, aviso, `${t('gpt.transcription', { texto: transcricao })}${await rodapeDeConsumo()}`);
            return;
        }

        const resposta = await perguntarAoChat({
            cmd: '/gpt', sistema: GPT_INSTRUCOES(), texto: t('gpt.audioPrompt', { pergunta: args.trim(), transcricao })
        });
        await concluirAviso(msg, aviso, `🤖 ${resposta}${await rodapeDeConsumo()}`);
    } catch (err) {
        await concluirAviso(msg, aviso, (transcrevendo && await erroDoModelo(err, MODELO_DE_AUDIO, '/gpt')) || erroOpenAi(err, '/gpt'));
    }
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
        return transcricao ? { texto: transcricao } : { erro: t('gpt.noSpeech') };
    } catch (err) {
        return { erro: (await erroDoModelo(err, MODELO_DE_AUDIO, '/gpt')) || erroOpenAi(err, '/gpt') };
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
        await msg.reply(t('gpt.voiceUsage'));
        return;
    }
    if (texto.length > VOZ_MAX_CARACTERES) {
        await msg.reply(t('gpt.voiceTooLong', { n: texto.length, max: VOZ_MAX_CARACTERES }));
        return;
    }

    const aviso = await avisarProcessando(msg, '/gpt');
    try {
        const voz = await sintetizarVoz({ cmd: '/gpt', texto, estilo });
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voz.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
        await apagarAviso(aviso);
        await responderConsumo(msg);
    } catch (err) {
        await concluirAviso(msg, aviso, (await erroDoModelo(err, MODELO_DE_VOZ, '/gpt')) || erroOpenAi(err, '/gpt'));
    }
}

/*
 * /gpt -img [pedido] e /gpt -gif [pedido]: criam uma imagem e um GIF animado, como o /draw e o
 * /draw -gif (src/comandos/draw.js). Os dois custam dinheiro, então são só do dono e dos admins.
 */

// "gere um gif animado de ...", "faça uma animação...": o pedido de GIF sem o -gif (só respondendo uma foto)
const PEDIU_GIF = /\b(gif|anima[çc][ãa]o|animation|animad[oa]|animated|v[ií]deo|video)\b/i;
const VERBO_DE_CRIAR = /\b(ger[ae]r?|cri[ae]r?|fa[çc]a|fazer|faz|anim[ae]r?|transform\w*|generate|create|make|animate)\b/i;
const pedeGif = (texto) => PEDIU_GIF.test(texto) && VERBO_DE_CRIAR.test(texto);

// O -img e o -gif são os do /draw (o desenhar() é um só): aqui só o texto do pedido e a mensagem de uso
const desenharDoGpt = (msg, args, quotedMsg, { opcao, gif, semPedido }) =>
    desenhar({ msg, cmd: '/gpt', pedido: semOpcao(args, opcao), quotedMsg, gif, semPedido });

const DIAS_PADRAO = 7;
const DIAS_MAX = 31;

const soma = () => ({ entrada: 0, saida: 0, cache: 0, requisicoes: 0 });
const tokens = (x) => x.entrada + x.saida;
const resumo = (x) => `${fmtNum(tokens(x))} tokens · ${fmtNum(x.requisicoes)} req`;

// Dólares: centavos, ou 4 casas quando é menos de 1 centavo ($0,0012)
const usd = (v) => `$${v.toLocaleString(loc(), v === 0 || v >= 0.01
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const somaCustos = (buckets) => buckets.reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0), 0);
const dataCurta = (inicio) => new Date(inicio * 1000).toISOString().slice(5, 10).split('-').reverse().join('/');

// O uso de imagens, voz, transcrição e embeddings (o que não veio ou está zerado não aparece)
function linhasDosServicos(servicos) {
    const somar = (buckets, campo) => (buckets ?? []).reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + (r[campo] ?? 0), 0), 0);
    const defs = [
        ['images', t('gpt.svcImages'), 'images', t('gpt.unitImages')],
        ['audio_speeches', t('gpt.svcVoice'), 'characters', t('gpt.unitChars')],
        ['audio_transcriptions', t('gpt.svcTranscription'), 'seconds', t('gpt.unitAudio')],
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
        const x = mapa.get(chave) ?? soma();
        x.entrada += r.input_tokens ?? 0;
        x.saida += r.output_tokens ?? 0;
        x.cache += r.input_cached_tokens ?? 0;
        x.requisicoes += r.num_model_requests ?? 0;
        mapa.set(chave, x);
    };

    for (const b of buckets) {
        for (const r of b.results ?? []) {
            acumular(new Map([[0, total]]), 0, r);
            acumular(porDia, b.start_time, r);
            acumular(porModelo, r.model ?? t('gpt.noModel'), r);
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
            const item = String(r.line_item ?? t('gpt.otherItem')).split(', ')[0];
            custoItem.set(item, (custoItem.get(item) ?? 0) + v);
        }
    }
    const comCusto = custos !== null;
    const custo = (v) => (comCusto ? ` · ${usd(v ?? 0)}` : '');

    const linhas = [dias === 1 ? t('gpt.usageTitleToday') : t('gpt.usageTitleDays', { dias })];
    if (comCusto) linhas.push(t('gpt.spent', { valor: usd(somaCustos(doPeriodo)) }));
    linhas.push(
        t('gpt.tokensLine', { total: fmtNum(tokens(total)), entrada: fmtNum(total.entrada), cache: fmtNum(total.cache), saida: fmtNum(total.saida) }),
        t('gpt.requests', { n: fmtNum(total.requisicoes) })
    );

    if (porDia.size) {
        linhas.push('', t('gpt.byDay'));
        for (const [dia, x] of [...porDia].sort((a, b) => a[0] - b[0])) {
            linhas.push(`• ${dataCurta(dia)} · ${resumo(x)}${custo(custoDia.get(dia))}`);
        }
    }
    if (porModelo.size) {
        linhas.push('', t('gpt.byModel'));
        for (const [modelo, x] of [...porModelo].sort((a, b) => tokens(b[1]) - tokens(a[1])).slice(0, 8)) {
            linhas.push(`• ${modelo} · ${resumo(x)}${custo(custoItem.get(modelo))}`);
        }
    }

    // O que gastou e não é chat (imagem, voz, transcrição...): os itens de custo sem modelo de chat
    const outros = [...custoItem].filter(([item, v]) => !porModelo.has(item) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const extras = linhasDosServicos(servicos);
    if (outros.length) {
        linhas.push('', t('gpt.otherCosts'), ...outros.map(([item, v]) => `• ${item} · ${usd(v)}`));
    }
    if (extras.length) linhas.push('', t('gpt.otherUses'), ...extras);

    if (!porDia.size && !porModelo.size && !extras.length) linhas.push('', t('gpt.noUsage'));
    return linhas.join('\n');
}

/*
 * O saldo em dólares: $usado/$total. A API não informa o saldo, então o total é o openai.credit.total
 * (o que foi comprado) e o usado é o gasto desde o openai.credit.since (sem ele, os últimos 180 dias).
 */
function textoDoSaldo(usado, total, desde) {
    const resta = total - usado;
    return t('gpt.balance', {
        usado: usd(usado),
        total: usd(total),
        resta: resta >= 0 ? t('gpt.balanceLeft', { valor: usd(resta) }) : t('gpt.balanceOver', { valor: usd(-resta) }),
        periodo: desde ? t('gpt.balanceSince', { data: desde.split('-').reverse().join('/') }) : t('gpt.balance180')
    });
}

// Os cabeçalhos x-ratelimit-* → o texto do chat
function textoDosLimites({ modelo, tokens: tk, requisicoes: r }) {
    const linha = (nome, x) => (x.limite
        ? t('gpt.limitLine', { nome, restante: fmtNum(x.restante ?? 0), limite: fmtNum(x.limite) }) +
            (x.reseta ? t('gpt.limitReset', { reseta: x.reseta }) : '')
        : null);
    const linhas = [linha('tokens', tk), linha(t('gpt.limitRequests'), r)].filter(Boolean);
    return [t('gpt.limitsTitle', { modelo }), ...(linhas.length ? linhas : [t('gpt.limitsNone')])].join('\n');
}

/*
 * /gpt -usage [dias]: o consumo (Usage API, com a chave de admin) e os limites de agora (cabeçalhos
 * de uma chamada mínima, com a chave normal). Só o dono e os admins (role no comandos).
 */
async function mostrarUso(msg, diasDigitado) {
    const dias = diasDigitado == null ? DIAS_PADRAO : Number(diasDigitado);
    if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAX) {
        await msg.reply(t('gpt.usageUsage', { max: DIAS_MAX, padrao: DIAS_PADRAO }));
        return;
    }

    const comAdmin = Boolean(chaveAdminOpenAi());
    const comChave = Boolean(chaveOpenAi());
    if (!comAdmin && !comChave) {
        await msg.reply(`${SEM_CHAVE('/gpt')}\n${t('gpt.adminKeyHint')}`);
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
                partes.push(t('gpt.creditHint'));
            }
        } catch (err) {
            const status = err.response?.status;
            const motivo = err.response?.data?.error?.message ?? '';
            const escopo = /api\.usage\.read/.test(motivo);
            partes.push(status === 401 || status === 403
                ? t(escopo ? 'gpt.adminRefusedScope' : 'gpt.adminRefused') + '\n' + t('gpt.adminRefusedHint')
                : erroOpenAi(err, '/gpt -usage'));
        }
    } else {
        partes.push(t('gpt.adminMissing'));
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
    const aviso = await avisarProcessando(msg, '/gpt');
    try {
        const { novos, mudados, iguais } = await atualizarPrecos({ cmd: '/gpt' });
        const linhas = [
            ...mudados.map(m => `🔄 ${m.modelo}: ${m.antes} → *${m.depois}*`),
            ...novos.map(m => `➕ ${m}`)
        ];
        const resumo = linhas.length
            ? t('gpt.pricesUpdated', {
                mudados: t(mudados.length === 1 ? 'gpt.priceChangedOne' : 'gpt.priceChangedMany', { n: mudados.length }),
                novos: t(novos.length === 1 ? 'gpt.priceNewOne' : 'gpt.priceNewMany', { n: novos.length }),
                iguais,
                linhas: linhas.slice(0, 20).join('\n')
            }) + (linhas.length > 20 ? t('gpt.pricesMore', { n: linhas.length - 20 }) : '')
            : t('gpt.pricesUpToDate', { iguais });
        await concluirAviso(msg, aviso, `${resumo}\n${t('gpt.pricesFooter')}`);
    } catch (err) {
        await concluirAviso(msg, aviso, t('gpt.pricesFail', { erro: err.message }));
    }
}

async function perguntar({ msg, args, opts, quotedMsg, admin }) {
    if (opts?.given.has('usage')) {
        await mostrarUso(msg, opts.opt.usage);
        return;
    }

    if (opts?.given.has('model')) {
        await trocarModelo(msg, opts.opt.model, opts, { cmd: '/gpt', icone: '🤖', usos: USOS_DO_GPT, padrao: USO_DE_PERGUNTA });
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
        await desenharDoGpt(msg, args, quotedMsg, {
            opcao: 'img', gif: null,
            semPedido: t('gpt.imgUsage')
        });
        return;
    }
    if (opts?.given.has('gif') || (ehFoto(quotedMsg) && pedeGif(args))) {
        if (!admin) {
            await msg.reply(SO_DONO_GERAR(t('gpt.actionGif')));
            return;
        }
        await desenharDoGpt(msg, args, quotedMsg, {
            opcao: 'gif', gif: {},
            semPedido: t('gpt.gifUsage')
        });
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
        ? t('gpt.docPrompt', { nome: doc.documento.nome, texto: doc.documento.texto })
        : String(quotedMsg?.body ?? '').trim();
    let pergunta = [respondido, args.trim()].filter(Boolean).join('\n\n');

    // Respondendo uma foto, ela vai junto da pergunta (sem pergunta, o /gpt descreve a foto)
    const foto = await imagemDaMensagem(quotedMsg, '/gpt');
    if (foto?.erro) {
        await msg.reply(foto.erro);
        return;
    }
    if (foto && !pergunta) pergunta = PERGUNTA_DA_FOTO();

    if (!pergunta) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    const aviso = await avisarProcessando(msg, '/gpt');
    try {
        const resposta = await perguntarAoChat({
            cmd: '/gpt', sistema: GPT_INSTRUCOES(), texto: pergunta, imagem: foto?.imagem
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
