# `/alias` · admin

Saves shortcuts in the bot's database: for a command with arguments or for a text with several
`{/comando}`, as in [`/cron`](cron.md#commands-in-the-text). The owner and admins register and remove
aliases. Whoever runs a shortcut needs permission for the target commands.

```text
/alias <nome> [-quiet|-q] [-desc|-d "Descrição"] </comando argumentos>
/alias <nome> [-quiet|-q] [-desc|-d "Descrição"] <texto com {/comando}>
/alias
/alias [-list|-l]
/alias <nome>
/alias -move|-m <nome atual> <novo nome>
/alias -rm <nome...|all>
```

| Option | Value | Description |
|---|---|---|
| `-quiet`, `-q` | | When running, omits the `🔗 Alias ...` header; works before or after the name |
| `-desc`, `-d` | `<text>` | Optional description in quotes, before the command or the text; without a command, updates only the description of an existing alias |
| `-list`, `-l` | | Lists the aliases; same as `/alias` without arguments. With only a name (`/alias /eita`), it shows what that alias does (description and command); if the name isn't an alias, the bot replies with an error |
| `-move`, `-m` | `<current name> <new name>` | Renames an alias, keeping command, description and quiet; the new name can't exist |
| `-rm` | `<name...\|all>` | Removes one or more aliases (separated by space or comma), with or without `/`; `all` removes all of them |

```text
/alias /eita -desc "Meu teste para dólar" /rates USD
/alias /nome /crypto USD
/alias /eita2 /rates EUR
/alias eita3 /rates USDT
/alias dimdim -desc “Exibe Dinheiro" /rates
/alias -l
/alias /eita
/eita
/eita2
/help alias
/alias -move /eita /eita3
/alias /eita -d "Novo texto"
/alias -rm /eita
/alias -rm eita2
/alias -rm eita eita2 /dolar
/alias -rm all
```

The start of a saved name also completes (`/dol` runs `/dolar`, if it's the only match; with
several, the bot lists them).

The name accepts letters, numbers, `_`, `-` and `.` (`/alias meu.comando /me Olá`), with or without
the slash on registration and removal. To run it, use the slash: `/eita`. Registering the same name
again replaces its command and its description. Without `-desc`, the description is empty. The
description accepts straight or curly quotes, even mixed, like `-desc “Exibe Dinheiro"`.

In a command alias, the target must be an active bot command, including its fixed aliases. It can't
be `/alias` or another registered shortcut. Bot command names are reserved, even when they're
disabled. The name `all` is also reserved and can't be registered. The target's arguments, quotes
and options are preserved.

Arguments typed when running are appended to the end of the saved command:

```text
/alias /dolar /rates USD
/dolar -h                    → the /rates help
```

### Parameters `$1`, `$N`

In a command alias, `$1`, `$2`... take the arguments typed when running, in order. The ones used
leave the list; the leftovers still go to the end of the command. A `$N` without an argument is
empty, unless it has a default value: `${N:-valor}`.

```text
/alias /rec /sticker -ss $1 -es $2
/rec 10 20 http://minhaurl/foo   → /sticker -ss 10 -es 20 http://minhaurl/foo

/alias /dolar /rates ${1:-USD}
/dolar                           → /rates USD
/dolar EUR                       → /rates EUR
```

With `$N`, what's left of the arguments goes to the end of the command separated by a space, so the
text's line breaks become spaces. Without `$N`, the text goes as typed, line breaks included. To run
several shortcuts at once, see [`/batch`](batch.md).

Permissions, repeat control and command disabling are those of the target command. Whoever can use
`/gpt` (e.g., `/bot +u +cmd /gpt`) also uses every shortcut to it, without needing the shortcut to
be enabled separately; `/bot +cmd` doesn't accept a shortcut's name, only commands. In a text
shortcut, the person needs to be allowed every `{/comando}`.
`/help alias` lists the shortcuts you can run, with the description and the saved command.
`/alias -h` or `/alias -help` shows the registration help. `/alias` without arguments or with
`-list`/`-l` lists all the registered shortcuts, including those of disabled commands.

Before running an alias, the bot prints the shortcut's name and the command that will be called,
including any additional arguments. For example:

```text
/alias /dimdim -desc "Exibe o preço do dólar" /rates USD
/dimdim
```

The bot replies with the notice below and then with the result of `/rates USD`:

```text
🔗 Alias /dimdim -> /rates USD
```

With `-quiet` (or `-q`), the header isn't printed and only the result shows up:

```text
/alias -q /haha /me Hahahahahahhahahaha vc e burro!
/haha  → Hahahahahahhahahaha vc e burro!
```

## Text with commands

When what comes after the name (and the description) doesn't start with `/`, the alias stores a
text. Each `{/comando args}` in it runs at the moment the alias is called, and the reply goes in
its place, as in the [`/cron` commands in the text](cron.md#commands-in-the-text). A single message
comes out, with all the replies. A typed `\n` becomes a line break, and the spaces around it are
removed.

```text
/alias nome2 Verificando Orca {/defi orca}\n Verificando Prjx {/defi prjx}
/alias bomdia -d "Resumo da manhã" Bom dia! ☀️ {/weather Recife}\nCâmbio: {/rates USD EUR}\nCripto: {/crypto BTC ETH}
/alias carteira {/defi orca}\n{/defi prjx}\n{/defi morpho}\n{/defi aave}
/alias risco CVEs críticas: {/cve -highscore}
```

`/nome2` runs `/defi orca` and `/defi prjx` and replies:

```text
🔗 Alias /nome2 -> /defi orca, /defi prjx
```

```text
Verificando Orca

🌊 Orca · SOL/cbBTC · fee 0.16%
   ...

Verificando Prjx

🌊 Project X · UBTC/USD₮0 · fee 0.05%
   ...
```

- The commands run in the chat where the alias was called, with the permissions of whoever called
  it. If the person can't use one of them, the whole alias doesn't run: a command above their
  level, like `/defi`, makes the alias be silently ignored, and a command outside their rule
  (`/bot -cmd`) shows the limit notice. `/help alias` only lists the aliases in which they can use all the commands.
- The same query commands as `/cron` run (`/rates`, `/crypto`, `/cve`, `/defi`, `/weather`...),
  without the options that change something, like `/crypto`'s `-add`. They're checked on
  registration: one that doesn't exist or doesn't run in the text errors right away.
- A multi-line reply becomes a paragraph, with a blank line before and after; a single-line one
  stays in the sentence. Media (`/meme`, `/giphy`) comes out after the text.
- Arguments typed when calling a text alias are ignored.
- The text needs at least one `{/comando}`; without any, the registration is refused.
- The `{/comando}` can be another command alias (with `$N`), but not a text alias.
