/*
 * O que os comandos da OpenAI (/gpt, /draw) repartem: o aviso "Processando", o rodapé de status das
 * mídias, o erro de modelo que a conta não tem, a troca de modelo por uso (-m) e a foto de referência.
 * As chamadas e os erros da API ficam no openaiChat.js.
 */

const sharp = require('sharp');

const { t } = require('../i18n');
const { OPENAI_MODELOS } = require('../openai');
const { chaveOpenAi, listarModelos, rodapeDeConsumo } = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');

/*
 * Como no /get: o "⏳ Processando…" sai antes da chamada e vira a resposta (o WhatsApp edita a mensagem).
 * Mídia não dá para editar: nela o aviso é apagado quando a mídia sai.
 */
const avisarProcessando = (msg, cmd) => msg.reply(t('openai.processing', { cmd }), null, { linkPreview: false });

async function apagarAviso(aviso) {
    try {
        await aviso?.delete?.(true);
    } catch { /* fica o aviso: não atrapalha a resposta */ }
}

// Mídia (voz, imagem, GIF) não tem rodapé: com o status ligado, o consumo vai numa mensagem à parte
async function responderConsumo(msg) {
    const rodape = (await rodapeDeConsumo()).trim();
    if (rodape) await msg.reply(rodape);
}

// A mensagem para quem não é dono nem admin
const SO_DONO_GERAR = (acao) => t('openai.ownerOnly', { acao });

// O texto do pedido sem a opção (-img, -gif)
const semOpcao = (args, nomes) => args.replace(new RegExp(`(^|\\s)-(?:${nomes})(?=\\s|$)`), '').trim();

/*
 * Para o erro de modelo e para o -m: o setting do modelo, o filtro da lista de modelos da conta e o nome do
 * recurso.
 */
const MODELO_DE_AUDIO = { setting: 'openai.transcribe.model', tipo: /whisper|transcribe|audio/i, get nome() { return t('openai.kindAudio'); } };
const MODELO_DE_VOZ = { setting: 'openai.tts.model', tipo: /tts|speech|audio/i, get nome() { return t('openai.kindVoice'); } };
const MODELO_DE_IMAGEM = { setting: 'openai.image.model', tipo: /image|dall/i, get nome() { return t('openai.kindImage'); } };
const MODELO_DE_GIF = { setting: 'openai.image.gifModel', tipo: /image/i, get nome() { return t('openai.kindGif'); } };

/*
 * "The model 'x' does not exist": o setting aponta para um modelo que a conta não tem. Em vez do erro cru,
 * lista os que a chave vê (GET /v1/models) parecidos com o tipo pedido e diz como trocar.
 * @param {object} err
 * @param {{ setting: string, tipo: RegExp, nome: string }} o  o setting do modelo, o filtro da lista e o nome do recurso
 * @param {string} cmd  o comando que chamou (para o log)
 * @returns {Promise<string | null>}  null: o erro não é de modelo
 */
async function erroDoModelo(err, { setting, tipo, nome }, cmd) {
    const mensagem = err.response?.data?.error?.message ?? '';
    if (!/does not exist|model_not_found|not found/i.test(`${mensagem} ${err.response?.data?.error?.code ?? ''}`)
        || !/model/i.test(mensagem)) {
        return null;
    }

    const modelo = getSetting(setting);
    let candidatos = [];
    try {
        candidatos = (await listarModelos({ cmd })).filter(id => tipo.test(id));
    } catch { /* sem a lista, só o aviso */ }

    return t('openai.modelMissing', { modelo, nome }) +
        (candidatos.length ? t('openai.modelCandidates', { lista: candidatos.join(', ') }) : t('openai.modelNoCandidates')) +
        t('openai.modelSwitch', { setting });
}

/*
 * -m: os modelos por uso e a troca de cada um. Cada comando lista os seus usos (o /gpt, todos; o /draw,
 * a imagem e o GIF) e diz como trocar com o seu nome. A lista é a da chave (GET /v1/models), com a fixa do
 * código de reserva quando a chave não responde.
 */
const USO_DE_PERGUNTA = {
    get nome() { return t('openai.useDefault'); }, get detalhe() { return t('openai.detailQuestions'); }, opcoes: [], setting: 'openai.api.model',
    exemplo: (cmd) => `${cmd} -m <modelo>`, daConta: (id) => OPENAI_MODELOS.includes(id), reserva: OPENAI_MODELOS
};
const USO_DE_IMAGEM = {
    nome: '-img', get detalhe() { return t('openai.detailImages'); }, opcoes: ['img'], setting: 'openai.image.model',
    exemplo: (cmd) => (cmd === '/gpt' ? '/gpt -m <modelo> -img' : `${cmd} -m <modelo>`), daConta: (id) => /image|dall-e/i.test(id)
};
const USO_DE_GIF = {
    nome: '-gif', get detalhe() { return t('openai.detailGif'); }, opcoes: ['gif', 'frames', 'ms'], setting: 'openai.image.gifModel',
    exemplo: (cmd) => (cmd === '/gpt' ? '/gpt -m <modelo> -gif' : `${cmd} -gif -m <modelo>`), daConta: (id) => /image/i.test(id)
};
const USO_DE_AUDIO = {
    nome: '-audio', get detalhe() { return t('openai.detailAudio'); }, opcoes: ['audio'], setting: 'openai.transcribe.model',
    exemplo: (cmd) => `${cmd} -m <modelo> -audio`, daConta: (id) => /transcribe|whisper/i.test(id)
};
const USO_DE_VOZ = {
    nome: '-voz', get detalhe() { return t('openai.detailVoice'); }, opcoes: ['voz'], setting: 'openai.tts.model',
    exemplo: (cmd) => `${cmd} -m <modelo> -voz`, daConta: (id) => /tts/i.test(id)
};

const USOS_DO_GPT = [USO_DE_PERGUNTA, USO_DE_IMAGEM, USO_DE_GIF, USO_DE_AUDIO, USO_DE_VOZ];
const USOS_DO_DESENHE = [USO_DE_IMAGEM, USO_DE_GIF];

// Os modelos da chave, ou null (sem chave ou sem resposta)
async function modelosDaConta(cmd) {
    if (!chaveOpenAi()) return null;
    try {
        return await listarModelos({ cmd });
    } catch {
        return null;
    }
}

// O modelo em uso: o do .env (só o das perguntas) ou o setting
const modeloAtual = (uso) => (uso.setting === 'openai.api.model'
    ? envOuSetting('OPENAI_MODEL', 'openai.api.model')
    : getSetting(uso.setting));

/**
 * @param {object} msg
 * @param {string} [modelo]  vazio: lista os modelos
 * @param {{ given: Set<string> }} opts  as opções do comando (a que casar com um uso escolhe o uso)
 * @param {object} o
 * @param {string} o.cmd      o comando ("/gpt", "/draw")
 * @param {string} o.icone    o emoji do título da lista
 * @param {object[]} o.usos   os usos que o comando tem
 * @param {object} o.padrao   o uso do -m sem outra opção
 */
async function trocarModelo(msg, modelo, opts, { cmd, icone, usos, padrao }) {
    const doEnv = process.env.OPENAI_MODEL?.trim();
    const pedido = usos.find(u => u.opcoes.some(o => opts?.given.has(o))) ?? null;
    const ids = await modelosDaConta(cmd);

    if (!modelo) {
        const mostrar = pedido ? [pedido] : usos;
        const blocos = mostrar.map(uso => {
            const atual = modeloAtual(uso);
            const doUso = ids ? ids.filter(uso.daConta) : (uso.reserva ?? []);
            const lista = [...new Set([atual, ...(doUso.length ? doUso : (uso.reserva ?? []))])];
            const linhas = lista.map(m => `${m === atual ? '✅' : '▫️'} ${m}${ids && !ids.includes(m) ? t('openai.keyCantSeeTag') : ''}`);
            const origem = uso.setting === 'openai.api.model' && doEnv ? t('openai.envOrigin') : '';
            return t('openai.modelBlock', { nome: uso.nome, detalhe: uso.detalhe, exemplo: uso.exemplo(cmd), origem, linhas: linhas.join('\n') });
        });
        await msg.reply(`${t('openai.modelsTitle', { icone, cmd })}\n\n${blocos.join('\n\n')}\n\n` + (ids
            ? t('openai.listFromKey')
            : t('openai.listDefaults')));
        return;
    }

    // Um modelo que a chave não vê não adianta gravar (os de imagem, áudio e voz são livres, sem lista fixa)
    const uso = pedido ?? padrao;
    if (uso.setting !== 'openai.api.model' && ids && !ids.includes(modelo)) {
        const candidatos = ids.filter(uso.daConta);
        await msg.reply(t('openai.keyCantSee', { modelo, detalhe: uso.detalhe }) +
            (candidatos.length ? t('openai.keySees', { lista: candidatos.join(', ') }) : ''));
        return;
    }

    try {
        await setSetting(uso.setting, modelo);
    } catch (e) {
        await msg.reply(t('openai.modelError', { erro: e.message }));
        return;
    }

    if (pedido) {
        await msg.reply(t('openai.modelSetFor', { detalhe: pedido.detalhe, cmd, modelo: getSetting(uso.setting) }));
        return;
    }
    await msg.reply(t('openai.modelSet', { cmd, modelo: getSetting(uso.setting) }) +
        (doEnv && uso.setting === 'openai.api.model'
            ? t('openai.envPriority', { env: doEnv })
            : ''));
}

// A foto: só as que a OpenAI lê, e até um tamanho que não estoure a requisição
const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const FOTO_MAX_BYTES = 15 * 1024 * 1024;

const ehFoto = (m) => Boolean(m?.hasMedia) && ['image', 'sticker'].includes(m.type);

/**
 * A imagem de uma mensagem (foto ou figurinha), baixada em base64.
 * @param {object} m    a mensagem respondida ou a própria (a foto com a legenda "/draw ...")
 * @param {string} cmd  o comando, para o aviso de tamanho
 * @returns {Promise<null | { imagem: { mimetype: string, data: string } } | { erro: string }>}
 *   null: a mensagem não é imagem
 */
async function imagemDaMensagem(m, cmd) {
    if (!ehFoto(m)) return null;

    const midia = await m.downloadMedia().catch(() => null);
    if (!midia?.data) return { erro: t('openai.photoDownload') };
    if (!TIPOS_DE_FOTO.includes(midia.mimetype)) {
        return { erro: t('openai.photoType', { tipo: midia.mimetype, tipos: TIPOS_DE_FOTO.map(x => x.split('/')[1]).join(', ') }) };
    }
    if (midia.data.length * 0.75 > FOTO_MAX_BYTES) {
        return { erro: t('openai.photoSize', { mb: FOTO_MAX_BYTES / 1024 / 1024, cmd }) };
    }
    return { imagem: { mimetype: midia.mimetype, data: midia.data } };
}

// A foto em PNG (a edição da OpenAI pede png, jpeg ou webp; o gif e a figurinha viram png)
const fotoEmPng = async (foto) => sharp(Buffer.from(foto.imagem.data, 'base64')).png().toBuffer();

module.exports = {
    MODELO_DE_AUDIO,
    MODELO_DE_GIF,
    MODELO_DE_IMAGEM,
    MODELO_DE_VOZ,
    SO_DONO_GERAR,
    USOS_DO_DESENHE,
    USOS_DO_GPT,
    USO_DE_IMAGEM,
    USO_DE_PERGUNTA,
    apagarAviso,
    avisarProcessando,
    ehFoto,
    erroDoModelo,
    fotoEmPng,
    imagemDaMensagem,
    responderConsumo,
    semOpcao,
    trocarModelo
};
