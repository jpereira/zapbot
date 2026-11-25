# `/forward` · admin

Role `admin`: only you and the extra admins. It can't be delegated: it sends messages from your
account to anyone.

Forwards the message you **replied to** (text, photo, video, audio, document, sticker, location...)
to one or more recipients, on WhatsApp or by email. It sends **only if every recipient is found**:
if any of them doesn't match, nothing is sent and the bot says which one failed. While sending, it
replies right away with `⏳ Forwarding message...` and, when it finishes, edits that same message
with the result (below).

```text
/forward [-quiet|-q|-status|-s] [-dry|-d] [-nohdr] [#list]... [-N|-N,-N|-N..-N] [/contact/|@mention|+number]... [text] [-to <destination>]...
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[/contact/\|@mention\|+number]...` | The recipients, separated by spaces: a contact or group by name or part of it (a name with spaces goes between `/.../` or quotes; if several match, you pick from the list), someone mentioned with `@`, a number or an email |
| `-to` | `<destination>` | One more recipient: a contact, a group, a number or an email (see [Destinations](index.md#destinations-contact-group-number-or-email)). Repeat for several |
| `-N` | `-N,-N` · `-N..-N` | Without a reply: the position of the messages above (see [Several messages](#several-messages--n)) |
| `-quiet`, `-q` | | Shows **nothing**: no status (neither the notice while sending nor the list at the end) and no header on what is sent. Only failures are reported |
| `-status`, `-s` | | Forces the header on what is sent **and** the status (the notice and the summary of who received it), even with the `forward.header` and `forward.status` settings off |
| `-nohdr` | | Sends without the `🤖 Message forwarded by ZapBot!` header only (the status stays; `-q` drops both). See [Header](#header) |
| `-dry`, `-d` | | Only validates the recipients: replies with who was found (or what is wrong) and sends nothing. Needs no reply or positions |
| `-add`, `-a` | `#list <recipients>...` | Creates the [recipient list](#recipient-lists) (or adds to it). Recipients are resolved now and saved with their ids; never replaces |
| `-list`, `-l` | `[#list...]` | Without a name, all the lists with their size; with names, their recipients (the name can be partial) |
| `-rm`, `-r` | `<#list...\|all>` · `#list <recipient>...` | Removes the whole list, or only the given recipients from it. If any does not exist, nothing is removed |
| `-move`, `-m` | `#list #newlist` | Renames the list (if the new name exists, the two merge) |
| `-copy`, `-c` | `#list #newlist` | Copies the list and keeps it: a faithful copy (description included) or, if the new name exists, its members join it without repeats |
| `-desc` | `#list [<description>\|-rm]` | List description, shown in `-list`. Without text, shows it; with `-rm`, deletes it |

```text
/forward /Fulano de Tal/
/forward /Jorge Pereira/ @Maria /Camila Gama/
/forward -q /Jorge Pereira/
/forward -to fulano@example.com /Jorge Pereira/ @Maria -to root@example.org
```

When everything goes through, the `⏳` message becomes:

```text
✉️ Message forwarded successfully!

👤 Fulano
👥 Family
📧 fulano@example.com
```

The list of who received it only shows up when the `forward.header` setting is on (the default, see
[Header](#header)); with it off, the message is just `✉️ Message forwarded successfully!`. Each line
has the recipient's type (👤 contact, 👥 group, 📧 email). If some sending fails (blocked chat, SMTP
down...), the title is `⚠️ Forwarded to 2 of 3` and the one that failed comes with `❌` and the reason
(`👤 Beltrano · ❌ blocked chat`); the others are still sent. If all fail, the title is `❌ I could
not forward the message`.

## Recipient lists

Like the tags of [`/notes`](notes.md), a `#list` is a saved group of recipients, so you do not have to
type them every time (a mailing list).

```text
/forward -a #friends /Jorge Pereira/ /Rossam Silva/ +5521999999999 a@b.com   creates it (or adds to it)
/forward -a #friends -to /Family/                                          -to also works as a member
/forward -l                                                                  all the lists
/forward -l #friends                                                         the recipients of #friends
/forward -r #friends /Jorge Pereira/                                        takes a recipient out
/forward -r #friends 2                                                      ...or by the number shown in -l
/forward -r #friends                                                        deletes the list
/forward -m #friends #team                                                renames (merges if #team exists)
/forward -c #friends #team                                                copies (merges into #team if it exists); #friends stays
/forward -desc #friends The usual crowd                                      description

/forward #friends                       sends to the whole list (reply, or -1 ...)
/forward #friends #work /Maria/ -to x@y.com    several lists and single recipients, nobody twice
/forward -d #friends                  validates and shows who would receive, sending nothing
```

- The recipients are resolved **when you add them** (you pick from the list if a name is ambiguous) and
  saved with their ids, so sending is deterministic.
- `-add` only adds, it never replaces: to start over, `-rm #friends` and `-add` again.
- To send or delete, the list needs its **full name**; the partial name (`#fri`) only works for reading
  (`-list`, `-desc`).
- `-rm` is all or nothing: if any list or recipient does not exist, nothing is removed. Taking out the
  last recipient removes the list.
- If someone on a list is the chat you typed the command in (the conversation the message came from), they are left out: it does not go back to them. A recipient typed on purpose still gets it, and `-dry` tells who was left out.
- Names are lowercase, with letters, digits, `_` and `-`.
- A send (lists and single recipients together) and each list are limited by the setting
  `forward.maxRecipients` (default 30).
- Admin only, like the rest of the command.

## A text with the message

After the recipients, what is left is a **text to send**. It goes at the start of the message and, when you reply to a
message, the replied message goes below it (after a blank line), under the header:

```text
/forward /My Contact/ #group /Family/ This goes to everyone!
(replying to "Meeting at 10am")
→ 🤖 Message forwarded by ZapBot!

  This goes to everyone!

  Meeting at 10am

/forward -q /Jorge Pereira/ Good morning!        → no reply: only the text, with no header and no status
/forward /Fulano/ Silva                          → "Silva" is the text (the recipient is /Fulano/)
/forward Fulano Silva                            → no explicit recipient: it's a name, as always
```

- The recipients that count as explicit are `/Name/`, `"Name"`, `@mention`, `+number`, an email, a `#list` and `-to`.
  The first loose word after one of them starts the text. With only loose words, they are a name (`/forward Fulano Silva`).
- Without a reply (and without positions), the text alone is what is sent: it doesn't ask for a reply.
- With `-q`, there's no header and no status, only the text (and the replied message, if any).

## A shortcut for a group of friends

A common use: whenever you see something to send to the same people, it's one reply. Here with a list of friends
who don't like politics (call it `#nopt`):

**1. Create the list** (once). The recipients are saved with their ids, and they can be contacts, groups or emails:

```text
/forward -add #nopt /Fulano/ /Lourival Neto/ /College Group/ /Rodrigo Souza/ /Rossam Silva/ /Erik Gielow/ /Bruno Melo/
```

**2. Create a shortcut** (once). With `-q` on the alias, only the forwarded message goes, with no `🔗 Alias ...` header,
and with `-q` on the `/forward`, no header and no status either:

```text
/alias -q nopt /forward -q #nopt
```

**3. Use it.** Whenever there is something worth sending, **reply to the message with `/nopt`**. You can also add an
extra text, which goes at the start, and the replied message below it:

```text
(replying to the message)  /nopt
→ they receive only the message

(replying to the message)  /nopt Look at this!
→ they receive:
  Look at this!

  <the replied message>
```

- To see who is in the list: `/forward -l #nopt`. To add or remove someone: `/forward -a #nopt /Maria/` and
  `/forward -r #nopt /Maria/`. More in [Recipient lists](#recipient-lists).
- Want the header and the confirmation? Use `/alias -q nopt /forward -s #nopt` (`-s` forces both).
- The same works for several lists (`#family`, `#work`): one alias for each, or mix them in one:
  `/alias -q all /forward -q #family #work`. Without a reply, `/nopt Good morning!` sends only the text.
- More about aliases in [`/alias`](alias.md).

## Header

By default the message goes with a header saying it came from the bot:

```text
🤖 Message forwarded by ZapBot!

<the text of the message>
```

With a photo, video or document, the header and the text go in the caption. Audio, voice notes and
stickers don't have a caption: the header goes before, in its own message. By email, the header opens
the text and the media goes as an attachment. To send only the message, turn it off:

```text
/set forward.header false
```

Or only for one run: `-nohdr` drops only the header (the status stays), `-q` drops the header and the status, and `-s` forces both:

```text
/forward -nohdr /Jorge Pereira/
/alias -q /nopt /forward -q -nohdr #nopt
```

- Location becomes the description and a map link; a poll becomes the question and the options.
- Several recipients repeated count once.

## Several messages (`-N`)

Without replying to anything, give the position of the messages above, right after the command (and
`-quiet`): `-1` is the message right above the command.

```text
/forward -1 /Rafael Silva/
/forward -1 -4 -6 /Rafael Silva/ /Family Group/
/forward -1,-4,-6 /Rafael Silva/
/forward -3..-1 /Rafael Silva/
```

- `-1 -4 -6` and `-1,-4,-6` forward exactly those positions; `-3..-1` forwards the range (`-1..-3`
  is the same). They always go from the oldest to the newest, even if typed out of order.
- Messages the bot itself sent (replies, statuses) and WhatsApp notices (someone joined...) don't
  count when numbering.
- Up to `forward.max` messages at a time (default 10), with a pause of `forward.delayMs` between
  them (default 1 s). If there are fewer messages above than you asked for, nothing is sent.
- The header goes **once**, in a message before all of them. By email, it's a single email with all
  the texts in sequence and the media attached.
- The notice counts them (`⏳ Forwarding 3 messages...`) and so does the result: `✉️ 3 messages forwarded successfully!`.
- Replying and giving numbers together is refused: use one or the other.
