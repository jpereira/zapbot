# `/decodeqr`

Reads the **QR Code** in a photo and replies with its text. Reply to the photo, or send it with
`/decodeqr` as the caption. With `-encode` it does the opposite and makes the QR Code of a text (the
same as [`/qr`](qr.md)).

```text
/decodeqr [-encode|-e] [<text>]
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[<text>]` | With `-encode`, the text of the QR Code, up to 1000 characters (without it, the replied message's) |
| `-encode`, `-e` | | Makes the QR Code of the text instead of reading one |

```text
/decodeqr                    → replying to a photo: the text in its QR Code
/decodeqr -e https://example.com   → the QR Code of the link
```

- The text comes with a 📱 in front. A photo with no readable QR Code gets a notice.
