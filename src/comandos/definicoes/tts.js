/*
 * /tts: The text as a voice note
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/tts',
    usage: '/tts [-status|-s] [<text>]',
    aliases: [],
    summary: 'The text as a voice note',
    help: 'Turns the text into a robot voice note (OpenAI speech API), like /gpt -voz. Up to 4096 characters. Replying to a text, it speaks the message (an audio is transcribed first), and what you typed becomes the speaking style ("speak like a robot"). Requires OPENAI_API_KEY in config/.env or the openai.api.key setting.',
    ex: ['/tts Good morning!', '/tts speak slowly'],
    cmd_opts: [
        {
            opts: ['status', 's'],
            values: [],
            desc: 'Adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: /set openai.status true.',
            ex: ['/tts -s Hello'],
            cron: false
        },
        {
            argv: ['[<text>]'],
            desc: 'What to speak. Replying to a message, the style of the speech.'
        }
    ],
    delegavel: true,
    role: ADMIN // Gasta a chave da OpenAI: delegável, como o /gpt
};
