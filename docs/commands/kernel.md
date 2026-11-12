# `/kernel`

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
