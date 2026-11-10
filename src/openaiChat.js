/*
 * Chamada ao chat da OpenAI, compartilhada pelo /gpt e pelo /tldr.
 */

const axios = require('axios');

const { printError } = require('./log');
const { envOuSetting, getSetting } = require('./settings');
const { paraWhatsapp } = require('./util/whatsapp');

/*
 * Chave, modelo e timeout vêm do config/.env (OPENAI_API_KEY, OPENAI_MODEL,
 * OPENAI_TIMEOUT_MS) ou, na falta deles, dos settings 'openai.api.key',
 * 'openai.api.model' e 'openai.timeout.ms'. A chave nunca é logada nem
 * ecoada: o erro devolvido é só a mensagem da API.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRICAO_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_VOZ_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_BASE = 'https://api.openai.com/v1';
const OPENAI_IMAGEM_URL = `${OPENAI_BASE}/images/generations`;
const OPENAI_IMAGEM_EDICAO_URL = `${OPENAI_BASE}/images/edits`;
const OPENAI_USAGE_URL = 'https://api.openai.com/v1/organization/usage/completions';

const chaveOpenAi = () => envOuSetting('OPENAI_API_KEY', 'openai.api.key');

// A chave de admin (sk-admin-...), só do /gpt -usage: a Usage API não aceita a chave normal
const chaveAdminOpenAi = () => envOuSetting('OPENAI_ADMIN_KEY', 'openai.admin.key');

const SEM_CHAVE = (cmd) => `⚠️ API key da OpenAI não encontrada: o ${cmd} está desativado.\n` +
    '💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_';

// Erro da OpenAI → mensagem para o chat (nunca contém a chave)
function erroOpenAi(err, cmd) {
    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    if (err.code === 'ECONNABORTED') return `⏱️ A OpenAI não respondeu em ${timeout / 1000}s. Tente de novo ou aumente o openai.timeout.ms.`;
    if (err.response?.status === 401) return '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.';
    if (err.response?.status === 429) return '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.';
    return `❌ Erro no ${cmd}: ${err.response?.data?.error?.message || err.message}`;
}

/**
 * Manda as instruções e o texto para o chat da OpenAI e devolve a resposta.
 * Em erro, registra no log (sem a chave) e lança o erro do axios.
 * @param {object} o
 * @param {string} o.cmd        comando que chamou (para o log)
 * @param {string} o.sistema    instruções (role "system")
 * @param {string} o.texto      pergunta ou conteúdo (role "user")
 * @param {{ mimetype: string, data: string }} [o.imagem]  uma imagem (base64) que vai junto da pergunta
 * @returns {Promise<string>}
 */
async function perguntarAoChat({ cmd, sistema, texto, imagem = null }) {
    // Com imagem, o conteúdo vira a lista de partes (texto + imagem em data URL)
    const conteudo = imagem
        ? [
            { type: 'text', text: texto },
            { type: 'image_url', image_url: { url: `data:${imagem.mimetype};base64,${imagem.data}` } }
        ]
        : texto;

    try {
        const { data } = await axios.post(OPENAI_URL, {
            model: envOuSetting('OPENAI_MODEL', 'openai.api.model'),
            messages: [
                { role: 'system', content: sistema },
                { role: 'user', content: conteudo }
            ]
        }, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });

        // O ChatGPT escreve em Markdown; o WhatsApp tem outra formatação (veja util/whatsapp.js)
        return paraWhatsapp(data.choices?.[0]?.message?.content) || '(resposta vazia)';
    } catch (err) {
        // No 401 a mensagem da OpenAI traz um pedaço da chave: não vai para o log
        const status = err.response?.status;
        printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        throw err;
    }
}

/**
 * Transcreve um áudio (POST /v1/audio/transcriptions, multipart), no idioma que a OpenAI detectar.
 * Em erro, registra no log (sem a chave) e lança o erro do axios.
 * @param {object} o
 * @param {string} o.cmd  comando que chamou (para o log)
 * @param {{ arquivo: string, mimetype: string, data: string }} o.audio  o áudio em base64; o nome
 *   do arquivo (com a extensão certa) é o que a OpenAI usa para saber o formato
 * @returns {Promise<string>}  o texto (vazio se não houver fala)
 */
async function transcreverAudio({ cmd, audio }) {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(audio.data, 'base64')], { type: audio.mimetype }), audio.arquivo);
    form.append('model', getSetting('openai.transcribe.model'));

    try {
        const { data } = await axios.post(OPENAI_TRANSCRICAO_URL, form, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
            maxBodyLength: Infinity
        });
        return String(data?.text ?? '').trim();
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

// O teto do texto da API de voz
const VOZ_MAX_CARACTERES = 4096;

/**
 * Gera a voz de um texto (POST /v1/audio/speech) em Ogg/Opus, o formato da nota de voz do WhatsApp.
 * Em erro, registra no log (sem a chave) e lança o erro do axios.
 * @param {object} o
 * @param {string} o.cmd    comando que chamou (para o log)
 * @param {string} o.texto  até VOZ_MAX_CARACTERES
 * @returns {Promise<Buffer>}
 */
async function sintetizarVoz({ cmd, texto }) {
    const modelo = getSetting('openai.tts.model');

    try {
        const { data } = await axios.post(OPENAI_VOZ_URL, {
            model: modelo,
            voice: getSetting('openai.tts.voice'),
            input: texto,
            response_format: 'opus',
            // Só o gpt-4o-mini-tts segue o estilo; o tts-1 e o tts-1-hd recusam o campo
            ...(modelo.startsWith('gpt-4o') ? { instructions: getSetting('openai.tts.instructions') } : {})
        }, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
            responseType: 'arraybuffer'
        });
        return Buffer.from(data);
    } catch (err) {
        // Com responseType arraybuffer, o corpo do erro (JSON) também vem em bytes
        if (Buffer.isBuffer(err.response?.data)) {
            try {
                err.response.data = JSON.parse(err.response.data.toString('utf8'));
            } catch { /* corpo que não é JSON: fica a mensagem do axios */ }
        }
        logarErro(cmd, err);
        throw err;
    }
}

/**
 * Gera uma imagem (v1/images/generations) ou, com `imagem`, edita a que veio (v1/images/edits). Com
 * `gif`, o resultado é um GIF animado (output_format gif, só nos modelos gpt-image-2.6-*).
 * @param {object} o
 * @param {string} o.cmd     comando que chamou (para o log)
 * @param {string} o.prompt  o que gerar ou mudar
 * @param {Buffer} [o.imagem]  a imagem a editar, em PNG
 * @param {{ frames: number, frameMs: number }} [o.gif]  pede o GIF, com os quadros e a duração de cada um
 * @returns {Promise<string>}  a imagem (PNG) ou o GIF, em base64
 */
async function gerarImagem({ cmd, prompt, imagem = null, gif = null }) {
    const modelo = getSetting('openai.image.model');
    const extras = gif ? { output_format: 'gif', frame_count: gif.frames, frame_duration_ms: gif.frameMs } : {};
    const config = {
        headers: { Authorization: `Bearer ${chaveOpenAi()}` },
        timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
    };

    try {
        let resposta;
        if (imagem) {
            const form = new FormData();
            form.append('model', modelo);
            form.append('prompt', prompt);
            for (const [campo, valor] of Object.entries(extras)) form.append(campo, String(valor));
            form.append('image', new Blob([imagem], { type: 'image/png' }), 'imagem.png');
            resposta = await axios.post(OPENAI_IMAGEM_EDICAO_URL, form, { ...config, maxBodyLength: Infinity });
        } else {
            resposta = await axios.post(OPENAI_IMAGEM_URL, { model: modelo, prompt, n: 1, ...extras }, config);
        }

        const b64 = resposta.data?.data?.[0]?.b64_json;
        if (!b64) throw new Error('a OpenAI não devolveu a imagem');
        return b64;
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

/**
 * Os modelos que a chave enxerga (GET /v1/models), em ordem alfabética: para dizer qual usar quando o
 * configurado não existe na conta.
 * @returns {Promise<string[]>}
 */
async function listarModelos({ cmd }) {
    try {
        const { data } = await axios.get(`${OPENAI_BASE}/models`, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });
        return (data?.data ?? []).map(m => m.id).filter(Boolean).sort();
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

// Erro da OpenAI no log, sem a chave (no 401 a mensagem traz um pedaço dela)
function logarErro(cmd, err) {
    const status = err.response?.status;
    printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
}

/**
 * O consumo dos últimos dias (GET /v1/organization/usage/completions), por dia e por modelo. Precisa de
 * uma chave de admin (sk-admin-...); a chave normal não vale.
 * @param {object} o
 * @param {string} o.cmd   comando que chamou (para o log)
 * @param {number} o.dias  quantos dias, contando hoje (buckets de 1 dia, em UTC)
 * @returns {Promise<{ buckets: object[] }>}  os buckets da OpenAI, de todas as páginas
 */
async function consultarConsumo({ cmd, dias }) {
    const buckets = [];
    const fim = Math.floor(Date.now() / 1000);
    let pagina = null;

    try {
        for (let n = 0; n < 5; n++) {
            const { data } = await axios.get(OPENAI_USAGE_URL, {
                headers: { Authorization: `Bearer ${chaveAdminOpenAi()}` },
                timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
                params: {
                    start_time: fim - dias * 86400,
                    bucket_width: '1d',
                    limit: dias,
                    group_by: ['model'],
                    ...(pagina ? { page: pagina } : {})
                }
            });
            buckets.push(...(data?.data ?? []));
            if (!data?.has_more || !data.next_page) break;
            pagina = data.next_page;
        }
        return { buckets };
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

/**
 * Os limites e o que sobrou na janela atual, lidos dos cabeçalhos x-ratelimit-* de uma chamada
 * mínima ao chat (gasta uns poucos tokens). Vale a chave normal.
 * @returns {Promise<{ modelo: string, tokens: object, requisicoes: object }>}
 */
async function consultarLimites({ cmd }) {
    const modelo = envOuSetting('OPENAI_MODEL', 'openai.api.model');

    try {
        const { headers } = await axios.post(OPENAI_URL, {
            model: modelo,
            messages: [{ role: 'user', content: '.' }],
            max_completion_tokens: 16
        }, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });

        const h = (nome) => headers?.[`x-ratelimit-${nome}`] ?? null;
        return {
            modelo,
            tokens: { limite: h('limit-tokens'), restante: h('remaining-tokens'), reseta: h('reset-tokens') },
            requisicoes: { limite: h('limit-requests'), restante: h('remaining-requests'), reseta: h('reset-requests') }
        };
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

module.exports = {
    SEM_CHAVE,
    chaveAdminOpenAi,
    chaveOpenAi,
    consultarConsumo,
    consultarLimites,
    erroOpenAi,
    gerarImagem,
    listarModelos,
    perguntarAoChat,
    sintetizarVoz,
    transcreverAudio,
    VOZ_MAX_CARACTERES
};
