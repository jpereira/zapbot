/*
 * /sticker: Creates a sticker
 */

const { USER } = require('../../roles').ROLES;
const { OPTION_VERBOSE_FULL, OPTION_VERBOSE_FFMPEG } = require('./_options');

module.exports = {
    cmd: '/sticker',
    pipeIn: true, // reads the text or the media of a pipe (/a | /b) as its replied message
    usage: '/sticker [OPTION]... [url]  (or replying to an image, video or link)  or  /sticker -txt <text> [-bg <color>] [-fg <color>]',
    summary: 'Creates a sticker',
    help: 'Creates a sticker: same as /get -sticker. Downloads the video from the URL or from the replied link; with no video, uses the link preview. On a photo post (Instagram, X/Twitter) uses the photo; on a carousel, -photo picks which one. From a video, up to 6 s with a square crop from the middle, from the -ss to -es range. From an image, the square crop from the middle. -pos moves the crop to the top or the bottom. With -txt, an animated sticker with the text, blinking between the -fg and -bg colors.',
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
            opts: ['photo', 'ph'],
            values: ['<n>'],
            desc: 'Photo post (Instagram, X/Twitter): which photo of the carousel to use. 1 is the first (default; an Instagram ?img_index=N link also works); with a leading -, counts from the end (-1 is the last).',
            ex: ['/sticker -photo 2 https://www.instagram.com/p/...']
        },
        {
            opts: ['pos'],
            values: ['<top|center|bottom>'],
            desc: 'Where the square crop of the image or video goes: top, center (default) or bottom. On media wider than tall, top is the left and bottom is the right.',
            ex: ['/sticker -pos top', '/sticker -ss 10 -pos bottom']
        },
        { opts: ['pb'], values: [], desc: 'Same as -pos bottom.' },
        { opts: ['pc'], values: [], desc: 'Same as -pos center.' },
        { opts: ['pt'], values: [], desc: 'Same as -pos top.' },
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
        OPTION_VERBOSE_FFMPEG,
        OPTION_VERBOSE_FULL,
        {
            argv: ['[url]'],
            desc: 'Video link; takes precedence over the replied message.',
            ex: ['https://youtu.be/...']
        }
    ],
    role: USER
};
