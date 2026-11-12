# `/version`

Shows the same banner as `/uptime`, with the bot version (it is the same handler). It can also be
used inside an [`/alias`](alias.md) or [`/cron`](cron.md) with `{/version}`.

```text
/version
🤖 ZapBot 2.0.13 (devel) (git+7a89b92/HEAD)
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 dias, 3 horas
🔐 Conectado: 2 dias, 2 horas, 58 minutos
```

The `git+4465374/vX.Y.Z` says where the running code comes from: the commit and, after the `/`, its
**tag**. It applies with the tag checked out or on a branch that's at its commit (`main` right after
`bump.sh`, at the release commit). On a commit without a tag, `HEAD` shows up in its place, and the
version gets the **`(devel)`**: it's code that hasn't become a release yet (`main` between one bump
and the next release), so nobody mistakes it for the stable one:

```text
🤖 ZapBot X.Y.Z (git+4465374/vX.Y.Z)         → release X.Y.Z (tag checkout, or main at it)
🤖 ZapBot X.Y.Z (devel) (git+7a89b92/HEAD)  → a commit without a tag (e.g. main in development)
```

`(devel)` also shows up in `/bot -status`, in `/bot -info`, at the start of boot, in the startup
message, in emails and in backups.

Both are read from the project's `.git`, without `git`. The `.dockerignore` lets the image carry only
what's needed: `.git/HEAD`, the branch and tag refs, `packed-refs` and the `HEAD` reflog. That way,
each `docker compose build` records the commit and tag of the code that went into it, with no extra
step.

The `bump.sh` tags are *annotated*: the ref points to a git object, not to the commit, and the image
doesn't carry objects. That's why `bump.sh` runs `git pack-refs --all` when creating the tag,
recording each tag's commit in `.git/packed-refs` (a fresh clone already comes that way). After a
`git fetch --tags`, checking out the tag (`git checkout vX.Y.Z`) also resolves, through the reflog.
If `HEAD` still shows up on a tagged commit, run `git pack-refs --all` and rebuild. To build the
image another way (e.g. without `.git`), set `ZAPBOT_COMMIT` (`4465374` or `4465374/vX.Y.Z`; see
[Configuration](../configuracao.md)). With neither, only the version shows up.
