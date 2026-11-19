# `/alias` · admin

Saves shortcuts in the bot's database: for a command with arguments or for a text with several
`{/command}`, as in [`/cron`](cron.md#commands-in-the-text). The owner and admins register and remove
aliases. Whoever runs a shortcut needs permission for the target commands.

```text
/alias <name> [-quiet|-q] [-desc|-d "description"] </command arguments>
/alias <name> [-quiet|-q] [-desc|-d "description"] <text with {/command}>
/alias
/alias [-list|-l]
/alias <name>
/alias -move|-m <current name> <new name>
/alias -rm <name...|all>
```

| Option | Value | Description |
|---|---|---|
| `-quiet`, `-q` | | When running, omits the `🔗 Alias ...` header; works before or after the name |
| `-desc`, `-d` | `<text>` | Optional description in quotes, before the command or the text; without a command, updates only the description of an existing alias |
| `-list`, `-l` | | Lists the aliases; same as `/alias` without arguments. With only a name (`/alias /demo`), it shows what that alias does (description and command); if the name isn't an alias, it lists the ones with that text in the name (`/alias dol` finds `/dollar`, `/dollar2` and `/my.dol`; up to 10), or an error if none matches |
| `-examples`, `-ex` | `[<file>]` | Without a name, lists the example files (`examples/*.zb`: aliases ready to use). With a name, loads that file; an alias that already exists stays as it is, unless `-yes` (`-y`): then the file's definition replaces it (to apply a newer version of an example) |
| `-move`, `-m` | `<current name> <new name>` | Renames an alias, keeping command, description and quiet; the new name can't exist |
| `-rm` | `<name...\|all>` | Removes one or more aliases (separated by space or comma), with or without `/`; `all` removes all of them |

```text
/alias /demo -d "My dollar test" /stocks USD
/alias /name /crypto USD
/alias /demo2 /stocks EUR
/alias demo3 /stocks USDT
/alias money -d “Shows Money" /stocks
/alias -l
/alias /demo
/demo
/demo2
/help alias
/alias -m /demo /demo3
/alias /demo -d "New text"
/alias -rm /demo
/alias -rm demo2
/alias -rm demo demo2 /dollar
/alias -rm all
```

The list (`/alias -l`) shows each shortcut with its description (📝), the command it runs (→) and, with 🔇,
the ones that run without the `🔗 Alias ...` header (`-q`):

```text
🔗 *ALIASES* (4)

*/bitcoin* 🔇
→ /crypto BTC

*/dollar*
📝 Dollar price
→ /stocks USD

*/endereco* 🔇
📝 My address
→ /me
   Flower Street, 123
   Downtown, Rio de Janeiro - RJ

*/go* 🔇
→ /ascii -c # LET'S GO!

💡 *Tips*
/alias <name> </command args> creates
/alias -rm <name...> removes
🔇 = no header when running
```

The start of a saved name also completes (`/dol` runs `/dollar`, if it's the only match; with
several, the bot lists them).

The name accepts letters, numbers, `_`, `-` and `.` (`/alias my.command /me Hello`), with or without
the slash on registration and removal. To run it, use the slash: `/demo`. Registering the same name
again replaces its command and its description. Without `-desc`, the description is empty. The
description accepts straight or curly quotes, even mixed, like `-desc “Shows Money"`.

In a command alias, the target must be an active bot command, including its fixed aliases. It can't
be `/alias` or another registered shortcut. Bot command names are reserved, even when they're
disabled. The name `all` is also reserved and can't be registered. The target's arguments, quotes
and options are preserved.

Arguments typed when running are appended to the end of the saved command:

```text
/alias /dollar /stocks USD
/dollar -h                    → the /stocks help
```

### Parameters `$1`, `$N`

In a command alias, `$1`, `$2`... take the arguments typed when running, in order. The ones used
leave the list; the leftovers still go to the end of the command. A `$N` without an argument is
empty, unless it has a default value: `${N:-valor}`.

```text
/alias /rec /sticker -ss $1 -es $2
/rec 10 20 http://minhaurl/foo   → /sticker -ss 10 -es 20 http://minhaurl/foo

/alias /dollar /stocks ${1:-USD}
/dollar                           → /stocks USD
/dollar EUR                       → /stocks EUR

/alias nopt /forward ${1:--l} #nopt
/nopt                            → /forward -l #nopt
/nopt -dry                       → /forward -dry #nopt
```

`$@` (or `$*`) is **all** the typed arguments, in every place it appears, and nothing is left over to the end:
it is the one for a [`/batch`](batch.md) shortcut, where each line needs the whole text. `${@:-default}` is the
default when nothing is typed.

```text
/alias /vfazol /batch -q
  /tts -q -l -v amy $@
  /tts -q -l -v lessac $@
/vfazol DO THE L!           → both voices say "DO THE L!"
```

The default goes after `:-`, so a default that itself starts with `-` takes two hyphens: `${1:--l}`. The
phone keyboards change `--` into `—` (a long dash): the bot understands `${1:—l}` as `${1:--l}` and saves it fixed.

With `$N`, what's left of the arguments goes to the end of the command separated by a space, so the
text's line breaks become spaces. Without `$N`, the text goes as typed, line breaks included. To run
several shortcuts at once, see [`/batch`](batch.md).

Permissions, repeat control and command disabling are those of the target command. Whoever can use
`/gpt` (e.g., `/bot +u +cmd /gpt`) also uses every shortcut to it, without needing the shortcut to
be enabled separately; `/bot +cmd` doesn't accept a shortcut's name, only commands. In a text
shortcut, the person needs to be allowed every `{/command}`.
`/help alias` lists the shortcuts you can run, with the description and the saved command.
`/alias -h` or `/alias -help` shows the registration help. `/alias` without arguments or with
`-list`/`-l` lists all the registered shortcuts, including those of disabled commands.

Before running an alias, the bot prints the shortcut's name and the command that will be called,
including any additional arguments. For example:

```text
/alias /money -d "Shows the dollar price" /stocks USD
/money
```

The bot replies with the notice below and then with the result of `/stocks USD`:

```text
🔗 Alias /money -> /stocks USD
```

With `-quiet` (or `-q`), the header isn't printed and only the result shows up:

```text
/alias -q /haha /me Hahahahahahhahahaha vc e burro!
/haha  → Hahahahahahhahahaha vc e burro!
```

## A shortcut to forward

An alias for `/forward` turns "send this to my friends" into one reply: `/alias -q nopt /forward -q #nopt` and, from
then on, `/nopt` replying to a message (or `/nopt Look at this!` with a text of yours) sends it to everyone in the
`#nopt` list, with no header and no status. The whole step by step is in
[A shortcut for a group of friends](forward.md#a-shortcut-for-a-group-of-friends).

```text
/forward -add #nopt /Fulano/ /Lourival Neto/ /College Group/
/alias -q nopt /forward -q #nopt
(replying to something interesting)  /nopt Look at this!
```

## Shortcuts for quotes

The quotes ([`/crypto`](crypto.md) and [`/stocks`](stocks.md)) are the commands you call the most, so they make good
aliases: one word instead of `/crypto BTC`. With `-q`, only the quote shows up, without the `🔗 Alias ...` header:

```text
/alias -q /btc /crypto BTC
/alias -q /eth /crypto ETH
/alias -q /sol /crypto SOL            (the same for /solana: one alias per name you like)
/alias -q /xaut /crypto XAUT          → gold (the Tether Gold token)
/alias -q /mstr /stocks MSTR
/alias -q /dolar /stocks USD
/alias -q /euro /stocks EUR
/alias -q /usdt /stocks USDT
```

After that, `/btc`, `/xaut`, `/mstr`, `/dolar`... answer with the quote straight away. Two more ideas:

- **A few at once:** `/alias -q /cripto /crypto BTC ETH SOL XAUT` and `/alias -q /mercado /stocks USD EUR MSTR` bring the
  whole group in one message.
- **One alias for any coin or ticker**, with the [parameter](#parameters-1-n) `${1:-...}`:

```text
/alias -q /coin /crypto ${1:-BTC}
/coin                  → /crypto BTC
/coin eth              → /crypto ETH
/coin xaut             → /crypto XAUT

/alias -q /mkt /stocks ${1:-MSTR}
/mkt                   → /stocks MSTR
/mkt nvda              → /stocks NVDA
/mkt PETR4.SA          → /stocks PETR4.SA
```

## Example files (`.zb`)

The bot ships with `.zb` files in the `examples/` folder: the commands you would type here, saved in a
file. Each file is loaded **once**, on the first boot after it appears (the `alias.examples` setting
keeps which ones were loaded, so an alias you removed doesn't come back). To load one by hand, or to see
which exist: `/alias -examples` and `/alias -examples tts-voices`. An alias that already exists is never
overwritten by the first-boot load; by hand, `/alias -examples tts-voices -yes` replaces the existing ones with the file's
(use it when a newer version of an example comes).

```text
# a comment: a line that starts with #

/alias /dollar -d "Currency quote, USD by default" \
    /stocks ${1:-USD}

/alias /test.tts.voices /batch -q
    /tts -q -l -v amy $@
    /tts -q -l -v ryan $@
```

- A command starts at a line with no indentation that begins with `/`; the indented lines under it
  belong to it (as typed, like the lines of a [`/batch`](batch.md) shortcut).
- A `\` at the end of a line joins it with the next one (with a single space).
- A line that starts with `#` is a comment; to start a line with a literal `#`, write `\#`.
- Only the form `/alias [-q] <name> [-desc "text"] <command>` runs, so a file can only **define** shortcuts: `-rm`, `-move`, `-list`
  and the like are refused, and so is any other command. A file is limited to 128 KB and 200 aliases, and a symlink isn't read.
  Still, a `.zb` is trusted code (it creates shortcuts that anyone allowed can run): read a file before putting it in `examples/`.
- Only `/alias` blocks run, so a file can only define shortcuts. The ones that come are in
  [Ready-made shortcuts](#ready-made-shortcuts-examples).

## Ready-made shortcuts (`examples/`)

The `.zb` files that come with the bot are in the [`examples/`](https://github.com/jpereira/zapbot/tree/main/examples) folder on GitHub:

| File | What it has | Loaded |
|---|---|---|
| [`tts-voices.zb`](https://github.com/jpereira/zapbot/blob/main/examples/tts-voices.zb) | `/test.tts.voices` and `/test.tts.vozes`: a phrase in every local voice, one voice note each | on the first boot |
| [`shortcuts.zb`](https://github.com/jpereira/zapbot/blob/main/examples/shortcuts.zb) | `/dollar` (currency quote) and `/idea` (a note with `#ideas`) | on the first boot |
| [`my-shortcuts.zb`](https://github.com/jpereira/zapbot/blob/main/examples/my-shortcuts.zb) | The author's shortcuts, below (the addresses and the contacts were replaced by examples) | by hand only: `/alias -examples my-shortcuts` |

A file with `# @manual` in its first lines isn't loaded on the boot, only with `/alias -examples <name>`.

### The author's shortcuts (`my-shortcuts.zb`)

Most use `-q` (no "🔗 Alias" header). Take the whole file with `/alias -examples my-shortcuts` or copy just the lines you like.

**Quotes (crypto, stocks, DeFi)**

| Shortcut | Runs |
|---|---|
| `/bitcoio` | `/crypto BTC` |
| `/btc` | `/crypto BTC` |
| `/creptomoeda` | `/crypto` |
| `/dolar` | `/stocks USD` |
| `/eth` | `/crypto ETH` |
| `/euro` | `/stocks EUR` |
| `/gold` | `/crypto XAUT` |
| `/hype` | `/crypto HYPE` |
| `/mkt` | `/stocks ${1:-MSTR}` |
| `/mstr` | `/stocks MSTR` |
| `/sol` | `/crypto SOL` |
| `/solana` | `/crypto SOL` |
| `/taxas` | `/defi -fees` |
| `/usdt` | `/stocks USDT` |
| `/xaut` | `/crypto XAUT` |

**Banners with `/ascii`**

| Shortcut | Runs |
|---|---|
| `/arrombado` | `/ascii -w 60 -c # ARROMBADO!` |
| `/bora` | `/ascii -c # BORA!` |
| `/fazol` | `/ascii  FAZ O L!` |
| `/fazolp` | `/ascii -c # FAZ O L\nPORRA!` |
| `/fodase` | `/ascii -c # FODA-SE!` |
| `/fuck` | `/ascii -w 60 FUCK\nTHE\nPRIVACY!` |
| `/fuckyou` | `/ascii -w 60 -c # FUCK YOU!` |
| `/partiu` | `/ascii -c # PARTIU!` |
| `/recua` | `/ascii RECUA  - FACISTE!` |
| `/viado` | `/ascii -c # VIADO` |

**Translations**

| Shortcut | Runs |
|---|---|
| `/en` | `/translate -p en $1` |
| `/toen` | `/translate -p en` |
| `/toes` | `/translate -p es` |
| `/topt` | `/translate -p pt` |
| `/txt2en` | `/translate -p en` |
| `/txt2es` | `/translate -p es` |
| `/txt2pt` | `/translate -p pt` |

**Notes**

| Shortcut | Runs |
|---|---|
| `/ideias` | `/notes #ideias` |
| `/n` | `/notes` |
| `/pt` | `/notes #pt $1` |

**Voice (`/tts` and `/gpt -voice`)**

| Shortcut | Runs |
|---|---|
| `/gptvoz` | `/gpt -voice` |
| `/tovoz` | `/gpt -voice` |
| `/tuga` | `/tts -q -l -v tugão $@` |
| `/tuga.btc` | `/tts -q -sp 75 -l -v tugão $@ {/crypto -q BTC}` |
| `/vf` | `/batch -q` + `/tts -q -l -v $@` with the voices tugão, cadu, edresson, faber |
| `/vfazol` | `/batch -q` + `/tts -q -l -v $@` with the voices cadu, edresson, faber |

**Debug (`/debug`)**

| Shortcut | Runs |
|---|---|
| `/dbg.off` | `/debug -off` |
| `/dbg.on` | `/debug -on -level 1` |
| `/dbg.on2` | `/debug -on -level 2` |
| `/dbg.on3` | `/debug -on -level 3` |

**Sending (`/me`, `/forward`) and others**

| Shortcut | Runs |
|---|---|
| `/end.home` | `/me` + the address text |
| `/end.work` | `/me` + the address text |
| `/flood` | `/me  -r 30 $1` |
| `/funny` | `/forward -q /Contact 1/ /Contact 2/ /Contact 3/` |
| `/gptusage` | `/gpt -usage` |
| `/haha` | `/me -r 15 AHHAhaₕₐₐₕahAHHAhaₕₐₐₕah` |
| `/nopt` | `/forward -q #nopt` |
| `/nopt.add` | `/forward -add #nopt` |
| `/rec` | `/sticker -ss $1` |
| `/sts` | `/sticker -ss` |

## Text with commands

When what comes after the name (and the description) doesn't start with `/`, the alias stores a
text. Each `{/command args}` in it runs at the moment the alias is called, and the reply goes in
its place, as in the [`/cron` commands in the text](cron.md#commands-in-the-text). A single message
comes out, with all the replies. A typed `\n` becomes a line break, and the spaces around it are
removed.

```text
/alias name2 Checking Orca {/defi orca}\n Checking Prjx {/defi prjx}
/alias goodmorning -d "Morning summary" Good morning! ☀️ {/weather Recife}\nExchange: {/stocks USD EUR}\nCrypto: {/crypto BTC ETH}
/alias wallet {/defi orca}\n{/defi prjx}\n{/defi morpho}\n{/defi aave}
/alias risk Critical CVEs: {/cve -highscore}
```

`/name2` runs `/defi orca` and `/defi prjx` and replies:

```text
🔗 Alias /name2 -> /defi orca, /defi prjx
```

```text
Checking Orca

🌊 Orca · SOL/cbBTC · fee 0.16%
   ...

Checking Prjx

🌊 Project X · UBTC/USD₮0 · fee 0.05%
   ...
```

- The commands run in the chat where the alias was called, with the permissions of whoever called
  it. If the person can't use one of them, the whole alias doesn't run: a command above their
  level, like `/defi`, makes the alias be silently ignored, and a command outside their rule
  (`/bot -cmd`) shows the limit notice. `/help alias` only lists the aliases in which they can use all the commands.
- The same query commands as `/cron` run (`/stocks`, `/crypto`, `/cve`, `/defi`, `/weather`...),
  without the options that change something, like `/crypto`'s `-add`. They're checked on
  registration: one that doesn't exist or doesn't run in the text errors right away.
- A multi-line reply becomes a paragraph, with a blank line before and after; a single-line one
  stays in the sentence. Media (`/meme`, `/giphy`) comes out after the text.
- Arguments typed when calling a text alias are ignored.
- The text needs at least one `{/command}`; without any, the registration is refused.
- The `{/command}` can be another command alias (with `$N`), but not a text alias.
