/*
 * /gpt: Asks ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;
const { optionStatus } = require('./_options');

module.exports = {
    cmd: '/gpt',
    usage: '/gpt [-s] [question]  or  /gpt -voice|-img|-gif <text>  or  /gpt -model [model]  or  /gpt -prices|-usage [days]',
    aliases: [],
    summary: 'Asks ChatGPT',
    help: 'Asks ChatGPT (OpenAI). Replying to a message, its text goes into the question; replying to a photo, it goes along (ChatGPT sees the image); replying to an audio, it is transcribed; replying to a document (text or PDF), the content goes along; with -voice, the text becomes a robot voice note; with -img and -gif, creates an image and a GIF. Requires OPENAI_API_KEY in config/.env or the gpt.api.key setting.',
    ex: ['/gpt -img -p @me @this draw the two of us as pirates', '/gpt -p @this who is this?'],
    cmd_opts: [
        {
            opts: ['model', 'm'],
            values: ['[model]'],
            desc: 'Lists the models by use and switches each one. Only the ones your key can see: with no option, the questions model (setting gpt.api.model); with -img, the image one; with -gif, the GIF one; with -audio, the transcription one; with -voice, the voice one. Without a model, it only lists (with -gif, -audio or -voice, only that use).',
            ex: ['/gpt -m', '/gpt -m gpt-4.1', '/gpt -m gpt-image-2.6-flare -gif', '/gpt -m gpt-transcribe -audio', '/gpt -m gpt-4o-mini-tts -v'],
            role: ADMIN
        },
        {
            opts: ['img'],
            values: [],
            desc: 'Same as /draw: creates an image from the request (v1/images, model gpt.image.model) and replies with it. Replying to a photo, edits it. Owner and admins only: spends your OpenAI account.',
            ex: ['/gpt -img a robot swimming in watercolor', '/gpt -img put a hat on it (replying to a photo)'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['gif'],
            values: [],
            desc: 'Same as /draw -gif: creates an animated GIF (images API, output_format gif, model gpt.image.gifModel, only the gpt-image-2.6-* ones) and replies with it. Replying to a photo, animates it; "gere um gif animado de..." replying to a photo also works, without -gif. The frames and the time of each are the settings gpt.gif.frames and gpt.gif.frameMs. Owner and admins only: spends your OpenAI account.',
            ex: ['/gpt -gif a cat in sunglasses', '/gpt generate an animated gif of it swimming (replying to a photo)'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['audio'],
            values: [],
            desc: 'Only together with -m: picks the audio transcription model (setting gpt.transcribe.model). A replied audio is transcribed without this option.',
            ex: ['/gpt -m gpt-transcribe -audio'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['voice', 'v'],
            values: [],
            desc: 'Generates a voice note from the text and replies with the audio (v1/audio/speech): robot voice, by default. Without typed text, speaks the replied message\'s (an audio is transcribed first); replying to a message, what you type becomes the speech style (only gpt-4o-mini-tts follows the style). Up to 4096 characters. The model, voice and style are the settings gpt.tts.model, gpt.tts.voice and gpt.tts.instructions.',
            ex: ['/gpt -v exterminate all humans', '/gpt -v (replying to a text message)', '/gpt -v speak like a kind of metallic robot (replying to a message)'],
            cron: false
        },
        {
            opts: ['prices'],
            values: [],
            desc: 'Updates the price table (setting gpt.pricing) from the OpenAI site.',
            ex: ['/gpt -prices'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['usage', 'u'],
            values: ['[days]'],
            desc: 'OpenAI usage over the last days (default 7, up to 31): input, output and cache tokens, requests, per day and per model, via the Usage API (v1/organization/usage/completions), which requires the admin key (OPENAI_ADMIN_KEY or the gpt.admin.key setting). And the current limits, read from the x-ratelimit-* headers of a minimal chat call (spends a few tokens). Owner and admins only, even if /gpt was made available to a user.',
            ex: ['/gpt -u [days]', '/gpt -u 30'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['profile', 'p'],
            values: [],
            desc: 'Adds profile photos of @me/$me, @this/$this, @reply/$reply or names (@me/@this at the start of the text already count, without -p). They go to the model next to the photo you reply to. Right after -p, as many as you want (up to 4): the names as they are in your address book, typed plain (-p fulano beltrano; the first word that is not a contact starts the request), /Full Name/, @mention, +number, @this (or $this): the chat (the other person, or the group photo), @reply (or $reply): who wrote the message you reply to, or @me (or $me): your own photo. Without anyone: the person of the private chat (you, in yours) or, in a group, whoever wrote the message you reply to. Whoever hides the photo by privacy is refused.',
            ex: ['/gpt -p /Rafael Silva/ describe this person', '/gpt -p /Rafael Silva/ add this person to the photo (replying to a photo, with -img)', '/gpt -p @me @this what do we have in common?', '/gpt -img -p @this make a logo from this group photo (in a group)'],
            cron: false
        },
        optionStatus('/gpt -s explique SSRF em 3 linhas'),
        {
            argv: ['<question>'],
            desc: 'What to ask. Replying to a photo (or sticker), it goes along with the question; without a question, ChatGPT describes the photo. Replying to an audio or voice note, /gpt transcribes it (without a question, or with "transcreva") or, with another question, answers on top of the transcription.',
            ex: ['/gpt explain SSRF in 3 lines', '/gpt what breed is this dog? (replying to the photo)', '/gpt now transcribe this (replying to an audio)', '/gpt summarize this audio']
        }
    ],
    strict: 'primeira',
    isDelegable: true,
    usageFree: ['prices', 'usage', 'u'], // queries: they do not spend the usage limit (/bot +limit)
    role: ADMIN // delegable: spends the owner's API (-model and -usage are owner and admins only)
};
