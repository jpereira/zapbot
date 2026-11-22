# `/notes` · admin

Notes saved in the database, valid for any chat (group or private). Each one has an ID, and
`-alert` notifies you about it at a date/time. Only the owner (and admins) can use it.

> 🔐 **Private notes:** a tag can be **protected with a password** (`/notes -lock #stash`): the text and the files
> are encrypted, they only unlock and open in **your own private chat**, lock again by themselves and never go out with
> `-to`. See [Protected tags](#protected-tags--lock) and the [privacy scenarios](#privacy-scenarios).

```text
/notes [-list|-l] [#tag...] [-to <destination>]...
/notes -compact|-c [#tag...]
/notes -search|-s [#tag...] <text|/regex/flags> [-to <destination>]...
/notes -update|-u <id> [#tag] <new text>
/notes -view|-v <id...|#tag...> [-to <destination>]...
/notes -move|-m #tag #newtag
/notes -desc|-d #tag [<description>|-rm]
/notes -export|-e [#tag...] [-to <destination>]...
/notes #tag <text>
/notes -add|-a #tag <text> [-alert <when> [-to <destination>]...]
/notes -rm|-r <id...|#tag...|all>
/notes -alert [<id|#tag...> [<when> [-to <destination>]...]]
/notes -alert -r <id...|#tag...|all>
/notes -lock|-lo [<password>] #tag [-now|-n|-no | -clean -yes]
/notes -view|-export|-list|-search -lock [<password>] #tag
```

| Option | Value | Description |
|---|---|---|
| `-list`, `-l` | `[#tag...]` | Lists the notes with the ID, grouped by `#tag` (`/notes` alone shows the tags; `/notes #home` lists that tag's notes). With one or more tags, only theirs |
| `-compact`, `-c` | `[#tag...]` | Lists with one line per note (title, the icons 🖼️ media, ⏰ alert and 🔗 link, and the time), grouped by day. Also works at the end: `/notes #pt -c`, `/notes -l -c` |
| `-search`, `-s` | `[#tag...] <text\|/regex/flags>` | Only the notes that match, grouped as in the list. See [Search](#search) |
| `-update`, `-u` | `<id> [#tag] <new text>` | Replaces the note's text (and the tag, if one is given; the alert and the image stay). When replying to a message, with no text, uses that message's text (with the ↩️) |
| `-view`, `-v` | `<id...\|#tag...>` | Shows the note with its media (text as the caption; with no media, just the text). The tag can be partial. With `-to`, sends to the destinations (or by email, with the image attached) |
| `-move`, `-m` | `#tag #newtag` | Renames the tag in all notes. If the new one already exists, the two merge |
| `-desc`, `-d` | `#tag [<description>\|-rm]` | Tag description, shown in the list and in `/notes` alone. With no text, shows the current one; with `-rm`, deletes it. `-move` carries the description along |
| `-export`, `-e` | `[#tag...]` | Sends the notes in a PDF, with the images and the text as the caption (header, footer with version, host, date and time, and pagination). With tags, only theirs. See [Export](#export) |
| `-lock`, `-lo` | `[password] #tag` | Protects a tag with a password (text and files encrypted) or unlocks it; the password can come in the command. See [Protected tags](#protected-tags--lock) and [Password in the command](#password-in-the-command) |
| `-now`, `-n`, `-no` | | Locks the tag right now, alone or with `-lock` in any order (`-n #foo`, `-lock #foo -now`, `-n -lock #foo`) |
| `-clean` | | With `-lock #tag`: deletes from the history the old commands you typed for that tag (needs `-yes`) |
| `#tag <text>` | | With no option in front, it becomes a new note, same as `-add`: `/notes #home do not forget to remove that option`. The `#tag` is required: `/notes meu texto` gives an error. Just `/notes #home`, with no text, lists the tag's notes |
| `-add`, `-a` | `#tag <text>` | Adds a note; the `#tag` is required and comes at the start of the text. The text goes up to the `-alert`, if there is one, and accepts multiple lines |
| `-rm`, `-r` | `<id...\|#tag...\|all>` | Removes the notes with those IDs (`-r 2`, `-r 1 2 3` or `-r 1,2,3`), of a tag (`-r #home`) or all (`all`). With a `#tag`, the numbers are the **positions in that tag's list** (`-r #home 1` is the 1st of `#home`), not IDs. A whole tag or `all` asks for `-yes`. If any ID, position or tag doesn't exist, none is removed. Together with `-alert`, removes only the alert, keeping the notes |
| `-yes`, `-y` | | With `-rm`: confirms removing a whole tag or all the notes (without it, the bot only says how many would go) |
| `-alert` | `<when>` | Notifies you about the note (or all notes of a `#tag`) at a date/time. See [Alerts](#alerts) |
| `-to` | `<destination>` | With `-alert`: notifies a contact, group, number or email instead of your private chat. With the list (`-l`, `#tag`) or `-export`: sends the list or the PDF there, instead of replying in the chat. Repeat it for several |

```text
/notes -a #home buy milk
/notes #home buy bread                               → the same as -a
/notes -a #contacts call John -alert tomorrow 9h
/notes -l
/notes -r 2
/notes -r all -yes
/notes -u 3 buy bread and milk            → replaces the text of #3
/notes -u #3 #home buy bread\nand milk         → replaces the text and moves it to #home
/notes -m #home #house                           → renames #home to #house
/notes -d #home Home stuff                     → description of #home
/notes -v 76                                   → #76 with the image, if it has one
/notes                                            → #home: 3, #doubts: 1, no tag: 2
/notes -compact                → one line per note, by day
```

## Tags

```text
/notes #home Remember to buy bread
/notes -a #doubts Look into how ETFs work
/notes                → the tags, with the number of notes
/notes -l             → lists everything, one message per #tag (the untagged ones, from before, last)
/notes #home          → only the ones in #home (the same as /notes -l #home)
/notes -r #home 1 3   → removes the 1st and the 3rd of #home (their positions in the list)
/notes -r #home -yes → removes all the ones in #home (without -yes, it only says how many would go)
/notes -r all -yes   → removes everything
```

- When you reply to a message, `/notes #reminder` (or `/notes -a #reminder`) saves its text as a
  note, with ↩️ in front. With text typed along (`/notes #reminder Remember to save this!`), the typed
  text comes first (it's the title) and the replied message follows, after a blank line, with ↩️; its
  media (image, document, audio, video) is saved in the same note. It can be combined with `-alert`: `/notes -a #reminder -alert tomorrow 9h`. In the PDF, the
  ↩️ becomes `[reply]`.
- In the note text, `\n` becomes a line break (`/notes #home bread\nmilk`); `\\n` stays as is.
- The first line is the title (the only one in bold), the rest comes as typed and every
  `http(s)://` link is moved out of where it was to the end, as bullets under `🔗 Links` (in the
  list, in `-view`, in the email and in the PDF, where it's just `Links`, without the emoji). This is
  done when displaying: the stored text doesn't change.
- The image goes out with a thin black border in `-view` (chat and email) and in the PDF; the gif
  goes as is.
- **Media:** send an image, document, audio or video with the caption `/notes #mytag Text` or
  reply to a media with `/notes #tag [text]`. The text is optional (in a reply with a caption, the
  caption is used, with the ↩️). The file is kept in `cache/notes/` (outside `cache/media/`, so
  `/cache -media` doesn't delete it), with the original name in the case of documents, and the list
  shows `🖼️ image`, `🎬 video`, `🎵 audio` or `📎 file-name`. To get the file back, use
  [`-view`](#view-and-organize) (audio has no caption: the text goes in another message). `-rm`
  deletes the file too, and [`/backup`](backup.md) takes the media in a separate file.
- The tag can be partial in the list, in the search, in `-view`, in `-desc` and in `-export`:
  `/notes #idea` finds `#ideas`. The exact one wins; otherwise the ones that start with what you
  typed apply, then the ones that contain it. Where it changes data (`-rm`, `-move` and `-alert`
  with `<when>`), the tag must be complete.
- Each note has at most one tag, the one at the start of the text. Uppercase and lowercase count the
  same.
- To save a note the tag is required: `/notes my text` (no tag) gives an error. `/notes #home`
  alone lists the tag's notes; in a reply or with media, it saves what came in it.

## View and organize

```text
/notes -v 76                  → #76: the media with the text as the caption (no media, just the text)
/notes -v 3 5                 → several at once, one message for each
/notes -v #idea               → all of #ideas
/notes -v 76 -to /Family/    → sends to the group (by email, the file is attached)
/notes -m #home #house       → renames the tag in all notes
/notes -d #house Home stuff        → tag description
/notes -d #house                → shows the description
/notes -d #house -r            → deletes the description
```

The compact list (`/notes -c`) puts one line per note, grouped by tag and by day, with the tag description in
italics, the ID, the start of the text, the icons and the time:

```text
📝 *NOTES* (6)

🏷️ home (3) · 🔗 1
👉 Things for the apartment

📆 11/03/2026
#12 Buy a new shower head · 9:15 AM
#13 Call the plumber about the leak · 9:20 AM
#14 smartplug-review.example.com/best-of-20… 🔗 · 8:02 PM

🏷️ ideas (3)
👉 Ideas for the weekend project

📆 11/05/2026
#15 Photo wall with the trip pictures · 6:40 PM
#16 Build a bookshelf with pallets · 6:44 PM
#17 Try the new trail near the lake · 10:03 PM

💡 _🖼️ media · ⏰ alert · 🔗 link_
💡 _-v <no.> opens the whole note_
💡 _without -c, the full list_
```

- The `-view` header shows the ID, the tag and the date. An ID or tag that doesn't exist cancels
  everything, sending nothing.
- `-move` to a new tag that already exists merges the notes of both. The description goes along; if
  the new one already had one, it keeps its own. A source tag that doesn't exist, or is the same as
  the new one, is refused.
- The description appears below the tag name in the list (in italics) and next to it in `/notes`
  alone: `#home: 3 · Home stuff`. You can describe a tag that has no notes yet; it only shows up
  in the list once it has some.

## Search

The same `-q` as in [`/show`](show.md) and [`/watch`](watch.md): text ignoring case and accents,
or `/regex/flags`.

```text
/notes -s cafe                   → the ones with "café" (and "CAFE", "Café"...)
/notes -s /etf|bolsa/i      → regex
/notes -s "buy bread"             → with spaces, the text works directly (the quotes are optional)
/notes -s #home milk             → only the ones in #home that match
/notes -s home                   → also matches the tag name (the ones in #home)
/notes -s etf -to /Family/      → sends the result to the destinations
```

- A regex that risks freezing the bot (like `(x+)+`) is refused.

## Export

```text
/notes -e          → ZapBot_notes_20261027_1530.pdf, with everything, grouped by #tag
/notes -e #home    → ZapBot_notes_tag-casa_20261027_1530.pdf, only the ones in #home
/notes -e -to /Family/                  → the PDF in the Family group
/notes #home -to /Jorge Pereira/ -to email  → the #home list to the contact and by email
```

`-to` works as in the other commands (see
[Notify in another chat or by email](stocks.md#notify-another-chat-or-by-email)). It doesn't
work with `-rm`.

- It goes out as a document in the chat itself (with `-to`, in the destinations; by email, as an
  attachment). The date and time in the name are Brasília time.
- The tag description (`-desc`) comes right below the tag's heading (`#home (3)`), for each tag that
  has one. The heading also summarizes how many notes have media, alert and link.
- Images go into the PDF, above the note text (which serves as the caption), scaled down to fit
  (JPEG, white background in place of transparency). An image that won't open is left out, with a
  warning on the note's line. Documents, audio and video don't go into the PDF; the note's line
  says so.
- The PDF font is Latin-1: accents come out fine, but emojis and symbols outside it are omitted.

## Protected tags (`-lock`)

> **Protected notes are only unlocked and accessed in your own private chat** (the messages with yourself). In a
> group, in the chat of another person or with `-to` (to send them somewhere), they stay locked for whoever reads:
> only the 🔒 shows, even if the tag is unlocked in your private chat.

For notes that cannot be read by whoever gets the database or a backup. A **protected tag** has the text of its notes
and its files encrypted (AES-256-GCM) with a key made from a password that is **never stored**.

```text
/notes -lock #foo
🔑 Create a password for #foo:            ← first time: asks twice; no recovery
(you type the password; the bot deletes your message and keeps it out of the history)
🔓 The tag #foo is now protected (3 notes encrypted) and unlocked, it will be locked in 5m without use.

/notes -lock #foo                          ← later: unlocks
🔑 Type your password:
🔓 The tag #foo is unlocked, it will be locked in 5m without use.

/notes -lock #foo -now                     → locks right now (also /notes -n #foo, /notes -n -lock #foo)

/notes -v -lock #foo                       → asks the password and then shows the notes (also -e, -l and -s)
```

- **Unlocked**, the tag works as any other (add, list, search, view, PDF). Each use renews the time; after
  `notes.lockMinutes` ([setting](../settings.md), default 5) without use it **locks by itself**, and a bot restart
  locks everything.
- **Everything in one line:** `/notes -v -lock #foo` (or `-e`, `-l`, `-s`) asks the password and, once unlocked, runs
  the command. If the tag is already unlocked it just shows. It needs one protected tag.
- **Only in your private chat:** unlocking (the password), reading (`-v`, `-l`, `-s`, `-e`, a lone `#tag`), adding
  (`/notes #foo ...`) and editing (`-u`) only work there. In any other chat the same tag, even unlocked, behaves as
  locked: lists, search and PDF show only the 🔒, adding and editing are refused (`🔒 The notes of #foo only open in
  your own private chat`) and the command you typed there stays out of the history.
- **Never sent to others:** `-v`, `-e`, `-l` or `-s` of a protected tag with `-to` (a contact, a group or an email) is
  refused (`🔒 The notes of #foo are protected: they are not sent to other chats or emails (no -to)`). A list of all
  the notes sent with `-to` shows the 🔒 where the protected ones are, never their text. An alert of a protected note
  says only that there is one.
- **Locked**, lists, search and PDF show only `🔒 (protected note)`, an alert says only that there is a note, and
  adding to it is refused (`/notes -lock #foo` first).
- **The password is typed only in your own private chat** (the messages with yourself), as the answer to the question.
  The bot deletes your message and replaces it in the history; if WhatsApp does not let it delete, it asks you to.
  5 wrong passwords block the tag for 15 minutes.
- **Nothing in the clear is left:** a note saved in a protected tag has its command and the media you sent removed from
  the history. For the commands you typed **before** protecting, `/notes -lock #foo -clean -yes` deletes them.
- **There is no recovery:** forgot the password, lost the notes. Backups carry only the encrypted content.
- A protected tag cannot be renamed or merged (`-move`) and its notes cannot change tag.

### Password in the command

The password can also come in the command, instead of the question: one message and it is done.

```text
/notes -v -lock mypassword #stash        → unlocks #stash and shows its notes
/notes -lock "my long password" #stash   → unlocks only (quotes for a password with spaces)
/stash.lock mypassword                   → with an alias like /alias -q -p /stash.lock /notes -v -lock $@ #stash
```

The password is the first word after `-lock` (or `-lo`, or `-l` beside `-v`/`-e`/`-s`/`-c`) that does not start with `#`
or `-`; it has to be among the options at the start (a `-lock word` in the text of a note is just text). Whatever the
result, **the message with the password is deleted** (right, wrong, a tag that is not protected, a group, a missing
tag): the right one unlocks and shows, the wrong one answers `❌ Wrong password.` (5 mistakes block the tag for 15
minutes, same as the question) and `❌ The tag #x is not protected` explains that the password only **opens** (creating
the protection still asks twice, with `/notes -lock #tag`).

What the bot hides, so that the password does not stay anywhere it writes:

| Where | What shows |
|---|---|
| The log (`docker logs`, debug included) | `executed '/notes -v -lock *** #stash'` |
| The echo of an alias without `-q` | `🔗 Alias /stash.lock -> /notes -v -lock *** #stash` |
| The messages table (history, `/show`, backups) | the command with `***` (and `/stash.lock ***` for the alias) |
| The bot's answers | never repeat it; they are direct messages, not replies to your command |

It only works in your own private chat (in a group the bot deletes the message and says where to type it). **It is less
safe than the question:** the password travels inside an ordinary command, so the notification preview on the phone
and the linked WhatsApp Web devices can see it for the instant before it is deleted, and an alias keeps the word
you typed in the chat before that. For the daily use prefer the question (`/notes -lock #stash`); use the password in
the command only if you accept that.

### Privacy scenarios

What a protected tag protects, and what it does not, in the situations that matter:

| Scenario | What happens |
|---|---|
| The database or a backup leaks (`cache/zapbot.db`, `cache/backups`, `cache/notes`) | The text and the files of the protected notes are encrypted (AES-256-GCM); only the password opens them. Without it they are noise |
| You lend your phone, or someone sees your WhatsApp Web | Lock the tag before (`/notes -lock #foo -now`): only `🔒 (protected note)` shows. It also locks by itself after `notes.lockMinutes` without use |
| You share your screen, or type in a group by mistake | Protected notes only unlock and open in **your own private chat**; in a group or in someone's chat they stay locked even if the tag is unlocked, adding and editing are refused |
| `-to` by mistake (sending a view, a list or a PDF to someone) | Refused: protected notes are never sent to other chats or emails. A list of all the notes sent with `-to` shows `🔒` where they are |
| An alert of a protected note | Says only that there is a note in the tag, never its text |
| Someone reads the logs, `/show` or the history | The password never appears (`-lock ***`), and the commands you typed for the tag leave the `messages` table |
| Someone with access to the running bot **while the tag is unlocked** | They can read it: the key is in memory until it locks. Lock it when you stop (`-now`), or keep `notes.lockMinutes` low |
| You forget the password | The notes are lost. There is no recovery, by design |

What it does **not** cover: the original messages you replied to or sent (they stay in the WhatsApp chat and, if they had
media, in `cache/media`: `/show -f` or `/cache` remove them), the **backups made before** you protected the tag (they
keep the text in the clear: delete them with `/backup`), and the password typed **in the command** (the notification
preview on the phone can show it for an instant; the question is safer).

### Example: a secret tag with shortcuts

For a tag you use all the time (the `#stash` below), three [aliases](alias.md) make each use one word. They are in
[`examples/secret-notes.zb`](https://github.com/jpereira/zapbot/blob/main/examples/secret-notes.zb) (load them with
`/alias -examples secret-notes`), or create them by hand. They are **private** (`-p`, see [Private aliases](alias.md#private-aliases)): only you see and run
them. The `-desc` of each one explains it in `/alias`:

```text
/alias -q -p /stash.add  -desc "Saves a note in the protected tag #stash, encrypted. The tag has to be unlocked first (/stash.view); locked, or outside your own private chat (a group, someone's chat), it refuses and the command stays out of the history"  /notes #stash $@
/alias -q -p /stash.lock -desc "Locks the protected tag #stash right now: afterwards only a lock shows. Use it before lending the phone or sharing the screen (it also locks by itself after notes.lockMinutes without use and when the bot restarts)"  /notes -lock #stash -now
/alias -q -p /stash.view -desc "Unlocks the protected tag #stash and shows its notes: asks the password in your private chat (or /stash.view password, less safe: it travels in a normal command, the bot deletes it and hides it from logs and history). Never opens in a group or with -to; locks again after notes.lockMinutes without use"  /notes -v -lock $1 #stash
```

Once, by hand, protect the tag (it asks the **new** password twice, there is no recovery):

```text
/notes -lock #stash
```

After that, a normal day:

```text
/stash.view                          → 🔑 Type your password:     (you type it; the bot deletes your message)
                                       🔓 The tag #stash is unlocked, it will be locked in 5m without use.
                                       (and its notes, shown)
/stash.add the bank PIN is 1234      → 📝 #7 · #stash · 🔒     (encrypted; your message leaves the history)
/stash.lock                          → 🔒 The tag #stash is locked.   (or wait 5 minutes without using it)
/stash.view mypassword               → the same as /stash.view, with the password in the command (the $1)
```

`/stash.add` only works while the tag is unlocked (locked, it answers `🔒 The tag #stash is locked`) and in your own
private chat. `/stash.view` asks the password and, with one typed after it, takes it from the command (see
[Password in the command](#password-in-the-command)). It does **not** create the protection (a typo in the tag
would ask for a password out of nowhere): for a tag that is not protected it says to use `/notes -lock #tag`.

## Alerts

The same scheme as the `-alert` of [`/stocks`](stocks.md#price-alerts): list, `-rm`, `-to`
and a periodic check (every minute). Here the condition is a date/time, and the notification is the
note itself.

```text
/notes -a #contacts call John -alert tomorrow 9h       → saves it and notifies tomorrow at 9h
/notes -alert 3 +2h                              → notifies about note 3 in 2 hours
/notes -alert 3 friday 18:30 -to /Family/        → notifies in the Family group
/notes -alert #home +2h -to /Family/            → notifies about all in #home, in the Family group
/notes -a #bills pay the bill -alert 25/12 10h -to /Jorge Pereira/ -to email
/notes -alert                                    → lists only the notes with an alert
/notes -alert #home                              → only the ones in #home that have an alert
/notes -alert -r 3                              → removes the alert from #3 (the note stays)
/notes -alert -r #home                          → removes the alerts of #home
/notes -alert -r all                            → removes all the alerts
```

- The `<when>` is the same as in [`/cron`](cron.md): `+2h`, `30m`, `1h30m`, `18h`, `18:30`,
  `today 18h`, `tomorrow [9h]`, `friday [18h]`, `25/12 [10h]`, `25/12/2027 10h` (no time: 9h). Maximum
  of 365 days ahead; past dates are refused.
- The alert fires **once** and goes away; the note stays in the list. To repeat, create another
  `-alert <id> <when>` (it replaces the previous one).
- `-to` with `-add` only works together with `-alert`; with `-alert` alone (the list) it gives an
  error: the destinations are only set when creating the alert.
- With a `#tag`, the alert goes on all the tag's notes (replacing the ones that already had one),
  and at the scheduled time one message goes out per note. If the tag doesn't exist, nothing is
  touched.
- Without `-to`, the notification goes to your private chat. `-to` accepts the same destinations as
  the other alerts (see
  [Notify in another chat or by email](stocks.md#notify-another-chat-or-by-email)).
- If the bot was down at the scheduled time, the notification goes out as soon as it's back.
