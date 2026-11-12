/*
 * Identical options in more than one command (/rates and /crypto, /get and /sticker): the description
 * stays in one place.
 */

const OPTION_ALERT_MSG = {
    opts: ['msg'],
    values: ['<texto>'],
    desc: 'Junto com -alerta: o texto vai no início do aviso. Vai até o fim do comando (pode ter espaços).',
    ex: ['-msg Hora de vender!'],
    cron: false
};

const OPTION_ALERT_RM = {
    opts: ['rm'],
    values: ['<nº...|all>'],
    desc: 'Junto com -alerta: remove o alerta nº N da lista, vários de uma vez (-rm 1 2 3 ou -rm 1,2,3) ou todos. Se algum nº não existe, nenhum sai.'
};

const OPTION_ALERT_TO = {
    opts: ['to'],
    values: ['<destino>'],
    desc: 'Junto com -alerta: avisa num contato, num grupo, num número ou por e-mail em vez do seu privado (vários com o nome: você escolhe na lista). Repita para vários: um alerta só, que avisa em todos.',
    ex: [
        '-to /Jorge Pereira/',
        '-to @Fulano (menção)',
        '-to /Grupo L200/ -to /Família/',
        '-to +5521999999999',
        '-to email (o QRCODE_EMAIL_SMTP_TO)',
        '-to voce@exemplo.com'
    ]
};

const OPTION_VERBOSE_FFMPEG = {
    opts: ['verbose', 'v'],
    values: [],
    desc: 'Mostra os comandos usados no yt-dlp e no ffmpeg.'
};

// -status|-s of /gpt, /tldr and /draw: the call usage in the footer (see src/openaiChat.js)
const optionStatus = (example) => ({
    opts: ['status', 's'],
    values: [],
    desc: 'Acrescenta no rodapé da resposta o consumo da chamada: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo. Para deixar sempre ligado: /set openai.status true.',
    ex: [example],
    cron: false
});

module.exports = {
    optionStatus,
    OPTION_ALERT_MSG,
    OPTION_ALERT_RM,
    OPTION_ALERT_TO,
    OPTION_VERBOSE_FFMPEG
};
