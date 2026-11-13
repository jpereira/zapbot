# `/carbon`

Draws code in an **image that looks like an editor window**, with colors for comments, strings,
numbers and keywords. It is made by the bot itself (SVG turned into PNG by `sharp`): no external
service, and the code doesn't leave the machine.

```text
/carbon [-theme|-t <dark|light>] <code>
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `<code>` | The code. It can have several lines, and the Markdown fence (` ``` `) is dropped. Without it, uses the replied message's. Up to 60 lines of 120 columns |
| `-theme`, `-t` | `<dark\|light>` | The color theme: `dark` (default) or `light`. Only counts at the start of the command (the rest is code) |

```text
/carbon console.log(42)
/carbon -t light print(42)
/carbon                      → replying to a message with code
```

- Tabs become 4 spaces; lines beyond the limit are cut.
- The highlight is simple (it doesn't know the language): `//` and `#` comments, strings, numbers
  and the most common keywords.
