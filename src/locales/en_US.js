/*
 * Catálogo en_US (o padrão): chave → texto, com {placeholders}. O pt_BR.js tem as mesmas chaves.
 */
module.exports = {
    // -h|-help (src/comandos/base.js)
    'help.usage': 'Usage: ',
    'help.options': 'Options:',
    'help.arguments': 'Arguments:',
    'help.more': 'Details: {url}',
    'help.aliases': 'Aliases: {list}',
    'help.groupAll': 'All',
    'help.and': ' and ',

    // /help (src/comandos/help.js)
    'help.title': '🤖 *HELP*',
    'help.menuTitle': '🤖 *HELP MENU*',
    'help.menuUserNote': '_(the commands you can use)_',
    'help.menuFooter': '💡 Use */help /command* or */command -h* for more information.',
    'help.notFound': '❌ Command not found: {cmd}',
    'help.restricted': '⛔ {cmd} is only for the bot owner{e}.',
    'help.andAdmins': ' (and admins)',
    'help.notAllowed': '⛔ {cmd} is not enabled for you.',
    'help.seeAllowed': '💡 _See the ones you can use with /help_'
};
