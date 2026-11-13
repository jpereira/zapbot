/*
 * Opções iguais em mais de um comando (o /rates e o /crypto, o /get e o /sticker): a descrição
 * fica num lugar só.
 */

const OPCAO_ALERTA_MSG = {
    opts: ['msg'],
    values: ['<text>'],
    desc: 'The text goes at the start of the notice (with -alerta). It runs to the end of the command (may have spaces).',
    ex: ['-msg Time to sell!'],
    cron: false
};

const OPCAO_ALERTA_RM = {
    opts: ['rm'],
    values: ['<#...|all>'],
    desc: 'Removes alert #N from the list, several at once (-rm 1 2 3 or -rm 1,2,3), or all (with -alerta). If any # does not exist, none is removed.'
};

const OPCAO_ALERTA_TO = {
    opts: ['to'],
    values: ['<destination>'],
    desc: 'Notifies a contact, a group, a number, or an email instead of your private chat (several with the name: you pick from the list) (with -alerta). Repeat for several: a single alert that notifies all of them.',
    ex: [
        '-to /Jorge Pereira/',
        '-to @Fulano (mention)',
        '-to /Grupo L200/ -to /Família/',
        '-to +5521999999999',
        '-to email (the QRCODE_EMAIL_SMTP_TO)',
        '-to you@example.com'
    ]
};

const OPCAO_VERBOSE_FFMPEG = {
    opts: ['verbose', 'v'],
    values: [],
    desc: 'Shows the commands used in yt-dlp and ffmpeg.'
};

// -status|-s do /gpt, do /tldr e do /draw: o consumo da chamada no rodapé (veja src/openaiChat.js)
const opcaoStatus = (exemplo) => ({
    opts: ['status', 's'],
    values: [],
    desc: 'Adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: /set openai.status true.',
    ex: [exemplo],
    cron: false
});

module.exports = {
    opcaoStatus,
    OPCAO_ALERTA_MSG,
    OPCAO_ALERTA_RM,
    OPCAO_ALERTA_TO,
    OPCAO_VERBOSE_FFMPEG
};
