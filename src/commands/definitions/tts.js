/*
 * /tts: The text as a voice note
 */

const { ADMIN } = require('../../roles').ROLES;
const { OPENAI_VOICES } = require('../../openai');
const { PIPER_REGIONS, piperVoicesByName } = require('../../ttsVoices');

const REGION_NAMES = { pt_BR: 'Portuguese (Brazil)', pt_PT: 'Portuguese (Portugal)', en_US: 'English (US)', en_GB: 'English (UK)' };
const PIPER_NAMES = PIPER_REGIONS.map(r => `${REGION_NAMES[r]}: ${piperVoicesByName(r).map(v => v.name + (v.qualities.length > 1 ? ` (${v.qualities.join('/')})` : '')).join(', ')}`).join('; ');

const { OPTION_QUIET_TIP } = require('./_options');

module.exports = {
    cmd: '/tts',
    usage: '/tts [-gpt|-g] [-local|-l] [-voice|-v <name>] [-speed|-sp <%>] [-pitch|-pi <semitones>] [-volume|-vol <%>] [-quiet|-q] [-status|-s] [<text>]',
    aliases: [],
    summary: 'The text as a voice note, with a local voice (Piper) or ChatGPT (-gpt)',
    help: 'Turns the text into a voice note: by default with a local Piper voice (no key), in Portuguese or English according to the text; with -gpt (-g), with ChatGPT (OpenAI speech API, like /gpt -voice), which needs the OpenAI key. The voice, speed, pitch and volume come from the options (-voice, -speed, -pitch, -volume) or from the tts.* settings. Up to the tts.maxChars setting (32000 characters; ChatGPT speaks in parts of 4096 and the audio is joined). The {/command}s of the text run first and their reply is spoken (the slash is optional: {stocks USD}). Replying to a text, it speaks the message (an audio is transcribed first), and what you typed becomes the speaking style ("speak like a robot"). -gpt requires OPENAI_API_KEY in config/.env or the gpt.api.key setting.',
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
            opts: ['voice', 'v'],
            values: ['<name>'],
            desc: `The voice, by the name of the person. Local (Piper): ${PIPER_NAMES}. Write just the name (faber), the name with the quality (faber-medium) or the full id (pt_BR-faber-medium); with several qualities the name alone is the medium one. The default is tts.voice.pt or tts.voice.en, by the language of the text; one not in the image is downloaded the first time. With -gpt: ${OPENAI_VOICES.join(', ')} (the default is gpt.tts.voice). /tts -v lists the Piper voices and /tts -g -v the ChatGPT ones.`,
            ex: ['/tts -voice amy Good morning!', '/tts -voice ryan Hello!', '/tts -gpt -voice nova Good morning!', '/tts -v', '/tts -g -v']
        },
        {
            opts: ['speed', 'sp'],
            values: ['<percent>'],
            desc: 'The speed of the voice, in % from 50 to 200 (100 normal, 150 faster, 75 slower). The default is the tts.speed setting (50) for the local voice and gpt.tts.speed (100) with -gpt.',
            ex: ['/tts -speed 130 Good morning!']
        },
        {
            opts: ['pitch', 'pi'],
            values: ['<semitones>'],
            desc: 'The pitch of the voice, in semitones from -12 to 12 (0 normal, 3 higher, -3 lower). The default is the tts.pitch setting.',
            ex: ['/tts -pitch 3 Good morning!', '/tts -pitch -4 Good morning!']
        },
        {
            opts: ['volume', 'vol'],
            values: ['<percent>'],
            desc: 'The volume of the voice, in % from 20 to 300 (100 normal, 200 twice as loud). The default is the tts.volume setting.',
            ex: ['/tts -volume 150 Good morning!']
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
    expandCommands: true,   // the {/command}s of the text run and their reply is spoken
    delegavel: true,
    role: ADMIN // Spends the OpenAI key: delegable, like /gpt
};
