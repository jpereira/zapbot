/*
 * /stt: Transcribes the speech of a video or audio
 */

const { USER } = require('../../roles').ROLES;

const { OPTION_QUIET_TIP, OPTION_VERBOSE_FFMPEG, OPTION_VERBOSE_FULL } = require('./_options');

module.exports = {
    cmd: '/stt',
    pipeIn: true, // reads the text or the media of a pipe (/a | /b) as its replied message
    usage: '/stt [OPTION]... <url>  or  /stt [OPTION]... (replying to a video, audio or link)',
    summary: 'Transcribes the speech of a video or audio',
    help: 'Transcribes the speech of a video or audio to text. /get -stt (-t) is a shortcut for it. From a URL (Instagram, YouTube, X, TikTok and other yt-dlp sites) or the replied link, downloads only the lowest-quality audio. Replying to any video or audio file (a voice note too), uses it. By default it runs on the server (faster-whisper, Portuguese, English and other languages detected by itself), with no cost per minute; with -gpt (-g), through ChatGPT, which needs the OpenAI key.',
    cmd_opts: [
        { ...OPTION_QUIET_TIP, desc: 'Returns ONLY the transcribed text: no header (language and duration), no engine tip and no "⏳" notice. With -sum, the summary and the text, with no titles. To hide the tip always: the stt.footer setting off.' },
        {
            opts: ['lang', 'L'],
            values: ['<code>'],
            desc: 'The language of the speech: pt, en, es, pt-br... or auto (whisper detects it). With -gpt, it also goes to the OpenAI API. The default is the stt.language setting (auto). (-l is the short of -local.)',
            ex: ['/stt -lang en <url>', '/stt -L pt']
        },
        {
            opts: ['model', 'M'],
            values: ['<name>'],
            desc: 'The faster-whisper model (tiny, base, small, medium, large-v3-turbo...; bigger is better and slower; one that is not in the image is downloaded the first time). With -gpt, the OpenAI model. The default is the stt.model setting.',
            ex: ['/stt -model medium <url>']
        },
        {
            opts: ['beam', 'b'],
            values: ['<1-10>'],
            desc: 'The beam size of the local search: 1 is the fastest, more can get a little more right and takes longer. The default is the stt.beam setting.',
            ex: ['/stt -beam 5 <url>']
        },
        {
            opts: ['vad'],
            values: ['<on|off>'],
            desc: 'On: skips the silence and the music before transcribing (where whisper invents text); off: transcribes it all. Local engine only. The default is the stt.vad setting.',
            ex: ['/stt -vad off <url>']
        },
        {
            opts: ['startSec', 'ss'],
            values: ['<time>'],
            desc: 'Starts at this point of the video or audio (default 0), in seconds or min:sec. With a leading -, counts from the end (-ss -60 is the last minute).',
            ex: ['-ss 30', '-ss 09:33', '-ss -60']
        },
        {
            opts: ['endSec', 'es'],
            values: ['<time>'],
            desc: 'Ends at this point (seconds or min:sec); must be greater than the start. With a leading -, counts from the end.',
            ex: ['-es 90', '-es -5']
        },
        {
            opts: ['gpt', 'g'],
            values: [],
            desc: 'Transcribes with ChatGPT (OpenAI API, spends your account) instead of the local faster-whisper. Without -gpt or -local, the stt.engine setting decides.',
            ex: ['/stt -gpt https://www.instagram.com/reel/...']
        },
        {
            opts: ['local', 'l'],
            values: [],
            desc: 'Transcribes with the local faster-whisper (no key, runs on the server CPU), even when stt.engine is gpt.',
            ex: ['/stt -local https://www.instagram.com/reel/...']
        },
        {
            opts: ['summary', 'sum'],
            values: [],
            desc: 'Also summarizes the speech with ChatGPT (same key as /gpt, which spends your OpenAI account): the summary in topics on top and the whole transcription below.',
            ex: ['/stt -sum https://www.instagram.com/reel/...']
        },
        { ...OPTION_VERBOSE_FFMPEG, desc: 'A summary of what ran: each step (yt-dlp, ffmpeg, faster-whisper) with how long it took, and the total. -vv: the full report.' },
        { ...OPTION_VERBOSE_FULL, desc: 'The full report: every command that ran (yt-dlp, ffmpeg, faster-whisper) with its time, and the options understood (JSON).' },
        {
            argv: ['<url>'],
            desc: 'Video or audio link; takes precedence over the replied message.',
            ex: ['https://www.instagram.com/reel/...']
        }
    ],
    role: USER
};
