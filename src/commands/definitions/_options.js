/*
 * Identical options in more than one command (/stocks and /crypto, /get and /sticker): the description
 * stays in one place.
 */

const OPTION_ALERT_MSG = {
    opts: ['msg', 'm'],
    requires: ['alert'],
    values: ['<text>'],
    desc: 'The text goes at the start of the notice (with -alert). It runs to the end of the command (may have spaces).',
    ex: ['-msg Time to sell!'],
    cron: false
};

const OPTION_ALERT_RM = {
    opts: ['rm'],
    requires: ['alert'],
    conflicts: ['pause', 'resume'],
    values: ['<#...|all>'],
    desc: 'Removes alert #N from the list, several at once (-rm 1 2 3 or -rm 1,2,3), or all (with -alert). If any # does not exist, none is removed.'
};

const OPTION_ALERT_PAUSE = {
    opts: ['pause', 'pa'],
    requires: ['alert'],
    conflicts: ['rm', 'resume'],
    values: ['<#...|all>'],
    desc: 'Pauses alert #N, several (-pause 1 3 or 1,3) or all (with -alert): it stays in the list, but is not checked until -resume. If any # does not exist, none is paused.',
    ex: ['-alert -pause 2'],
    cron: false
};

const OPTION_ALERT_RESUME = {
    opts: ['resume', 're'],
    requires: ['alert'],
    conflicts: ['rm', 'pause'],
    values: ['<#...|all>'],
    desc: 'Resumes paused alerts (one, several or all, with -alert). If the price already crossed the value while paused, it notifies on the next check.',
    ex: ['-alert -resume all'],
    cron: false
};

const OPTION_ALERT_TO = {
    opts: ['to'],
    requires: ['alert'],
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

// -v: a summary (each step with its time, and the total); -vv: the full report (the commands, the options as JSON,
// the end of the log when a download fails). /get, /stt and /sticker (src/commands/get.js)
const OPTION_VERBOSE_FFMPEG = {
    opts: ['verbose', 'v'],
    values: [],
    desc: 'A summary of what ran: each step (yt-dlp, ffmpeg...) with how long it took, and the total. -vv: the full report.'
};
const OPTION_VERBOSE_FULL = {
    opts: ['vv', 'v2'],
    values: [],
    desc: 'The full report: every command that ran (yt-dlp, ffmpeg...) with its time, the options understood (JSON) and, when a download fails, the end of its log.'
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
    OPTION_ALERT_PAUSE,
    OPTION_ALERT_RESUME,
    OPTION_ALERT_TO,
    OPTION_VERBOSE_FFMPEG,
    OPTION_VERBOSE_FULL
};
