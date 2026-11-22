# `/kernel`

> ⚠️ **Disabled by default.** `/kernel` comes turned off (it is in the `commands.disabled` setting, see [`/set`](set.md)): it is not in
> `/help` and, for you and the admins, the bot answers `🚫 The /kernel is disabled. To turn it on: /set -rm commands.disabled kernel`.
> To turn it on, send `/set -rm commands.disabled kernel` (the three at once: `/set -rm commands.disabled kernel cve walissu`,
> or `/set commands.disabled ""` for none disabled). To turn it off again: `/set -a commands.disabled kernel`.

Mainline, stable and longterm versions published at `kernel.org/releases.json` (up to 6 lines, in
kernel.org order), with the release date of each one.

Illustrative example of a reply:

```text
/kernel
🐧 Linux 7.2.8 (latest stable)

mainline  7.3-rc5      2026-09-27
stable    7.2.8        2026-09-25
stable    7.1.13       2026-09-02
longterm  6.18.54      2026-09-25
longterm  6.12.111     2026-09-21
longterm  6.6.157      2026-09-14
```

If kernel.org doesn't respond, the bot says so: `❌ I couldn't query kernel.org right now.`
