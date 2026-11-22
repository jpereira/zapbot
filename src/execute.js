/*
 * What every command does before the handler, the same for whoever types (events/messages.js), for the
 * {/command} in the /cron and /alias text (textCommands.js) and for /batch: read the options,
 * check what each one can do and build the handler context.
 */

const { getCommandSyntax } = require('./commands/base');
const { GetOptFromCommand } = require('./options');
const { t } = require('./i18n');
const { getSetting } = require('./settings');
const { ROLES, answer } = require('./roles');
const { askedHelpWatch, askedMaskWatch } = require('./watch/options');
const { maskMarks } = require('./commandMarks');

const ASKED_HELP = /^-h(?:elp)?$/;

// The commands with their own option reader: /watch has rules and regexes with spaces
const READERS_OWN = {
    '/watch': (opts, args) => {
        opts.opt.help = askedHelpWatch(args);
        opts.opt.mask = askedMaskWatch(args);
    }
};

/**
 * The command's options. With `argumentsFree` (/alias and /batch), the rest is free text, with
 * the saved command's options: only -h/-help is read here.
 */
function readOptions(command, args) {
    const free = command.freeArguments && !ASKED_HELP.test(args);
    // A command that runs the {/command}s of its text (/tts): what is inside the braces is not its options
    const marks = command.expandCommands ? maskMarks(args) : null;
    // The /tts with several lines reads its options from the first line only (the next ones are segments)
    const source = marks ? marks.masked : args;
    const opts = GetOptFromCommand(free ? '' : (command.firstLineOptions ? String(source).split('\n')[0] : source), command);
    if (marks?.marks.length) {
        opts.argv = opts.argv.map(marks.restore);
        for (const [k, v] of Object.entries(opts.opt)) if (typeof v === 'string') opts.opt[k] = marks.restore(v);
    }
    READERS_OWN[command.cmd]?.(opts, args);
    return opts;
}

/*
 * Runs the command with "typing..." lit: many take a while (downloading, querying, cleaning the email,
 * asking ChatGPT) and without this the chat seems stuck. Applies to every typed command, except the
 * that declare `typing: false` (the instant ones, like /ping).
 *
 * WhatsApp deletes the notice when the bot sends a message (the "⏳ Limpando..." in the middle) and also
 * after a few seconds. So it is resent every `each` ms until the command ends.
 * @param {number} [o.each]  the resend interval (only the tests change it)
 */
async function withTyping(msg, command, run, { each = 3000 } = {}) {
    let chat = null;
    const getChat = () => (chat ? Promise.resolve(chat) : msg.getChat().then(c => (chat = c)));

    // Like a person: reads (blue ✓✓) before replying. Also applies to instant ones (/ping)
    if (getSetting('commands.seen')) await getChat().then(c => c.sendSeen?.()).catch(() => {});

    if (command.typing === false) return run();

    const type = () => getChat()
        .then(c => c.sendStateTyping())
        .catch(() => {});

    type();
    const timer = setInterval(type, each);
    timer.unref?.();
    try {
        return await run();
    } finally {
        clearInterval(timer);
        // Without a reply at the end (the command only acted), the notice does not stay lit until WhatsApp deletes it
        if (chat) Promise.resolve().then(() => chat.clearState?.()).catch(() => {});
    }
}

// -mask of whoever declares "mask: true" in commands.js (the /defi one is different: it hides the wallets)
const askedMask = (command, opts) => Boolean(command.mask && opts.opt.mask);

// "❌ Opção desconhecida: -x" with the syntax, or null (only in commands with "strict: true")
function optionsError(command, opts) {
    if (!opts.unknown.length) return null;
    const list = opts.unknown.join(' ');
    // /gpt and /tldr (strict: 'primeira') only suggest the help; the others show the syntax
    if (command.strict === 'primeira') return t('executar.opcaoDesconhecidaAjuda', { list, cmd: command.cmd });
    return t('executar.opcaoDesconhecidaSintaxe', { list, syntax: getCommandSyntax(command.cmd) });
}

/**
 * The reply for whoever used what they cannot, or null. Two marks in the definition's cmd_opts:
 * role: ADMIN|OWNER   the option requires this level, even if the command was delegated to a user
 * (change the /gpt model, delete data...);
 * otherChats: true   the option (or the argument, in { argv }) looks at other chats: a user who
 * received the command sees only the current chat.
 * @param {string|null} level  the typist's: owner, admin or user (src/roles.js)
 */
function denial(command, opts, level) {
    for (const o of command.cmd_opts ?? []) {
        const used = o.opts ? o.opts.some(nameAlt => opts.given.has(nameAlt)) : opts.argv.length > 0;
        if (!used) continue;
        if (o.role && !answer(level, o.role)) {
            return t(o.role === ROLES.OWNER ? 'executar.soDonoOpcao' : 'executar.soAdminOpcao', { opt: o.opts[0], cmd: command.cmd });
        }
        if (o.otherChats && !answer(level, ROLES.ADMIN)) return t('executar.soAdminOutrosChats');
    }
    return null;
}

/**
 * What the handler receives, the same everywhere a command is executed.
 * @param {object} o
 * @param {object} o.msg
 * @param {string} o.args
 * @param {object} o.opts
 * @param {object} [o.quotedMsg]
 * @param {{ chatId: string, chatName: string, isGroup: boolean }} o.chat
 * @param {{ level: string, admin: boolean, canUse: Function, senderContact?: object,
 * senderName?: string, senderNumber?: string }} o.who  who runs (level: owner, admin
 * or user; admin is the owner or an admin)
 */
function assembleContext({ msg, args, opts, quotedMsg = null, chat, who }) {
    return {
        msg, args, opts, quotedMsg,
        chatId: chat.chatId, chatName: chat.chatName, isGroup: Boolean(chat.isGroup),
        level: who.level, admin: who.admin, canUse: who.canUse ?? (() => true),
        senderContact: who.senderContact ?? null, senderName: who.senderName, senderNumber: who.senderNumber
    };
}

module.exports = {
    withTyping,
    optionsError,
    readOptions,
    assembleContext,
    denial,
    askedMask
};
