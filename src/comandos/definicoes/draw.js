/*
 * /draw: Desenha uma imagem ou um GIF animado com o GPT Image
 */

const { ADMIN } = require('../../roles').ROLES;
const { opcaoStatus } = require('./_opcoes');

module.exports = {
    cmd: '/draw',
    usage: '/draw [request]  or  /draw -gif [-frames N] [-ms N] [request]  or  /draw [-gif] -model [model]',
    aliases: ['/desenhe', '/desenha', '/img'],
    summary: 'Draws an image with GPT Image (OpenAI)',
    help: 'Draws an image with GPT Image (OpenAI); with -gif, an animated GIF (GPT Image 2.6), and on a photo (caption or reply) edits the photo or animates it. When replying to a message, its text is added to the request. Requires OPENAI_API_KEY in config/.env or the openai.api.key setting.',
    cmd_opts: [
        {
            opts: ['gif', 'g'],
            values: [],
            desc: 'Animated GIF (model openai.image.gifModel; only the gpt-image-2.6-* ones). On a photo, or replying to one, animates the photo. The frames and the time of each are the settings openai.gif.frames and openai.gif.frameMs.',
            ex: ['/img -gif a dancing cat', '/img -gif the flag in the wind (replying to a photo)'],
            cron: false
        },
        {
            opts: ['frames', 'f'],
            values: ['<n>'],
            desc: 'GIF frames, from 2 to 16 (default: the openai.gif.frames setting, 9). Counts as -gif; the more frames, the more expensive.',
            ex: ['/img -f 6 a flag in the wind'],
            cron: false
        },
        {
            opts: ['ms'],
            values: ['<ms>'],
            desc: 'Duration of each GIF frame, from 20 to 2000 ms (default: the openai.gif.frameMs setting, 200). Counts as -gif.',
            ex: ['/img -gif -f 6 -ms 300 a flag in the wind'],
            cron: false
        },
        {
            opts: ['model', 'm'],
            values: ['[model]'],
            desc: 'Changes the image model (openai.image.model setting) or, with -gif, the GIF one (openai.image.gifModel). Without a model, lists the current one and the ones your key can see.',
            ex: ['/draw -m', '/draw -m gpt-image-2', '/draw -gif -m gpt-image-2.6-flare'],
            role: ADMIN
        },
        opcaoStatus('/draw -s an astronaut cat in watercolor'),
        {
            argv: ['<request>'],
            desc: 'What to draw or animate. When replying to a message, its text goes before the request; on a photo (the message\'s own, in the caption, or the replied one), the request edits the photo (or, with -gif, animates it; with no request, with a subtle motion).',
            ex: ['/draw an astronaut cat in watercolor', '/draw put a hat on it (replying to a photo)']
        }
    ],
    estrito: 'primeira',
    delegavel: true,
    role: ADMIN // delegável: gasta a conta da OpenAI do dono (o -model é só do dono e dos admins)
};
