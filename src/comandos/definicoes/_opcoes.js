/*
 * Opções iguais em mais de um comando (o /cotacao e o /crypto, o /get e o /sticker): a descrição
 * fica num lugar só.
 */

const OPCAO_ALERTA_MSG = {
    opts: ['msg'],
    values: ['<texto>'],
    desc: 'Junto com -alerta: o texto vai no início do aviso. Vai até o fim do comando (pode ter espaços).',
    ex: ['-msg Hora de vender!'],
    cron: false
};

const OPCAO_ALERTA_RM = {
    opts: ['rm'],
    values: ['<nº...|all>'],
    desc: 'Junto com -alerta: remove o alerta nº N da lista, vários de uma vez (-rm 1 2 3 ou -rm 1,2,3) ou todos. Se algum nº não existe, nenhum sai.'
};

const OPCAO_ALERTA_TO = {
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

const OPCAO_VERBOSE_FFMPEG = {
    opts: ['verbose', 'v'],
    values: [],
    desc: 'Mostra os comandos usados no yt-dlp e no ffmpeg.'
};

module.exports = {
    OPCAO_ALERTA_MSG,
    OPCAO_ALERTA_RM,
    OPCAO_ALERTA_TO,
    OPCAO_VERBOSE_FFMPEG
};
