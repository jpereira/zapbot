# `/cache` · admin

Shows the space used in `cache/` (database, media, temp files, backups) and cleans the cache. In the
command help (`/cache -h`) the paths appear in full (in Docker, `/app/cache` and `/app/cache/media`).

| Option | Description |
|---|---|
| `-all`, `-a` | Deletes **everything** in `cache/`: messages (including the ones kept for `/show`), edits, reactions, temp files, media downloaded to `cache/media` and the [`/backup`](backup.md) backups in `cache/backups`, and compacts the database. `/watch` hits, `/stats` counters, polls, price alerts and settings are kept |
| `-backup`, `-b` | Deletes the [`/backup`](backup.md) backups in `cache/backups` (the database stays as is) |
| `-clean`, `-c` | Removes only what is past the retention window (68 h, or `cache.messageRetentionHours` for regular message text and `cache.messageMediaRetentionHours` for media / `cache.revokedRetentionDays` for deleted / `cache.editedRetentionDays` for edited / `cache.reactionRetentionDays` for reactions / `watch.hitsRetentionDays` for `/watch` hits / `stats.retentionDays` for `/stats` counters / `enquete.retentionDays` for polls / 30 days for the [`/mute`](mute.md) notices; in `cache/tmp`, temp files older than 2 h and the [cached downloads](get.md#download-cache) from `/get` older than `get.cache.maxDays` days) |
| `-media`, `-m` | Deletes the media downloaded to `cache/media` (photos, videos, audio and documents kept to recover deleted messages). The messages stay: a deleted one recovered later says the file is no longer available |

```text
/cache           → lists the contents of cache/ and the total number of messages
/cache -clean        → normal cleanup (retention)
/cache -m        → media only
/cache -c -m     → normal cleanup and media
/cache -b        → backups only
/cache -a        → everything, including backups
```

Without options, it shows the first-level files and directories in alphabetical order. The size of
each directory includes its contents; the total adds up files and directories. The counts of
messages, deleted ones, edits and backups appear below the tree.

Example:

```text
🗂️ Exibindo conteúdo de /app/cache/*

├── 📁 backups/   118.33 KB
├── 📁 media/     404.77 MB
├── 📁 tmp/             0 B
└── zapbot.db     704.00 KB
───────────────────────────
Total:            405.57 MB

🗄️ 1150 mensagens no cache.
🗑️ 79 apagadas.
✏️ 3 edições.
😶 1 reação removida ou trocada.
📦 Backups: 3 (veja /backup).
```

`-a` leaves no backup behind: if you want to keep a copy first, use `/backup -s` (the file arrives
in your private chat). The `-c`, `-m` and `-b` options can be used together; `-a` overrides them.
