/*
 * /get: Downloads video or audio from social networks
 */

const { USER } = require('../../roles').ROLES;
const { OPTION_VERBOSE_FFMPEG } = require('./_options');

module.exports = {
    cmd: '/get',
    usage: '/get [OPTION]... <url>  or  /get [OPTION]... (replying to a link or media)',
    aliases: [],
    summary: 'Downloads video or audio from social networks',
    help: 'Downloads video or audio from social networks (Instagram, YouTube, X, TikTok and other yt-dlp sites), from the URL or by replying to a message with a link. Replying to a WhatsApp video, image or audio uses that media itself: with no option, returns the original file. Pick audio, sticker or transcription per run; video and audio are sent as a document.',
    cmd_opts: [
        {
            opts: ['sticker', 'st'],
            values: [],
            desc: 'Sends as an animated sticker (up to 6 s, square crop from the middle of the video). Same as /sticker.'
        },
        {
            opts: ['photo', 'ph'],
            values: ['<n>'],
            desc: 'Photo post (Instagram, X/Twitter): sends only this photo of the carousel, instead of all. 1 is the first; with a leading -, counts from the end (-1 is the last). With -st, the sticker is made from it.',
            ex: ['/get -photo 2 https://www.instagram.com/p/...']
        },
        {
            opts: ['pos'],
            values: ['<top|center|bottom>'],
            desc: 'Where the square crop sits: top, center (default) or bottom.',
            ex: ['/get -st -pos top <url>']
        },
        { opts: ['pb'], values: [], desc: 'Same as -pos bottom.' },
        { opts: ['pc'], values: [], desc: 'Same as -pos center.' },
        { opts: ['pt'], values: [], desc: 'Same as -pos top.' },
        { opts: ['audio', 'a'], values: [], desc: 'Audio only, as .mp3.' },
        {
            opts: ['transcribe', 't'],
            values: [],
            desc: 'Shortcut for /transcribe: replies with the text of the speech instead of the file. From a link, downloads only the lowest-quality audio; replying to a video or audio, uses it. Transcribed locally (faster-whisper). Works with -ss and -es.',
            ex: ['/get -t https://www.instagram.com/reel/...', '/get -t -ss 30 -es 90 <url>']
        },
        {
            opts: ['summary', 'sum'],
            values: [],
            desc: 'With -t: also summarizes the speech with ChatGPT (same key as /gpt). The summary in topics on top and the transcription below.',
            ex: ['/get -t -sum https://www.instagram.com/reel/...']
        },
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
        OPTION_VERBOSE_FFMPEG,
        {
            argv: ['<url>'],
            desc: 'Video link; takes precedence over the replied message.',
            ex: ['https://youtu.be/...']
        }
    ],
    role: USER
};
