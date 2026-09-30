/*
 * Comando /enquete.
 */

const { Poll } = require('whatsapp-web.js');

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');

/*
 * /enquete [-m] Pergunta | opção 1 | opção 2 ...
 * Envia uma enquete nativa do WhatsApp no chat. Separadores: "|" ou uma por
 * linha (a 1ª linha é a pergunta). -m (ou -multi) permite marcar várias opções.
 * O -m só vale no começo: no meio do texto faz parte da pergunta.
 */
const ENQUETE_MAX_OPCOES = 12;
const ENQUETE_MAX_PERGUNTA = 255;
const ENQUETE_MAX_OPCAO = 100;

async function cmdEnquete({ msg, args, chatId }) {
    let texto = String(args ?? '').trim();
    let multi = false;

    const flag = texto.match(/^-(m|multi)(\s+|$)/i);
    if (flag) {
        multi = true;
        texto = texto.slice(flag[0].length);
    }

    const partes = (texto.includes('|') ? texto.split('|') : texto.split('\n'))
        .map(p => p.trim())
        .filter(Boolean);

    let [pergunta, ...opcoes] = partes;
    const erro = (m) => msg.reply(`❌ ${m}\n\n` + '```' + getCommandSyntax('/enquete') + '```');

    if (!pergunta || opcoes.length < 2) {
        await erro('Informe a pergunta e pelo menos 2 opções.');
        return;
    }

    if (opcoes.length > ENQUETE_MAX_OPCOES) {
        await erro(`No máximo ${ENQUETE_MAX_OPCOES} opções (foram ${opcoes.length}).`);
        return;
    }

    if (pergunta.length > ENQUETE_MAX_PERGUNTA || opcoes.some(o => o.length > ENQUETE_MAX_OPCAO)) {
        await erro(`A pergunta vai até ${ENQUETE_MAX_PERGUNTA} caracteres e cada opção até ${ENQUETE_MAX_OPCAO}.`);
        return;
    }

    // O WhatsApp não aceita opções repetidas
    const repetidas = opcoes.filter((o, i) => opcoes.findIndex(x => x.toLowerCase() === o.toLowerCase()) !== i);
    if (repetidas.length) {
        await erro(`Opção repetida: ${[...new Set(repetidas)].join(', ')}`);
        return;
    }

    // A enquete volta no 'message_create' como sua: nunca pode parecer um comando
    if (pergunta.startsWith('/')) pergunta = `📊 ${pergunta}`;

    await client.sendMessage(chatId, new Poll(pergunta, opcoes, { allowMultipleAnswers: multi }));
}

module.exports = {
    cmdEnquete
};
