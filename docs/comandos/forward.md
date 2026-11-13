# `/forward` · admin

Role `admin`: only you and the extra admins. It can't be delegated: it sends messages from your
account to anyone.

Forwards the message you **replied to** (text, photo, video, audio, document, sticker, location...)
to one or more recipients, on WhatsApp or by email. It sends **only if every recipient is found**:
if any of them doesn't match, nothing is sent and the bot says which one failed. While sending, it
replies right away with `⏳ Forwarding message...` and, when it finishes, edits that same message
with the result (below).

```text
/forward [-quiet|-q] [-N|-N,-N|-N..-N] [/contact/|@mention|+number]... [-to <destination>]...
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[/contact/\|@mention\|+number]...` | The recipients, separated by spaces: a contact or group by name or part of it (a name with spaces goes between `/.../` or quotes; if several match, you pick from the list), someone mentioned with `@`, a number or an email |
| `-to` | `<destination>` | One more recipient: a contact, a group, a number or an email (see [Destinations](index.md#destinations-contact-group-number-or-email)). Repeat for several |
| `-N` | `-N,-N` · `-N..-N` | Without a reply: the position of the messages above (see [Several messages](#several-messages--n)) |
| `-quiet`, `-q` | | Shows no status: neither the notice while sending nor the list at the end. Only failures are reported |

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
