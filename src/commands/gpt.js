/*
 * Comando /gpt.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { MessageMedia } = require('whatsapp-web.js');

const { completeNotice } = require('../client');
const { getCommandSyntax } = require('./base');
const { drawAlt } = require('./draw');
const {
    AUDIO_MODEL, VOICE_MODEL, SO_OWNER_GENERATE, GPT_USES, QUESTION_USAGE, deleteNotice, notifyProcessing, isPhoto,
    modelError, messageImage, replyConsumption, withoutOption, swapModel
} = require('./openaiCommon');
const { TMP_DIR } = require('../constants');
const {
    WITHOUT_KEY, updatePrices, keyAdminOpenAi, keyOpenAi, queryConsumption, queryCosts, queryLimits, queryServices, errorOpenAi,
    measureConsumption, askOnChat, consumptionFooter, synthesizeVoice, transcribeAudio, VOICE_MAX_CHARACTERS
} = require('../openaiChat');
const { getSetting } = require('../settings');
const { captureOutput } = require('../util/processes');
const { fmtInA, plural } = require('../util/format');

/*
 * /gpt: asks ChatGPT (the call and the errors live in openaiChat.js).
 */
const GPT_INSTRUCTIONS = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma. ' +
    'Formate para o WhatsApp, que não é Markdown: *negrito* com um asterisco só, _itálico_, ~tachado~, ' +
    'listas com "- " ou "1. ", código entre crases (``` para blocos). Não use títulos com #, tabelas, ' +
    'linhas "---" nem **dois asteriscos**.';

const PHOTO_QUESTION = 'Descreva esta imagem.';

/*
 * The replied document: plain text (txt, md, csv, json, code...) and PDF (through pdftotext). The content
 * goes to the chat as text, after the question. Other formats (docx, xlsx...) are not read.
 */
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_MAX_CHARACTERS = 60000;
const TEXT_DOC_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|x-sh|sql|csv))/i;
const TEXT_DOC_EXTENSIONS = /\.(txt|md|csv|tsv|json|xml|ya?ml|log|ini|conf|sh|js|ts|py|rb|go|rs|c|h|cpp|java|sql|html?|css)$/i;

/**
 * @returns {Promise<null | { documento: { nome: string, texto: string } } | { erro: string }>}
 * null: the replied message is not a document
 */
async function replyDocument(quotedMsg) {
    if (!quotedMsg?.hasMedia || quotedMsg.type !== 'document') return null;

    const mediaAlt = await quotedMsg.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) return { erro: '❌ Não consegui baixar o documento (ele pode ter expirado no WhatsApp).' };
    if (mediaAlt.data.length * 0.75 > DOC_MAX_BYTES) {
        return { erro: `❌ O documento tem mais de ${DOC_MAX_BYTES / 1024 / 1024} MB: é grande demais para o /gpt.` };
    }

    const nameAlt = mediaAlt.filename || 'documento';
    const type = String(mediaAlt.mimetype).split(';')[0].trim().toLowerCase();
    const bytes = Buffer.from(mediaAlt.data, 'base64');
    let textAlt;

    if (type === 'application/pdf' || /\.pdf$/i.test(nameAlt)) {
        const folder = path.join(TMP_DIR, `doc-${crypto.randomBytes(6).toString('hex')}`);
        fs.mkdirSync(folder, { recursive: true });
        try {
            const fileAlt = path.join(folder, 'doc.pdf');
            fs.writeFileSync(fileAlt, bytes);
            textAlt = await captureOutput('pdftotext', ['-layout', fileAlt, '-'], 60_000);
        } catch {
            return { erro: '❌ Não consegui ler o PDF (o pdftotext, do poppler-utils, precisa estar instalado).' };
        } finally {
            fs.rmSync(folder, { recursive: true, force: true });
        }
    } else if (TEXT_DOC_TYPES.test(type) || TEXT_DOC_EXTENSIONS.test(nameAlt)) {
        textAlt = bytes.toString('utf8');
    } else {
        return { erro: `❌ O /gpt lê documento de texto e PDF, não ${type || nameAlt}.` };
    }

    textAlt = textAlt.trim();
    if (!textAlt) return { erro: '❌ Não achei texto nesse documento (um PDF escaneado, talvez).' };
    return { documento: { nome: nameAlt, texto: textAlt.slice(0, DOC_MAX_CHARACTERS) } };
}

// The replied audio: the right extension for OpenAI (the format comes from the file name) and its ceiling
const AUDIO_EXTENSIONS = {
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/flac': 'flac'
};
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The replied message's audio (audio or voice note), downloaded as base64.
 * @returns {Promise<null | { audio: { arquivo: string, mimetype: string, data: string } } | { erro: string }>}
 * null: the replied message is not audio
 */
async function replyAudio(quotedMsg) {
    if (!quotedMsg?.hasMedia || !['audio', 'ptt'].includes(quotedMsg.type)) return null;

    const mediaAlt = await quotedMsg.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) return { erro: '❌ Não consegui baixar o áudio (ele pode ter expirado no WhatsApp).' };

    // "audio/ogg; codecs=opus" (the WhatsApp voice note) → "audio/ogg"
    const type = String(mediaAlt.mimetype).split(';')[0].trim().toLowerCase();
    const extension = AUDIO_EXTENSIONS[type];
    if (!extension) {
        return { erro: `❌ A OpenAI não transcreve áudio ${type}: só ${[...new Set(Object.values(AUDIO_EXTENSIONS))].join(', ')}.` };
    }
    if (mediaAlt.data.length * 0.75 > AUDIO_MAX_BYTES) {
        return { erro: `❌ O áudio tem mais de ${AUDIO_MAX_BYTES / 1024 / 1024} MB: é grande demais para transcrever.` };
    }
    return { audio: { arquivo: `audio.${extension}`, mimetype: type, data: mediaAlt.data } };
}

// "agora transcreva isso", "transcreve": it is only the transcription (no question for the chat)
const soTranscribe = (args) => !args.trim() ||
    (/^(agora\s+)?transcrev\w*/i.test(args.trim()) && args.trim().split(/\s+/).length <= 6);

/*
 * Replying to an audio: transcribes (v1/audio/transcriptions). Without a question, or just "transcreva", replies the
 * transcription; with another question ("resuma", "traduza para o inglês"), sends the transcription along to the chat.
 */
async function replyOnAudio(msg, { audio, erro: errorAlt }, args) {
    if (errorAlt) {
        await msg.reply(errorAlt);
        return;
    }

    const notice = await notifyProcessing(msg, '/gpt');
    let transcribing = true;
    try {
        const transcription = await transcribeAudio({ cmd: '/gpt', audio });
        transcribing = false;
        if (!transcription) {
            await completeNotice(msg, notice, '🤖 Não ouvi fala nenhuma nesse áudio.');
            return;
        }
        if (soTranscribe(args)) {
            await completeNotice(msg, notice, `🤖 *Transcrição:*\n${transcription}${await consumptionFooter()}`);
            return;
        }

        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS, texto: `${args.trim()}\n\nTranscrição do áudio:\n${transcription}`
        });
        await completeNotice(msg, notice, `🤖 ${reply}${await consumptionFooter()}`);
    } catch (err) {
        await completeNotice(msg, notice, (transcribing && await modelError(err, AUDIO_MODEL, '/gpt')) || errorOpenAi(err, '/gpt'));
    }
}

/*
 * What /gpt -voz speaks from the replied message: its text or, if it is audio, the transcription.
 * @returns {Promise<{ texto?: string, erro?: string }>}  without text: there is nothing to speak in the reply
 */
async function contentForTalk(quotedMsg) {
    const audio = await replyAudio(quotedMsg);
    if (!audio) return { texto: String(quotedMsg?.body ?? '').trim() };
    if (audio.erro) return { erro: audio.erro };

    try {
        const transcription = await transcribeAudio({ cmd: '/gpt', audio: audio.audio });
        return transcription ? { texto: transcription } : { erro: '🤖 Não ouvi fala nenhuma nesse áudio.' };
    } catch (err) {
        return { erro: (await modelError(err, AUDIO_MODEL, '/gpt')) || errorOpenAi(err, '/gpt') };
    }
}

/*
 * /gpt -voz [text]: the voice of the text (v1/audio/speech), robot by default, in a voice note. Without
 * typed text, speaks the replied message's.
 */
async function talkText(msg, args, quotedMsg) {
    const typed = args.replace(/(^|\s)-(?:voz|v)(?=\s|$)/, '').trim();
    let textAlt = typed;
    let style = null;

    // Replying to a text (or an audio, which is transcribed): what was typed is the speech style
    // ("/gpt -voz speak like a metallic robot") and the replied content is what is spoken.
    const replied = await contentForTalk(quotedMsg);
    if (replied.erro) {
        await msg.reply(replied.erro);
        return;
    }
    if (replied.texto) {
        textAlt = replied.texto;
        style = typed || null;
    }

    if (!textAlt) {
        await msg.reply('❌ Use: /gpt -voz <texto> (ou responda uma mensagem de texto)');
        return;
    }
    if (textAlt.length > VOICE_MAX_CHARACTERS) {
        await msg.reply(`❌ O texto tem ${textAlt.length} caracteres: a voz aceita até ${VOICE_MAX_CHARACTERS}.`);
        return;
    }

    const notice = await notifyProcessing(msg, '/gpt');
    try {
        const voice = await synthesizeVoice({ cmd: '/gpt', texto: textAlt, estilo: style });
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voice.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
        await deleteNotice(notice);
        await replyConsumption(msg);
    } catch (err) {
        await completeNotice(msg, notice, (await modelError(err, VOICE_MODEL, '/gpt')) || errorOpenAi(err, '/gpt'));
    }
}

/*
 * /gpt -img [request] and /gpt -gif [request]: create an image and an animated GIF, like /draw and
 * /draw -gif (src/commands/draw.js). Both cost money, so they are owner and admins only.
 */

// "gere um gif animado de ...", "faça uma animação...": the GIF request without -gif (only when replying to a photo)
const ASKED_GIF = /\b(gif|anima[çc][ãa]o|animad[oa]|v[ií]deo)\b/i;
const CREATE_VERB = /\b(ger[ae]r?|cri[ae]r?|fa[çc]a|fazer|faz|anim[ae]r?|transform\w*)\b/i;
const asksGif = (textAlt) => ASKED_GIF.test(textAlt) && CREATE_VERB.test(textAlt);

// -img and -gif are those of /draw (desenhar() is a single one): here only the request text and the usage message
const gptDraw = (msg, args, quotedMsg, { opcao: optionAlt, gif, semPedido: withoutRequest }) =>
    drawAlt({ msg, cmd: '/gpt', pedido: withoutOption(args, optionAlt), quotedMsg, gif, semPedido: withoutRequest });

const DAYS_DEFAULT = 7;
const DAYS_MAX = 31;

const sum = () => ({ entrada: 0, saida: 0, cache: 0, requisicoes: 0 });
const tokens = (t) => t.entrada + t.saida;
const summary = (t) => `${fmtInA(tokens(t))} tokens · ${fmtInA(t.requisicoes)} req`;

// Dollars in pt-BR: cents, or 4 decimals when it is less than 1 cent ($0,0012)
const usd = (v) => `$${v.toLocaleString('pt-BR', v === 0 || v >= 0.01
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const sumCosts = (buckets) => buckets.reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0), 0);
const dateShort = (start) => new Date(start * 1000).toISOString().slice(5, 10).split('-').reverse().join('/');

// The usage of images, voice, transcription and embeddings (whatever did not come or is zero does not show)
function servicesLines(services) {
    const sumAlt = (buckets, campo) => (buckets ?? []).reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + (r[campo] ?? 0), 0), 0);
    const defs = [
        ['images', '🖼️ Imagens', 'images', 'imagens'],
        ['audio_speeches', '🔊 Voz', 'characters', 'caracteres'],
        ['audio_transcriptions', '🎙️ Transcrição', 'seconds', 's de áudio'],
        ['embeddings', '🧬 Embeddings', 'input_tokens', 'tokens']
    ];
    return defs.flatMap(([nameAlt, label, campo, unit]) => {
        const req = sumAlt(services?.[nameAlt], 'num_model_requests');
        return req ? [`• ${label} · ${fmtInA(sumAlt(services[nameAlt], campo))} ${unit} · ${fmtInA(req)} req`] : [];
    });
}

/*
 * The Usage API buckets (+ the costs and the other uses) → the chat text: the money, the total, per day,
 * per model, per service. The costs and services are extras: without them, only the tokens.
 */
function consumptionText(buckets, daysAlt, { custos: costs = null, servicos: services = null } = {}) {
    const total = sum();
    const byDay = new Map();
    const byModel = new Map();
    const accumulate = (map, keyAlt, r) => {
        const t = map.get(keyAlt) ?? sum();
        t.entrada += r.input_tokens ?? 0;
        t.saida += r.output_tokens ?? 0;
        t.cache += r.input_cached_tokens ?? 0;
        t.requisicoes += r.num_model_requests ?? 0;
        map.set(keyAlt, t);
    };

    for (const b of buckets) {
        for (const r of b.results ?? []) {
            accumulate(new Map([[0, total]]), 0, r);
            accumulate(byDay, b.start_time, r);
            accumulate(byModel, r.model ?? '(sem modelo)', r);
        }
    }

    // The period's costs (the item is "model, input"; the prefix is the model) per day and per model
    const period = costs ?? [];
    const costDay = new Map();
    const costItem = new Map();
    for (const b of period) {
        for (const r of b.results ?? []) {
            const v = Number(r.amount?.value ?? 0);
            costDay.set(b.start_time, (costDay.get(b.start_time) ?? 0) + v);
            const item = String(r.line_item ?? '(outros)').split(', ')[0];
            costItem.set(item, (costItem.get(item) ?? 0) + v);
        }
    }
    const withCost = costs !== null;
    const cost = (v) => (withCost ? ` · ${usd(v ?? 0)}` : '');

    const linesAlt = [`📊 *Consumo da OpenAI* — ${daysAlt === 1 ? 'hoje' : `últimos ${daysAlt} dias`}`];
    if (withCost) linesAlt.push(`💵 Gasto: *${usd(sumCosts(period))}*`);
    linesAlt.push(
        `🔢 ${fmtInA(tokens(total))} tokens · entrada ${fmtInA(total.entrada)} (cache ${fmtInA(total.cache)}) · saída ${fmtInA(total.saida)}`,
        `🔁 ${fmtInA(total.requisicoes)} requisições`
    );

    if (byDay.size) {
        linesAlt.push('', '📅 *Por dia* _(UTC)_');
        for (const [day, t] of [...byDay].sort((a, b) => a[0] - b[0])) {
            linesAlt.push(`• ${dateShort(day)} · ${summary(t)}${cost(costDay.get(day))}`);
        }
    }
    if (byModel.size) {
        linesAlt.push('', '🧠 *Por modelo*');
        for (const [modelAlt, t] of [...byModel].sort((a, b) => tokens(b[1]) - tokens(a[1])).slice(0, 8)) {
            linesAlt.push(`• ${modelAlt} · ${summary(t)}${cost(costItem.get(modelAlt))}`);
        }
    }

    // What was spent that is not chat (image, voice, transcription...): the cost items without a chat model
    const other = [...costItem].filter(([item, v]) => !byModel.has(item) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const extras = servicesLines(services);
    if (other.length) {
        linesAlt.push('', '🧾 *Outros custos*', ...other.map(([item, v]) => `• ${item} · ${usd(v)}`));
    }
    if (extras.length) linesAlt.push('', '🧰 *Outros usos*', ...extras);

    if (!byDay.size && !byModel.size && !extras.length) linesAlt.push('', 'ℹ️ Nenhum uso nesse período.');
    return linesAlt.join('\n');
}

/*
 * The balance in dollars: $used/$total. The API does not report the balance, so the total is openai.credit.total
 * (what was bought) and the used one is the spend since openai.credit.since (without it, the last 180 days).
 */
function balanceText(used, total, since) {
    const remains = total - used;
    return `💰 *Créditos:* ${usd(used)}/${usd(total)} · ${remains >= 0 ? `restam *${usd(remains)}*` : `*${usd(-remains)} acima do total*`}` +
        ` _(gasto ${since ? `desde ${since.split('-').reverse().join('/')}` : 'nos últimos 180 dias'})_`;
}

// The x-ratelimit-* headers → the chat text
function limitsText({ modelo: modelAlt, tokens: t, requisicoes: r }) {
    const line = (nameAlt, x) => (x.limite
        ? `• ${nameAlt}: ${fmtInA(x.restante ?? 0)} de ${fmtInA(x.limite)}${x.reseta ? ` · reseta em ${x.reseta}` : ''}`
        : null);
    const linesAlt = [line('tokens', t), line('requisições', r)].filter(Boolean);
    return [`⏱️ *Limites agora* — ${modelAlt}`, ...(linesAlt.length ? linesAlt : ['• A OpenAI não informou os limites.'])].join('\n');
}

/*
 * /gpt -usage [days]: the consumption (Usage API, with the admin key) and the current limits (headers
 * of a minimal call, with the normal key). Only the owner and the admins (role in comandos).
 */
async function showUsage(msg, daysTyped) {
    const daysAlt = daysTyped == null ? DAYS_DEFAULT : Number(daysTyped);
    if (!Number.isInteger(daysAlt) || daysAlt < 1 || daysAlt > DAYS_MAX) {
        await msg.reply(`❌ Use: /gpt -usage [dias] (de 1 a ${DAYS_MAX}; padrão ${DAYS_DEFAULT})`);
        return;
    }

    const withAdmin = Boolean(keyAdminOpenAi());
    const withKey = Boolean(keyOpenAi());
    if (!withAdmin && !withKey) {
        await msg.reply(`${WITHOUT_KEY('/gpt')}\n💡 _Para o consumo, a chave de admin: OPENAI_ADMIN_KEY ou /set openai.admin.key_`);
        return;
    }

    const partsAlt = [];

    if (withAdmin) {
        try {
            const total = getSetting('openai.credit.total');
            const sinceData = getSetting('openai.credit.since');
            const nowAlt = Math.floor(Date.now() / 1000);
            const startBalance = sinceData ? Math.floor(Date.parse(sinceData) / 1000) : nowAlt - 180 * 86400;

            // The usage is required (its error is the key's); the cost, the balance and the other uses are extras
            const [consumption, costs, balanceCosts, services] = await Promise.all([
                queryConsumption({ cmd: '/gpt', dias: daysAlt }),
                queryCosts({ cmd: '/gpt', desde: nowAlt - daysAlt * 86400 }).catch(() => null),
                total ? queryCosts({ cmd: '/gpt', desde: startBalance }).catch(() => null) : null,
                queryServices({ cmd: '/gpt', dias: daysAlt })
            ]);

            if (balanceCosts) partsAlt.push(balanceText(sumCosts(balanceCosts), total, sinceData));
            partsAlt.push(consumptionText(consumption.buckets, daysAlt, { custos: costs, servicos: services }));
            if (!total && costs) {
                partsAlt.push('💡 _Para ver $usado/$total: /set openai.credit.total <dólares comprados> e ' +
                    '/set openai.credit.since AAAA-MM-DD (a API da OpenAI não informa o saldo)._');
            }
        } catch (err) {
            const status = err.response?.status;
            const reasonAlt = err.response?.data?.error?.message ?? '';
            const scope = /api\.usage\.read/.test(reasonAlt);
            partsAlt.push(status === 401 || status === 403
                ? '🔑 A chave de admin foi recusada' + (scope ? ': ela não tem o escopo api.usage.read.' : '.') +
                    '\n💡 _A Usage API pede uma Admin key (sk-admin-..., em platform.openai.com › Organization › ' +
                    'Admin keys) ou uma chave com o escopo Usage em Read. Uma chave de projeto (sk-proj-...) comum não serve._'
                : errorOpenAi(err, '/gpt -usage'));
        }
    } else {
        partsAlt.push('💡 _Para ver o consumo, defina a chave de admin: OPENAI_ADMIN_KEY no config/.env ou /set openai.admin.key <chave>_');
    }

    if (withKey) {
        try {
            partsAlt.push(limitsText(await queryLimits({ cmd: '/gpt' })));
        } catch (err) {
            partsAlt.push(errorOpenAi(err, '/gpt -usage'));
        }
    }

    await msg.reply(partsAlt.join('\n\n'));
}

/*
 * /gpt -prices: fetches the price table from the OpenAI site and updates openai.pricing (the estimated cost
 * of -status). The models you added by hand that the page does not have stay as they are.
 */
async function showPrices(msg) {
    const notice = await notifyProcessing(msg, '/gpt');
    try {
        const { novos: freshAlt3, mudados: changed, iguais: equal } = await updatePrices({ cmd: '/gpt' });
        const linesAlt = [
            ...changed.map(m => `🔄 ${m.modelo}: ${m.antes} → *${m.depois}*`),
            ...freshAlt3.map(m => `➕ ${m}`)
        ];
        const summary = linesAlt.length
            ? `✅ *Preços atualizados* (${plural(changed.length, 'alterado', 'alterados')}, ${plural(freshAlt3.length, 'novo', 'novos')}, ${equal} sem mudança)\n${linesAlt.slice(0, 20).join('\n')}` +
                (linesAlt.length > 20 ? `\n_…e mais ${linesAlt.length - 20}_` : '')
            : `✅ Os ${equal} preços já estão em dia.`;
        await completeNotice(msg, notice, `${summary}\n💡 _Dólares por 1M de tokens, entrada/saída (openai.pricing)._`);
    } catch (err) {
        await completeNotice(msg, notice, `❌ Não consegui atualizar os preços: ${err.message}`);
    }
}

async function ask({ msg, args, opts, quotedMsg, admin }) {
    if (opts?.given.has('usage')) {
        await showUsage(msg, opts.opt.usage);
        return;
    }

    if (opts?.given.has('model')) {
        await swapModel(msg, opts.opt.model, opts, { cmd: '/gpt', icone: '🤖', usos: GPT_USES, padrao: QUESTION_USAGE });
        return;
    }

    if (opts?.given.has('prices')) {
        await showPrices(msg);
        return;
    }

    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/gpt'));
        return;
    }

    // -img: creates (or, replying to a photo, edits) an image; -gif: a GIF (replying to a photo, animates it).
    // Without -gif, "gere um gif animado..." replying to a photo also works (and is also owner and admins only).
    if (opts?.given.has('img')) {
        await gptDraw(msg, args, quotedMsg, {
            opcao: 'img', gif: null,
            semPedido: '❌ Use: /gpt -img <o que criar> (respondendo uma foto, ela é editada)'
        });
        return;
    }
    if (opts?.given.has('gif') || (isPhoto(quotedMsg) && asksGif(args))) {
        if (!admin) {
            await msg.reply(SO_OWNER_GENERATE('gerar GIF'));
            return;
        }
        await gptDraw(msg, args, quotedMsg, {
            opcao: 'gif', gif: {},
            semPedido: '❌ Use: /gpt -gif <o que animar> (respondendo uma foto, ela é animada)'
        });
        return;
    }

    // -voz: the text becomes a voice note
    if (opts?.given.has('voz')) {
        await talkText(msg, args, quotedMsg);
        return;
    }

    // Replying to an audio: the transcription (and, with a question, the chat on top of it)
    const audio = await replyAudio(quotedMsg);
    if (audio) {
        await replyOnAudio(msg, audio, args);
        return;
    }

    // Replying to a document: its content goes along with the question
    const doc = await replyDocument(quotedMsg);
    if (doc?.erro) {
        await msg.reply(doc.erro);
        return;
    }

    // Replying to a message, its text (or the photo caption, or the document) goes before the question
    const replied = doc
        ? `Documento "${doc.documento.nome}":\n${doc.documento.texto}`
        : String(quotedMsg?.body ?? '').trim();
    let question = [replied, args.trim()].filter(Boolean).join('\n\n');

    // Replying to a photo, it goes along with the question (without a question, /gpt describes the photo)
    const photo = await messageImage(quotedMsg, '/gpt');
    if (photo?.erro) {
        await msg.reply(photo.erro);
        return;
    }
    if (photo && !question) question = PHOTO_QUESTION;

    if (!question) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    const notice = await notifyProcessing(msg, '/gpt');
    try {
        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS, texto: question, imagem: photo?.imagem
        });

        // The 🤖 in front also guarantees the reply never starts with "/" (see markSentByBot)
        await completeNotice(msg, notice, `🤖 ${reply}${await consumptionFooter()}`);
    } catch (err) {
        await completeNotice(msg, notice, errorOpenAi(err, '/gpt'));
    }
}

// The -status|-s (or the openai.status setting) shows the call usage in the footer
const cmdGpt = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => ask(ctx));

module.exports = {
    cmdGpt
};
