# `/ascii`

The text in big ASCII letters, in a code block (monospaced on WhatsApp). The letters are 3 columns
wide and 5 rows tall, and the text wraps into several rows of letters to fit on a phone screen: 30
columns by default.

```text
/ascii [-width|-w <columns>] [-char|-c <character>] <text>
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `<text>` | Up to 40 characters (`\n` breaks the line): letters (no accents), numbers and `! ? . , : - + _ /`. Uppercase and lowercase come out the same; anything without a drawing is ignored. Without text, uses the replied message's |
| `-width`, `-w` | `<columns>` | Columns per row of letters, from 10 to 60 (default 30) |
| `-char`, `-c` | `<character>` | The character for the letter strokes (default: setting `ascii.defaultChar`, `#`) |

```text
/ascii Jorge!
/ascii -w 20 Happy birthday
/ascii -c @ Hi
/ascii Jorge\nPereira
```

```text
/ascii Jorge!
```

```text
  # ### ##   ## ### #
  # # # # # #   #   #
  # # # ##  # # ##  #
# # # # # # # # #
 #  ### # #  ## ### #
```

Long texts wrap into several rows of letters, separated by a blank line:

```text
/ascii Happy birthday
```

```text
# #  #  ### ### # #    ##  ###
# # # # # # # # # #    # #  #
### ### ### ###  #     ##   #
# # # # #   #    #     # #  #
# # # # #   #    #     ##  ###

##  ### # # ##   #  # #
# #  #  # # # # # # # #
##   #  ### # # ###  #
# #  #  # # # # # #  #
# #  #  # # ##  # #  #
```

Errors: no text (and no replied message) shows the usage; more than 40 characters, `-width` outside
10 to 60 and `-char` with more than one character are rejected; a text with nothing drawable
(e.g. `#$%`) replies `❌ Nada para desenhar`.

It doesn't depend on an external service and can be used inside an [`/alias`](alias.md) or
[`/cron`](cron.md) with `{/ascii Hi}`. Inside them the `-width` and `-char` options are not
accepted: use the `ascii.defaultChar` setting instead.
