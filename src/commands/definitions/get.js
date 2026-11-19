/*
 * /get: Downloads video or audio from social networks
 */

const { USER } = require('../../roles').ROLES;
const { OPTION_VERBOSE_FFMPEG, OPTION_QUIET_TIP } = require('./_options');

module.exports = {
    cmd: '/get',
    usage: '/get [OPTION]... <url>  or  /get [OPTION]... (replying to a link or media)',
    aliases: [],
    summary: 'Downloads video or audio from social networks',
    help: 'Downloads video or audio from social networks (Instagram, YouTube, X, TikTok and other yt-dlp sites), from the URL or by replying to a message with a link. Replying to a WhatsApp video, image or audio uses that media itself: with no option, returns the original file. Pick audio, sticker or transcription per run; video and audio are sent as a document.',
    cmd_opts: [
        { ...OPTION_QUIET_TIP, desc: 'Returns ONLY the transcribed text: no header (language and duration), no engine tip and no "⏳" notice. With -sum, the summary and the text, with no titles. To hide the tip always: the stt.footer setting off.' },
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
            opts: ['stt', 't'],
            values: [],
            desc: 'Shortcut for /stt: replies with the text of the speech instead of the file. From a link, downloads only the lowest-quality audio; replying to a video or audio, uses it. Transcribed locally (faster-whisper). Works with -ss and -es.',
            ex: ['/get -t https://www.instagram.com/reel/...', '/get -t -ss 30 -es 90 <url>']
        },
        {
            opts: ['gpt', 'g'],
            values: [],
            desc: 'With -t: transcribes with ChatGPT (OpenAI API, spends your account) instead of the local faster-whisper. Without -gpt or -local, the stt.engine setting decides.',
            ex: ['/get -t -gpt https://www.instagram.com/reel/...']
        },
        {
            opts: ['local', 'l'],
            values: [],
            desc: 'With -t: transcribes with the local faster-whisper (no key, runs on the server CPU), even when stt.engine is gpt.',
            ex: ['/get -t -local https://www.instagram.com/reel/...']
        },
        {
            opts: ['summary', 'sum'],
            values: [],
            desc: 'With -t: also summarizes the speech with ChatGPT (same key as /gpt). The summary in topics on top and the transcription below.',
            ex: ['/get -t -sum https://www.instagram.com/reel/...']
        },
        {
            opts: ['lang', 'L'],
            values: ['<code>'],
            desc: 'The language of the speech: pt, en, es, pt-br... or auto (whisper detects it). With -gpt, it also goes to the OpenAI API. The default is the stt.language setting (auto). (-l is the short of -local.)',
            ex: ['/get -t -lang en <url>', '/get -t -L pt']
        },
        {
            opts: ['model', 'M'],
            values: ['<name>'],
            desc: 'The faster-whisper model (tiny, base, small, medium, large-v3-turbo...; bigger is better and slower; one that is not in the image is downloaded the first time). With -gpt, the OpenAI model. The default is the stt.model setting.',
            ex: ['/get -t -model medium <url>']
        },
        {
            opts: ['beam', 'b'],
            values: ['<1-10>'],
            desc: 'The beam size of the local search: 1 is the fastest, more can get a little more right and takes longer. The default is the stt.beam setting.',
            ex: ['/get -t -beam 5 <url>']
        },
        {
            opts: ['vad'],
            values: ['<on|off>'],
            desc: 'On: skips the silence and the music before transcribing (where whisper invents text); off: transcribes it all. Local engine only. The default is the stt.vad setting.',
            ex: ['/get -t -vad off <url>']
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
