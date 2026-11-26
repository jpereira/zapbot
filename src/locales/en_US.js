/*
 * en_US catalog (the default): key → text, with {placeholders}. pt_BR.js has the same keys.
 */
module.exports = {
    // -h|-help (src/commands/base.js)
    'help.usage': 'Usage',
    'help.options': 'Options',
    'help.arguments': 'Arguments',
    'help.more': '🔗 {url}',
    'help.hint': '💡 _{cmd} -h for help_',
    'help.aliases': '*Aliases:* {list}',
    'help.groupAll': 'All',
    'help.and': ' and ',

    // /help (src/commands/help.js)
    'help.groupActionTip': 'Use /g action or /g.action. For details: /g action -h.',
    'help.category.groups': 'Groups',
    'help.category.media': 'Media',
    'help.category.ai': 'AI',
    'help.category.finance': 'Finance',
    'help.category.tools': 'Tools',
    'help.category.admin': 'Administration',
    'help.category.aliases': 'Shortcuts',
    'help.category.configuration': 'Configuration',
    'help.category.participants': 'Members',
    'help.category.moderation': 'Moderation',
    'help.category.greetings': 'Greetings',
    'help.category.participation': 'Account groups',
    'help.category.examples': 'Examples',
    'help.categoryHint.groups': 'Groups, members and moderation',
    'help.categoryHint.media': 'Photos, videos, stickers and audio',
    'help.categoryHint.ai': 'ChatGPT and AI tools',
    'help.categoryHint.finance': 'Quotes, investments and alerts',
    'help.categoryHint.tools': 'Calendar, notes and utilities',
    'help.categoryHint.admin': 'Permissions, settings, backups and web',
    'help.categoryHint.aliases': 'Shortcuts available to you',
    'help.aliasesHint': '💡 To show the shortcut list:',
    'help.emptyCategory': 'No commands available in this category.',
    'help.views': '/help -f · All commands by category\n/help -r · All commands by role',
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
