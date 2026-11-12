# `/set` (`/config`) · admin

Lists and changes the bot's settings stored in the `settings` table (see
[Settings](../settings.md)). The change takes effect immediately and survives restarts.

| Option | Value | Description |
|---|---|---|
| *(none)* | | Lists all keys and values and, in your private chat, the `config/.env` variables |
| `<key>` | | Shows value, default, type and description (the description is still in Portuguese) |
| `<snippet>` or `/regex/` | | If it isn't a key: lists the keys that contain the snippet (case-insensitive) or match the regex. E.g.: `/set alerta`, `/set /^show\./` |
| `<key> <value>` | | Changes it. Lists: items separated by comma or space (`watch.rules`: one rule per line; `bot.users.cmds`: separated by space, since each item has commas); `""` empties it |
| `<key>=<value>` | | The same as `<key> <value>`, for any key. E.g.: `/set zapbot.lang=pt_BR` |
| `-append`, `-a` | `<key> <value>` | In a list, adds the items (the existing ones stay). E.g.: `/set -a bot.admins +5521999999999` (for `bot.admins` and `bot.users`, `/Jorge Pereira/` and `@Fulano Da Silva` also work; for `bot.users`, groups) |
| `-rm` | `<key> <value>` | In a list, removes the items. E.g.: `/set -rm commands.disabled noffa` |
| `-reset`, `-r` | `<key>` | Goes back to the default value |
| `<VARIABLE>` | | A `config/.env` variable (e.g.: `OPENAI_MODEL`): shows the value, only in your private chat |

```text
/set
/set show.max
/set alerta          → only the keys with "alerta" (alerta.intervalMin, alerta.max, defi.alerta.intervalMin)
/set /^news\./       → the ones that match the regex
/set show.max 10
/set monitor.pool=300
/set monitor.maxRecords=30
/set zapbot.lang=pt_BR  → the same as /set zapbot.lang pt_BR
/config show.max 10  → the same, through the alias
/set debug.enabled off
/set sticker.name "Meu Bot"
/set commands.disabled noffa everybody
/set commands.disabled ""
/set -r crypto.coins
/set watch.rules ""
/set -a commands.disabled walissu   → disables one more, without rewriting the list
/set -rm commands.disabled noffa   → re-enables just that one
/set -a bot.admins /Jorge Pereira/  → an extra admin, by contact name (see /bot)
/set bot.users /Grupo Familia/      → allows the regular commands in the group (see /bot)
```

## Contact monitor

Like any other key, the four [`/monitor`](monitor.md) settings accept `<key> <value>` or
`key=value`:
`monitor.enabled`, `monitor.pool`, `monitor.max` and `monitor.maxRecords`.

```text
/set monitor.pool 300
/set monitor.pool=300
/set monitor.max=5
/set monitor.maxRecords=30
/set monitor.enabled=false
```

`monitor.pool` is the minimum interval in seconds per contact (120 to 86400, default 300), and
`monitor.max` limits the registrations (1 to 5, default 5). `monitor.maxRecords` limits the history
in the database and in the per-person lists (1 to 1000, default 30);
lowering this value immediately removes the oldest excess timestamps. `monitor.enabled=false` pauses
without deleting registrations or history. Changes take effect without a restart.

## Lists: `-append` and `-rm`

For keys that are lists (`bot.admins`, `bot.users`, `commands.disabled`, `crypto.coins`,
`watch.rules`, the `news.*` feeds...), `<key> <value>` replaces the whole list; `-append` (`-a`)
adds items and `-rm` removes them, leaving the rest alone. Items go through the same validation as
`<key> <value>`: a phone number becomes just the digits, a command becomes its main name
(`/set -rm commands.disabled /mudo` removes `/mute`).

```text
/set -a crypto.coins hype
✅ crypto.coins + HYPE
= BTC, ETH, SOL, HYPE
```

On a key that isn't a list (`show.max`, `debug.enabled`...), `-append` and `-rm` are refused: change
the value with `/set <key> <value>` or go back to the default with `/set -reset <key>` (`-r`).

Only the owner changes `bot.admins` and `bot.users` (including with `-append`, `-rm` and `-reset`):
an extra admin can't give themselves (or others) that access. In them, besides the number, the
contact name (`/Jorge Pereira/`) or the mention works: the bot stores the phone number and shows the
name next to it ([Extra admins](bot.md#extra-admins)). `bot.users` also accepts groups (stores the
id and shows `👥 Name`) and `true`/`false` ([Users](bot.md#users)).

## `config/.env` variables

In your private chat (the chat with yourself), `/set` also shows the [`config/.env`](../configuracao.md)
variables the bot reads, **read-only**: they change in the file, and take effect when the container
is recreated. Keys and passwords appear masked (`••••1234`).

```text
🔒 config/.env (read-only: change the file and recreate the container)

GIPHY_API_KEY                   ••••a1b2
OPENAI_MODEL                    (empty)
PHONE_NUMBER                    5521999999999
QRCODE_EMAIL_SMTP_PASS          ••••mnop
...
```

In another chat (a group, for example), you get only the notice
`🔒 The config/.env variables (read-only) only show up in your private chat.` instead. Trying to
change one (`/set OPENAI_MODEL gpt-4.1`) is refused.
