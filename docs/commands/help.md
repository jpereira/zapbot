# `/help`

Shows a short index of the categories available to the caller. Lists respect chat permissions,
roles, [`/bot +cmd`](bot.md) delegation and disabled commands.

| Category | Contents |
|---|---|
| `/help groups` | [`/g`](group.md) actions grouped by configuration, members, moderation, greetings and account groups |
| `/help mod` or `/help moderation` | Group moderation actions |
| `/help media` | Photos, videos, stickers and audio |
| `/help ai` | ChatGPT and AI tools |
| `/help finance` | Quotes, investments and alerts |
| `/help tools` | Calendar, notes and other utilities |
| `/help admin` | Permissions, settings, backups and the web dashboard |
| `/help aliases` | [Shortcuts](alias.md) you can run, with their targets |

| Option | Value | Description |
|---|---|---|
| `-full`, `-f` | | Lists every available command by category, one line per command |
| `-role`, `-r` | | Lists available commands by role in owner, admin and user order |

`/g -h` opens the same list as `/help groups`. Group actions appear as `/g.<action>`.
Standalone commands are available according to their permissions.

For the syntax, options and examples of a specific command:

```text
/help get
/help /calendar
/help /g.warn
/g.warn -h
/help defi aave
```

## Language

`-h`, `-help` and `/help` follow the `zapbot.lang` setting: `en_US` (English, the default) or
`pt_BR`, and so do all the other replies, alerts, errors, dates and numbers of the bot. Change it
with `/set zapbot.lang pt_BR` (or `/set zapbot.lang=en_US`); it applies right away, with no
restart. The descriptions `/set` shows for each setting are still in Portuguese.

```text
/set zapbot.lang en_US
/ping -h
*/ping* · Checks whether the bot is responding

*Usage*
`/ping`

🔗 https://jpereira.github.io/zapbot/commands/ping/
```

```text
/set zapbot.lang pt_BR
/ping -h
*/ping* · Verifica se o bot está respondendo

*Uso*
`/ping`

🔗 https://jpereira.github.io/zapbot/pt-BR/commands/ping/
```
