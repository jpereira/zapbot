# `/debug` · admin

Controls the diagnostic logs in the console, with cumulative levels, regex filtering and copying to a
WhatsApp chat. The settings are saved in the settings and survive restarts. On first boot, debug
starts off, at level `0`.

| Option | Description |
|---|---|
| `-on` | Turns debug on |
| `-off` | Turns debug off and clears the filter and the copy; keeps the level. Only works alone (combined with other options it's refused) |
| `-level`, `-lvl` | Sets the level `N` from `0` to `3`; requires debug on or `-on` in the same command |
| `-filter`, `-f` | Shows and copies only the logs that match `/regex/flags` (up to 100 characters). Without a value, clears the filter |
| `-copy-to` | Copies the logs to a contact, group, number or mention. Without a value, uses the command's chat. Doesn't accept email |

| Level | Label | Diagnostics |
|---|---|---|
| `0` | `DEBUG0` | Basic messages and command arguments, including options and destinations; default level |
| `1` | `DEBUG1` | Received commands, parser calls, input and output of exported functions, call depth and duration, chat context |
| `2` | `DEBUG2` | External calls: Axios with URL and parameters, WhatsApp, SMTP and external processes |
| `3` | `DEBUG3` | Function results, database queries, message data and execution in Chromium |

Each level includes the previous ones. Credentials are hidden, and large objects, media and circular
structures are summarized. The filter also applies to info and error logs while debug is on. Flags
like `i`, `g`, `m`, `s`, `u` and `y` follow JavaScript regex syntax; each log record is evaluated
independently. The context includes `chatName` and `chatId` from level `1` on, which lets you filter
by chat name or ID. In a console with colors enabled, the parts that match the filter appear in red
and bold, like `grep --color`. Copies sent to WhatsApp contain text without the color codes.

`DEBUG0` includes the command parser: positional arguments, given options, values in quotes or
slashes and all `-to` destinations. `/watch`, `/debug` and `/cron` show the fields of their specific
parsers, including regex with flags and free text. Options without a value appear as `null`; boolean
options use `true` or `false`. Shared references keep their values; only real cycles appear as
`[circular]`.

Startup and authentication logs and the bot-started email alert appear unfiltered. The saved filter
takes effect once WhatsApp is ready and the initial alert has been fired; it also applies while the
sending of that email is still in progress.

```text
/debug -off
/debug -on
/debug -level 2 -filter /chatName.*Jorge/
/debug -on -level 2 -filter /sapato/i -copy-to @Jorge
/debug -on -level 3 -filter -copy-to
/debug -off
/debug -on -lvl 3 -filter /@newsletter/
/debug
```

Without options, it shows the active state, level, filter and destination. Destinations with spaces
can be written as `/Nome do Grupo/` or in quotes. Ambiguous names open a list to choose from, like in
`-to` of the other commands.

`-level`, `-filter` and `-copy-to` only work with debug on (or `-on` in the same command); otherwise
the bot answers `❌ Turn debug on first: /debug -on -level 0`. The reply shows the state:

```text
🪲 Debug Enabled. [DEBUG2]
🔎 Filter: /sapato/i
📋 Copy: 👤 Jorge
```

The copy sends the logs in batches, with the prefix `🪲 [ZapBot log]`. Sending the copy doesn't
itself generate additional logs. The queue is bounded and drops the oldest blocks when it's full.
Logs wait in the queue while the WhatsApp connection isn't ready. If sending fails, the copy pauses
and logs the error to the console; configure it again through `/debug` to resume. The console keeps
working.

An unknown or disabled command shows up in the log: the owner's always; other people's only with
debug on, subject to the configured filter:

```text
[!] ⚠️ 'Jorge' executed unknown command: '/tapioca'
[DEBUG0] ⚠️ 'Fulano' executed unknown command: '/tapioca'
```
