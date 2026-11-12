# `/help` (`/h`)

Shows the command menu, or the help for a single command. Everyone sees only what they can use:

- **You** (the owner) and the [extra admins](bot.md#extra-admins): all commands.
- **Everyone else** (the [users](bot.md#users)): only the `user` role commands, the `user` ones
  in the [command table](index.md#summary). The menu has `(the commands you can use)` in the
  title, and the `/help` of an `admin` or `owner` command replies
  `⛔ /show is only for the bot owner (and admins).`
  Anyone limited to a few commands ([`/bot +cmd`](bot.md#each-users-commands)) sees only
  those, and an `admin` command the owner delegated (`/bot +u +cmd /gpt`) shows up for whoever
  received it. `/help` and `/whois` always go through.

`/help` on its own lists one command per line, with just what it does (the `summary` from the
command definition), in a monospaced block (to keep the alignment on mobile), and ends with a tip on
how to see the rest:

````text
/help

```
 /alias - Saves shortcuts for commands with arguments
 /ascii - The text in big ASCII letters
 ...
```

💡 Use */help /command* or */command -h* for more information.
````

| Option | Value | Description |
|---|---|---|
| `-role`, `-r` | | Lists the commands split by role, only the ones you can use |

With `-role` (or `-r`), the menu comes split by role (`owner`, `admin` and `user`, in that order),
with only the ones you can use (a role with no visible commands doesn't show up; today no command is
`owner`):

````text
/help -r

```
Role: admin
 /alias - Saves shortcuts for commands with arguments
 ...

Role: user
 /ascii - The text in big ASCII letters
 ...
```
````

For the full help of a command:

```text
/help get
/help alias        → lists the registered shortcuts you can run
/h /show
/help defi orca    → only the Orca help in /defi (same as /defi orca -help)
/help defi aave    → only the Aave V3 help
/alias -help       → help for registering, listing and removing shortcuts
/watch -help       → /watch help, including rules, sources and destinations
/show -h           → /show help
```

All active commands and their aliases accept `-h` and `-help`. The help shows the usage, options,
arguments and aliases. `[]` means something optional; `<>`, a value to fill in; `...`, something that
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
Uso: /ping
Verifica se o bot está respondendo (responde pong).

Ajuda: -help, -h
```
