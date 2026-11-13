/*
 * /get: Baixa vídeo ou áudio de redes sociais
 */

const { USER } = require('../../roles').ROLES;
const { OPCAO_VERBOSE_FFMPEG } = require('./_opcoes');

module.exports = {
    cmd: '/get',
    usage: '/get [OPTION]... <url>  or  /get [OPTION]... (replying to a link or media)',
    aliases: [],
    summary: 'Downloads video or audio from social networks',
    help: 'Downloads video or audio from social networks (Instagram, YouTube, X, TikTok and other yt-dlp sites), from the URL or by replying to a message with a link. Replying to a WhatsApp video, image or audio uses that media itself: with no option, returns the original file. Pick audio or sticker per run; video and audio are sent as a document.',
    cmd_opts: [
        {
            opts: ['sticker', 'st'],
            values: [],
            desc: 'Sends as an animated sticker (up to 6 s, square crop from the middle of the video). Same as /sticker.'
        },
        {
            opts: ['pos'],
            values: ['<top|middle|bottom>'],
            desc: 'With -st: where the square crop goes, top, middle (default) or bottom. On media wider than tall, top is the left and bottom is the right.',
            ex: ['/get -st -pos topo <url>']
        },
        { opts: ['audio', 'a'], values: [], desc: 'Audio only, as .mp3.' },
        {
            opts: ['startSec', 'ss'],
            values: ['<time>'],
            desc: 'Starts at this point of the original video (default 0), in seconds or min:sec. Accepts a decimal with a dot. With a leading -, counts from the end (-ss -10 is the last 10 s).',
            ex: ['-ss 1.5', '-ss 09:33', '-ss -10', '-ss -01:44']
        },
        {
            opts: ['endSec', 'es'],
            values: ['<time>'],
            desc: 'Ends at this point of the original video (seconds or min:sec); must be greater than the start. With a leading -, counts from the end (-es -5 ends 5 s before the end). Works without -ss and for stickers, limited to six seconds.',
            ex: ['-es 15', '-es 09:45', '-es -5']
        },
        OPCAO_VERBOSE_FFMPEG,
        {
            argv: ['<url>'],
            desc: 'Video link; takes precedence over the replied message.',
            ex: ['https://youtu.be/...']
        }
    ],
    role: USER
};
