# `/batch` · admin

Runs several commands from a single message, one after the other, and replies with a summary. Use it
to send at once what you'd otherwise send in several blocks (e.g. multiple notes through your
[alias](alias.md)). It also works when replying to a message that contains the commands.

![Demonstração do /batch](../assets/demo/12-batch-alias.gif)

```text
/batch [-stop|-s] [-dry|-d] [-quiet|-q]
<comandos, nas linhas de baixo>
```

| Option | Value | Description |
|---|---|---|
| `-stop`, `-s` | | Stops at the first block that fails (by default it carries on with the others) |
| `-dry`, `-d` | | Only shows how the blocks were split, without running anything |
| `-quiet`, `-q` | | Doesn't reply with the execution summary (errors go only to the log). Doesn't work with `-dry` |

## How blocks are split

A line that starts with a command (or alias) opens a block. Whatever comes after it, blank lines
included, belongs to the same block. A line with `/` that is neither a command nor an alias (e.g.
`/etc/hosts`) is still part of the block's text, and anything before the first command is ignored
(with a warning).

```text
/batch
/ideia Preciso ver sobre isso

http://minha.com/?124

/ideia Quando puder ler o link sobre isso.
http://g1.com/labala
```

That's two blocks: the top URL belongs to the first `/ideia` and the bottom one to the second. The
`/ideia` is an alias, for example `/alias /ideia /notes #ideias $1`.

The reply is a single summary:

```text
📦 BATCH · 2/2 ok

✅ 1 · /ideia Preciso ver sobre isso http://minha.com/?124
   ↳ 📝 #77 · #ideias · Preciso ver sobre isso http://minha.com/?124
✅ 2 · /ideia Quando puder ler o link sobre isso. http://g1.com/labala
   ↳ 📝 #78 · #ideias · Quando puder ler o link sobre isso. http://g1.com/labala
```

With `-dry` (or `-d`), nothing runs; it only shows how it split things:

```text
/batch -dry
📦 BATCH (2) · só a separação, nada executado

1. /ideia Preciso ver sobre isso (+2 linhas)
2. /ideia Quando puder ler o link sobre isso. (+1 linhas)
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
