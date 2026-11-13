# `/qr`

Makes the **QR Code** of a text, as a PNG image. With `-decode` it does the opposite and reads the QR
Code in a photo (the same as [`/decodeqr`](decodeqr.md)). The bot's own `qrcode` library makes it and
`jsqr` reads it: nothing goes to an external service.

```text
/qr [-decode|-d] [<text>]
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[<text>]` | The text of the QR Code, up to 1000 characters. Without it, uses the replied message's |
| `-decode`, `-d` | | Reads the QR Code in a photo instead of making one: reply to the photo, or send it with `/qr -d` as the caption |

```text
/qr https://example.com      → the QR Code of the link
/qr                          → replying to a text: its QR Code
/qr -d                       → replying to a photo: the text in its QR Code
```

- A photo with no readable QR Code gets a notice.
