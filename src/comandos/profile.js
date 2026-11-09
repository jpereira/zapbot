/*
 * Comando /profile.
 */

const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');

const { lerPessoa, pessoasDoTexto, semDelimitadores } = require('./block');
const { client } = require('../cliente');
const { nomeDaAgenda, nomeDoContato, resolveLidToPhone, resolverNomeDoGrupo } = require('../contatos');
const { printError } = require('../log');

/*
 * /profile (/perfil): a foto de perfil de um contato, com o nome da sua agenda e o telefone.
 *   /profile                → no privado, a pessoa dele (o seu, no seu próprio privado);
 *                             no grupo, a foto do grupo
 *   /profile <pessoa>...    → /Nome/, @menção ou +número (vários que servem: você escolhe na lista)
 *   /profile, respondendo   → quem escreveu a mensagem respondida
 * Sem foto, ou com a foto escondida pela privacidade do contato, sai só o texto.
 */
const TIMEOUT_MS = 15000;
const MAX_BYTES = 10 * 1024 * 1024;

/*
 * A pessoa de um id (telefone ou @lid): o telefone (null: o WhatsApp não informou) e o nome, o da
 * sua agenda primeiro e, para quem não está nela, o do perfil dela.
 */
async function dadosDa(id) {
    const jid = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    const telefone = jid?.endsWith('@c.us') ? jid.split('@')[0] : null;

    const contatos = [];
    for (const alvo of new Set([jid, id].filter(Boolean))) {
        contatos.push(await client.getContactById(alvo).catch(() => null));
    }
    const nome = contatos.map(nomeDaAgenda).find(Boolean) || contatos.map(nomeDoContato).find(Boolean) || null;

    return { telefone, nome, ids: [...new Set([jid, id].filter(Boolean))] };
}

// A foto como mídia, ou null (sem foto, foto privada ou o download falhou)
async function fotoDe(ids) {
    for (const id of ids) {
        const url = await client.getProfilePicUrl(id).catch(() => null);
        if (!url) continue;

        try {
            const { data, headers } = await axios.get(url, {
                responseType: 'arraybuffer', timeout: TIMEOUT_MS, maxContentLength: MAX_BYTES
            });
            const mime = String(headers?.['content-type'] ?? 'image/jpeg').split(';')[0];
            return new MessageMedia(mime, Buffer.from(data).toString('base64'), 'perfil.jpg');
        } catch (err) {
            printError('/profile: não baixei a foto:', err.message);
        }
    }
    return null;
}

async function mostrarPerfil(msg, pessoa) {
    const { telefone, nome, ids } = await dadosDa(pessoa.id);
    const rotulo = nome ?? pessoa.nome ?? (telefone ? `+${telefone}` : pessoa.id.split('@')[0]);
    const contato = `Contato: ${rotulo}${telefone ? ` <+${telefone}>` : ''}`;

    const foto = await fotoDe(ids);
    if (foto) {
        await msg.reply(foto, undefined, { caption: contato });
        return;
    }
    await msg.reply(`${contato}\n🚫 Sem foto de perfil (ou ela está escondida pela privacidade do contato).`);
}

// A foto do grupo, com a legenda Grupo: nome
async function mostrarGrupo(msg, chatId) {
    const nome = await resolverNomeDoGrupo(chatId).catch(() => null);
    const grupo = `Grupo: ${nome ?? chatId.split('@')[0]}`;

    const foto = await fotoDe([chatId]);
    if (foto) {
        await msg.reply(foto, undefined, { caption: grupo });
        return;
    }
    await msg.reply(`${grupo}\n🚫 Sem foto do grupo.`);
}

async function cmdProfile({ msg, opts, quotedMsg, chatId, isGroup }) {
    const texto = opts.argv.join(' ').trim();

    // Sem ninguém: a mensagem respondida (quem a escreveu), o grupo ou a pessoa do privado (você, no seu)
    if (!texto) {
        if (!quotedMsg && isGroup) {
            await mostrarGrupo(msg, chatId);
            return;
        }
        const pessoa = quotedMsg
            ? await lerPessoa(msg, '', quotedMsg, '/profile')
            : { id: chatId };
        if (pessoa) await mostrarPerfil(msg, pessoa);
        return;
    }

    const vistos = new Set();
    for (const item of pessoasDoTexto(texto)) {
        const pessoa = await lerPessoa(msg, semDelimitadores(item), null, '/profile');
        if (!pessoa || vistos.has(pessoa.id)) continue;
        vistos.add(pessoa.id);
        await mostrarPerfil(msg, pessoa);
    }
}

module.exports = { cmdProfile };
