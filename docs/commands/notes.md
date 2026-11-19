# `/notes` · admin

Notes saved in the database, valid for any chat (group or private). Each one has an ID, and
`-alert` notifies you about it at a date/time. Only the owner (and admins) can use it.

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
