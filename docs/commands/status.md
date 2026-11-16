# `/status` · admin

Posts on the **WhatsApp Status** of the bot's account (the "stories"): a text or a photo/video with
a caption.

!!! warning "Risk of ban"
    Posting on the Status many times in a row is the kind of behavior WhatsApp punishes by banning
    the number. One post a day is fine; a loop is not. From `status.warnAfter` posts in 24 hours
    (default 3) the bot adds a warning to the reply. It doesn't block, so the call is yours.

| Option | Value | Description |
|---|---|---|
| *(text)* | `<text>` | The text of the Status (up to 700 characters) or the caption of the photo/video |

```text
/status Good morning, everybody! ☀️
📣 Posted on your Status.
```

## With a photo or video

Reply to a photo or a video (or send it with `/status` in the caption). What you write becomes the
caption:

```text
(replying to a photo of the sunset)
/status Sunday evening 🌇
📣 Posted on your Status.
```

```text
(sending a video with the caption)  /status New song, listen up
📣 Posted on your Status.
```

## Scheduled: `/cron -status`

The same Status, at a set time, with the `{/command}`s of the [`/cron`](cron.md) running when it is
posted:

```text
/cron 8h -r d -status Good morning! {/weather}
🗓️ Scheduled for Tue 17/11 08:00 🔁 daily to 👤 WhatsApp Status.
📝 Good morning! {/weather}
⚠️ Posting on the Status too often is what WhatsApp punishes with a ban: one a day is fine, many in a row is not.
```

```text
/cron 18h -status Training done 💪
```

`-status` doesn't take `-to`, `-private` or `-reminder` (the Status has no destination). The list
(`/cron -l`), `-pause`, `-resume`, `-rm` and `-test` work as with any item.

## Warnings

```text
/status Another one!
📣 Posted on your Status.
⚠️ That is 4 posts in 24 hours. Posting too much in a row is what WhatsApp punishes with a ban: slow down.
```

## What the bot does not do

- It doesn't **see or react to other people's statuses** (neither does it save them): automating that
  is what gets accounts banned the most.
- It doesn't repost anything on its own: every post comes from a `/status` or a `/cron -status` you
  wrote.

See also [`/profile -about`](profile.md#the-about-text--about), the note under your name.
