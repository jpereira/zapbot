/*
 * /tts: The text as a voice note
 */

const { ADMIN } = require('../../roles').ROLES;

const { OPTION_QUIET_TIP } = require('./_options');

module.exports = {
    cmd: '/tts',
    usage: '/tts [-gpt|-g] [-local|-l] [-status|-s] [<text>]',
    aliases: [],
    summary: 'The text as a voice note, with a local voice (Piper) or ChatGPT (-gpt)',
    help: 'Turns the text into a voice note: by default with a local Piper voice (no key), in Portuguese or English according to the text; with -gpt (-g), with ChatGPT (OpenAI speech API, like /gpt -voice), which needs the OpenAI key. Up to 4096 characters. Replying to a text, it speaks the message (an audio is transcribed first), and what you typed becomes the speaking style ("speak like a robot"). -gpt requires OPENAI_API_KEY in config/.env or the gpt.api.key setting.',
    ex: ['/tts Good morning!', '/tts speak slowly'],
    cmd_opts: [
        OPTION_QUIET_TIP,
        {
            opts: ['gpt', 'g'],
            values: [],
            desc: 'Speaks with ChatGPT (OpenAI speech API, spends your account) instead of the local Piper voice. Without -gpt or -local, the tts.engine setting decides.',
            ex: ['/tts -gpt Good morning!']
        },
        {
            opts: ['local', 'l'],
            values: [],
            desc: 'Speaks with the local Piper voice (no key, runs on the server CPU), even when tts.engine is gpt.',
            ex: ['/tts -local Good morning!']
        },
        {
            opts: ['status', 's'],
            values: [],
            desc: 'Adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: /set gpt.status true.',
            ex: ['/tts -s Hello'],
            cron: false
        },
        {
            argv: ['[<text>]'],
            desc: 'What to speak. Replying to a message, the style of the speech.'
        }
    ],
    isDelegable: true,
    role: ADMIN // Spends the OpenAI key: delegable, like /gpt
};
