/*
 * Identical options in more than one command (/stocks and /crypto, /get and /sticker): the description
 * stays in one place.
 */

const OPTION_ALERT_MSG = {
    opts: ['msg', 'm'],
    values: ['<text>'],
    desc: 'The text goes at the start of the notice (with -alert). It runs to the end of the command (may have spaces).',
    ex: ['-msg Time to sell!'],
    cron: false
};

const OPTION_ALERT_RM = {
    opts: ['rm'],
    values: ['<#...|all>'],
    desc: 'Removes alert #N from the list, several at once (-rm 1 2 3 or -rm 1,2,3), or all (with -alert). If any # does not exist, none is removed.'
};

const OPTION_ALERT_TO = {
    opts: ['to'],
    values: ['<destination>'],
    desc: 'Notifies somewhere else instead of your private chat. A contact, a group, a number, or an email (several with the name: you pick from the list) (with -alert). Repeat for several: a single alert that notifies all of them.',
    ex: [
        '-to /Jorge Pereira/',
        '-to @Fulano (mention)',
        '-to /L200 Group/ -to /Family/',
        '-to +5521999999999',
        '-to email (the QRCODE_EMAIL_SMTP_TO)',
        '-to you@example.com'
    ]
};

const OPTION_VERBOSE_FFMPEG = {
    opts: ['verbose', 'v'],
    values: [],
    desc: 'Shows the commands used in yt-dlp and ffmpeg.'
};

// -status|-s of /gpt, /tldr and /draw: the call usage in the footer (see src/openaiChat.js)
const optionStatus = (example) => ({
    opts: ['status', 's'],
    values: [],
    desc: 'Adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: /set gpt.status true.',
    ex: [example],
    cron: false
});

// -quiet|-q of the commands that end the reply with the engine tip ("💡 Read by Tesseract")
const OPTION_QUIET_TIP = {
    opts: ['quiet', 'q'],
    values: [],
    desc: 'Does not show the engine tip ("💡 ... by ChatGPT, Tesseract, Piper...") at the end of the reply. To hide it always: the <command>.footer setting off.'
};

module.exports = {
    OPTION_QUIET_TIP,
    optionStatus,
    OPTION_ALERT_MSG,
    OPTION_ALERT_RM,
    OPTION_ALERT_TO,
    OPTION_VERBOSE_FFMPEG
};
