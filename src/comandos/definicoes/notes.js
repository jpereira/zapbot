/*
 * /notes: Anotações salvas no banco
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/notes',
    usage: '/notes [-list|-l] [#tag...] [-to <destino>]...  ou  /notes -compact|-c [#tag...]  ou  /notes -search|-s [#tag...] <texto|/regex/flags> [-to <destino>]...  ou  /notes -update|-u <id> [#tag] <novo texto>  ou  /notes -view|-v <id...|#tag...> [-to <destino>]...  ou  /notes -move|-m #tag #novatag  ou  /notes -desc|-d #tag [<descrição>|-rm]  ou  /notes -export|-e [#tag...] [-to <destino>]...  ou  /notes #tag <texto>  ou  /notes -add|-a #tag <texto> [-alerta <quando> [-to <destino>]...]  ou  /notes -rm|-r <id...|#tag...|all>  ou  /notes -alerta [<id|#tag...> [<quando> [-to <destino>]...]]  ou  /notes -alerta -rm <id...|#tag...|all>',
    aliases: [],
    summary: 'Anotações salvas no banco',
    help: 'Anotações salvas no banco. Para anotar, a sintaxe é /notes #tag <texto>: sem a #tag dá erro, e só /notes #tag lista as anotações da tag. Respondendo uma mensagem, o texto dela vira a anotação, com ↩️ (/notes #lembrete); uma mídia (imagem, documento, áudio, vídeo...) na própria mensagem ou na respondida é guardada no disco junto da anotação. Sem nada, mostra as tags com a quantidade e a descrição de cada uma; -l lista todas as anotações, com o ID, agrupadas por #tag (uma mensagem por tag). O -alerta lembra de uma anotação numa data/hora (uma vez; a anotação continua): no seu privado ou nos destinos do -to.',
    ex: [
        '/notes #casa comprar leite',
        '/notes #casa',
        '/notes -s /pão|leite/i',
        '/notes -v 76',
        '/notes #idei (acha a #ideias)',
        '/notes -m #casa #lar',
        '/notes -d #casa Coisas da casa',
        '/notes -update 3 novo texto',
        '/notes -e #casa',
        '/notes -r #casa',
        '/notes #lembrete ligar pro João -alerta amanhã 9h',
        '/notes -alerta 3 +2h -to /Família/',
        '/notes -alerta #casa 18h -to /Família/',
        '/notes -r 2'
    ],
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['#tag <texto>'],
            desc: 'Adiciona uma anotação: a #tag é obrigatória e vem no começo (o texto vai até o -alerta, se houver).',
            ex: ['/notes -a #casa comprar leite'],
            cron: false
        },
        {
            opts: ['list', 'l'],
            values: ['[#tag...]'],
            desc: 'Lista as anotações, cada uma com o ID, agrupadas por #tag. Com tags, só as delas (a tag pode vir pela metade: #idei acha a #ideias).',
            ex: ['/notes -l #casa', '/notes -l #idei']
        },
        {
            opts: ['compact', 'c'],
            values: ['[#tag...]'],
            desc: 'Lista com uma linha por nota (título, ícones 🖼️ mídia, ⏰ alerta e 🔗 link, e a hora), agrupadas por dia. Também vale como /notes #tag -c ou -l -c.',
            ex: ['/notes -c', '/notes #pt -c']
        },
        {
            opts: ['search', 's'],
            values: ['[#tag...] <texto|/regex/flags>'],
            desc: 'Só as anotações que casam: texto (sem diferenciar maiúsculas/acentos) ou /regex/flags, como o -q do /show. Casa também o nome da tag.',
            ex: ['/notes -s /pão|leite/i', '/notes -s #casa leite'],
            cron: false
        },
        {
            opts: ['update', 'u'],
            values: ['<id> [#tag] <novo texto>'],
            desc: 'Troca o texto da anotação (e a tag, se vier uma).',
            ex: ['/notes -update 3 comprar pão e leite'],
            cron: false
        },
        {
            opts: ['view', 'v'],
            values: ['<id...|#tag...>'],
            desc: 'Mostra a anotação com a imagem (o texto vai na legenda; sem imagem, só o texto). Aceita vários IDs ou tags (a tag pode vir pela metade). Com -to, manda no destino; por e-mail, a imagem vai anexada.',
            ex: ['/notes -v 76', '/notes -v 3 5', '/notes -v #idei', '/notes -v 76 -to /Família/'],
            cron: false
        },
        {
            opts: ['move', 'm'],
            values: ['#tag #novatag'],
            desc: 'Renomeia a tag em todas as anotações (se a nova já existe, as duas se juntam). A tag vai inteira, e a descrição dela vai junto.',
            ex: ['/notes -move #casa #lar'],
            cron: false
        },
        {
            opts: ['desc', 'd'],
            values: ['#tag [<descrição>|-rm]'],
            desc: 'Descrição da tag, mostrada na lista e no /notes sozinho. Sem texto, mostra a atual; com -rm, apaga. A tag pode vir pela metade.',
            ex: ['/notes -desc #casa Coisas da casa', '/notes -d #casa', '/notes -d #casa -rm'],
            cron: false
        },
        {
            opts: ['export', 'e'],
            values: ['[#tag...]'],
            desc: 'Manda as anotações num PDF, com as imagens e o texto como legenda (ZapBot_notes_YYYYMMDD_HHMM.pdf), ou só as das tags (ZapBot_notes_tag-casa_YYYYMMDD_HHMM.pdf). A tag pode vir pela metade, e a descrição dela (-desc) vem no começo do documento. Com -to, o PDF vai no destino.',
            ex: ['/notes -e', '/notes -e #casa', '/notes -e #casa -to /Família/'],
            cron: false
        },
        {
            opts: ['rm', 'r'],
            values: ['<id...|#tag...|all>'],
            desc: 'Remove as anotações com esses IDs (-rm 1 2 3 ou -rm 1,2,3), de uma tag (-rm #casa) ou todas (all). Se algum ID ou tag não existe, nenhuma sai. A tag vai inteira. Junto com -alerta, tira só o alerta, mantendo as anotações.',
            ex: [
                '/notes -rm 2',
                '/notes -rm 1 2 3',
                '/notes -rm #casa',
                '/notes -rm all',
                '/notes -alerta -rm 3'
            ],
            cron: false
        },
        {
            opts: ['alerta'],
            values: ['<quando>'],
            desc: 'Avisa da anotação numa data/hora. Com -add: /notes -a texto -alerta amanhã 9h. Com ID: /notes -alerta 3 +2h. Com #tag: avisa de todas as anotações da tag (/notes -alerta #casa 18h -to /Família/). Sozinho, lista as anotações com alerta (com #tag, só as da tag); com -rm <id...|#tag...|all>, tira o alerta. O quando aceita +2h, 30m, 18h, amanhã 9h, sexta 18:30, 25/12 10h.',
            cron: false
        },
        {
            opts: ['to'],
            values: ['<destino>'],
            desc: 'Com a lista (-l, #tag), o -view ou o -export: manda no destino em vez de responder aqui. Com -alerta: avisa num contato, num grupo, num número ou por e-mail em vez do seu privado. Repita para vários: um alerta só, que avisa em todos.',
            ex: [
                '/notes -e #casa -to /Família/',
                '-to /Jorge Pereira/',
                '-to @Fulano',
                '-to /Grupo L200/ -to /Família/',
                '-to +5521999999999',
                '-to email'
            ]
        }
    ],
    role: ADMIN // anotações pessoais do dono
};
