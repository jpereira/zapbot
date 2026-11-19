/*
 * Comando /gpt.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { MessageMedia } = require('whatsapp-web.js');

const { completeNotice } = require('../client');
const { commandUsage } = require('./base');
const { drawAlt } = require('./draw');
const { imagesContext, textReadProfile, readProfileImplicit, resolverProfiles } = require('./profileInAi');
const {
    AUDIO_MODEL, VOICE_MODEL, SO_OWNER_GENERATE, GPT_USES, QUESTION_USAGE, notifyProcessing, isPhoto,
    modelError, messageImage, replyConsumption, withoutOption, swapModel
} = require('./openaiCommon');
const { TMP_DIR } = require('../constants');
const { CHATGPT, engineProcessing, withEngineTip } = require('../engines');
const { printError } = require('../log');
const { speakLocal } = require('../ttsLocal');
const { language, t } = require('../i18n');
const { unescape } = require('../util/format');
const {
    WITHOUT_KEY, updatePrices, keyAdminOpenAi, keyOpenAi, queryConsumption, queryCosts, queryLimits, queryServices, errorOpenAi,
    measureConsumption, askOnChat, consumptionFooter, synthesizeVoice, transcribeAudio, VOICE_MAX_CHARACTERS
} = require('../openaiChat');
const { getSetting } = require('../settings');
const { captureOutput } = require('../util/processes');

/*
 * /gpt: asks ChatGPT (the call and the errors live in openaiChat.js).
 */
const GPT_INSTRUCTIONS = () => t('gpt.instructions');

const PHOTO_QUESTION = () => t('gpt.describePhoto');

// Number and money in the language format (pt-BR: 1.234,50; en-US: 1,234.50)
const loc = () => (language() === 'pt_BR' ? 'pt-BR' : 'en-US');
const fmtInA = (n) => Number(n).toLocaleString(loc());

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
    if (!mediaAlt?.data) return { erro: t('gpt.docDownload') };
    if (mediaAlt.data.length * 0.75 > DOC_MAX_BYTES) {
        return { erro: t('gpt.docTooBig', { mb: DOC_MAX_BYTES / 1024 / 1024 }) };
    }

    const nameAlt = mediaAlt.filename || t('gpt.docName');
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
            return { erro: t('gpt.pdfRead') };
        } finally {
            fs.rmSync(folder, { recursive: true, force: true });
        }
    } else if (TEXT_DOC_TYPES.test(type) || TEXT_DOC_EXTENSIONS.test(nameAlt)) {
        textAlt = bytes.toString('utf8');
    } else {
        return { erro: t('gpt.docType', { tipo: type || nameAlt }) };
    }

    textAlt = textAlt.trim();
    if (!textAlt) return { erro: t('gpt.docEmpty') };
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
    if (!mediaAlt?.data) return { erro: t('gpt.audioDownload') };

    // "audio/ogg; codecs=opus" (the WhatsApp voice note) → "audio/ogg"
    const type = String(mediaAlt.mimetype).split(';')[0].trim().toLowerCase();
    const extension = AUDIO_EXTENSIONS[type];
    if (!extension) {
        return { erro: t('gpt.audioFormat', { tipo: type, formatos: [...new Set(Object.values(AUDIO_EXTENSIONS))].join(', ') }) };
    }
    if (mediaAlt.data.length * 0.75 > AUDIO_MAX_BYTES) {
        return { erro: t('gpt.audioTooBig', { mb: AUDIO_MAX_BYTES / 1024 / 1024 }) };
    }
    return { audio: { arquivo: `audio.${extension}`, mimetype: type, data: mediaAlt.data } };
}

// "agora transcreva isso", "transcreve", "now transcribe this": it is only the transcription (no question for the chat)
const soTranscribe = (args) => !args.trim() ||
    (/^((agora|now)\s+)?(transcrev|transcrib)\w*/i.test(args.trim()) && args.trim().split(/\s+/).length <= 6);

/*
 * Replying to an audio: transcribes (v1/audio/transcriptions). Without a question, or just "transcreva", replies the
 * transcription; with another question ("resuma", "traduza para o inglês"), sends the transcription along to the chat.
 */
async function replyOnAudio(msg, { audio, erro: errorAlt }, args) {
    if (errorAlt) {
        await msg.reply(errorAlt);
        return;
    }

    const notice = await msg.reply(engineProcessing('gpt', CHATGPT), null, { linkPreview: false });
    let transcribing = true;
    try {
        const transcription = await transcribeAudio({ cmd: '/gpt', audio });
        transcribing = false;
        if (!transcription) {
            await completeNotice(msg, notice, t('gpt.noSpeech'));
            return;
        }
        if (soTranscribe(args)) {
            await completeNotice(msg, notice, `${withEngineTip(t('gpt.transcription', { texto: transcription }), 'stt', CHATGPT)}${await consumptionFooter()}`);
            return;
        }

        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS(), texto: t('gpt.audioPrompt', { pergunta: args.trim(), transcricao: transcription })
        });
        await completeNotice(msg, notice, `${withEngineTip(`🤖 ${reply}`, 'gpt', CHATGPT)}${await consumptionFooter()}`);
    } catch (err) {
        await completeNotice(msg, notice, (transcribing && await modelError(err, AUDIO_MODEL, '/gpt')) || errorOpenAi(err, '/gpt'));
    }
}

/*
 * What /gpt -voice speaks from the replied message: its text or, if it is audio, the transcription.
 * @returns {Promise<{ texto?: string, erro?: string }>}  without text: there is nothing to speak in the reply
 */
async function contentForTalk(quotedMsg, cmd = '/gpt') {
    const audio = await replyAudio(quotedMsg);
    if (!audio) return { texto: String(quotedMsg?.body ?? '').trim() };
    if (audio.erro) return { erro: audio.erro };

    try {
        const transcription = await transcribeAudio({ cmd, audio: audio.audio });
        return transcription ? { texto: transcription } : { erro: t('gpt.noSpeech') };
    } catch (err) {
        return { erro: (await modelError(err, AUDIO_MODEL, cmd)) || errorOpenAi(err, cmd) };
    }
}

/*
 * /gpt -voice [text]: the voice of the text (v1/audio/speech), robot by default, in a voice note. Without
 * typed text, speaks the replied message's.
 */
async function talkText(msg, args, quotedMsg, cmd = '/gpt', { local = false } = {}) {
    const typed = unescape(args.replace(/(^|\s)-(?:voice|v)(?=\s|$)/, '').trim());
    let textAlt = typed;
    let style = null;

    // Replying to a text (or an audio, which is transcribed): what was typed is the speech style
    // ("/gpt -voice speak like a metallic robot") and the replied content is what is spoken.
    const replied = await contentForTalk(quotedMsg, cmd);
    if (replied.erro) {
        await msg.reply(replied.erro);
        return;
    }
    if (replied.texto) {
        textAlt = replied.texto;
        style = typed || null;
    }

    if (!textAlt) {
        await msg.reply(cmd === '/tts' ? commandUsage('/tts') : t('gpt.voiceUsage'));
        return;
    }
    if (textAlt.length > VOICE_MAX_CHARACTERS) {
        await msg.reply(t('gpt.voiceTooLong', { n: textAlt.length, max: VOICE_MAX_CHARACTERS }));
        return;
    }

    const engine = local ? 'Piper' : CHATGPT;
    const notice = await msg.reply(engineProcessing('tts', engine), null, { linkPreview: false });
    try {
        const voice = local ? await speakLocal(textAlt) : await synthesizeVoice({ cmd, texto: textAlt, estilo: style });
        await completeNotice(msg, notice, withEngineTip(t('gpt.voiceBelow'), 'tts', engine, { sep: '\n' }));
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voice.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
        if (!local) await replyConsumption(msg);
    } catch (err) {
        printError(`${cmd}:`, err.message);
        await completeNotice(msg, notice, local ? t('tts.localFailed', { error: err.message }) : (await modelError(err, VOICE_MODEL, cmd)) || errorOpenAi(err, cmd));
    }
}

/*
 * /gpt -img [request] and /gpt -gif [request]: create an image and an animated GIF, like /draw and
 * /draw -gif (src/commands/draw.js). Both cost money, so they are owner and admins only.
 */

// "gere um gif animado de ...", "faça uma animação...": the GIF request without -gif (only when replying to a photo)
const ASKED_GIF = /\b(gif|anima[çc][ãa]o|animation|animad[oa]|animated|v[ií]deo|video)\b/i;
const CREATE_VERB = /\b(ger[ae]r?|cri[ae]r?|fa[çc]a|fazer|faz|anim[ae]r?|transform\w*|generate|create|make|animate)\b/i;
const asksGif = (textAlt) => ASKED_GIF.test(textAlt) && CREATE_VERB.test(textAlt);

// -img and -gif are those of /draw (desenhar() is a single one): here only the request text and the usage message
const gptDraw = (msg, args, quotedMsg, { opcao: optionAlt, gif, perfis: profiles = [], semPedido: withoutRequest }) =>
    drawAlt({ msg, cmd: '/gpt', pedido: withoutOption(args, optionAlt), quotedMsg, gif, perfis: profiles, semPedido: withoutRequest });

const DAYS_DEFAULT = 7;
const DAYS_MAX = 31;

const sum = () => ({ entrada: 0, saida: 0, cache: 0, requisicoes: 0 });
const tokens = (x) => x.entrada + x.saida;
const summary = (x) => `${fmtInA(tokens(x))} tokens · ${fmtInA(x.requisicoes)} req`;

// Dollars: cents, or 4 decimals when it is less than 1 cent ($0,0012)
const usd = (v) => `$${v.toLocaleString(loc(), v === 0 || v >= 0.01
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const sumCosts = (buckets) => buckets.reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0), 0);
const dateShort = (start) => new Date(start * 1000).toISOString().slice(5, 10).split('-').reverse().join('/');

// The usage of images, voice, transcription and embeddings (whatever did not come or is zero does not show)
function servicesLines(services) {
    const sumAlt = (buckets, campo) => (buckets ?? []).reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + (r[campo] ?? 0), 0), 0);
    const defs = [
        ['images', t('gpt.svcImages'), 'images', t('gpt.unitImages')],
        ['audio_speeches', t('gpt.svcVoice'), 'characters', t('gpt.unitChars')],
        ['audio_transcriptions', t('gpt.svcTranscription'), 'seconds', t('gpt.unitAudio')],
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
        const x = map.get(keyAlt) ?? sum();
        x.entrada += r.input_tokens ?? 0;
        x.saida += r.output_tokens ?? 0;
        x.cache += r.input_cached_tokens ?? 0;
        x.requisicoes += r.num_model_requests ?? 0;
        map.set(keyAlt, x);
    };

    for (const b of buckets) {
        for (const r of b.results ?? []) {
            accumulate(new Map([[0, total]]), 0, r);
            accumulate(byDay, b.start_time, r);
            accumulate(byModel, r.model ?? t('gpt.noModel'), r);
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
            const item = String(r.line_item ?? t('gpt.otherItem')).split(', ')[0];
            costItem.set(item, (costItem.get(item) ?? 0) + v);
        }
    }
    const withCost = costs !== null;
    const cost = (v) => (withCost ? ` · ${usd(v ?? 0)}` : '');

    const linesAlt = [daysAlt === 1 ? t('gpt.usageTitleToday') : t('gpt.usageTitleDays', { dias: daysAlt })];
    if (withCost) linesAlt.push(t('gpt.spent', { valor: usd(sumCosts(period)) }));
    linesAlt.push(
        t('gpt.tokensLine', { total: fmtInA(tokens(total)), entrada: fmtInA(total.entrada), cache: fmtInA(total.cache), saida: fmtInA(total.saida) }),
        t('gpt.requests', { n: fmtInA(total.requisicoes) })
    );

    if (byDay.size) {
        linesAlt.push('', t('gpt.byDay'));
        for (const [day, x] of [...byDay].sort((a, b) => a[0] - b[0])) {
            linesAlt.push(`• ${dateShort(day)} · ${summary(x)}${cost(costDay.get(day))}`);
        }
    }
    if (byModel.size) {
        linesAlt.push('', t('gpt.byModel'));
        for (const [modelAlt, x] of [...byModel].sort((a, b) => tokens(b[1]) - tokens(a[1])).slice(0, 8)) {
            linesAlt.push(`• ${modelAlt} · ${summary(x)}${cost(costItem.get(modelAlt))}`);
        }
    }

    // What was spent that is not chat (image, voice, transcription...): the cost items without a chat model
    const other = [...costItem].filter(([item, v]) => !byModel.has(item) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const extras = servicesLines(services);
    if (other.length) {
        linesAlt.push('', t('gpt.otherCosts'), ...other.map(([item, v]) => `• ${item} · ${usd(v)}`));
    }
    if (extras.length) linesAlt.push('', t('gpt.otherUses'), ...extras);

    if (!byDay.size && !byModel.size && !extras.length) linesAlt.push('', t('gpt.noUsage'));
    return linesAlt.join('\n');
}

/*
 * The balance in dollars: $used/$total. The API does not report the balance, so the total is gpt.credit.total
 * (what was bought) and the used one is the spend since gpt.credit.since (without it, the last 180 days).
 */
function balanceText(used, total, since) {
    const remains = total - used;
    return t('gpt.balance', {
        usado: usd(used),
        total: usd(total),
        resta: remains >= 0 ? t('gpt.balanceLeft', { valor: usd(remains) }) : t('gpt.balanceOver', { valor: usd(-remains) }),
        periodo: since ? t('gpt.balanceSince', { data: since.split('-').reverse().join('/') }) : t('gpt.balance180')
    });
}

// The x-ratelimit-* headers → the chat text
function limitsText({ modelo: modelAlt, tokens: tk, requisicoes: r }) {
    const line = (nameAlt, x) => (x.limite
        ? t('gpt.limitLine', { nome: nameAlt, restante: fmtInA(x.restante ?? 0), limite: fmtInA(x.limite) }) +
            (x.reseta ? t('gpt.limitReset', { reseta: x.reseta }) : '')
        : null);
    const linesAlt = [line('tokens', tk), line(t('gpt.limitRequests'), r)].filter(Boolean);
    return [t('gpt.limitsTitle', { modelo: modelAlt }), ...(linesAlt.length ? linesAlt : [t('gpt.limitsNone')])].join('\n');
}

/*
 * /gpt -usage [days]: the consumption (Usage API, with the admin key) and the current limits (headers
 * of a minimal call, with the normal key). Only the owner and the admins (role in comandos).
 */
async function showUsage(msg, daysTyped) {
    const daysAlt = daysTyped == null ? DAYS_DEFAULT : Number(daysTyped);
    if (!Number.isInteger(daysAlt) || daysAlt < 1 || daysAlt > DAYS_MAX) {
        await msg.reply(t('gpt.usageUsage', { max: DAYS_MAX, padrao: DAYS_DEFAULT }));
        return;
    }

    const withAdmin = Boolean(keyAdminOpenAi());
    const withKey = Boolean(keyOpenAi());
    if (!withAdmin && !withKey) {
        await msg.reply(`${WITHOUT_KEY('/gpt')}\n${t('gpt.adminKeyHint')}`);
        return;
    }

    const partsAlt = [];

    if (withAdmin) {
        try {
            const total = getSetting('gpt.credit.total');
            const sinceData = getSetting('gpt.credit.since');
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
                partsAlt.push(t('gpt.creditHint'));
            }
        } catch (err) {
            const status = err.response?.status;
            const reasonAlt = err.response?.data?.error?.message ?? '';
            const scope = /api\.usage\.read/.test(reasonAlt);
            partsAlt.push(status === 401 || status === 403
                ? t(scope ? 'gpt.adminRefusedScope' : 'gpt.adminRefused') + '\n' + t('gpt.adminRefusedHint')
                : errorOpenAi(err, '/gpt -usage'));
        }
    } else {
        partsAlt.push(t('gpt.adminMissing'));
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
 * /gpt -prices: fetches the price table from the OpenAI site and updates gpt.pricing (the estimated cost
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
            ? t('gpt.pricesUpdated', {
                mudados: t(changed.length === 1 ? 'gpt.priceChangedOne' : 'gpt.priceChangedMany', { n: changed.length }),
                novos: t(freshAlt3.length === 1 ? 'gpt.priceNewOne' : 'gpt.priceNewMany', { n: freshAlt3.length }),
                iguais: equal,
                linhas: linesAlt.slice(0, 20).join('\n')
            }) + (linesAlt.length > 20 ? t('gpt.pricesMore', { n: linesAlt.length - 20 }) : '')
            : t('gpt.pricesUpToDate', { iguais: equal });
        await completeNotice(msg, notice, `${summary}\n${t('gpt.pricesFooter')}`);
    } catch (err) {
        await completeNotice(msg, notice, t('gpt.pricesFail', { erro: err.message }));
    }
}

async function ask({ msg, args, opts, quotedMsg, admin, chatId, isGroup }) {
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

    // -p [people]: the profile photos come along with the images (only in -img, -gif and in the question; -p leaves the text)
    // (without -p, @me/@this at the start of the text count the same)
    const profileText = opts?.given.has('profile') ? await textReadProfile(args) : readProfileImplicit(args);
    const prepareProfiles = async () => {
        if (!profileText) return [];
        args = profileText.texto;
        return resolverProfiles({ msg, quotedMsg, chatId, isGroup, itens: profileText.itens, cmd: '/gpt' });
    };

    // -img: creates (or, replying to a photo, edits) an image; -gif: a GIF (replying to a photo, animates it).
    // Without -gif, "gere um gif animado..." replying to a photo also works (and is also owner and admins only).
    if (opts?.given.has('img')) {
        const profiles = await prepareProfiles();
        if (!profiles) return;
        await gptDraw(msg, args, quotedMsg, {
            opcao: 'img', gif: null, perfis: profiles,
            semPedido: t('gpt.imgUsage')
        });
        return;
    }
    if (opts?.given.has('gif') || (isPhoto(quotedMsg) && asksGif(args))) {
        if (!admin) {
            await msg.reply(SO_OWNER_GENERATE(t('gpt.actionGif')));
            return;
        }
        const profiles = await prepareProfiles();
        if (!profiles) return;
        await gptDraw(msg, args, quotedMsg, {
            opcao: 'gif', gif: {}, perfis: profiles,
            semPedido: t('gpt.gifUsage')
        });
        return;
    }

    // -voice: the text becomes a voice note
    if (opts?.given.has('voice')) {
        await talkText(msg, args, quotedMsg);
        return;
    }

    // Replying to an audio: the transcription (and, with a question, the chat on top of it)
    const audio = await replyAudio(quotedMsg);
    if (audio) {
        await replyOnAudio(msg, audio, args);
        return;
    }

    // -p: the people's profile photos, to go along with the question
    const profiles = await prepareProfiles();
    if (!profiles) return;

    // Replying to a document: its content goes along with the question
    const doc = await replyDocument(quotedMsg);
    if (doc?.erro) {
        await msg.reply(doc.erro);
        return;
    }

    // Replying to a message, its text (or the photo caption, or the document) goes before the question
    const replied = doc
        ? t('gpt.docPrompt', { nome: doc.documento.nome, texto: doc.documento.texto })
        : String(quotedMsg?.body ?? '').trim();
    let question = [replied, unescape(args.trim())].filter(Boolean).join('\n\n');

    // Replying to a photo, it goes along with the question (without a question, /gpt describes the photo)
    const photo = await messageImage(quotedMsg, '/gpt');
    if (photo?.erro) {
        await msg.reply(photo.erro);
        return;
    }
    if ((photo || profiles.length) && !question) question = PHOTO_QUESTION();
    const context = imagesContext({ comFotoDaMensagem: Boolean(photo), perfis: profiles });
    if (context) question = `${question}\n\n${context}`;

    if (!question) {
        await msg.reply(commandUsage('/gpt'));
        return;
    }

    const notice = await msg.reply(engineProcessing('gpt', CHATGPT), null, { linkPreview: false });
    try {
        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS(), texto: question, imagens: [photo?.imagem, ...profiles.map(p => p.imagem)].filter(Boolean)
        });

        // The 🤖 in front also guarantees the reply never starts with "/" (see markSentByBot)
        await completeNotice(msg, notice, `${withEngineTip(`🤖 ${reply}`, 'gpt', CHATGPT)}${await consumptionFooter()}`);
    } catch (err) {
        await completeNotice(msg, notice, errorOpenAi(err, '/gpt'));
    }
}

// The -status|-s (or the gpt.status setting) shows the call usage in the footer
const cmdGpt = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => ask(ctx));

module.exports = {
    cmdGpt,
    talkText
};
