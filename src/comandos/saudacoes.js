/*
 * Comandos /welcome e /goodbye: a mensagem de entrada e de saída de cada grupo (veja src/saudacoes.js).
 *   /welcome               → mostra a deste grupo
 *   /welcome <texto>       → liga com este texto ({name} = a pessoa, {group} = o grupo)
 *   /welcome -on           → liga com o texto padrão
 *   /welcome -off          → desliga
 *   /welcome -test         → manda como ficaria, com você no lugar de quem entra
 */

const {
    MAX_CARACTERES, apagarSaudacao, gravarSaudacao, lerSaudacao, montarTexto
} = require('../saudacoes');
const { client } = require('../cliente');
const { t } = require('../i18n');
const { resolverNomeDoGrupo } = require('../contatos');

// O texto do comando sem as opções (preserva as quebras de linha do que foi digitado)
const semOpcoes = (args) => args.replace(/(^|\s)-(?:on|off|test|t)(?=\s|$)/g, ' ').trim();

async function cmdSaudacao(tipo, cmd, { msg, args, opts, chatId, isGroup, senderName }) {
    if (!isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }
    const tipoTxt = t(`saudacoes.kind.${tipo}`);

    if (opts.given.has('off')) {
        await apagarSaudacao(chatId, tipo);
        await msg.reply(t('saudacoes.off', { kind: tipoTxt }));
        return;
    }

    const texto = semOpcoes(args);

    if (opts.given.has('test')) {
        const atual = texto ? { text: texto } : (await lerSaudacao(chatId, tipo)) ?? { text: null };
        const grupo = (await resolverNomeDoGrupo(chatId).catch(() => null)) ?? chatId.split('@')[0];
        const quem = msg.author || client.info.wid._serialized;
        const nome = tipo === 'welcome' ? `@${quem.split('@')[0]}` : senderName;
        await msg.reply(montarTexto(tipo, atual, { nome, grupo }), null, tipo === 'welcome' ? { mentions: [quem] } : {});
        return;
    }

    if (texto) {
        if (texto.length > MAX_CARACTERES) {
            await msg.reply(t('saudacoes.tooLong', { n: texto.length, max: MAX_CARACTERES }));
            return;
        }
        await gravarSaudacao(chatId, tipo, texto);
        await msg.reply(t('saudacoes.set', { kind: tipoTxt, text: texto }));
        return;
    }

    if (opts.given.has('on')) {
        await gravarSaudacao(chatId, tipo, null);
        await msg.reply(t('saudacoes.set', { kind: tipoTxt, text: t(`saudacoes.${tipo}Default`) }));
        return;
    }

    const atual = await lerSaudacao(chatId, tipo);
    if (!atual) {
        await msg.reply(t('saudacoes.none', { kind: tipoTxt, cmd }));
        return;
    }
    await msg.reply(t('saudacoes.current', { kind: tipoTxt, cmd, text: atual.text ?? t(`saudacoes.${tipo}Default`) }));
}

const cmdWelcome = (ctx) => cmdSaudacao('welcome', '/welcome', ctx);
const cmdGoodbye = (ctx) => cmdSaudacao('goodbye', '/goodbye', ctx);

module.exports = { cmdGoodbye, cmdWelcome };
