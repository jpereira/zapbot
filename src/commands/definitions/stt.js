/*
 * /stt: Transcribes the speech of a video or audio
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/stt',
    usage: '/stt [OPTION]... <url>  or  /stt [OPTION]... (replying to a video, audio or link)',
    summary: 'Transcribes the speech of a video or audio',
    help: 'Transcribes the speech of a video or audio to text. /get -stt (-t) is a shortcut for it. From a URL (Instagram, YouTube, X, TikTok and other yt-dlp sites) or the replied link, downloads only the lowest-quality audio. Replying to any video or audio file (a voice note too), uses it. By default it runs on the server (faster-whisper, Portuguese, English and other languages detected by itself), with no cost per minute; with -gpt (-g), through ChatGPT, which needs the OpenAI key.',
    cmd_opts: [
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
        {
            opts: ['verbose', 'v'],
            values: [],
            desc: 'Shows the commands used in yt-dlp, ffmpeg and faster-whisper, and how long the transcription took.'
        },
        {
            argv: ['<url>'],
            desc: 'Video or audio link; takes precedence over the replied message.',
            ex: ['https://www.instagram.com/reel/...']
        }
    ],
    role: USER
};
