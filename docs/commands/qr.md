# `/qr`

Makes the **QR Code** of a text, as a PNG image. With `-decode` it does the opposite and reads the QR
Code in a photo. **Replying to a photo with `/qr`** (or sending a photo with `/qr` as the caption) reads it too, without
`-decode`; typed text always makes a QR Code. The bot's own `qrcode` library makes it and
`jsqr` reads it: nothing goes to an external service.

```text
/qr [-d|-d] [<text>]
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[<text>]` | The text of the QR Code, up to 1000 characters. Without it, uses the replied message's |
| `-decode`, `-d` | | Reads the QR Code in a photo instead of making one: reply to the photo, or send it with `/qr -d` as the caption. Automatic when you reply to a photo (or send one) with `/qr` and no text |

```text
/qr https://example.com      → the QR Code of the link
/qr                          → replying to a text: its QR Code
/qr -d                       → replying to a photo: the text in its QR Code
```

- A photo with no readable QR Code gets a notice.
