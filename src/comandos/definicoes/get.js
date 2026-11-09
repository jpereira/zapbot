/*
 * /get: Baixa vídeo ou áudio de redes sociais
 */

const { USER } = require('../../roles').ROLES;
const { OPCAO_VERBOSE_FFMPEG } = require('./_opcoes');

module.exports = {
    cmd: '/get',
    usage: '/get [OPÇÃO]... <url>  ou  /get [OPÇÃO]... (respondendo um link ou uma mídia)',
    aliases: ['/download'],
    summary: 'Baixa vídeo ou áudio de redes sociais',
    help: 'Baixa vídeo ou áudio de redes sociais (Instagram, YouTube, X, TikTok e outros sites do yt-dlp), pela URL ou respondendo uma mensagem com link. Respondendo um vídeo, uma imagem ou um áudio do WhatsApp, usa a própria mídia: sem opção, devolve o arquivo original. Escolha áudio ou figurinha por execução; vídeo e áudio são enviados como documento.',
    cmd_opts: [
        {
            opts: ['sticker', 'st'],
            values: [],
            desc: 'Envia como figurinha animada (até 6 s, recorte quadrado no meio do vídeo). É o mesmo que o /sticker.'
        },
        {
            opts: ['pos'],
            values: ['<topo|meio|baixo>'],
            desc: 'Com -st: onde fica o recorte quadrado, topo, meio (padrão) ou baixo. Em mídia mais larga que alta, topo é a esquerda e baixo a direita.',
            ex: ['/get -st -pos topo <url>']
        },
        { opts: ['audio', 'a'], values: [], desc: 'Só o áudio, em .mp3.' },
        {
            opts: ['startSec', 'ss'],
            values: ['<tempo>'],
            desc: 'Começa neste ponto do vídeo original (padrão 0), em segundos ou em min:seg. Aceita decimal com ponto. Com - na frente, conta do final (-ss -10 são os últimos 10 s).',
            ex: ['-ss 1.5', '-ss 09:33', '-ss -10', '-ss -01:44']
        },
        {
            opts: ['endSec', 'es'],
            values: ['<tempo>'],
            desc: 'Termina neste ponto do vídeo original (segundos ou min:seg); deve ser maior que o início. Com - na frente, conta do final (-es -5 termina 5 s antes do fim). Vale sem -ss e para figurinhas, limitadas a seis segundos.',
            ex: ['-es 15', '-es 09:45', '-es -5']
        },
        OPCAO_VERBOSE_FFMPEG,
        {
            argv: ['<url>'],
            desc: 'Link do vídeo; vale mais que a mensagem respondida.',
            ex: ['https://youtu.be/...']
        }
    ],
    role: USER
};
