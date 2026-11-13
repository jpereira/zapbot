/*
 * Comando /ocr: o texto de uma imagem, lido pelo ChatGPT (visão).
 *   /ocr, respondendo uma foto      → o texto da foto
 *   foto com a legenda "/ocr"       → o texto dela
 */

const { concluirAviso } = require('../cliente');
const { avisarProcessando, ehFoto, imagemDaMensagem } = require('./openaiComum');
const { t } = require('../i18n');
const { SEM_CHAVE, chaveOpenAi, erroOpenAi, medirConsumo, perguntarAoChat, rodapeDeConsumo } = require('../openaiChat');

// O que o modelo responde quando a imagem não tem texto (para o bot trocar pela mensagem do idioma)
const SEM_TEXTO = 'NO_TEXT';

async function extrair({ msg, quotedMsg }) {
    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/ocr'));
        return;
    }

    const origem = [quotedMsg, msg].find(ehFoto);
    if (!origem) {
        await msg.reply(t('ocr.usage'));
        return;
    }

    const foto = await imagemDaMensagem(origem, '/ocr');
    if (foto.erro) {
        await msg.reply(foto.erro);
        return;
    }

    const aviso = await avisarProcessando(msg, '/ocr');
    try {
        const texto = await perguntarAoChat({
            cmd: '/ocr', sistema: t('ocr.instructions', { vazio: SEM_TEXTO }), texto: t('ocr.prompt'), imagem: foto.imagem
        });
        // O 📝 na frente também garante que a resposta nunca começa com "/" (ver marcarEnviadaPeloBot)
        const resposta = texto.trim() === SEM_TEXTO ? t('ocr.noText') : `📝 ${texto}`;
        await concluirAviso(msg, aviso, `${resposta}${await rodapeDeConsumo()}`);
    } catch (err) {
        await concluirAviso(msg, aviso, erroOpenAi(err, '/ocr'));
    }
}

const cmdOcr = (ctx) => medirConsumo(ctx.opts?.given.has('status'), () => extrair(ctx));

module.exports = { cmdOcr };
