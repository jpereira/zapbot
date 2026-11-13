/*
 * Comandos /promote e /demote: dá e tira o admin de alguém do grupo (o bot precisa ser admin dele).
 *   /promote @Fulano            → /Nome/, @menção ou +número (vários: você escolhe na lista)
 *   /promote, respondendo       → quem escreveu a mensagem respondida
 */

const { lerPessoa, pessoasDoTexto, semDelimitadores } = require('./block');
const { client } = require('../cliente');
const { resolveLidToPhone } = require('../contatos');
const { t } = require('../i18n');
const { printError } = require('../log');

// O participante do grupo que é esta pessoa (o id do grupo pode ser o @lid dela)
async function participanteDe(grupo, id) {
    const user = id.split('@')[0];
    const direto = grupo.participants.find(p => p.id._serialized === id || p.id.user === user);
    if (direto) return direto;

    for (const p of grupo.participants.filter(p => p.id._serialized.endsWith('@lid'))) {
        if ((await resolveLidToPhone(p.id._serialized).catch(() => null)) === id) return p;
    }
    return null;
}

async function mudarAdmin(promover, { msg, opts, quotedMsg, isGroup }) {
    const cmd = promover ? '/promote' : '/demote';
    const grupo = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!grupo?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const eu = await participanteDe(grupo, client.info.wid._serialized);
    if (!eu?.isAdmin && !eu?.isSuperAdmin) {
        await msg.reply(t('grp.admin.botNotAdmin'));
        return;
    }

    const texto = opts.argv.join(' ').trim();
    if (!texto && !quotedMsg) {
        await msg.reply(t('grp.admin.usage', { cmd }));
        return;
    }

    const itens = texto ? pessoasDoTexto(texto) : [''];
    const vistos = new Set();
    for (const item of itens) {
        const pessoa = await lerPessoa(msg, semDelimitadores(item), item ? null : quotedMsg, cmd);
        if (!pessoa || vistos.has(pessoa.id)) continue;
        vistos.add(pessoa.id);

        const alvo = await participanteDe(grupo, pessoa.id);
        if (!alvo) {
            await msg.reply(t('grp.admin.notMember', { name: pessoa.nome }));
            continue;
        }
        if (promover && (alvo.isAdmin || alvo.isSuperAdmin)) {
            await msg.reply(t('grp.admin.alreadyAdmin', { name: pessoa.nome }));
            continue;
        }
        if (!promover && !alvo.isAdmin && !alvo.isSuperAdmin) {
            await msg.reply(t('grp.admin.notAdmin', { name: pessoa.nome }));
            continue;
        }
        if (!promover && alvo.isSuperAdmin) {
            await msg.reply(t('grp.admin.creator', { name: pessoa.nome }));
            continue;
        }

        try {
            const r = promover
                ? await grupo.promoteParticipants([alvo.id._serialized])
                : await grupo.demoteParticipants([alvo.id._serialized]);
            if (r?.status && r.status !== 200) throw new Error(`status ${r.status}`);
            await msg.reply(t(promover ? 'grp.admin.promoted' : 'grp.admin.demoted', { name: pessoa.nome }));
        } catch (err) {
            printError(`${cmd}:`, err.message);
            await msg.reply(t('grp.admin.failed', { name: pessoa.nome, error: err.message }));
        }
    }
}

const cmdPromote = (ctx) => mudarAdmin(true, ctx);
const cmdDemote = (ctx) => mudarAdmin(false, ctx);

module.exports = { cmdDemote, cmdPromote };
