/*
 * /draw: Draws an image or an animated GIF with GPT Image
 */

const { ADMIN } = require('../../roles').ROLES;
const { optionStatus, OPTION_QUIET_TIP } = require('./_options');

module.exports = {
    cmd: '/draw',
    usage: '/draw [request]  or  /draw -gif [-frames N] [-ms N] [request]  or  /draw [-gif] -model [model]',
    aliases: [],
    summary: 'Draws an image with ChatGPT (GPT Image)',
    help: 'Draws an image with ChatGPT (GPT Image); with -gif, an animated GIF (GPT Image 2.6), and on a photo (caption or reply) edits the photo or animates it. When replying to a message, its text is added to the request. Requires OPENAI_API_KEY in config/.env or the gpt.api.key setting.',
    ex: ['/draw -p @me @this draw the two of us as pirates', '/draw -g a dancing cat'],
    cmd_opts: [
        OPTION_QUIET_TIP,
        {
            opts: ['gif', 'g'],
            values: [],
            desc: 'Animated GIF (model gpt.image.gifModel; only the gpt-image-2.6-* ones). On a photo, or replying to one, animates the photo. The frames and the time of each are the settings gpt.gif.frames and gpt.gif.frameMs.',
            ex: ['/draw -g a dancing cat', '/draw -g the flag in the wind (replying to a photo)'],
            cron: false
        },
        {
            opts: ['frames', 'f'],
            values: ['<n>'],
            desc: 'GIF frames, from 2 to 16 (default: the gpt.gif.frames setting, 9). Counts as -gif; the more frames, the more expensive.',
            ex: ['/draw -f 6 a flag in the wind'],
            cron: false
        },
        {
            opts: ['ms'],
            values: ['<ms>'],
            desc: 'Duration of each GIF frame, from 20 to 2000 ms (default: the gpt.gif.frameMs setting, 200). Counts as -gif.',
            ex: ['/draw -g -f 6 -ms 300 a flag in the wind'],
            cron: false
        },
        {
            opts: ['profile', 'p'],
            values: [],
            desc: 'Adds profile photos of @me/$me, @this/$this, @reply/$reply or names (@me/@this at the start of the request already count, without -p). They go to the model next to the photo you reply to. Right after -p, as many as you want (up to 4): the names as they are in your address book, typed plain (-p fulano beltrano; the first word that is not a contact starts the request), /Full Name/, @mention, +number, @this (or $this): the chat (the other person, or the group photo), @reply (or $reply): who wrote the message you reply to, or @me (or $me): your own photo. Without anyone: the person of the private chat (you, in yours) or, in a group, whoever wrote the message you reply to. Whoever hides the photo by privacy is refused.',
            ex: ['/draw -p /Rafael Silva/ draw him as an astronaut', '/draw -g -p put a hat on this person (replying to a photo)', '/draw -p @me @this draw the two of us as pirates (in a private chat)', '/draw -p @this make a poster with this group\'s photo (in a group)', '/draw -p @me fulano beltrano draw the three of us climbing'],
            cron: false
        },
        {
            opts: ['model', 'm'],
            values: ['[model]'],
            desc: 'Changes the image model (gpt.image.model setting) or, with -gif, the GIF one (gpt.image.gifModel). Without a model, lists the current one and the ones your key can see.',
            ex: ['/draw -m', '/draw -m gpt-image-2', '/draw -g -m gpt-image-2.6-flare'],
            role: ADMIN
        },
        optionStatus('/draw -s an astronaut cat in watercolor'),
        {
            argv: ['<request>'],
            desc: 'What to draw or animate. When replying to a message, its text goes before the request; on a photo (the message\'s own, in the caption, or the replied one), the request edits the photo (or, with -gif, animates it; with no request, with a subtle motion).',
            ex: ['/draw an astronaut cat in watercolor', '/draw put a hat on it (replying to a photo)']
        }
    ],
    estrito: 'primeira',
    delegavel: true,
    role: ADMIN // delegable: spends the owner's OpenAI account (-model is owner and admins only)
};
