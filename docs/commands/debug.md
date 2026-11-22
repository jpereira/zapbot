# `/debug` · owner

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
| `1` | `DEBUG1` | **What the bot is calling**, one line each, with the duration: the received message, the command, the database queries (the SQL), the HTTP requests (method, URL and status), the external processes, the emails and the WhatsApp calls; chat context. The light one: good for following what happens |
| `2` | `DEBUG2` | The same calls with their start and end, **with the arguments**, plus every exported function of the modules (parser, handlers...), call depth and duration. Verbose |
| `3` | `DEBUG3` | Everything of level 2 plus the **results** of every call, the message data and the execution in Chromium. Very verbose |

Each level includes the previous ones (from level `2` on, the one-line summaries of level `1` become the full start/end of the same call). Credentials are hidden, and large objects, media and circular
structures are summarized. The filter also applies to info and error logs while debug is on. Flags
like `i`, `g`, `m`, `s`, `u` and `y` follow JavaScript regex syntax; each log record is evaluated
independently. The context includes `chatName` and `chatId` from level `1` on, which lets you filter
by chat name or ID. In a console with colors enabled, the parts that match the filter appear in red
and bold, like `grep --color`. Copies sent to WhatsApp contain text without the color codes.

Level `1` for a `/ping` (one line per call, `+Nms` is how long it took):

```text
[DEBUG1] message_create start { body: '/ping', type: 'chat' } {chatName=Family}
[DEBUG1] whatsapp getChatById 120363000000000001@g.us +3ms
[DEBUG1] database SELECT 1 AS ok FROM messages WHERE id = ? +0ms
[DEBUG1] database INSERT INTO messages (id, sender_name, sender_jid, ...) VALUES (?, ?, ?, ...) +1ms
[DEBUG1] command /ping +2ms
[DEBUG1] whatsapp sendMessage 120363000000000001@g.us +41ms
[DEBUG1] request GET https://www.kernel.org/releases.json → 200 +312ms      (a /kernel)
[DEBUG1] process /usr/bin/ffmpeg -y -i in.wav -c:a libopus out.ogg +0ms      (a /tts)
```

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
/debug -lvl 2 -f /chatName.*Jorge/
/debug -on -lvl 2 -f /sapato/i -copy-to @Jorge
/debug -on -lvl 3 -f -copy-to
/debug -off
/debug -on -lvl 3 -f /@newsletter/
/debug
```

Without options, it shows the active state, level, filter and destination. Destinations with spaces
can be written as `/Group Name/` or in quotes. Ambiguous names open a list to choose from, like in
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
