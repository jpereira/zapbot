/*
 * Comando /whois.
 */

const { PAPEIS, descreverItem, escopoDoChat, permissoes } = require('./bot');
const { ehODono, itensDoTexto } = require('./set');
const { client } = require('../cliente');
const { resolveLidToPhone, resolverNomeDoGrupo } = require('../contatos');
const { descreverRegra, permissaoAqui } = require('../permissoes');
const { resolverOuEscolher } = require('../destinos');
const { getSetting } = require('../settings');

/*
 * /whois (/who, /id): quem é e o que pode no bot, neste chat
 *   /whois                → você (quem digitou)
 *   /whois <pessoa...>    → (dono e admins) outras pessoas: /Nome/, @menção ou +número
 *   /whois, respondendo   → (dono e admins) quem escreveu a mensagem respondida
 * O nível vale para o chat onde o comando foi digitado: um grupo do bot.users
 * libera todo mundo ali dentro, mas não no privado de cada um. Num grupo, o
 * telefone de quem não está nele sai escondido, como no /bot.
 */

// O nível de alguém neste chat, do mais alto ao mais baixo
async function nivelDe(numero, { chatId, isGroup }) {
    const users = getSetting('bot.users');
    const soNosGrupos = users.filter(u => u.startsWith(`${numero}:`))
        .map(u => u.slice(u.indexOf(':') + 1));
    if (ehODono(numero)) return `${PAPEIS.dono} dono`;
    if (getSetting('bot.admins').includes(numero)) return `${PAPEIS.admin} +o`;
    if (users.includes(numero)) return `${PAPEIS.usuario} +v`;
    if (users.includes('all')) return `${PAPEIS.usuario} todos`;
    if (isGroup && users.includes(chatId)) return `${PAPEIS.usuario} +v pelo grupo`;
    if (isGroup && soNosGrupos.includes(chatId)) return `${PAPEIS.usuario} +v neste grupo`;

    // Só noutros grupos: diz onde
    if (soNosGrupos.length) {
        const grupos = await Promise.all(soNosGrupos.map(async g => `👥 ${await resolverNomeDoGrupo(g).catch(() => null) || g}`));
        return `${PAPEIS.nenhum} sem permissão aqui (só em ${grupos.join(', ')})`;
    }
    return `${PAPEIS.nenhum} sem permissão`;
}

// O telefone de um id (o LID vira o telefone, se o WhatsApp souber); null: não sei
async function telefoneDe(id) {
    const telefone = id?.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    return telefone?.endsWith('@c.us') ? telefone.split('@')[0] : null;
}

/**
 * As pessoas do texto viram telefones (o número passa como veio, o nome é
 * buscado nos contatos). Grupo e e-mail são recusados.
 * @returns {Promise<string[]|null>} null: já respondeu o erro
 */
async function telefonesDoTexto(msg, texto) {
    const numeros = [];

    for (const item of itensDoTexto(texto)) {
        if (/^\+?[\d\s().-]+$/.test(item)) {
            numeros.push(item.replace(/\D/g, ''));
            continue;
        }

        const pessoa = await resolverOuEscolher(msg, item, {
            semEmail: '❌ O /whois é de pessoas: informe um contato, uma menção ou um número, não um e-mail.'
        });
        if (!pessoa) return null;

        if (pessoa.grupo) {
            await msg.reply(`❌ ${pessoa.nome} é um grupo: o /whois é de pessoas.\n💡 _Para ver quem usa o bot no grupo: /bot_`);
            return null;
        }

        const telefone = await telefoneDe(pessoa.id);
        if (!telefone) {
            await msg.reply(`❌ Não sei o telefone de ${pessoa.nome} (o WhatsApp só informou o id interno): use o número, ex.: /whois +5521999999999.`);
            return null;
        }
        numeros.push(telefone);
    }

    return [...new Set(numeros)];
}

async function cmdWhois({ msg, args, quotedMsg, senderNumber, chatId, isGroup, admin }) {
    const texto = String(args ?? '').trim();
    const outros = Boolean(texto || quotedMsg);

    // Os outros, só o dono e os admins: quem usa o bot não precisa saber o nível de todo mundo
    if (outros && !admin) {
        await msg.reply('⛔ Só o dono do bot (e os admins) vê o nível dos outros.\n💡 _/whois sozinho mostra o seu._');
        return;
    }

    let numeros;
    if (texto) {
        numeros = await telefonesDoTexto(msg, texto);
        if (!numeros) return;
    } else if (quotedMsg) {
        const autor = quotedMsg.fromMe
            ? client.info.wid._serialized
            : (quotedMsg.author || quotedMsg.from);
        const telefone = await telefoneDe(autor);
        if (!telefone) {
            await msg.reply('❌ Não sei o telefone de quem escreveu essa mensagem (o WhatsApp só informou o id interno).');
            return;
        }
        numeros = [telefone];
    } else {
        // Você mesmo: o dono pela conta do bot; os outros, pelo telefone de quem mandou
        const eu = msg.fromMe ? client.info.wid.user : senderNumber;
        if (!eu) {
            await msg.reply('❌ Não sei o seu telefone (o WhatsApp só informou o id interno).');
            return;
        }
        numeros = [eu];
    }

    const chat = { chatId, isGroup };
    const escopo = await escopoDoChat(chat);
    const niveis = await Promise.all(numeros.map(n => nivelDe(n, chat)));
    // Usuário com regra (o /bot +cmd|-cmd): os comandos dele aqui, embaixo
    const linhas = await Promise.all(numeros.map(async (n, i) => {
        const { regras } = permissaoAqui({ numero: n, chatId, isGroup });
        const usuario = niveis[i].startsWith(PAPEIS.usuario);
        return `• ${niveis[i]} · ${await descreverItem(n, escopo)}` +
            (usuario && regras.length ? `\n → ${regras.map(descreverRegra).join('; ')}` : '');
    }));

    await msg.reply(`*Quem é?* (${numeros.length})\n${linhas.join('\n')}\n\n` +
        permissoes({
            dono: numeros.some(ehODono),
            semPermissao: niveis.some(n => n.startsWith(PAPEIS.nenhum))
        }) +
        '\n\nDigite /help para saber quais comandos estão disponíveis.');
}

module.exports = {
    cmdWhois
};
