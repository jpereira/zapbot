/*
 * /show: Mostra mensagens do cache do bot
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/show',
    usage: '/show [-N] [OPÇÃO] [chat]  ou  /show -l [chat]  ou  /show -q <texto|/regex/flags> [-N] [chat]',
    aliases: ['/mostrar'],
    summary: 'Mostra mensagens do cache do bot',
    help: 'Sem parâmetros no privado, lista o cache de todos os chats, como /show -l. Em grupos, reexibe a última mensagem apagada do grupo. Reexibe as mensagens apagadas, editadas, os status apagados e as reações removidas ou trocadas que estão no cache: deste chat ou de outro (pelo nº do -l, nome, @menção ou /regex/). Publicações de canais (@newsletter) são identificadas com 📰 Canal e o nome, sem nome ou telefone de contato.',
    cmd_opts: [
        { opts: ['deleted', 'd'], values: [], desc: 'Mensagens apagadas (sem chat, o padrão).' },
        {
            opts: ['edited', 'e'],
            values: [],
            desc: 'Mensagens editadas, com o texto de antes e o de depois.'
        },
        {
            opts: ['status', 's'],
            values: [],
            desc: 'Status apagados: num privado, os da pessoa; no seu privado, sem chat, de todos.'
        },
        {
            opts: ['reaction', 'r'],
            values: [],
            desc: 'Reações removidas ou trocadas, com a reação de antes (e a nova, se trocou) e o texto da mensagem reagida.'
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lista os chats com conteúdo no cache, numerados para o /show <nº>, marcando o chat atual. Com chat (nº, nome, @menção ou /regex/), só os que casam, e as contas só deles.',
            ex: ['/show -l', '/show -l /^Maria/'],
            outrosChats: true
        },
        {
            opts: ['flush', 'f'],
            values: [],
            desc: 'Remove do cache as apagadas deste chat ou, com -e/-s/-r/chat, o que foi pedido (no seu privado, sem chat: de todos).',
            role: ADMIN
        },
        {
            opts: ['query', 'q'],
            values: ['<texto|/regex/flags>'],
            desc: 'Busca as que têm o texto (sem diferenciar maiúsculas nem acentos) ou que casam com a /regex/flags. Neste chat, no chat pedido ou, no seu privado, em todos. Sem -N: as 5 mais recentes. Com espaços, entre aspas.',
            ex: ['/show -q pix', '/show -e -q "bom dia"', '/show -5 -q /pix|boleto/i']
        },
        {
            argv: ['-N'],
            desc: 'Quantidade de mensagens (padrão 1, máx. show.max).',
            ex: ['/show -3'],
            numero: true
        },
        {
            argv: ['chat'],
            desc: 'Outro chat: o nº da lista do -l, parte do nome, @menção ou /regex/ (sem diferenciar maiúsculas nem acentos). Sem -d, -e, -s e -r, vêm apagadas, editadas, status e reações juntos, por data.',
            ex: ['/show -3 /^Maria/'],
            outrosChats: true
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Ofusca telefones com 10 a 15 dígitos contínuos na saída desta execução, mantendo os cinco primeiros e os dois últimos (como +55219****44). Os dados salvos e os destinos usam os números completos.',
            ex: ['/show -mask']
        }
    ],
    estrito: true,
    mask: true,
    delegavel: true,
    role: ADMIN // delegável: só o chat atual (o -flush é só do dono)
};
