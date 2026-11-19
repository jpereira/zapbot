# `/help`

Shows the command menu, or the help for a single command. Everyone sees only what they can use:

- **You** (the owner) and the [extra admins](bot.md#extra-admins): all commands.
- **Everyone else** (the [users](bot.md#users)): only the `user` role commands, the `user` ones
  in the [command table](index.md#summary). The menu has `(the commands you can use)` in the
  title, and the `/help` of an `admin` or `owner` command replies
  `⛔ /show is only for the bot owner (and admins).`
  Anyone limited to a few commands ([`/bot +cmd`](bot.md#each-users-commands)) sees only
  those, and an `admin` command the owner delegated (`/bot +u +cmd /gpt`) shows up for whoever
  received it. `/help` and `/whois` always go through.

`/help` on its own lists the commands with just what each does (the `summary` from the command
definition): the command in **bold** and, on the line below, the description in _italic_ (WhatsApp
formatting, so it wraps on its own to the width of the phone, and every description starts at the same margin), and ends with a tip on how to see the rest:

````text
/help

*/alias*
_Saves shortcuts for commands with arguments_

*/ascii*
_The text in big ASCII letters_

*/backup*
_Database backup: lists, details, restores, sends or deletes_
...

💡 Use */help /command* or */command -h* for more information.
````

**Shortcuts at the end (for users).** Whoever is not an admin also gets, after the commands and before the tip, the
[shortcuts](alias.md) (aliases) that lead to commands they can use: an alias works as the command it points to, so it
belongs in the menu (an alias to a command they cannot use does not show up, and neither does one inside a text with
such a command). Each one is **the same block as in the [`/alias`](alias.md) list** (the name, the `-desc` and the command it
leads to, with its arguments), without the 🔇 and 🔒 marks:

````text
🔗 *Shortcuts* (2): they work like the commands (/help alias shows each one in full)

*/moeda*
→ /stocks USD

*/tuga*
📝 Speaks with the Portuguese voice
→ /tts -q -l -v tugão $@
````

The owner and the admins do not get this section (they have `/help alias`, which lists them with the full
description). `/help alias` for a user lists the same shortcuts, in full.

| Option | Value | Description |
|---|---|---|
| `-role`, `-r` | | Lists the commands split by role, only the ones you can use |

With `-role` (or `-r`), the menu comes split by role (`owner`, `admin` and `user`, in that order),
with only the ones you can use (a role with no visible commands doesn't show up; today no command is
`owner`):

````text
/help -r

🔸 Role: admin

*/alias*
_Saves shortcuts for commands with arguments_
...

🔸 Role: user

*/ascii*
_The text in big ASCII letters_
...
````

For the full help of a command:

```text
/help get
/help alias        → lists the registered shortcuts you can run
/help /show
/help defi orca    → only the Orca help in /defi (same as /defi orca -help)
/help defi aave    → only the Aave V3 help
/alias -help       → help for registering, listing and removing shortcuts
/watch -help       → /watch help, including rules, sources and destinations
/show -h           → /show help
```

All active commands and their aliases accept `-h` and `-help`. The help is short on purpose: the usage, the one-line summary, the
options and arguments (one line each), up to 3 examples and, at the end, the link to the command's
page on the site (`Details: ...`), where everything is explained. `[]` means something optional; `<>`, a value to fill in; `...`, something that
can be repeated. A line starting with `Ex:` is an example command.

Unknown or disabled commands get a reply to the message for the owner, admins and users with
permission in the chat: `⚠️ Unknown command '/comando', try: /help`. `/help /xyz`, with a command that doesn't exist, replies
`❌ Command not found: /xyz`.

## Language

`-h`, `-help` and `/help` follow the `zapbot.lang` setting: `en_US` (English, the default) or
`pt_BR`, and so do all the other replies, alerts, errors, dates and numbers of the bot. Change it
with `/set zapbot.lang pt_BR` (or `/set zapbot.lang=en_US`); it applies right away, with no
restart. The descriptions `/set` shows for each setting are still in Portuguese.

```text
/set zapbot.lang en_US
/ping -h
Usage: /ping
Checks whether the bot is responding (replies pong).

Help: -help, -h
```

```text
/set zapbot.lang pt_BR
/ping -h
Usage: /ping
Verifica se o bot está respondendo (responde pong).

Ajuda: -help, -h
```
