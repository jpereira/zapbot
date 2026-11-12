/*
 * /gpt: Pergunta ao ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;
const { opcaoStatus } = require('./_opcoes');

module.exports = {
    cmd: '/gpt',
    usage: '/gpt [-status|-s] [question]  or  /gpt -model [model] [-img|-gif|-audio|-voz]  or  /gpt -prices  or  /gpt -usage|-u [days]  or  /gpt -voz [text]  or  /gpt -img <request>  or  /gpt -gif [request]',
    aliases: ['/ai'],
    summary: 'Asks ChatGPT',
    help: 'Asks ChatGPT (OpenAI). Replying to a message, its text goes into the question; replying to a photo, it goes along (ChatGPT sees the image); replying to an audio, it is transcribed; replying to a document (text or PDF), the content goes along; with -voz, the text becomes a robot voice note; with -img and -gif, creates an image and a GIF. Requires OPENAI_API_KEY in config/.env or the openai.api.key setting.',
    cmd_opts: [
        {
            opts: ['model', 'm'],
            values: ['[model]'],
            desc: 'Lists the models by use, the ones your key can see, and switches each one: with no option, the questions model (setting openai.api.model); with -img, the image one; with -gif, the GIF one; with -audio, the transcription one; with -voz, the voice one. Without a model, it only lists (with -gif, -audio or -voz, only that use).',
            ex: ['/gpt -m', '/gpt -m gpt-4.1', '/gpt -m gpt-image-2.6-flare -gif', '/gpt -m gpt-transcribe -audio', '/gpt -m gpt-4o-mini-tts -voz'],
            role: ADMIN
        },
        {
            opts: ['img'],
            values: [],
            desc: 'Same as /draw: creates an image from the request (v1/images, model openai.image.model) and replies with it. Replying to a photo, edits it. Owner and admins only: spends your OpenAI account.',
            ex: ['/gpt -img a robot swimming in watercolor', '/gpt -img put a hat on it (replying to a photo)'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['gif'],
            values: [],
            desc: 'Same as /draw -gif: creates an animated GIF (images API, output_format gif, model openai.image.gifModel, only the gpt-image-2.6-* ones) and replies with it. Replying to a photo, animates it; "gere um gif animado de..." replying to a photo also works, without -gif. The frames and the time of each are the settings openai.gif.frames and openai.gif.frameMs. Owner and admins only: spends your OpenAI account.',
            ex: ['/gpt -gif a cat in sunglasses', '/gpt gere um gif animado dele nadando (replying to a photo)'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['audio'],
            values: [],
            desc: 'Only together with -m: picks the audio transcription model (setting openai.transcribe.model). A replied audio is transcribed without this option.',
            ex: ['/gpt -m gpt-transcribe -audio'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['voz', 'v'],
            values: [],
            desc: 'Generates a voice note from the text and replies with the audio (v1/audio/speech): robot voice, by default. Without typed text, speaks the replied message\'s (an audio is transcribed first); replying to a message, what you type becomes the speech style (only gpt-4o-mini-tts follows the style). Up to 4096 characters. The model, voice and style are the settings openai.tts.model, openai.tts.voice and openai.tts.instructions.',
            ex: ['/gpt -voz exterminate all humans', '/gpt -voz (replying to a text message)', '/gpt -voz speak like a kind of metallic robot (replying to a message)'],
            cron: false
        },
        {
            opts: ['prices'],
            values: [],
            desc: 'Fetches the price table from the OpenAI site and updates the openai.pricing setting (dollars per 1M tokens), used in the estimated cost of -status. Shows what changed; models you added that the page does not have stay as they are.',
            ex: ['/gpt -prices'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['usage', 'u'],
            values: ['[days]'],
            desc: 'OpenAI usage over the last days (default 7, up to 31): input, output and cache tokens, requests, per day and per model, via the Usage API (v1/organization/usage/completions), which requires the admin key (OPENAI_ADMIN_KEY or the openai.admin.key setting). And the current limits, read from the x-ratelimit-* headers of a minimal chat call (spends a few tokens). Owner and admins only, even if /gpt was made available to a user.',
            ex: ['/gpt -usage [days]', '/gpt -u 30'],
            role: ADMIN,
            cron: false
        },
        opcaoStatus('/gpt -s explique SSRF em 3 linhas'),
        {
            argv: ['<question>'],
            desc: 'What to ask. Replying to a photo (or sticker), it goes along with the question; without a question, ChatGPT describes the photo. Replying to an audio or voice note, /gpt transcribes it (without a question, or with "transcreva") or, with another question, answers on top of the transcription.',
            ex: ['/gpt explain SSRF in 3 lines', '/gpt what breed is this dog? (replying to the photo)', '/gpt now transcribe this (replying to an audio)', '/gpt summarize this audio']
        }
    ],
    estrito: 'primeira',
    delegavel: true,
    role: ADMIN // delegável: gasta a API do dono (o -model e o -usage são só do dono e dos admins)
};
