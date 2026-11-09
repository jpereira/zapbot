/*
 * /bot: Liga/desliga o bot e diz quem usa os comandos
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/bot',
    usage: '/bot [-on|-off] [-list-users [all]]  ou  /bot +a|-a|+u|-u [+cmd|-cmd <comandos>] [pessoa...] [-list-users all]  ou  /bot -reset [force]  ou  /bot -status [<hora>|off] [-to <destino>]...  ou  /bot -info  ou  /bot -test  ou  /bot -flush-email [true]  ou  /bot -passwd <senha|off>  ou  /bot -login <senha>',
    aliases: [],
    summary: 'Liga/desliga o bot e diz quem usa os comandos',
    help: 'Liga/desliga o bot e diz quem usa os comandos: você e os admins usam tudo; os usuários, os comandos comuns. Sem opção, mostra o status (o mesmo do -status). O -info mostra as versões do que ele usa.',
    cmd_opts: [
        { opts: ['on'], values: [], desc: 'Liga o bot.', cron: false },
        {
            opts: ['off'],
            values: [],
            desc: 'Desliga todos comandos do bot, exceto o /bot. Os admins e os usuários continuam nas listas.',
            cron: false
        },
        {
            opts: ['a'],
            sinais: ['+', '-'],
            values: ['[pessoa...]'],
            desc: 'Adiciona (+a) e tira (-a) admins, que usam todos os comandos: /nome/, @menção ou +número (grupo não). Sem parâmetro, a pessoa do privado onde o comando foi digitado. Só o dono.',
            ex: ['/bot +a /Jorge Pereira/', '/bot -a'],
            cron: false
        },
        {
            opts: ['u'],
            sinais: ['+', '-'],
            values: ['[pessoa|grupo...]'],
            desc: 'Adiciona (+u) e tira (-u) usuários para comandos comuns: pessoas, em qualquer chat, e grupos, qualquer um dentro dele. Digitado num grupo, o +u de uma pessoa vale só nesse grupo (no privado, ela não usa). Sem ninguém, o chat atual: o grupo ou a pessoa do privado. Só o dono.',
            ex: ['/bot +u /Maria Lucia/ /Grupo Familia/', '/bot -u'],
            cron: false
        },
        {
            opts: ['cmd'],
            sinais: ['+', '-'],
            values: ['<comandos>'],
            desc: 'Os comandos de um usuário (vírgula entre eles). Com o +u, define: +u +cmd /a,/b, só esses; +u -cmd /a, todos menos esse. Sozinho, +cmd libera e -cmd tira (quem não é usuário entra só com eles); +cmd all libera todos de novo. Na lista, embaixo da pessoa: → Apenas: ... O /help e o /whois sempre passam. Só o dono.',
            ex: [
                '/bot +cmd /cotacao,/crypto +u /Sofia Izabel/',
                '/bot -cmd /meme /Fulano/',
                '/bot +u +cmd /cotacao'
            ],
            cron: false
        },
        {
            opts: ['list-users', 'lu'],
            values: ['[all]'],
            desc: 'Os usuários deste chat: num grupo, quem participa dele (e o grupo); no privado de alguém, só a pessoa; no seu privado, todos. A opção all exibe tudo em qualquer lugar (num grupo, também quem não é de lá, com o telefone escondido: cuidado para não expor ninguém). Junto do +a/+u, a resposta traz todos. Aceita -mask.',
            ex: ['/bot -list-users', '/bot -lu all'],
            cron: false
        },
        {
            opts: ['reset', 'r'],
            values: ['[force]'],
            desc: 'Volta ao padrão: bot ligado, sem admins extras e sem usuários (só você usa comandos). Pergunta antes: responda sim em 10 s. Com force, volta direto. O envio diário do -status fica. Aceita -mask; as outras opções são recusadas. Só o dono.',
            ex: ['/bot -r', '/bot -r force'],
            cron: false
        },
        {
            opts: ['status', 's'],
            values: ['[<hora>|off]'],
            desc: 'O status (o mesmo do /bot sem opção): o relatório das últimas 24 h (no ar, cache, /watch, apagadas, editadas, status apagados, /mute e último backup), os usuários e o envio diário. Com uma hora (Brasília: 06h, 6h30, 06:00 ou às 18h), envia todo dia nesse horário, no seu privado ou nos destinos do -to. Com -to e sem hora, envia agora. Com off, desliga o envio diário. Aceita -to e -mask; as outras opções são recusadas.',
            ex: ['/bot -s', '/bot -s 06h', '/bot -s 06h -to voce@exemplo.com', '/bot -s off'],
            cron: false
        },
        {
            opts: ['to'],
            values: ['<destino>'],
            desc: 'Junto com -status: para onde vai o relatório, em vez do seu privado. Uma pessoa, um grupo ou um e-mail (email = o QRCODE_EMAIL_SMTP_TO); repita para vários. No fim do relatório, o envio diário mostra os destinos: 👤 pessoa, 👥 grupo ou 📧 e-mail.',
            ex: ['-to /Jorge Pereira/', '-to /Grupo Familia/ -to email'],
            cron: false
        },
        {
            opts: ['info', 'i'],
            values: [],
            desc: 'Versões do bot e do que ele usa (Node.js, whatsapp-web.js, WhatsApp Web, SQLite, Chromium, yt-dlp, ffmpeg), com aviso de versão nova, e o sistema (host, CPU, memória e há quanto tempo estão no ar). Aceita -mask; as outras opções são recusadas.'
        },
        {
            opts: ['test', 't'],
            values: [],
            desc: 'Testa tudo: escrita/leitura no cache, espaço em disco, banco SQLite, conexão com o WhatsApp, DNS e internet, velocidade (baixa 8 MB e sobe 1 MB no speed.cloudflare.com), login no SMTP e os programas externos (Chromium, yt-dlp, ffmpeg). Cada item sai com ✅ ou ❌ (➖ = não configurado). Sozinho: as outras opções são recusadas.',
            cron: false
        },
        {
            opts: ['passwd'],
            values: ['<senha|off>'],
            desc: 'Só o dono: define a senha do /bot -login (mín. 8 caracteres; só o hash scrypt fica no banco, setting bot.login). Com off, desliga o login.',
            ex: ['/bot -passwd minhasenha'],
            cron: false
        },
        {
            opts: ['login'],
            values: ['<senha>'],
            desc: 'Para quem é de fora, só no privado: com a senha certa, vira admin (entra no bot.admins) e o dono é avisado por WhatsApp e e-mail. Erra 5 vezes, fica 15 min bloqueado. A senha é apagada do banco de mensagens.',
            ex: ['/bot -login minhasenha'],
            cron: false
        },
        {
            opts: ['flush-email', 'fe'],
            values: ['[true]'],
            desc: 'Conecta no IMAP do e-mail (QRCODE_EMAIL_IMAP_HOST, com o login do SMTP) e mostra quantas mensagens há em Sent e Trash. Com true, apaga todas as de Sent e Trash e conclui mostrando quantas foram limpas (⏳ enquanto limpa). Só o dono apaga. Sozinho: as outras opções são recusadas.',
            ex: ['/bot -flush-email', '/bot -flush-email true'],
            cron: 'dono'
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Ofusca telefones com 10 a 15 dígitos contínuos na saída desta execução, mantendo os cinco primeiros e os dois últimos (como +55219****44). Os dados salvos e os destinos usam os números completos.',
            ex: ['/bot -mask'],
            cron: false
        }
    ],
    mask: true,
    role: ADMIN, // permissões, senha e liga/desliga
    cron: 'dono',
    espacado: true
};
