# `/ascii`

The text in big ASCII letters, in a code block (monospaced on WhatsApp). The letters are 3 columns
wide and 5 rows tall, and the text wraps into several rows of letters to fit on a phone screen: 30
columns by default.

```text
/ascii [-width|-w <colunas>] [-char|-c <caractere>] <texto>
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `<texto>` | Up to 40 characters (`\n` breaks the line): letters (no accents), numbers and `! ? . , : - + _ /`. Uppercase and lowercase come out the same; anything without a drawing is ignored. Without text, uses the replied message's |
| `-width`, `-w` | `<colunas>` | Columns per row of letters, from 10 to 60 (default 30) |
| `-char`, `-c` | `<caractere>` | The character for the letter strokes (default: setting `ascii.defaultChar`, `#`) |

```text
/ascii Jorge!
/ascii -w 20 Feliz aniversario
/ascii -c @ Oi
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
/ascii Feliz aniversario
```

```text
### ### #   ### ###     #  ##
#   #   #    #    #    # # # #
##  ##  #    #   #     ### # #
#   #   #    #  #      # # # #
#   ### ### ### ###    # # # #

### # # ### ##   ##  #  ##
 #  # # #   # # #   # # # #
 #  # # ##  ##   #  ### ##
 #  # # #   # #   # # # # #
###  #  ### # # ##  # # # #

### ###
 #  # #
 #  # #
 #  # #
### ###
```

It doesn't depend on an external service and can be used inside an [`/alias`](alias.md) or
[`/cron`](cron.md) with `{/ascii Oi}`.
