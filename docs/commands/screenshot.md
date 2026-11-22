# `/screenshot` `/ss` · admin

Role `admin`: only you and the extra admins. The owner can grant it to a person or group with
`/bot +u +cmd /screenshot` ([Delegating](index.md#delegating-an-admin-command)). It opens pages from **your
server**, so it is not for everyone by default.

Opens a page in the bot's own browser (the Chromium that already runs WhatsApp Web) and sends a **picture
of it**, with the page title and the final address (after redirects) in the caption. As in `/contacts` and
`/draw`, a `⏳` notice goes out first and becomes `🖼️ Screenshot below.` when the picture is ready.

```text
/screenshot [-full] [-mobile] [-wait <seconds>] [-pdf] <url>
```

| Option | Value | Description |
|---|---|---|
| *(none)* | `[<url>]` | The page address, with or without `http(s)://` (without it, the first link of the replied message) |
| `-full`, `-f` | | The whole page instead of the first screen (up to 16000 px of height) |
| `-mobile`, `-m` | | Phone-sized screen (390 x 844), so the site shows its mobile version |
| `-wait`, `-w` | `<seconds>` | Waits N seconds after the page loads (0 to 30), for animations and content that comes late |
| `-pdf`, `-p` | | Sends a PDF of the page instead of an image |

```text
/screenshot https://example.com
/ss -full -mobile example.com
/ss -pdf -wait 5 https://example.com/report
/screenshot                          → replying to a message with a link
```

## Safety

- Only **public** `http` and `https` pages. Addresses of the local network (`localhost`, `192.168.x.x`,
  `169.254.x.x`...) are refused, and so is **everything the page requests** from there (images, scripts,
  frames, redirects): a page cannot use the bot to reach your homelab.
- Each shot runs in an **isolated browser context**: no cookies, cache or storage shared with WhatsApp Web
  or with other shots.
- One shot at a time; if it takes longer than `screenshot.timeout`, it ends with an error.

## User-Agent

The browser identifies itself with the `screenshot.userAgent` setting. Empty (the default), it is the
Chromium's own User-Agent **without the "Headless"** that many sites refuse. To pretend to be another
browser: `/set screenshot.userAgent Mozilla/5.0 (...)`. The wait for the page is `screenshot.timeout`
(30 seconds by default).
