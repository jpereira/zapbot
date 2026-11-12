# `/poll` (`/enquete`, `/quiz`) · admin

Role `admin`: only you and the extra admins. The owner delegates it to a person or group with
`/bot +u +cmd /poll` ([Delegating](index.md#delegating-an-admin-command)).

Creates a native WhatsApp poll in the current chat. The question and the options (2 to 12) are
separated by `|` or one per line (the 1st line is the question). By default each person picks one
option; with `-m` at the start, they can pick several.

| Option | Description |
|---|---|
| `-multi`, `-m` | Allows picking more than one option. Only works at the start of the text |
| `-result`, `-r` | Shows the result of the chat's most recent poll (or of the poll being replied to). Only works at the start of the text. See [Result](#result) |

```text
/poll Pizza ou hambúrguer? | Pizza | Hambúrguer
/poll -r                  → the result of the chat's last poll
/poll -m Quais dias você pode? | Seg | Ter | Qua | Qui | Sex
/quiz Onde vamos?
Praia
Montanha
Campo
```

WhatsApp limits: question up to 255 characters, options up to 100 and no repeats (case is ignored).
A question that starts with `/` gets a `📊` in front, so it never looks like a command. `/quiz` is
just a shortcut: WhatsApp Web doesn't offer quiz mode (with a correct answer) for bots.

## Result

`/poll -r` shows the scoreboard of the chat's most recent poll: votes per option, the percentage
and who voted for each one. When replying to a poll, the scoreboard is that poll's.

```text
/poll -r
📊 Result: Pizza ou hambúrguer?
3 votes from 3 people · created on 9/30/2026, 18:02:11

🏆 Pizza — 2 (67%) ███████
   Fulano, Tia
▫️ Hambúrguer — 1 (33%) ███
   Ciclano
▫️ Salada — 0 (0%) ▏
```

- WhatsApp only delivers the votes to whoever created the poll: the bot counts the votes of polls
  from **your account**, both the ones from `/poll` and the ones you create on your phone (those
  get picked up on the first vote).
- Each person's current choice is what counts: someone who changes their vote counts only once, and
  someone who removes their vote drops off the scoreboard. With `-m`, each option picked counts as a
  vote.
- Votes only start being counted while the bot is up: data on polls from before that (or from when
  it was disconnected) doesn't show up.
- Polls and votes are kept for 90 days (setting `enquete.retentionDays`, default 90, from 1 to
  365), in the `polls` and `poll_votes` tables.
- With no poll recorded in the chat, the bot says so. Replying to a poll the bot doesn't have the
  votes of (one that isn't from your account), it says that too.
