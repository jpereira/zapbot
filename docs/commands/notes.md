# `/notes` (`/notas`) · admin

Notes saved in the database, valid for any chat (group or private). Each one has an ID, and
`-alerta` notifies you about it at a date/time. Only the owner (and admins) can use it.

```text
/notes [-list|-l] [#tag...] [-to <destino>]...
/notes -compact|-c [#tag...]
/notes -search|-s [#tag...] <texto|/regex/flags> [-to <destino>]...
/notes -update|-u <id> [#tag] <novo texto>
/notes -view|-v <id...|#tag...> [-to <destino>]...
/notes -move|-m #tag #novatag
/notes -desc|-d #tag [<descrição>|-rm]
/notes -export|-e [#tag...] [-to <destino>]...
/notes #tag <texto>
/notes -add|-a #tag <texto> [-alerta <quando> [-to <destino>]...]
/notes -rm|-r <id...|#tag...|all>
/notes -alerta [<id|#tag...> [<quando> [-to <destino>]...]]
/notes -alerta -rm <id...|#tag...|all>
```

| Option | Value | Description |
|---|---|---|
| `-list`, `-l` | `[#tag...]` | Lists the notes with the ID, grouped by `#tag` (`/notes` alone shows the tags; `/notes #casa` lists that tag's notes). With one or more tags, only theirs |
| `-compact`, `-c` | `[#tag...]` | Lists with one line per note (title, the icons 🖼️ media, ⏰ alert and 🔗 link, and the time), grouped by day. Also works at the end: `/notes #pt -c`, `/notes -l -c` |
| `-search`, `-s` | `[#tag...] <texto\|/regex/flags>` | Only the notes that match, grouped as in the list. See [Search](#search) |
| `-update`, `-u` | `<id> [#tag] <novo texto>` | Replaces the note's text (and the tag, if one is given; the alert and the image stay). When replying to a message, with no text, uses that message's text |
| `-view`, `-v` | `<id...\|#tag...>` | Shows the note with its media (text as the caption; with no media, just the text). The tag can be partial. With `-to`, sends to the destinations (or by email, with the image attached) |
| `-move`, `-m` | `#tag #novatag` | Renames the tag in all notes. If the new one already exists, the two merge |
| `-desc`, `-d` | `#tag [<descrição>\|-rm]` | Tag description, shown in the list and in `/notes` alone. With no text, shows the current one; with `-rm`, deletes it. `-move` carries the description along |
| `-export`, `-e` | `[#tag...]` | Sends the notes in a PDF, with the images and the text as the caption (header, footer with version, host, date and time, and pagination). With tags, only theirs. See [Export](#export) |
| `#tag <texto>` | | With no option in front, it becomes a new note, same as `-add`: `/notes #casa não esquecer de remover a opção tal`. The `#tag` is required: `/notes meu texto` gives an error. Just `/notes #casa`, with no text, lists the tag's notes |
| `-add`, `-a` | `#tag <texto>` | Adds a note; the `#tag` is required and comes at the start of the text. The text goes up to the `-alerta`, if there is one, and accepts multiple lines |
| `-rm`, `-r` | `<id...\|#tag...\|all>` | Removes the notes with those IDs (`-r 2`, `-r 1 2 3` or `-r 1,2,3`), of a tag (`-r #casa`) or all (`all`). If any ID or tag doesn't exist, none is removed. Together with `-alerta`, removes only the alert, keeping the notes |
| `-alerta` | `<quando>` | Notifies you about the note (or all notes of a `#tag`) at a date/time. See [Alerts](#alerts) |
| `-to` | `<destino>` | With `-alerta`: notifies a contact, group, number or email instead of your private chat. With the list (`-l`, `#tag`) or `-export`: sends the list or the PDF there, instead of replying in the chat. Repeat it for several |

```text
/notes -a #casa comprar leite
/notes #casa comprar pão                             → the same as -a
/notes -a #contatos ligar pro João -alerta amanhã 9h
/notes -l
/notes -r 2
/notes -r all
/notes -update 3 comprar pão e leite             → replaces the text of #3
/notes -u #3 #casa comprar pão\ne leite          → replaces the text and moves it to #casa
/notes -move #casa #lar                           → renames #casa to #lar
/notes -desc #casa Coisas da casa                 → description of #casa
/notes -view 76                                   → #76 with the image, if it has one
/notes                                            → #casa: 3, #duvidas: 1, sem tag: 2
```

## Tags

```text
/notes #casa Lembrar de comprar pão
/notes -a #duvidas Olhar sobre como funciona as ETFs
/notes                → the tags, with the number of notes
/notes -l             → lists everything, one message per #tag (the untagged ones, from before, last)
/notes #casa          → only the ones in #casa (the same as /notes -l #casa)
/notes -rm #casa     → removes all the ones in #casa
/notes -rm all       → removes everything
```

- When you reply to a message, `/notes #lembrete` (or `/notes -a #lembrete`) saves its text as a
  note, with ↩️ in front. Text typed along with it takes the place of the message's (without the
  ↩️). It can be combined with `-alerta`: `/notes -a #lembrete -alerta amanhã 9h`. In the PDF, the
  ↩️ becomes `[resp.]`.
- In the note text, `\n` becomes a line break (`/notes #casa pão\nleite`); `\\n` stays as is.
- The first line is the title (the only one in bold), the rest comes as typed and every
  `http(s)://` link is moved out of where it was to the end, as bullets under `🔗 Links` (in the
  list, in `-view`, in the email and in the PDF, where it's just `Links`, without the emoji). This is
  done when displaying: the stored text doesn't change.
- The image goes out with a thin black border in `-view` (chat and email) and in the PDF; the gif
  goes as is.
- **Media:** send an image, document, audio or video with the caption `/notes #minhatag Texto` or
  reply to a media with `/notes #tag [texto]`. The text is optional (in a reply with a caption, the
  caption is used, with the ↩️). The file is kept in `cache/notes/` (outside `cache/media/`, so
  `/cache -media` doesn't delete it), with the original name in the case of documents, and the list
  shows `🖼️ imagem`, `🎬 vídeo`, `🎵 áudio` or `📎 nome-do-arquivo`. To get the file back, use
  [`-view`](#view-and-organize) (audio has no caption: the text goes in another message). `-rm`
  deletes the file too, and [`/backup`](backup.md) takes the media in a separate file.
- The tag can be partial in the list, in the search, in `-view`, in `-desc` and in `-export`:
  `/notes #idei` finds `#ideias`. The exact one wins; otherwise the ones that start with what you
  typed apply, then the ones that contain it. Where it changes data (`-rm`, `-move` and `-alerta`
  with `<quando>`), the tag must be complete.
- Each note has at most one tag, the one at the start of the text. Uppercase and lowercase count the
  same.
- To save a note the tag is required: `/notes meu texto` (no tag) gives an error. `/notes #casa`
  alone lists the tag's notes; in a reply or with media, it saves what came in it.

## View and organize

```text
/notes -v 76                  → #76: the media with the text as the caption (no media, just the text)
/notes -v 3 5                 → several at once, one message for each
/notes -v #idei               → all of #ideias
/notes -v 76 -to /Família/    → sends to the group (by email, the file is attached)
/notes -move #casa #lar       → renames the tag in all notes
/notes -desc #lar Coisas da casa   → tag description
/notes -d #lar                → shows the description
/notes -d #lar -rm            → deletes the description
```

- The `-view` header shows the ID, the tag and the date. An ID or tag that doesn't exist cancels
  everything, sending nothing.
- `-move` to a new tag that already exists merges the notes of both. The description goes along; if
  the new one already had one, it keeps its own. A source tag that doesn't exist, or is the same as
  the new one, is refused.
- The description appears below the tag name in the list (in italics) and next to it in `/notes`
  alone: `#casa: 3 · Coisas da casa`. You can describe a tag that has no notes yet; it only shows up
  in the list once it has some.

## Search

The same `-q` as in [`/show`](show.md) and [`/watch`](watch.md): text ignoring case and accents,
or `/regex/flags`.

```text
/notes -s pao                    → the ones with "pão" (and "PAO", "Pão"...)
/notes -search /etf|bolsa/i      → regex
/notes -s "comprar pão"          → with spaces, the text works directly (the quotes are optional)
/notes -s #casa leite            → only the ones in #casa that match
/notes -s casa                   → also matches the tag name (the ones in #casa)
/notes -s etf -to /Família/      → sends the result to the destinations
```

- A regex that risks freezing the bot (like `(x+)+`) is refused.

## Export

```text
/notes -e          → ZapBot_notes_20261027_1530.pdf, with everything, grouped by #tag
/notes -e #casa    → ZapBot_notes_tag-casa_20261027_1530.pdf, only the ones in #casa
/notes -e -to /Família/                  → the PDF in the Família group
/notes #casa -to /Jorge Pereira/ -to email  → the #casa list to the contact and by email
```

`-to` works as in the other commands (see
[Notify in another chat or by email](rates.md#notify-another-chat-or-by-email)). It doesn't
work with `-rm`.

- It goes out as a document in the chat itself (with `-to`, in the destinations; by email, as an
  attachment). The date and time in the name are Brasília time.
- The tag description (`-desc`) comes at the start of the document, right after the total, one line
  per tag that has one: `#casa: Coisas da casa`. Only the tags that are in the PDF are included.
- Images go into the PDF, above the note text (which serves as the caption), scaled down to fit
  (JPEG, white background in place of transparency). An image that won't open is left out, with a
  warning on the note's line. Documents, audio and video don't go into the PDF; the note's line
  says so.
- The PDF font is Latin-1: accents come out fine, but emojis and symbols outside it are omitted.

## Alerts

The same scheme as the `-alerta` of [`/rates`](rates.md#price-alerts): list, `-rm`, `-to`
and a periodic check (every minute). Here the condition is a date/time, and the notification is the
note itself.

```text
/notes -a #contatos ligar pro João -alerta amanhã 9h       → saves it and notifies tomorrow at 9h
/notes -alerta 3 +2h                              → notifies about note 3 in 2 hours
/notes -alerta 3 sexta 18:30 -to /Família/        → notifies in the Família group
/notes -alerta #casa +2h -to /Família/            → notifies about all in #casa, in the Família group
/notes -a #contas pagar boleto -alerta 25/12 10h -to /Jorge Pereira/ -to email
/notes -alerta                                    → lists only the notes with an alert
/notes -alerta #casa                              → only the ones in #casa that have an alert
/notes -alerta -rm 3                              → removes the alert from #3 (the note stays)
/notes -alerta -rm #casa                          → removes the alerts of #casa
/notes -alerta -rm all                            → removes all the alerts
```

- The `<quando>` is the same as in [`/cron`](cron.md): `+2h`, `30m`, `1h30m`, `18h`, `18:30`,
  `hoje 18h`, `amanhã [9h]`, `sexta [18h]`, `25/12 [10h]`, `25/12/2027 10h` (no time: 9h). Maximum
  of 365 days ahead; past dates are refused.
- The alert fires **once** and goes away; the note stays in the list. To repeat, create another
  `-alerta <id> <quando>` (it replaces the previous one).
- With a `#tag`, the alert goes on all the tag's notes (replacing the ones that already had one),
  and at the scheduled time one message goes out per note. If the tag doesn't exist, nothing is
  touched.
- Without `-to`, the notification goes to your private chat. `-to` accepts the same destinations as
  the other alerts (see
  [Notify in another chat or by email](rates.md#notify-another-chat-or-by-email)).
- If the bot was down at the scheduled time, the notification goes out as soon as it's back.
