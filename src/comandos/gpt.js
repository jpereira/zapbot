/*
 * Comando /gpt.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { MessageMedia } = require('whatsapp-web.js');

const { concluirAviso } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { desenhar } = require('./desenhe');
const {
    MODELO_DE_AUDIO, MODELO_DE_VOZ, SO_DONO_GERAR, USOS_DO_GPT, USO_DE_PERGUNTA, apagarAviso, avisarProcessando, ehFoto,
    erroDoModelo, imagemDaMensagem, responderConsumo, semOpcao, trocarModelo
} = require('./openaiComum');
const { TMP_DIR } = require('../constantes');
const {
    SEM_CHAVE, atualizarPrecos, chaveAdminOpenAi, chaveOpenAi, consultarConsumo, consultarCustos, consultarLimites, consultarServicos, erroOpenAi,
    medirConsumo, perguntarAoChat, rodapeDeConsumo, sintetizarVoz, transcreverAudio, VOZ_MAX_CARACTERES
} = require('../openaiChat');
const { getSetting } = require('../settings');
const { capturarSaida } = require('../util/processos');
const { fmtNum, plural } = require('../util/formatar');

/*
 * /gpt: pergunta ao ChatGPT (a chamada e os erros ficam no openaiChat.js).
 */
const GPT_INSTRUCOES = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma. ' +
    'Formate para o WhatsApp, que não é Markdown: *negrito* com um asterisco só, _itálico_, ~tachado~, ' +
    'listas com "- " ou "1. ", código entre crases (``` para blocos). Não use títulos com #, tabelas, ' +
    'linhas "---" nem **dois asteriscos**.';

const PERGUNTA_DA_FOTO = 'Descreva esta imagem.';

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
        return transcricao ? { texto: transcricao } : { erro: '🤖 Não ouvi fala nenhuma nesse áudio.' };
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
        await msg.reply('❌ Use: /gpt -voz <texto> (ou responda uma mensagem de texto)');
        return;
    }
    if (texto.length > VOZ_MAX_CARACTERES) {
        await msg.reply(`❌ O texto tem ${texto.length} caracteres: a voz aceita até ${VOZ_MAX_CARACTERES}.`);
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
 * /gpt -img [pedido] e /gpt -gif [pedido]: criam uma imagem e um GIF animado, como o /desenhe e o
 * /desenhe -gif (src/comandos/desenhe.js). Os dois custam dinheiro, então são só do dono e dos admins.
 */

// "gere um gif animado de ...", "faça uma animação...": o pedido de GIF sem o -gif (só respondendo uma foto)
const PEDIU_GIF = /\b(gif|anima[çc][ãa]o|animad[oa]|v[ií]deo)\b/i;
const VERBO_DE_CRIAR = /\b(ger[ae]r?|cri[ae]r?|fa[çc]a|fazer|faz|anim[ae]r?|transform\w*)\b/i;
const pedeGif = (texto) => PEDIU_GIF.test(texto) && VERBO_DE_CRIAR.test(texto);

// O -img e o -gif são os do /desenhe (o desenhar() é um só): aqui só o texto do pedido e a mensagem de uso
const desenharDoGpt = (msg, args, quotedMsg, { opcao, gif, semPedido }) =>
    desenhar({ msg, cmd: '/gpt', pedido: semOpcao(args, opcao), quotedMsg, gif, semPedido });

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
    const aviso = await avisarProcessando(msg, '/gpt');
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
            semPedido: '❌ Use: /gpt -img <o que criar> (respondendo uma foto, ela é editada)'
        });
        return;
    }
    if (opts?.given.has('gif') || (ehFoto(quotedMsg) && pedeGif(args))) {
        if (!admin) {
            await msg.reply(SO_DONO_GERAR('gerar GIF'));
            return;
        }
        await desenharDoGpt(msg, args, quotedMsg, {
            opcao: 'gif', gif: {},
            semPedido: '❌ Use: /gpt -gif <o que animar> (respondendo uma foto, ela é animada)'
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
        ? `Documento "${doc.documento.nome}":\n${doc.documento.texto}`
        : String(quotedMsg?.body ?? '').trim();
    let pergunta = [respondido, args.trim()].filter(Boolean).join('\n\n');

    // Respondendo uma foto, ela vai junto da pergunta (sem pergunta, o /gpt descreve a foto)
    const foto = await imagemDaMensagem(quotedMsg, '/gpt');
    if (foto?.erro) {
        await msg.reply(foto.erro);
        return;
    }
    if (foto && !pergunta) pergunta = PERGUNTA_DA_FOTO;

    if (!pergunta) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    const aviso = await avisarProcessando(msg, '/gpt');
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
