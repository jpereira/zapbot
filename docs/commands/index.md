# Commands

Commands are defined in
[`src/commands/definitions/`](https://github.com/jpereira/zapbot/tree/main/src/commands/definitions).
You can send them in **any chat** (private, group, or the chat with yourself).

## General syntax

```text
/command [-option] [-option value] [arguments]
```

- Options use **a single hyphen** and accept the long or the short name: `-audio` = `-a`,
  `-startSec 10` = `-ss 10`. A value with a leading `-` is also fine when it's a time (`-ss -10`:
  the last 10 s).
- **To write text that looks like an option**, put a backslash in front: `\-foo` is the text `-foo`, not
  an option. It works in the middle of any text, even when `-foo` is an option of the command:
  `/notes #home buy milk \-to the market` saves `buy milk -to the market` (without `\-to`, it would be read
  as the destination), and `/gpt explain \-a` sends `-a` to ChatGPT. It also works as an option value
  (`-msg \-to`). Only the `\` right before the `-` counts, at the start of the word.
- Every command accepts `-help` / `-h`: `/get -h` shows the help for that command only. A command typed without what it
  needs answers with just its *Usage* and the hint to use `-h` (no ❌: a missing parameter is not an error):
  `/qr` replies `*Usage*`, the line `/qr [-decode|-d] [<text>]` and `💡 /qr -h for help`.
- `/help` shows the available categories and `/help -f` lists the commands. Use `/help get` or
  `/help /get` show a specific one, and `/help -r` groups the list by role (`owner`, `admin`, and
  `user`).
- The commands have English names and there are no fixed aliases: the name is the same in any
  language. [`/alias`](alias.md) saves the shortcuts you want (`/alias tempo /weather`), with
  arguments or texts with several `{/command}`; `/help alias` lists the shortcuts available to you.
- The language is the `zapbot.lang` setting (`en_US`, the default, or `pt_BR`; see
  [Language](../configuration.md#language)). It translates `-h` and `/help` and also the replies,
  alerts, errors, dates, and numbers of the bot. The descriptions that `/set` shows for each
  setting are still in Portuguese.
- Just type the beginning of the command: `/wat` or `/watc` become `/watch`. If the beginning
  matches more than one (`/wa`), the bot replies with the possible commands (`/walissu, /warn, /watch`).
  The exact name and the `/alias` shortcuts take priority.

## Pipes: `/a | /b`

The output of a command can be the input of the next one: `/a | /b` is the same as replying to the reply
of `/a` with `/b`, in a single line.

```text
/stocks -q USD | /tts -q -sp 50 -l -v tugão        → speaks the dollar quote
/weather -q Lisbon | /translate -to en             → the forecast, in English
/draw an astronaut cat | /sticker                  → the drawing, as a sticker
/get -a <link> | /stt | /gpt -q summarize in 3 lines → transcribes the video and summarizes it
/crypto -q BTC | /translate -to en | /tts -l       → three steps
```

- Only the last command answers in the chat; the ones before it work quietly (their "⏳" notices included).
- What goes on is the text without the WhatsApp marks (`*`, `_`, `~`, `` ` ``) and without the
  "💡 Tips" block, or the media (picture, audio, video, sticker) with its caption: the next command
  reads it as the message you replied to.
- The commands after a `|` are the ones that read a replied message. Text: `/tts`, `/translate`,
  `/ascii`, `/calc`, `/carbon` and `/screenshot` (a link); media: `/ocr`; either: `/gpt`, `/draw`,
  `/sticker`, `/stt`, `/get` and `/qr`. Any other answers with this list, and a picture given to one that
  reads text (or the other way around) says so before running it.
- A command that fails (❌, ⚠️) stops the pipe with its own message: the error is not translated nor
  spoken. At most 4 commands, and 10 minutes for each one.
- The permissions are the same as typing each command (and the usage limit counts each one); the
  options of each command are checked as if typed (`-h`, an unknown option, options that do not combine).
- Replying to a message with a pipe, that message is the input of the first command: reply to an audio
  with `/stt | /translate -to en`.
- Only `" | /command"` splits: the bar between spaces and followed by a command or a shortcut, outside a
  `{/command}`. `\|` is the bar itself, and `/alias`, `/cron`, `/me`, `/batch` and `/watch` keep the bar
  as their text, so a shortcut can save a pipe: `/alias /dollarvoice /stocks -q USD | /tts -l`
  (see [`examples/pipes.zb`](https://github.com/jpereira/zapbot/blob/main/examples/pipes.zb)).

## Destinations: contact, group, number, or email

Commands that send to destinations use **`-to`**: [`/cron`](cron.md), the alerts of
[`/stocks`](stocks.md#notify-another-chat-or-by-email) and [`/crypto`](crypto.md),
[`/defi -alert`](defi.md#out-of-range-alert), [`/watch`](watch.md#notify-somewhere-else),
[`/backup -send`](backup.md#send-the-file), and the [`/notes -alert`](notes.md#alerts) alerts
(`/notes` also uses it to send a list, a view, or an export). `/bot -status` also accepts `-to`.
These commands accept several `-to`: the alert (or the message, or the file) goes out to each destination. The
target of [`/mute`](mute.md), the people in [`/bot +a`/`+u`](bot.md#extra-admins), and
[`/whois`](whois.md) use the same lookup. Without `-to`, alerts (and the `/backup` file) go to your
private chat, and `/cron` goes to the current chat.

| Form | Example | Finds |
|---|---|---|
| Name | `/Jorge Pereira/`, `"Jorge Pereira"` or `Jorge` | Searches contacts and groups; exact names take priority, and contacts win a tie. Your own name (the one saved in your contacts or the one in your profile) is your private chat |
| Group | `/L200 Group/`, `"L200 Group"` or `L200` | The group, with priority for the exact name |
| Mention | `@Fulano` (picked from WhatsApp's `@` list) | The mentioned person. Useful in a group, for someone who isn't in your contacts. A typed `@number` that isn't a mention is rejected |
| Number | `+5521999999999` | The number's private chat: country code + area code + number (the `+` is optional; the bot checks that it's on WhatsApp) |
| Email | `email`, `you@example.com` or `"a@x.com, b@y.com"` | In alerts (`/stocks`, `/crypto`, `/defi`, and `/notes`), in `/watch`, in `/bot -status`, and in `/backup -send`: `email` is the `QRCODE_EMAIL_SMTP_TO`; it goes out through the bot's SMTP, without WhatsApp formatting ([Emails](../emails.md)) |

`/debug` uses `-copy-to` to copy logs to a chat, and doesn't accept email. `/watch -in` selects the
source of the messages: contact, group, or `@newsletter` channel.

The same forms, in a single command:

```text
/cron 8h -r d -to /Jorge Pereira/ -to @Fulano Da Silva -to /L200 Group/ -to +5521999999999 Good morning!
/stocks -alert USD > 5.30 -to email           → by email (the QRCODE_EMAIL_SMTP_TO)
/crypto -alert BTC < 90000 -to /L200 Group/ -to email  → in the group and by email
/mute @Fulano Da Silva                          → the /mute target, by mention
/bot +a /Jorge Pereira/ +5511988887777         → /bot +a (and +u) accepts several people at once
```

- **Mention:** in a group, type `@` and pick the person from the WhatsApp list. In the message text
  it becomes an id (`@100000000000002`), and the bot identifies the person by the id that WhatsApp
  sends along. It works for someone who's in the group but not in your contacts. An `@number` typed
  by hand, without picking from the list, is rejected: for a number, use `+5521999999999`.
- `/cron` and `/mute` don't accept email: the `/cron` message goes out on WhatsApp, and `/mute`
  silences a person or a group. Admins (`/bot +a`) and `/whois` accept only people (contact,
  mention, or number); users (`/bot +u`), people and groups.
- A name matches when it has **all** the words, in any order, ignoring case and accents. In `-to`,
  names with spaces go between `/.../` or quotes (without them, only the first word counts); in
  `/mute`, the target is the rest of the text, with or without `/.../`.
- A **fully matching** name beats one that merely contains the words (and a contact beats a group).
- If more than one fits, the bot lists them and waits for you to **reply with just the number**,
  in the same chat, within 2 minutes:

```text
/mute /Jorge/
🔎 "Jorge" matches 2 contacts:

1. 👤 Jorge Pereira · +5521999999999
2. 👤 Jorge Silva · +5511988888888

💡 Reply with just the number (within 2 minutes; 0 cancels), or repeat the command with more words of the name.

1
🔇 Muted: 👤 Jorge Pereira — deleted, edited, status, reactions
Only the alert goes away: the messages are still stored for /show.
💡 Tips
/mute shows the list
/unmute undoes it
```

To give up without waiting, reply `0` (or `cancel`):

```text
0
🚫 Cancelled.
```

The same goes for a yes/no confirmation: `cancel` counts as "no".

With no reply in 2 minutes, nothing is done, and the list itself becomes the notice (no extra
message): `⌛ No number chosen for "Jorge" in 2 minutes: nothing was done.`

## Permissions (`role`)

The person typing and each command have the same level: **owner > admin > user**. A command only
runs for someone with its level or higher.

| Level | Who | How they get in |
|---|---|---|
| `owner` | You: the account paired with the bot, from any device | Already are |
| `admin` | The extra admins (setting `bot.admins`) | `/bot +a /Jorge Pereira/`, `@Fulano Da Silva` or `+5521999999999` (see [Extra admins](bot.md#extra-admins)) |
| `user` | The people and groups in the `bot.users` setting | `/bot +u /Maria Lucia/ /Family Group/` (see [Users](bot.md#users)) |

A command's `role` (the Role column in the table, and the `role` in the definition) is the minimum
level needed to use it:

| Role | Who uses it |
|---|---|
| `user` | Any of the three: the regular commands (`/get`, `/weather`, `/sticker`...) |
| `admin` | The admins and the owner (`/set`, `/alias`, `/backup`...) |
| `admin` · delegable | The admins and the owner, and the owner can **delegate** it to a user (or a group) by naming the command in a `+cmd` ("Only"): `/bot +u +cmd /gpt` |
| `owner` | Only the owner (no command today; the `/bot` options that change who has access are owner-only) |

Only the owner changes who has access: `+a`/`-a`, `+u`/`-u`, `+cmd`/`-cmd`, `-reset`, `-passwd`, and
`-flush-email`. An extra admin doesn't promote anyone, not even themselves. If someone tries a
command above their level, nothing happens in the chat; with [debug](debug.md) on, you get a notice
at `PHONE_NUMBER`:

```text
⚠️ Fulano tried to run /show inside Family, but has no permission
```

`user` commands belong to whoever is in the `bot.users` setting, which **defaults to `false`**: only
you (and the extra admins) use commands. With `/bot +u /Maria Lucia/ /Family Group/`, those people
(in any chat) and those groups (any member, inside the group) can use them too; a person's `/bot +u`
typed in a group only applies in that group; with `/set bot.users true`, everyone. `/bot +cmd` /
`-cmd` limits each user's commands. See [Users](bot.md#users). To find out your level (or, as
owner or admin, someone else's), use [`/whois`](whois.md). Anyone who isn't an admin has
[flood protection](bot.md#flood-protection): the same command, at most 3 times in 2 seconds by
default (`bot.flood.maxCommandRepeated` and `bot.flood.intervalCommand`).

### Delegating an admin command

A **delegable** `admin` command (the Summary table marks them) falls under the user rule only if
it's named in a `+cmd` ("Only"). `-cmd` ("All, except") and `bot.users = true` do **not** unlock it,
and `/bot +cmd` rejects a command the owner doesn't delegate (`/set`, `/bot`...).

```text
/bot +u +cmd /gpt                 → typed in the Familia group: everyone there uses only /gpt
/bot +u +cmd /gpt /Familia/       → the same, from any chat
/bot +cmd /show /Sofia Izabel/    → Sofia (who already has "Only") gets /show
/bot +u +cmd /stocks,/gpt /Sofia Izabel/   → Sofia uses the named regular ones and /gpt
```

Even when delegated, the command doesn't let a user **adjust** anything: the options that change a
setting or delete data (`/gpt -model <model>`, `/stats -flush`, `/show -flush`...) reply
`⛔ Only the bot owner (or an admin) can ...`. Only the owner and admins adjust things.

Whoever gets the command also sees **only the current chat**: whatever looks at other chats or at
your private chat replies `⛔ Only the bot owner (or an admin) can see other chats.`

<!-- gerado:limites -->
| Command | Current chat only (left out) | Owner and admins only |
|---|---|---|
| `/crypto` |  | `-add`, `-del` |
| `/draw` |  | `-model`, `-quality`, `-size` |
| `/gpt` |  | `-model`, `-img`, `-gif`, `-audio`, `-prices`, `-usage` |
| `/profile` | `[/contact/\|@mention\|+number]...` | `-set` |
| `/show` | `-list`, `chat` | `-flush`, `-yes` |
| `/stats` | `-list`, `-me`, `</chat/>` | `-flush`, `-flush-all` |
| `/stocks` |  | `-add`, `-del` |
| `/tldr` | `-chat`, `-private` |  |
<!-- /gerado:limites -->

Someone who already uses all the regular commands (no rule, or "All, except") doesn't gain an
`admin` one with `+cmd`: the bot refuses and asks for the "Only" list with its commands. The
[`/alias`](alias.md) shortcuts follow the target: whoever can use `/gpt` uses the shortcuts for it,
and a shortcut's name doesn't go in `+cmd`.

<!-- gerado:roles -->
### Commands by role

**user** (whoever is in `bot.users`) (32):

[`/ascii`](ascii.md), [`/bills`](bills.md), [`/calc`](calc.md), [`/calendar`](calendar.md),
[`/carbon`](carbon.md), [`/crypto`](crypto.md), [`/cve`](cve.md), [`/games`](games.md),
[`/get`](get.md), [`/giphy`](giphy.md), [`/help`](help.md), [`/joke`](joke.md),
[`/kernel`](kernel.md), [`/me`](me.md), [`/meme`](meme.md), [`/news`](news.md),
[`/noffa`](noffa.md), [`/ocr`](ocr.md), [`/ping`](ping.md), [`/pixelart`](pixelart.md),
[`/qr`](qr.md), [`/sticker`](sticker.md), [`/stocks`](stocks.md), [`/stt`](stt.md),
[`/translate`](translate.md), [`/tts`](tts.md), [`/uptime`](uptime.md), [`/usage`](usage.md),
[`/version`](version.md), [`/walissu`](walissu.md), [`/weather`](weather.md), [`/whois`](whois.md)

**admin, delegable** (admins and the owner; the owner releases them to a user with `+cmd`) (19):

[`/antibadword`](antibadword.md), [`/antilink`](antilink.md), [`/antitag`](antitag.md),
[`/demote`](demote.md), [`/draw`](draw.md), [`/everybody`](everybody.md), [`/goodbye`](goodbye.md),
[`/gpt`](gpt.md), [`/group`](group.md), [`/members`](members.md), [`/poll`](poll.md),
[`/profile`](profile.md), [`/promote`](promote.md), [`/screenshot`](screenshot.md),
[`/show`](show.md), [`/stats`](stats.md), [`/tldr`](tldr.md), [`/warn`](warn.md),
[`/welcome`](welcome.md)

**admin** (admins and the owner; never delegable) (20):

[`/alias`](alias.md), [`/batch`](batch.md), [`/block`](block.md), [`/bot`](bot.md),
[`/call`](call.md), [`/cron`](cron.md), [`/defi`](defi.md), [`/forward`](forward.md),
[`/invite`](invite.md), [`/join`](join.md), [`/leave`](leave.md), [`/monitor`](monitor.md),
[`/mute`](mute.md), [`/notes`](notes.md), [`/search`](search.md), [`/set`](set.md),
[`/status`](status.md), [`/unblock`](unblock.md), [`/unmute`](unmute.md), [`/watch`](watch.md)

**owner** (the owner only) (5):

[`/backup`](backup.md), [`/cache`](cache.md), [`/contacts`](contacts.md), [`/debug`](debug.md),
[`/web`](web.md)
<!-- /gerado:roles -->

The **bot's own replies** also go out through your account, but they're never treated as commands,
even if they start with `/`. Without that, someone could use a command that echoes text (e.g.,
`/noffa /cache -a`) to make the bot "type" an admin command.

## Shortcuts with `/alias`

If you think the bot has too many parameters, simplify it with [`/alias`](alias.md) and make it your
own. Each shortcut is saved in the database and works like a command:

```text
/alias -q /usd /stocks USD          → shows the USD price
/alias -q /btc /crypto BTC         → shows the Bitcoin price
/alias -q /forecast /weather ${1:-Rio de Janeiro}   → /forecast shows Rio; /forecast Lisboa, Lisbon
/alias /rec /sticker -ss $1 -es $2           → /rec 10 20 <link> runs /sticker -ss 10 -es 20 <link>
/alias -q /tofriends /forward -q /Family Group/ +5521999999999 /Maria Lucia/ /Rafael Silva/   → a shortcut for a /forward list
```

`$1`, `$2`... take the arguments you type when running, and `${1:-default}` sets a default value
(`/clima` alone uses it; see [Parameters](alias.md#parameters-1-n)). That is the power of `/alias`: type
`/usd` and it's done. The shortcut follows the permissions of its
target command, and `/alias /usd` shows what a shortcut does.

## Summary

| Command | Aliases | Role | Description |
|---|---|:-:|---|
| [`/alias`](alias.md) | | `admin` | Registers, lists, and removes shortcuts for commands with arguments or texts with several `{/command}` |
| [`/antibadword`](antibadword.md) | | `admin` · delegable | Deletes messages from non-admins with banned words (a list per group) |
| [`/antilink`](antilink.md) | | `admin` · delegable | Deletes links sent by non-admins in the group |
| [`/antitag`](antitag.md) | | `admin` · delegable | Deletes messages from non-admins that tag lots of people |
| [`/ascii`](ascii.md) | | `user` | The text in big ASCII letters, in a block that fits a phone screen |
| [`/backup`](backup.md) | | `owner` | Daily local backup and delivery through `backup.to`; lists, details, restores, sends, and deletes the database |
| [`/batch`](batch.md) | | `admin` | Runs several commands from a single message, in sequence (each line that starts with a command opens a block), and replies with a summary; `-stop` and `-dry` |
| [`/bills`](bills.md) | | `user` | Joke: draws 2 members to "pay a invoice" |
| [`/block`](block.md) | | `admin` | Blocks one or more people on your WhatsApp account (replying to a message, whoever wrote it); with nothing, lists the blocked ones; `-mask` obfuscates phone numbers |
| [`/bot`](bot.md) | | `admin` | Bot status (24 h report and the users); turns commands on/off (`-on`/`-off`) and says who uses them: admins (`+a`/`-a`) and users (`+u`/`-u`, in any chat or just in one group, and each one's commands with `+cmd`/`-cmd`); `-reset` goes back to the default; `-status` (`-s`): report for the last 24 h, and `-s 06h` sends it every day; `-info` (`-i`): versions and system; `-test` (`-t`): tests cache, disk, database, WhatsApp, internet, SMTP, IMAP, and programs |
| [`/cache`](cache.md) | | `owner` | Cache tree with sizes, message counts, and cleanup |
| [`/calc`](calc.md) | `/math`, `/sum` | `user` | Calculates and sums the numbers of a list: reply to "437 gym / 351 running" and get 788; understands 1.234,56, signs, shows a tape of what it read and `-group` by name |
| [`/calendar`](calendar.md) | `/cal` | `user` | A text with an appointment becomes a calendar event |
| [`/call`](call.md) | | `admin` | Rejects voice and video calls and replies with a message: turn it on/off, set the text and who always rings |
| [`/carbon`](carbon.md) | | `user` | The code in an editor-window image |
| [`/contacts`](contacts.md) | | `owner` | Exports your address book as a vCard (`.vcf`) with name, number, about and profile photo, ready for Android and iPhone; photos cached in `cache/contacts`. Only in your own private chat |
| [`/cron`](cron.md) | | `admin` | At the set time (`30m`, `at 18h`, `friday 9h`...): sends a message (here or with `-to`, to one or several chats) or, with `-reminder`, an ⏰ reminder; can repeat, be edited and paused, and run commands in the text (`{/crypto}`) |
| [`/crypto`](crypto.md) | | `user` | Quote for the enabled cryptos (default: BTC, ETH, SOL, and HYPE) or just the requested ones (`BTC ETH`); price alerts |
| [`/cve`](cve.md) | | `user` | Latest published CVEs (NVD); `-highscore` only the critical ones |
| [`/debug`](debug.md) | | `owner` | Debug logs with levels, filtering, and copying to chats |
| [`/defi`](defi.md) | | `admin` | Liquidity positions on Orca and Project X: balance, range, price, and fees to collect, read on-chain; `-alert` warns when it leaves and returns to the range and when fees go over a value. `liquidswap`: LP positions on Aptos. `morpho` and `aave`: position, loans, and risk on Morpho and Aave V3 |
| [`/demote`](demote.md) | | `admin` · delegable | Removes someone's group admin |
| [`/draw`](draw.md) | | `admin` · delegable | Draws an image or an animated GIF (`-gif`) with ChatGPT (GPT Image); on a photo, edits or animates it |
| [`/everybody`](everybody.md) | | `admin` · delegable | Mentions everyone in the group |
| [`/forward`](forward.md) | | `admin` | Forwards the replied message to people, groups and emails (`-to`), only if every recipient is found |
| [`/games`](games.md) | | `user` | Group games: magic 8 ball, truth, dare and trivia |
| [`/get`](get.md) | | `user` | Downloads video/audio from social networks or from the replied media |
| [`/giphy`](giphy.md) | | `user` | GIPHY GIF by tag, URL, or ID, sent looping |
| [`/goodbye`](goodbye.md) | | `admin` · delegable | Message when someone leaves the group (per group; `{name}`, `{group}`) |
| [`/gpt`](gpt.md) | | `admin` · delegable | Asks ChatGPT (OpenAI); `-img`, `-gif`, `-voice`, `-prices`, `-usage`, and `-status` (bytes, tokens, cost, and balance) |
| [`/group`](group.md) | | `admin` · delegable | Shows and changes the group: name, description, photo, who can send, edit and add; `-send admins -for 30m` closes it for a while |
| [`/help`](help.md) | | `user` | Help menu, only with the commands the requester can use |
| [`/invite`](invite.md) | | `admin` | The group invite link (`-revoke` makes a new one) |
| [`/join`](join.md) | | `admin` | Joins a group through the invite link (`-info` shows the group without joining); `-l` lists your groups |
| [`/joke`](joke.md) | | `user` | Random joke in Portuguese |
| [`/kernel`](kernel.md) | | `user` | Current Linux kernel versions (kernel.org) |
| [`/leave`](leave.md) | | `admin` | Leaves one or more groups, by name or by list number; `-l` lists your groups |
| [`/me`](me.md) | | `user` | Sends the typed message; `{/command}` runs and the reply goes in its place, `\n` breaks the line |
| [`/members`](members.md) | | `admin` · delegable | Lists the group's members |
| [`/meme`](meme.md) | | `user` | Random meme template (imgflip) |
| [`/monitor`](monitor.md) | | `admin` | 👀 Up to 5 contacts, limited history, per-contact filter, and online-presence alerts |
| [`/mute`](mute.md) | | `admin` | Silences the notices for deleted, edited, status, and reactions (and those from `/watch`) of a person, a group, or a community; replying to a notice, from where it came |
| [`/news`](news.md) | | `user` | Headlines from RSS feeds: `-hack`, `-g1`, `-gazeta`, `-brazil` |
| [`/noffa`](noffa.md) | | `user` | Joke: decorates the text with rainbows |
| [`/notes`](notes.md) | | `admin` | Notes with ID and `#tag` (`-a`, `-l`, `-s`, `-r`): view with the media (`-v`), edit (`-u`), rename a tag (`-m`), describe a tag (`-d`), export to PDF (`-e`), `-alert` that notifies at a date/time, and `-lock` that protects a tag with a password (encrypted, only in your private chat) |
| [`/ocr`](ocr.md) | | `user` | The text in a photo, read locally (Tesseract) or by ChatGPT (`-gpt`) |
| [`/ping`](ping.md) | | `user` | Checks whether the bot is alive |
| [`/pixelart`](pixelart.md) | | `user` | Random ANSI/ASCII art (16colo.rs) |
| [`/poll`](poll.md) | | `admin` · delegable | Creates a native WhatsApp poll in the chat; `-r` shows the result |
| [`/profile`](profile.md) | | `admin` · delegable | A contact's profile picture, with the name from your contacts and the phone number |
| [`/promote`](promote.md) | | `admin` · delegable | Makes someone a group admin |
| [`/qr`](qr.md) | | `user` | Makes the QR Code of a text (`-decode` reads one) |
| [`/screenshot`](screenshot.md) | `/ss` | `admin` · delegable | A picture of a web page |
| [`/search`](search.md) | | `admin` | Searches the WhatsApp Web history, not just the cache: in this chat or, in your private chat, in all of them (`-N` for more); `-mask` obfuscates phone numbers |
| [`/set`](set.md) | | `admin` | Lists and changes the settings; `-a`/`-rm` add and remove items in lists (e.g., `bot.admins` and `bot.users`) |
| [`/show`](show.md) | | `admin` · delegable | In your private chat, lists the cache; redisplays deleted messages, edits (`-e`), status (`-s`), and removed or changed reactions (`-r`); `-q` searches (text or regex) and `-mask` obfuscates phone numbers |
| [`/stats`](stats.md) | | `admin` · delegable | Ranking for this chat or another (`/Grupo/`): who talks, deletes, and edits the most, peak hours; `-me` for yours, `-l` lists the chats, `-flush` deletes |
| [`/status`](status.md) | | `admin` | Posts on your WhatsApp Status (text, photo or video); `/cron -status` schedules it |
| [`/sticker`](sticker.md) | | `user` | Sticker from an image, video, or link (the `/get -st`), replying or as the caption of the media; with `-txt`, an animated text sticker |
| [`/stocks`](stocks.md) | | `user` | Quotes of the dollar, euro, pound and USDT against the real, and of stocks, ETFs and indexes (Yahoo Finance): USD, EUR, MSTR, PETR4.SA, `^GSPC`; `-alert` for price alerts |
| [`/stt`](stt.md) | | `user` | Text of the speech of a link, video or audio (`/get -t` is a shortcut), replying or as the caption; `-ss` and `-es` pick a part |
| [`/tldr`](tldr.md) | | `admin` · delegable | Summarizes the chat's conversation with ChatGPT (`30m`, `2h`, `1d`, `1h30m` or `300` messages; replying to a message, from it on) |
| [`/translate`](translate.md) | | `user` | Translates the text or the replied message with Google Translate, no key; `-to en` changes the language |
| [`/tts`](tts.md) | | `user` | The text as a voice note, with a local voice (Piper) or ChatGPT (`-gpt`) |
| [`/unblock`](unblock.md) | | `admin` | Unblocks a person: by name, by number, by the `/block` list number, or by replying to a message |
| [`/unmute`](unmute.md) | | `admin` | Undoes the `/mute` silence: by name, by list number, by replying to a notice, or all (`-all`) |
| [`/uptime`](uptime.md) | | `user` | Run time and connection time |
| [`/usage`](usage.md) | | `user` | Your usage limits (set by the owner with `/bot +limit`): used, left and when they renew; `-l` shows your last calls |
| [`/version`](version.md) | | `user` | Bot version (same banner as `/uptime`) |
| [`/walissu`](walissu.md) | | `user` | Joke: Walissu CVE BOT: tags 2 members with a random CVE |
| [`/warn`](warn.md) | | `admin` · delegable | Warns someone in the group; at the limit, they are removed |
| [`/watch`](watch.md) | | `admin` | Text/regex rules, with an optional source in `-in`; lists occurrences, searches them with `-q`, and notifies the `-to` destinations; `-mask` obfuscates phone numbers and `-mask N` turns on 🔒 for rule N |
| [`/weather`](weather.md) | | `user` | Weather now and the day's max/min (Open-Meteo); `/weather 16d` shows up to 16 days, counting today; without a city it uses `weather.city` |
| [`/web`](web.md) | | `owner` | Manage the web interface and its sessions |
| [`/welcome`](welcome.md) | | `admin` · delegable | Message when someone joins the group (per group; `{name}`, `{group}`) |
| [`/whois`](whois.md) | | `user` | Who you are and what you can do in the bot, in this chat: 🤖 owner, 👑 admin, 🗣️ user, or 🚫 no permission; the owner and admins see others |
