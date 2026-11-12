# `/pixelart` (`/ansi`, `/px`)

Random ANSI/ASCII art from [16colo.rs](https://16colo.rs/), the BBS art scene archive. The image
comes rendered by the site itself; title, artist, group and date come from the SAUCE record stored at
the end of the original file (without it, the caption carries the file name and the pack's year).

| Option | Value | Description |
|---|---|---|
| `-random`, `-r` | | Picks from any pack in the archive |
| `-year`, `-y` | `<ano>` | Picks from a pack of the year (e.g., 1996; from 1980 to the current year) |
| `pack` | | Pack name (e.g., `chuck-norris-lvl`). Without it, uses the `pixelart.packs` setting |

```text
/pixelart                    → from one of the packs in the pixelart.packs setting
/pixelart chuck-norris-lvl   → from the given pack
/pixelart -r                 → from any pack in the archive
/pixelart -y 1996            → from a 1996 pack
/px                          → same as /pixelart, via the alias
```

Example reply:

```text
[imagem da arte]
🎨 Chuck Norris
👤 lord jazz / ACiD
📦 chuck-norris-lvl (01/04/2021)
🔗 https://16colo.rs/pack/chuck-norris-lvl/LDJ-CHUCK.ANS
```

## Changing the packs

```text
/set pixelart.packs mimic100 blocktronics_space       → picks among these
/set -reset pixelart.packs                            → back to the default
```

Details:

- Pixel art suffers from WhatsApp's compression: the image is doubled without smoothing and sent in
  HD.
- Art taller than 4096 px goes in parts, up to the `pixelart.maxParts` setting (3, from 1 to 10);
  anything beyond that stays as a link only.
- With `-r`, `-y` or several packs in `pixelart.packs`, packs with no ANSI/ASCII art (only
  executables or texts) are swapped for another draw, up to 5 attempts.
- The full pack list for `-r` is downloaded at most once a day.
