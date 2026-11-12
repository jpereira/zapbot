/*
 * /sticker: Cria uma figurinha
 */

const { USER } = require('../../roles').ROLES;
const { OPCAO_VERBOSE_FFMPEG } = require('./_opcoes');

module.exports = {
    cmd: '/sticker',
    usage: '/sticker [OPÇÃO]... [url]  (ou respondendo uma imagem, vídeo ou link)  ou  /sticker -txt <texto> [-bg <cor>] [-fg <cor>]',
    aliases: ['/figurinha'],
    summary: 'Cria uma figurinha',
    help: 'Cria uma figurinha: é o /get -sticker. Da URL ou do link respondido, baixa o vídeo; sem vídeo, usa a prévia do link. De um vídeo, até 6 s com recorte quadrado no meio, no trecho do -ss e do -es. De uma imagem, o recorte quadrado no meio. O -pos muda o recorte para o topo ou para baixo. Com -txt, uma figurinha animada com o texto, piscando entre as cores do -fg e do -bg.',
    cmd_opts: [
        {
            opts: ['bg'],
            values: ['<cor>'],
            desc: 'Com -txt: a cor de fundo, em #RRGGBB (padrão #FFFFFF, branco).'
        },
        {
            opts: ['fg'],
            values: ['<cor>'],
            desc: 'Com -txt: a cor da letra, em #RRGGBB (padrão #000000, preto).'
        },
        {
            opts: ['pos'],
            values: ['<topo|meio|baixo>'],
            desc: 'Onde fica o recorte quadrado da imagem ou do vídeo: topo, meio (padrão) ou baixo. Em mídia mais larga que alta, topo é a esquerda e baixo a direita.',
            ex: ['/sticker -pos topo', '/sticker -ss 10 -pos baixo']
        },
        {
            opts: ['txt'],
            values: ['<texto>'],
            desc: 'Figurinha animada com o texto (até 200 caracteres), que pisca trocando as cores do -fg e do -bg a cada meio segundo. Não combina com -ss, -es, -v nem URL.',
            ex: ['/sticker -txt "Bom dia!"', '/sticker -txt Partiu? -bg "#C0392B" -fg "#FFFFFF"']
        },
        {
            opts: ['startSec', 'ss'],
            values: ['<tempo>'],
            desc: 'Vídeo: começa neste ponto (padrão 0), em segundos ou em min:seg, e pega os 6 s seguintes. Aceita decimal com ponto. Com - na frente, conta do final (-ss -10 começa 10 s antes do fim).',
            ex: ['-ss 1.5', '-ss 01:12', '-ss -10']
        },
        {
            opts: ['endSec', 'es'],
            values: ['<tempo>'],
            desc: 'Vídeo: termina neste ponto (segundos ou min:seg), maior que o início; a figurinha tem no máximo 6 s. Com - na frente, conta do final.',
            ex: ['/sticker -ss 10 -es 13', '/sticker -ss 01:10 -es 01:13', '/sticker -es -2']
        },
        OPCAO_VERBOSE_FFMPEG,
        {
            argv: ['[url]'],
            desc: 'Link do vídeo; vale mais que a mensagem respondida.',
            ex: ['https://youtu.be/...']
        }
    ],
    role: USER
};
