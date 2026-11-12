# Recording the demo

Script for recording the bot working for real, with real commands, in short scenes. Each scene has
the messages ready to paste into the bot's chat. The finished GIFs are in the
[Demo](demonstracao.md).

## Before recording

- Use a chat just for the recording (your private chat with the bot or a test group) and close the
  other conversations in the WhatsApp sidebar.
- The commands are owner commands: record on your own account (see [`/whois`](comandos/whois.md)).
- `-mask` hides phone numbers in `/block`, `/bot`, `/profile`, `/search`, `/show` and `/watch`, and
  wallets in `/defi`. Always use it when the command accepts it.
- **Without `-mask`:** `/monitor`, `/join -l`, `/leave -l` and `/stats` show contact and group names.
  Record in a test chat and blur or cut those scenes if they contain your data.
- Replace the links, names and numbers in the examples with your own (or with test data).
- Increase the font size of the WhatsApp window (`Cmd +`) so the caption is readable in the GIF.

## Recording

Record only the WhatsApp window area. The app doesn't expose the window ID to AppleScript, so get the
position and size through System Events (macOS may ask the terminal for Accessibility permission) and
pass them to `screencapture -R`:

```bash
osascript -e 'tell application "System Events" to tell process "WhatsApp" to get {position, size} of window 1'
# 421, 34, 1307, 1083  →  x, y, width, height
screencapture -v -R421,34,1307,1083 cena-01.mov   # Ctrl+C stops
```

To get only the conversation, add the width of the contact list to `x` and subtract the same value
from the width. To convert to a GIF (or a light MP4), use
[`scripts/gif.sh`](https://github.com/jpereira/zapbot/blob/main/scripts/gif.sh):

```bash
scripts/gif.sh cena-01.mov            # generates cena-01.gif (720 px wide, 12 fps)
scripts/gif.sh cena-01.mov 560 10     # width and fps
scripts/gif.sh cena-01.mov 560 10 33  # crops 33% from the left (the contact list)
```

The 4th argument crops the strip on the left so only the conversation with the bot remains. Adjust
the percentage until the list is gone (its width varies with the window size) and check the GIF
before publishing. The safest is not to record the list at all: use `-R` on the conversation area
only.

Tip: one scene per file. Wait for the reply to arrive before sending the next command.

## Sequence

### 1. Warm-up

```text
/ping
/version
/help
/help get
```

### 2. Recovering what was deleted: `/show`

Ask someone (or another account of yours) to send a message and delete it, then:

```text
/show -mask
/show -3 -mask
/show -2 -e -mask
/show -s -mask
```

### 3. Who's online: `/monitor`

```text
/monitor
/monitor -add /Fulano/ -alerta
/monitor
```

Without `-mask`: use a test contact.

### 4. Joining and leaving groups: `/join` and `/leave`

```text
/join -info https://chat.whatsapp.com/<codigo-de-um-grupo-de-teste>
/join https://chat.whatsapp.com/<codigo-de-um-grupo-de-teste>
/join -l
/leave -l
/leave 1
```

Without `-mask`: `-l` lists your groups. Do the scene with few groups, only the test ones.

### 5. Stickers: `/sticker`

```text
/sticker -txt "Bom dia!"
/sticker -txt "Partiu praia?" -bg "#2980B9" -fg "#FFFFFF"
```

Then, reply to a photo of yours with:

```text
/sticker
/sticker -pos topo
```

### 6. Downloading videos: `/get`

```text
/get https://www.instagram.com/reel/<codigo>/
/get -a https://youtu.be/<id>
/get -sticker -ss 3 -es 6 https://youtu.be/<id>
```

### 7. Quotes: `/crypto`

```text
/crypto
/crypto btc eth
/crypto -l
```

### 8. DeFi: `/defi`

Always with `-mask` (hides balances and wallets):

```text
/defi -mask
/defi -taxas -mask
/defi -taxas -alerta -mask
```

### 9. Scheduling messages: `/cron`

```text
/cron 1m Oi do futuro!
/cron
/cron -r diario 8h Bom dia!
/cron
```

See the options (`-to`, `-repetir`, removing) in [`/cron`](comandos/cron.md).

### 10. Watching messages: `/watch`

```text
/watch /pix/i -in /Fulano/ -mask
/watch -mask
/watch -10 -mask
```

Send a "pix" from the other account and show the alert arriving in your private chat.

### 11. Statistics: `/stats`

```text
/stats
/stats -30
/stats -me
/stats -l
```

Without `-mask`: in a public recording, pick a test group.

### 12. Wrapping up: `/batch` and `/alias`

A shortcut that runs several commands at once:

```text
/alias demo -desc "Mostra o bot em ação" /ping
/demo
/batch /uptime
/crypto btc
```

## Redoing the GIFs

The GIFs live in `docs/assets/demo/`. The `.mov` files don't go to git (they're in `.gitignore`). To
generate them again from the recording:

```bash
scripts/gif.sh docs/assets/demo/05-sticker.mov 900 15
```

Today's GIFs use `900 15`. For a smaller file, lower the width or the fps (`/get`, the biggest one,
is the heaviest).
