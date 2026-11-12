/*
 * /sticker: Cria uma figurinha
 */

const { USER } = require('../../roles').ROLES;
const { OPCAO_VERBOSE_FFMPEG } = require('./_opcoes');

module.exports = {
    cmd: '/sticker',
    usage: '/sticker [OPTION]... [url]  (or replying to an image, video or link)  or  /sticker -txt <text> [-bg <color>] [-fg <color>]',
    summary: 'Creates a sticker',
    help: 'Creates a sticker: same as /get -sticker. Downloads the video from the URL or from the replied link; with no video, uses the link preview. From a video, up to 6 s with a square crop from the middle, from the -ss to -es range. From an image, the square crop from the middle. -pos moves the crop to the top or the bottom. With -txt, an animated sticker with the text, blinking between the -fg and -bg colors.',
    cmd_opts: [
        {
            opts: ['bg'],
            values: ['<color>'],
            desc: 'With -txt: the background color, as #RRGGBB (default #FFFFFF, white).'
        },
        {
            opts: ['fg'],
            values: ['<color>'],
            desc: 'With -txt: the text color, as #RRGGBB (default #000000, black).'
        },
        {
            opts: ['pos'],
            values: ['<top|middle|bottom>'],
            desc: 'Where the square crop of the image or video goes: top, middle (default) or bottom. On media wider than tall, top is the left and bottom is the right.',
            ex: ['/sticker -pos topo', '/sticker -ss 10 -pos baixo']
        },
        {
            opts: ['txt'],
            values: ['<text>'],
            desc: 'Animated sticker with the text (up to 200 characters), blinking between the -fg and -bg colors every half second. Cannot be combined with -ss, -es, -v or a URL.',
            ex: ['/sticker -txt "Good morning!"', '/sticker -txt Let\'s go? -bg "#C0392B" -fg "#FFFFFF"']
        },
        {
            opts: ['startSec', 'ss'],
            values: ['<time>'],
            desc: 'Video: starts at this point (default 0), in seconds or min:sec, and takes the next 6 s. Accepts a decimal with a dot. With a leading -, counts from the end (-ss -10 starts 10 s before the end).',
            ex: ['-ss 1.5', '-ss 01:12', '-ss -10']
        },
        {
            opts: ['endSec', 'es'],
            values: ['<time>'],
            desc: 'Video: ends at this point (seconds or min:sec), greater than the start; the sticker is at most 6 s. With a leading -, counts from the end.',
            ex: ['/sticker -ss 10 -es 13', '/sticker -ss 01:10 -es 01:13', '/sticker -es -2']
        },
        OPCAO_VERBOSE_FFMPEG,
        {
            argv: ['[url]'],
            desc: 'Video link; takes precedence over the replied message.',
            ex: ['https://youtu.be/...']
        }
    ],
    role: USER
};
