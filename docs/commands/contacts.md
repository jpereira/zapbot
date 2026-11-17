# `/contacts` · owner

Exports your address book as a **single vCard 3.0 file** (`.vcf`) with name, number, company and about
of every contact (and the profile photos with `-p`), ready to import on **Android** (Google Contacts) and **iPhone**.
Only in **your own private chat**: the output is your whole address book.

| Option | Value | Description |
|---|---|---|
| *(none)* | | Shows this help |
| `-export`, `-e` | | Generates the `.vcf` with all the contacts (or only the ones matching the filter) and sends it here, as text only: name, number, company and about |
| `-photos`, `-p` | | With `-e`: includes the profile photos (slow: one download per contact, with a pause; cached in `cache/contacts`) |
| `-list`, `-l` | | Lists the contacts (name and number); more than 40 go in a `contacts-YYYYMMDD.txt` file |
| `-nocache`, `-n` | | With `-e -p`: downloads the photos for this export only, without reading or saving `cache/contacts` |
| `-refresh`, `-r` | | With `-e -p`: downloads the photos again, ignoring the cache |
| `-clear`, `-c` | | Deletes the photos saved in `cache/contacts` |

| Argument | Description |
|---|---|
| `[filter...]` | Part of the name or of the number, to narrow down the contacts. Several at once with `/Name/`: anyone matching any of them is included. Without it, all of them |

```text
/contacts -e -p
⏳ Exporting 312 contacts, please wait. Photos are downloaded slowly, so this may take a while.
📇 312 contacts · 🖼️ 241 with photo (0 from the cache) · 18.40 MB
```

```text
/contacts            → this help
/contacts -l Ana     → contacts with "Ana" in the name
/contacts -e         → all of them, text only, as contacts-YYYYMMDD.vcf (seconds)
/contacts -e -p      → with the profile photos (minutes)
/contacts -e -p -r   → downloads every photo again
/contacts -e -p -n                → exports with photos, without touching the photo cache
/contacts -clear                  → deletes the saved photos
```

- Each card has a fixed `UID` derived from the number (`zapbot-<number>`), so importing the file again
  updates the contact instead of duplicating it, **when the phone matches by UID**. Test with one
  contact first: Android and iPhone may still ask what to do with duplicates.
- The WhatsApp photo is not the one in your phone's address book, and the bot cannot write to the
  phone: you import the file there.
- Photos are kept in `cache/contacts` (also in the [backup](backup.md)) and reused for
  `contacts.cacheDays` days. Turn it off with `contacts.cache` or per export with `-n`.
- The download is slow on purpose (`contacts.delayMs` between photos). Contacts with the photo hidden
  by privacy are exported without it.
