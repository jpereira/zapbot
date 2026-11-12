# Development

## Docker (Makefile)

There's a single service, `zapbot` from `docker/docker-compose.yml`, which uses `config/.env`. The
`Makefile` has shortcuts for it:

```bash
make help    # lists all targets
make build   # builds the zapbot image
make deploy  # build + (re)creates the container
make shell   # shell inside the container
make clean   # removes the zapbot container and image
make recreate # clean + build without cache + brings up a fresh instance (volumes intact)
make destroy # clean + deletes the volumes (WhatsApp session and cache!)
make docs    # local documentation site (see Documentation)
```

The targets don't show the commands they run. To debug, `Q=` (or `V=1`) shows all of them,
including the ones from internal calls to other targets:

```bash
make Q= DOCK_REMOTE=1 deploy   # shows every docker command executed
make V=1 check               # the same, with V=1
```

The destination of the Docker operations and tests is selected by `DOCK_REMOTE`: `0` (default) uses
this machine's Docker; `1` uses the remote server's. The service is always `zapbot`. The address and the context accept values from the environment or the command line:

```bash
make test                    # tests of the local checkout
make DOCK_REMOTE=1 test      # tests of the image running on the homelab
make DOCK_REMOTE=1 deploy      # build + recreates the remote bot
make DOCK_REMOTE=1 recreate  # the same, but with the image rebuilt from scratch (no cache)
make DOCK_REMOTE=1 logs      # remote bot logs
make DOCK_REMOTE=1 shell     # shell inside the remote bot
make DOCK_REMOTE=1 DOCKER_REMOTE_SERVER=ssh://root@homelab.local REMOTE_CONTEXT=homelab test

export DOCK_REMOTE=1
export DOCKER_REMOTE_SERVER=ssh://root@homelab.local
export REMOTE_CONTEXT=homelab
make test                    # remote, using the exported variables
make DOCK_REMOTE=0 test      # local, even with DOCK_REMOTE=1 in the environment
```

`DOCKER_REMOTE_SERVER` defaults to `ssh://root@homelab.local`; `REMOTE_CONTEXT`, to `homelab`;
and `LOCAL_CONTEXT`, to `default`. The context name is not part of the SSH address. Setting only the
address or the context does not enable remote mode: use `DOCK_REMOTE=1`. Each Docker command passes
the context explicitly, without switching the global context. The `context` target creates the remote
context or updates its address when it differs from `DOCKER_REMOTE_SERVER`.

In remote mode, `test` and `test.coverage` use the code of the deployed image, without sending the
local checkout, building or restarting the bot. Database, network and WhatsApp are simulated; the
bot's session and cache are not used by the tests. `TEST_ARGS` and `DEBUG_TESTES` are also passed to
the tests in the remote container.

`deps`, `lint`, `check` and `docs*` always work on the local checkout. `check` validates lint, local
tests and documentation, regardless of the destination. `clean` removes the container and the image
of the selected environment, preserving the volumes, and deletes the build cache of the selected
Docker context. `destroy` also removes the volumes: the session and the cache are lost, and a new
`deploy` asks for the QR Code. `prune` cleans up media and messages.

## Code structure

`app.js` only does the bootstrap (loads the `.env`, prepares the database, creates the client,
registers the events and starts the periodic tasks). The code lives in `src/`:

```text
app.js                  bootstrap, in initialization order
src/
  constantes.js         directories, time windows, external binaries
  telefoneBot.js        configured number and the bot's identification on WhatsApp
  versao.js             the version with the commit and tag (or HEAD and the (devel)) that are running, read from .git
  estado.js             connection state, shared between modules
  log.js                colored print* (and the line for unknown commands)
  debug*.js             context, instrumentation, regex, log data and copy to chats
  db.js                 SQLite (dbGet/dbAll/dbRun) and the dbPronto signal
  inicializacao.js      tables + settings loading
  settings.js           SETTINGS_SCHEMA, getSetting/setSetting and validation of persisted values
  botConfig.js          the commands (src/comandos/comandos.js) loaded and checked at boot
  roles.js              the command roles (USER, ADMIN, OWNER) and the most restrictive of several
  executar.js           what every command does before the handler: read the options, what each one can do (role and outrosChats) and the context
  cliente.js            whatsapp-web.js client, the mark on the bot's sent messages and concluirAviso (the "Processando…" or the question becomes the conclusion)
  conexao.js            QR Code, connection events, restart and watchdog
  backup.js             database backup (/backup): creation, daily, retention and restore
  email.js              SMTP and email alerts
  enquetes.js           poll votes (vote_update) and the /poll -r scoreboard
  heartbeat.js          proof of life for the Docker HEALTHCHECK
  processo.js           crash and signals (docker stop)
  limpeza.js            retention and periodic cleanup
  stats.js              /stats counters
  status.js             /bot -status report and the daily send (via the schedule)
  sistema.js            /bot -info: versions (Node.js, whatsapp-web.js, Chromium, yt-dlp, ffmpeg...), the new ones and the system
  moedas.js, cotacoes.js, alertasPreco.js   /crypto, /rates and price alerts
  aliases.js            resolution, listing and execution (of the text ones) of the shortcuts persisted in the database
  agenda.js             /cron (and /lembrete): reading, list and send on time
  notas.js              /notes: notes, #tags (and the description), images, the -export PDF and the -alerta (a notice at a date/time, once)
  diagnostico.js        /bot -test: the test battery (cache, disk, database, WhatsApp, internet, speed, SMTP...)
  imap.js               /bot -flush-email: minimal IMAP client (logs in and empties Sent and Trash)
  comandosNoTexto.js    the {/command} and the \n in the text (/cron and /alias): checked on creation and run on send
  midia.js              /get and /sticker: the ffmpeg arguments, the sticker crop (sharp) and the link preview
  stickerTexto.js       /sticker -txt: the PNG frames (sharp) and the animated WebP (ffmpeg)
  openai.js             models accepted by /gpt
  openaiChat.js         call to the OpenAI chat (/gpt and /tldr) and the status footer (bytes, tokens, cost)
  i18n.js               t('key', {vars}) and the bot's language (setting zapbot.lang)
  locales/              en_US.js and pt_BR.js (the catalogs) and pt_BR/definicoes/ (the Portuguese text of each command)
  login.js              /bot -login: the password (scrypt) that turns an outsider into an admin
  monitor.js, monitorHistorico.js, presenca.js   /monitor: contacts, history and one presence query at a time
  contatos.js, opcoes.js                    contacts/@lid and the option parser
  destinos.js           the -to/target: contact or group by name, mention (@), number or email, and sending to the destination
  escolhas.js           the numbered list to choose from (several contacts/groups) and the yes/no confirmation (only from whoever gave the command)
  flood.js              flood protection (the same command beyond the limit: one notice and then silence)
  permissoes.js         who uses the commands (user, delegated admin), and which ones (bot.users, +cmd|-cmd)
  mudo.js               /mute: who is muted, the suppressed notices and the origin of each notice
  defi/                 Solana, HyperEVM, Aptos and EVM (RPC, indexer, Multicall3), Orca, Project X, Liquidswap, Morpho and Aave V3 (/defi) and the out-of-range -alerta
  watch/                /watch rules and checking
  eventos/              message_create, deleted, edited, reactions
  comandos/             comandos.js (loads definicoes/), one file per command,
                        index.js (HANDLERS) and base.js (help and utilities)
  comandos/definicoes/  the definition of each command (cmd, options, role...), one file per command, with the text in English
  comandos/localizar.js the command text in the bot's language (merges locales/pt_BR/definicoes/<cmd>.json)
  comandos/openaiComum.js  what /gpt and /draw share: the "Processing" notice, the status footer and the model switch
  comandos/draw.js      /draw (and the image/GIF of /gpt -img, -gif)
  util/                 files, formatting, typed dates (quando.js), PDF (pdf.js), external processes, URLs
tests/                  automated tests (see Tests)
```

The [`/debug`](comandos/debug.md) instrumentation is installed after the `.env`, before the bot's
modules. It wraps the functions exported from `src/` during the CommonJS load, preserving
synchronous returns, promises and `this`. Function traces start at level `1`; Axios, SMTP,
processes and WhatsApp methods are at `2`; database queries and results, at `3`. The per-execution
context uses `AsyncLocalStorage` to keep the chat and the call depth. The log module applies the
filter and the credential masking before the console and the copy queue.

## Tests

The tests use Node's own test runner (`node:test`), with no extra dependency. Outside Docker they
need **Node 22.13 or newer** (because of `node:sqlite`) and the dependencies installed
(`make deps`); in the container (`make shell`) just run `make test`.

```bash
make deps                                  # installs the dependencies from package-lock.json
make test                                  # the whole suite
make lint                                  # ESLint (eslint.config.js)
make test TEST_ARGS=--test-name-pattern=mask  # filters by test name
DEBUG_TESTES=1 make test                    # shows the bot log during the tests
make test.coverage                          # coverage of src/
make docs.build                            # documentation in strict mode
make check                                 # lint + tests + documentation
make DOCK_REMOTE=1 test                     # tests of the image running on the server
```

On GitHub, the **Testes** workflow (`.github/workflows/ci.yml`) runs `make lint`, `make test` and
`make docs.build` on every push to `main` and on every pull request; the badge at the top of the
README and of the home page shows the result of the last run.

Two new-version notices live on GitHub:

- **Dependabot** (`.github/dependabot.yml`): every Monday morning, opens PRs with the new versions
  of the npm dependencies (the development ones in a single PR) and of the Docker base image
  (`docker/app`). Left out are `whatsapp-web.js`, which is a pinned commit of `main` (the
  [`/bot -info`](comandos/bot.md#system-information) reports its news), and the Node major
  switch, which is manual.
- **yt-dlp** (`.github/workflows/yt-dlp.yml`): every day at 09:00, checks the latest version on PyPI
  and, if it's new, opens the issue "yt-dlp X disponível", with the commands to rebuild the image,
  and closes the one for the previous version. The image installs the latest on every build: the
  notice is to let you know when to rebuild.

When a security alert is on an indirect dependency that still asks for the vulnerable version, the
fix goes in the `overrides` of `package.json`, which forces the version in the lock. Right now
there's one:

- `basic-ftp` `^6.2.1` ([GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r)):
  comes from `whatsapp-web.js → puppeteer → … → get-uri`, which still asks for `^5.3.1`. Remove the
  override when `get-uri` starts accepting 6 (`npm ls basic-ftp` shows who asks for what).

Nothing leaves the machine: `tests/helpers/ambiente.js` swaps out, before loading the bot, WhatsApp
(a fake client that keeps what the bot sent), SQLite (in memory), the network (`axios` with
responses registered per URL; a URL without a response fails the test), SMTP, `yt-dlp`/ `ffmpeg`
and `sharp`. The database and media live in a temporary folder (`ZAPBOT_CACHE_DIR`), never in
`cache/`.

Messages go through the real `message_create` (recording, `/stats`, `/watch`, permissions and the
option parser), and the test fails if the bot logs an unexpected error. `tests/helpers/bot.js` has
the shortcuts: `bot.responder('/show -2')` returns what the bot replied, `bot.apagar(msg)` and
`bot.editar(msg, 'novo')` fire the events, `bot.reiniciar()` clears everything between cases.
The messages the bot sends have whatsapp-web.js's `edit()`: it swaps the text in place (with
`editada: true`) and fires `message_edit`; with `bot.client.recusarEdicao = true`, it returns
`null`, as when WhatsApp doesn't allow editing.

| File | What it covers |
|---|---|
| `agenda.test.js` | Typed dates (`6h`, `+2h`, `às 18h`, `sexta`...) and `/cron`, in message and reminder modes, with several `-to` in a single item, `-edit`, `-pause`/`-resume` and the `{/comando}` and the `\n` in the text (and `-test`) |
| `alias.test.js` | Persistent registration, descriptions with straight and curly quotes, listing, single and full removal, reserved names, additional arguments, target permissions and the text aliases (`{/comando}`, `\n` and each command's permissions) |
| `apagadas-editadas.test.js` | Delete/edit events (the notice's Name comes from the schedule) (and the `show.alert.*` notices) and `/show` (deleted, edited and status, the requested chat and the `-q` search) |
| `ascii.test.js` | `/ascii`: the 5 lines inside the code block, wrapping by width (`-w`), `-c`, the replied message's text, accents and errors |
| `backup.test.js` | `/backup` (creation, list, restore, sending in private, by email and with one or several `-to`) and the daily backup |
| `batch.test.js` | `/batch`: the split into blocks (blank lines, URLs and a `/` that isn't a command), the summary, `-dry`, `-stop`, the refusal of `/batch` inside `/batch` and owner-only use |
| `block.test.js` | `/block` (`/bloquear`) and `/unblock`: by name, by number, replying, the list (with the `@lid` converted to the phone number) and its number, and `/unblock -all` |
| `bump.test.js` | Release and bump in temporary repositories, example versions, existing tags and preview without changes |
| `canais.test.js` | Identification of `@newsletter` channels in the notices and in `/show` |
| `comandos.test.js` | `/help` (only with the commands of whoever asked), `/debug`, `/uptime`, `/version`, `/ping`, `/noffa`, `/bot` (the `-h` in blocks, the status without option, `-on`/`-off`, `-list-users`, and `-info`, with the new yt-dlp and whatsapp-web.js versions), `/set` (and `-append`/`-rm`) |
| `conexao-email.test.js` | Connection events, restart (and the retries without internet, at boot and on restart, and the `ready` watchdog), watchdog, email alerts, crash and `docker stop` |
| `configuracao.test.js` | `comandos.js`, settings (and validation of persisted values), option parser, help (one form of the usage and one example per line) and the consistency between config, code, README and `docs/` (including alphabetical order, links and the stable version of the installation) |
| `cotacoes.test.js` | `/rates`, `/crypto` (and the filter by currency) and the price alerts (with one or several `-to`, `-msg` and `-rm` of several) |
| `debug.test.js` | Levels, command parser, filter with highlighting, startup logs, copy to chats and credential masking |
| `defi.test.js` | Solana (base58, PDA), Orca accounts (checked against the official SDK), Project X (simulated HyperEVM), Liquidswap (simulated Aptos: indexer and fullnode, with the price of the stable pools and the API key), Morpho (simulated API, with the accounts checked against the API's), Aave V3 (simulated blockchain, with the real Multicall3) and `/defi`: the filter by protocol, `-rm` of several, the addresses (full only in private), the list (with the 🔔 and the limit), the `-taxas` summary (with the total and `-alerta`) and `-alerta` (leaving and returning to the range, `-taxas`, `-alerta` on registration and several `-to`) |
| `dependencias.test.js` | Loading of the dependencies without the `punycode` module warning |
| `diagnostico.test.js` | `/bot -test`: the items with ✅/❌/➖ (simulated network), a test failure in the count and the refusal alongside other options; `-flush-email` (without SMTP, refusal) and the lookup of the Sent and Trash folders |
| `externos.test.js` | `/cve`, `/weather`, `/news`, `/gpt`, `/tldr`, `/draw`, `/translate`, `/giphy`, `/meme`, `/joke`, `/kernel`, `/pixelart` |
| `get-cache.test.js` | `/get` (the URL, the link and the replied media, and the anti-SSRF), `/cache` and the periodic cleanup |
| `grupo.test.js` | `/everybody`, `/bills`, `/members`, `/walissu`, `/poll` (and `-r`), `/sticker` (and `-txt`) |
| `grupos.test.js` | `/join` (link, code, `-info`, invalid invite and refusal) and `/leave` (by name, by number, the list) |
| `i18n.test.js` | The `zapbot.lang` setting (default `en_US`, `pt-BR`/`pt`/`en` accepted), the catalogs (same keys and `{placeholders}`), the English text of the definitions with a Portuguese translation for each, and `-h`/`/help` in both languages |
| `heartbeat.test.js` | Heartbeat and `docker/app/healthcheck.js` (actually executed) |
| `mascara-telefones.test.js` | Phone number obfuscation in `/show`, `/watch` and `/bot` |
| `mensagens.test.js` | Recording (with the name from your contacts, not the pushname) and of locations without interpreting the thumbnail as text or command, routing, permissions (`role`, `bot.users` with people, groups, `true`/`false` and the persisted permissions, bot off, extra admins from `bot.admins`, the `/bot +a`/`+u` shortcuts, the `-list-users`/`-list-users all` lists, each user's commands (`+cmd`/`-cmd`), `-reset` with confirmation, `/whois` and flood protection), the log of unknown commands and the `/stats` count (without the system notices) |
| `monitor.test.js` | Registration, filter and removal with the shared resolver, persistent online alerts, database migration, `-rm all`, sequential queries, pauses, history per contact, entry limit, persistence and listing as text or document |
| `notes.test.js` | `/notes`: `-add`, `-list` and `-rm` (several IDs, `all`, nonexistent ID), the `#tags` (the partial one: `#idei` finds `#ideias`), `-tags`, `-desc`, `-move`, `-view` (with image), `-export` (PDF, with the images), `-search`, images and `-alerta` (in `-add` and by ID or tag, when invalid, `-to`, single trigger and `-alerta -rm`) |
| `mute.test.js` | `/mute` and `/unmute`: notices muted per person, group or community (only the target is `-a`), the target lookup (exact names, contact, group, mention and a list to choose by number) and the reply to a notice (where it came from) |
| `presenca.test.js` | Presence reading by LID, shared subscription, cache and absence of valid times without fabricating data |
| `profile.test.js` | `/profile` (`/perfil`): the photo with the caption `Contato: nome da agenda <telefone>` (by name, mention and number), the contacts name instead of the pushname, your profile and that of whoever wrote the replied message, several people, no photo, a failing download, the `@lid`, `-mask`, group refused and owner-only use |
| `reacoes.test.js` | Removed or changed reactions: the `message_reaction` event (and what doesn't generate a notice), the `show.alert.reaction` notice, `/show -r`, `/mute -r`, `/bot -status` and the cleanup |
| `search.test.js` | `/search` (`/buscar`): in this chat, in all of them in your private chat, `-N` and the limit, media and long texts |
| `sticker-pos.test.js` | `/sticker -pos`: the square crop at the top, middle (default) or bottom |
| `stats.test.js`, `watch.test.js` | `/stats` (with `/chat/`, `-l` and `-flush`) and `/watch` (and one or several `-to`) |
| `status.test.js` | `/bot -status`: the report (with the `show.alert.*` notice off and the ones muted by `/mute`) and the daily send (and `-to`: people, groups and emails) |
| `telefone-bot.test.js` | Number of the configured account, expected format, notices and internal destinations |
| `url.test.js` | Anti-SSRF of `/get` and of the link preview: internal addresses blocked, mixed DNS answers refused and IP pinning with redirect revalidation |
| `util.test.js` | Formatting, contacts/`@lid`, mentions, cache files and the version with the commit and the `(devel)` (`versao.js`) |

A new command or option comes with its tests; `configuracao.test.js` fails if the command doesn't
have its page in `docs/comandos/`, if it's out of order or if any link is broken.

## Documentation

This documentation lives in `docs/`, in Markdown, and becomes the site
[jpereira.github.io/zapbot](https://jpereira.github.io/zapbot/) through
[MkDocs Material](https://squidfunk.github.io/mkdocs-material/) (`mkdocs.yml` has the menu and the
theme). The site is published **only on releases**: the `.github/workflows/docs.yml` workflow runs
when a `v*` tag reaches GitHub, so it always shows the stable version.

To see the site with the current content (HEAD, not the last release):

```bash
make docs                     # 📖 Documentation at http://127.0.0.1:8000/zapbot/
make docs DOCS_PORT=8001      # on another port (DOCS_HOST=0.0.0.0 opens it to the network)
```

The first time it creates the `.venv-docs` virtualenv with Python 3.12 (the same as CI; on 3.14
`mkdocs serve` still doesn't install) and recreates it when `docs/requirements.txt` changes. Another
Python: `make docs DOCS_PYTHON=python3.13`. The page reloads by itself when you save a file in
`docs/` or `mkdocs.yml`.

To check what the workflow generates (fails on a broken link or anchor):

```bash
make docs.build
```

When changing a command, change its page in `docs/comandos/` and the Summary tables (the one on the
[site](comandos/index.md#summary) and the ones in the READMEs); a new command also goes in the `nav`
of `mkdocs.yml`, in alphabetical order.

The documentation is bilingual: English (en_US) is the default and Brazilian Portuguese (pt-BR) sits next
to it. `docs/page.md` is the English page and `docs/page.pt-BR.md` its Portuguese twin; the site (the
`mkdocs-static-i18n` plugin) shows the English one at the root, the Portuguese one under `/pt-BR/` and a
language selector in the header. Change both versions together; the tests check that each pair has the
same headings, tables, code blocks and links. In `docs/comandos/index.md` and `index.pt-BR.md`, the parts
between `<!-- gerado:... -->` come from `node scripts/gerar-docs.js`, in both languages. A new page also
needs its twin and an entry in `nav` (with `nav_translations` for the title, if it is new).

`README.md` is in English (en_US) and `README.pt-BR.md` is the same in Portuguese: change both
together. They point to each other, and the tests check that they have the same sections, links and
code blocks, and that the command tables match `comandos.js` (`bump.sh` also updates the version in
both).

### Recording the demo

The GIFs on the [Demo](demonstracao.md) page are recorded with a scene script, using
`screencapture` and `scripts/gif.sh`: see [Recording the demo](gravar-demonstracao.md).

## New version

A run of `./scripts/bump.sh` **closes** the current version (the one in `package.json`) and
**opens** the next one:

```text
... X.Y.Z commits ── Release X.Y.Z (tag vX.Y.Z) ── Bump para X.Y.W ── X.Y.W commits ...
```

1. **Release X.Y.Z** (skipped if the tag `vX.Y.Z` already exists): the stable version in the README
   and in the installation (the `vX.Y.Z` right after a backtick, `checkout ` or `versão: `, as in
   `git checkout vX.Y.Z`) becomes the current one, with today's date next to it in
   `vX.Y.Z (from YYYY-MM-DD)`. The output examples lose the `(devel)` label:
   `X.Y.Z (devel) (git+<commit>/HEAD)` becomes `X.Y.Z (git+<commit>/vX.Y.Z)`. Commit
   `Release X.Y.Z`, with the annotated tag `vX.Y.Z` on it.
2. **Bump para X.Y.W** (the patch by default, X.Y.Z+1; `--minor` opens X.Y+1.0, `--major` opens
   X+1.0.0, or the given version: `./scripts/bump.sh 3.0.0`): `package.json` and
   `package-lock.json` move to the new one, and the examples go back to being from the version in
   development, with the label: `X.Y.Z (git+…/vX.Y.Z)` becomes `X.Y.W (devel) (git+…/HEAD)` and
   `ZapBot X.Y.Z` becomes `ZapBot X.Y.W (devel)`. The stable version remains the release that just
   came out. Commit `Bump para X.Y.W`, no tag.
3. Writes the refs to `.git/packed-refs` (`git pack-refs --all`), so the Docker image knows the
   tag's commit (the [`/version`](comandos/version.md) shows `(git+<commit>/<tag>)`).

The bot shows the same label by itself: outside a `vX.Y.Z` tag, the version comes as
`X.Y.Z (devel)` in `/version`, in `/bot -info`, at boot and in emails.

It needs a clean working tree and doesn't push. The swap happens **only** in the README and in
`docs/`, and skips the lines that quote `bump.sh` itself (the examples below). The ones that explain
the format use `X.Y.Z`, which `bump.sh` doesn't swap. In the code and in the tests, the same number
can be something else, like a dependency's version: the tests check both.

```bash
./scripts/bump.sh -n          # dry-run: shows what would be changed in both steps
./scripts/bump.sh             # Release X.Y.Z (with the tag) + Bump para X.Y.Z+1
./scripts/bump.sh --minor     # Release X.Y.Z (with the tag) + Bump para X.Y+1.0
./scripts/bump.sh --major     # Release X.Y.Z (with the tag) + Bump para X+1.0.0
./scripts/bump.sh 3.0.0       # Release X.Y.Z (with the tag) + Bump para 3.0.0
git push && git push origin vX.Y.Z   # pushing the tag publishes the site
```

Pushing the tag triggers the [documentation](#documentation) workflow, which publishes the release
site in a few minutes (follow it in **Actions › Documentação**). The notes go in the GitHub release
(`gh release create vX.Y.Z`), with what changed since the previous one
(`git log <previous tag>..vX.Y.Z`).

## Adding or changing commands

Commands are defined in `src/comandos/definicoes/`, one file per command (the name is the
command's, without the slash: `gpt.js` for `/gpt`). Each file exports the command's entry; a common
module, with `require`, constants and comments. `comandos.js` only loads the folder (files that
start with `_`, like `_opcoes.js`, are support files). At boot, `botConfig.js` checks each entry
(name, role and duplicate names) and fails right away if something is wrong. The handler goes in
`HANDLERS` in `src/comandos/index.js`: the definition doesn't import the handler, so `settings.js`
and the rest can read the commands without loading the whole bot (otherwise the `require`s would
loop back). Each entry follows this format:

```js
{
    cmd: '/get',                       // main name
    usage: '/get [OPTION]... <url>',   // "Usage:" line in -help (forms with "  or  ": one per line)
    aliases: ['/download'],            // alternative names
    summary: 'Downloads video or audio', // what it does, in one line (the /help list)
    help: 'Downloads video or audio...', // full description (the -help)
    ex: ['/get <url>', '/get -a <url>'], // examples (optional), one per line after the text
    cmd_opts: [
        { opts: ['audio', 'a'], values: [], desc: '...' },                // flag
        { opts: ['startSec', 'ss'], values: ['<time>'], desc: '...' },   // option with a value
        { argv: ['<url>'], desc: '...' },                                 // positional argument (doc only)
        { opts: ['a'], sinais: ['+', '-'], values: ['[x]'], desc: '...' }, // +a/-a pair on one line (doc only)
        { opts: ['add'], values: ['<x>'], desc: '...', cron: false },      // optional; doesn't run in a /cron {/comando}
        { opts: ['flush'], desc: '...', role: OWNER },                     // optional; owner only, even if delegated
        { opts: ['chat'], values: ['<x>'], desc: '...', outrosChats: true } // optional; only the current chat for whoever received it
    ],
    estrito: true,                     // optional; unknown option is an error (instead of going to argv)
                                       // ('primeira': only an unknown FIRST word, like /gpt -price)
    mask: true,                        // optional; accepts -mask (obfuscated phone numbers in the output)
    digitando: false,                  // optional; no "digitando..." (for the ones that reply right away)
    argumentosLivres: true,            // optional; the rest is free text, no options read (/alias, /batch)
    cron: true,                        // optional; true = runs in a {/comando} in the /cron text
    role: USER,                        // the minimum level: USER, ADMIN (admins and the owner) or OWNER (owner only)
    delegavel: true,                   // optional; on an ADMIN, the owner can grant it to a user (/bot +cmd)
    disabled: false                    // optional; true = the bot ignores the command
}
```

- `cron: true` lets the command run inside the text of
  [`/cron`](comandos/cron.md#commands-in-the-text) (`{/crypto}`), at send time. Only for query
  commands, which reply with `msg.reply` (the text goes in place and media goes out afterwards). An
  option that changes something (`-add`, `-alerta`...) gets `cron: false` and is refused when
  creating the item. `cron: 'dono'` (on the command or on the option) only applies if whoever
  creates the item is the owner (`/bot -flush-email`).
- `role` is the minimum level of whoever uses it, and people have the same names (`src/roles.js`):
  `OWNER` (the owner, the account paired to the bot), `ADMIN` (the ones in `bot.admins`, `/bot +a`)
  and `USER` (the ones in `bot.users`, `/bot +u`). An `ADMIN` command with `delegavel: true` can
  still be granted by the owner to a user with `/bot +cmd`; without the mark, only admins and the
  owner use it. An `/alias` shortcut or `/me` with several `{/comando}` gets the highest role among
  the targets. See [Permissions](comandos/index.md#permissions-role).
- Two marks in `cmd_opts` say what a user who was granted the command can't do, checked in
  `src/executar.js` before the handler (and also inside a `{/comando}`): `role: ADMIN` (the option
  requires this level, or `OWNER`: changing the `/gpt` model, deleting data...) and
  `outrosChats: true` (the option, or the `{ argv }` argument, looks at other chats). The reply is
  the same in all of them: `⛔ Apenas o dono do bot (ou um admin) pode ...`. The doc table comes
  from these marks: `node scripts/gerar-docs.js` (the test checks that it's up to date).
- Every typed command shows "digitando..." while it runs (`comDigitando`, in `src/executar.js`):
  several download, query or ask ChatGPT, and without it the chat looks stuck. The notice is resent
  every 3 s until the command finishes, because a message in the middle (the "⏳ Limpando..." from
  `/bot -fe true`) clears it. `digitando: false` turns it off for the ones that reply right away
  (`/ping`, `/help`...).
- `{ argv: ['-N'], numero: true }` makes the parser read `-10` as `opts.numero` (the 1st; a second
  one is unknown), instead of sending it to `argv`. With `estrito: true`, an unknown option doesn't
  reach the handler: `executar.js` replies `❌ Opção desconhecida: -x` with the syntax. With
  `estrito: 'primeira'` (`/gpt`, `/tldr` and `/draw`), only an unknown **first** word that looks like an
  option (`/gpt -price`) is rejected, with a hint to use `-h` instead of the syntax; later ones
  are part of the text.
- Changing `help`, `usage`, `aliases`, descriptions, `role` or `disabled` doesn't require code:
  just rebuild and recreate the container.
- The `-h` is read on a phone, so the formatter breaks the lines:
  - each form of the `usage` separated by `"  or  "` (`"  ou  "` in Portuguese) comes out on its own line;
  - the `help` and each `desc` come out with one sentence per line (the end of a sentence is `. `
    followed by a capital letter: `Máx. 20` and `(ex.: -taxas 50)` don't break); on an option, the
    1st sentence stays next to it, and the others are indented;
  - the `ex` (a list, on the command, on the option or on the protocol) always goes on the line
    below, on the left: `Ex: /defi` and, below it, the others, one per line.
- `sinais: ['+', '-']` shows the pair on a single line in `-h` (`+a, -a`), instead of `-a` in
  Options and `+a` in Arguments, far from each other. The parser still reads only `-a`: `+a`
  arrives in `argv`, and the handler deals with it (like `/bot +a`).
- `espacado: true` (on the command) separates the `-h` options with a blank line: for long help
  texts, like the one for `/bot`.
- `protocolos` (on the command) gives a help for each protocol, as in `/defi`:
  `{ orca: { nome: 'Orca', usage: '...', help: '...' } }`, and each option says which ones it
  belongs to (`protocolos: ['orca']`; without the list, it applies to all). `/defi orca -help` (or
  `/help defi orca`) shows the protocol's `usage` and `help` and only the options that apply to it;
  `/defi -help` shows all of them, grouped (` > Orca`, ` > Project X e Morpho`, ` > Todos`).
- The texts (`usage`, `help` and `desc`) accept template strings with the constants from
  `src/constantes.js` (`` `... em ${CACHE_DIR}` ``): the help shows the real path (e.g. the
  `/cache -h`).
- An option that's the same in more than one command becomes a constant in `definicoes/_opcoes.js`
  (`OPCAO_ALERTA_TO`, from `/rates` and `/crypto`), so the description lives in one place only.
- With `disabled: true` the command isn't loaded: the bot doesn't respond to it or to its aliases,
  and it disappears from `/help`. At boot it shows up in the logs as `Disabled N callers (...)`. To
  disable without a rebuild, use the `commands.disabled` setting (`/set commands.disabled noffa`).
- A **new** command needs a definition in `src/comandos/definicoes/`, the handler in
  `src/comandos/` and an entry in the `HANDLERS` object of `src/comandos/index.js`. At boot, the bot
  warns in the logs if there's a definition without a handler.
  Commands, handlers, the [Summary](comandos/index.md#summary) table and the pages in
  `docs/comandos/` are kept in **alphabetical order** (the `mkdocs.yml` menu too).

## Internationalization (i18n)

The bot's language is the `zapbot.lang` [setting](settings.md): `en_US` (default) or `pt_BR`.
`/set zapbot.lang pt_BR` (or `/set zapbot.lang=pt_BR`) switches it right away; `pt-BR`, `pt` and
`en` are accepted and normalized. Today it translates the help (`-h`, `/help`); the **replies of the
commands are still in Portuguese** and are being migrated to the same mechanism.

- `src/i18n.js` has `t('key', { vars })`: it looks the key up in the catalog of the current language
  (`src/locales/en_US.js` and `src/locales/pt_BR.js`, plain modules of key → text), replaces the
  `{placeholders}` and, for a plural, picks the form from `{ one, other }` using `vars.n`. A key
  missing in the language falls back to `en_US` and, failing that, to the key itself.
- The text of a command (`summary`, `usage`, `help`, `ex` and, in the options, `desc`, `ex`, `values` and
  `argv`) lives **in English** in `src/comandos/definicoes/`. The Portuguese translation goes in
  `src/locales/pt_BR/definicoes/<cmd>.json`, with the same fields in the same places, and
  `src/comandos/localizar.js` merges it over the definition when the language is not the default.
  The rest of the definition (`opts`, `role`...) is the same for every language.
- **A string**: add the key to `en_US.js` and to `pt_BR.js` (same `{placeholders}`) and use
  `t('key', { ... })` in the code.
- **A command text**: write it in English in the definition and the translation in the `.json`.
- **A language**: create `src/locales/<lang>.js` and `src/locales/<lang>/definicoes/`, register the
  language in `IDIOMAS` and in the catalogs of `src/i18n.js`, and in `opcoes` and `normalizar` of
  `zapbot.lang` in `SETTINGS_SCHEMA`.

The tests run in `pt_BR` (`bot.reiniciar()` sets it), because their assertions are in Portuguese.
`tests/i18n.test.js` changes the language on purpose and checks both: the catalogs have the same
keys and placeholders, every definition has its translation with the same structure, and the help comes
out right in `en_US` and in `pt_BR`.
