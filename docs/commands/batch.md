# `/batch` · admin

Runs several commands from a single message, one after the other, and replies with a summary. Use it
to send at once what you'd otherwise send in several blocks (e.g. multiple notes through your
[alias](alias.md)). It also works when replying to a message that contains the commands.

![/batch demo](../assets/demo/12-batch-alias.gif)

```text
/batch [-stop|-s] [-dry|-d] [-quiet|-q]
<commands, on the lines below>
```

| Option | Value | Description |
|---|---|---|
| `-stop`, `-s` | | Stops at the first block that fails (by default it carries on with the others) |
| `-dry`, `-d` | | Only shows how the blocks were split, without running anything |
| `-quiet`, `-q` | | Doesn't reply with the execution summary (errors go only to the log). Doesn't work with `-dry` |

```text
/batch -stop
/ping
/uptime
→ if /ping fails, /uptime doesn't run

/batch -q
/notes #home buy milk
→ saves the note and doesn't reply with the summary
```

## A shortcut that runs a `/batch`

A [shortcut](alias.md) can hold a whole `/batch`: the lines below the first one go indented, and `$@` puts
**all** the typed text in each line (`$1` would be only the first word, and the rest would go to the end
of the last line).

```text
/alias /vfazol /batch -q
  /tts -q -l -v amy $@
  /tts -q -l -v ryan $@
  /tts -q -l -v lessac $@

/vfazol DO THE L!
→ three voice notes, one for each voice, all saying "DO THE L!"
```

Another use: trying a lot of things at once. Each [`/tts`](tts.md) with `-q` sends only the audio, so
a `/me` before it says which voice is speaking:

```text
/batch
/me 🎙️ en_US-amy-medium
/tts -q -l -v amy DO THE L!
/me 🎙️ en_US-ryan-medium
/tts -q -l -v ryan DO THE L!
```

## How blocks are split

A line that starts with a command (or alias) opens a block. Whatever comes after it, blank lines
included, belongs to the same block. A line with `/` that is neither a command nor an alias (e.g.
`/etc/hosts`) is still part of the block's text, and anything before the first command is ignored
(with a warning).

```text
/batch
/idea I need to look into this

http://example.com/?124

/idea When you can, read the link about this.
http://news.example.com/story
```

That's two blocks: the top URL belongs to the first `/idea` and the bottom one to the second. The
`/idea` is an alias, for example `/alias /idea /notes #ideas $1`.

The reply is a single summary:

```text
📦 BATCH · 2/2 ok

✅ 1 · /idea I need to look into this http://example.com/?124
   ↳ 📝 #77 · #ideas · I need to look into this http://example.com/?124
✅ 2 · /idea When you can, read the link about this. http://news.example.com/story
   ↳ 📝 #78 · #ideas · When you can, read the link about this. http://news.example.com/story
```

With `-dry` (or `-d`), nothing runs; it only shows how it split things:

```text
/batch -d
📦 BATCH (2) · only the split, nothing executed

1. /idea I need to look into this (+2 lines)
2. /idea When you can, read the link about this. (+1 lines)
```

- Each block goes through the same path as a normal message (alias, `$1`, options). An alias with
  `$1` joins the text into a single line, just like it already does outside `/batch`.
- You get a single reply: `✅`/`❌` per block, with the start of what the command replied.
- A block fails when the command's reply starts with ❌ or ⚠️, or when it throws an error. The
  others carry on, unless you use `-stop`: it stops at the first one and tells you how many didn't
  run.
- Each command's reply is cut at 300 characters in the summary; a reply with a code block (e.g.
  `/ascii`) comes out whole, in its own message after the summary.
- Each block carries only its own text: media or the message replied to by `/batch` aren't passed
  on to the commands inside.
- Maximum of 50 blocks; `/batch` inside `/batch` is refused.
