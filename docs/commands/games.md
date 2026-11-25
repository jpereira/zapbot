# `/games`

Group games, for when the chat needs a break: the **magic 8 ball**, **truth**, **dare** and
**trivia**. The lists follow the bot language (`zapbot.lang`) and live in
[`src/commands/games.json`](https://github.com/jpereira/zapbot/blob/main/src/commands/games.json).

| Option | Value | Description |
|---|---|---|
| `-8ball`, `-8` | | The magic 8 ball: ask a yes/no question and it answers (yes, no or maybe) |
| `-truth`, `-t` | | A truth question for the group |
| `-dare`, `-d` | | A dare for the group |
| `-trivia`, `-tr` | | A general-knowledge question with 4 options. Answer with the letter (A, B, C or D) within 5 minutes: `-trivia B`. One open question per chat |

## Magic 8 ball

```text
/games -8ball will I pass the exam?
🎱 will I pass the exam?
Signs point to yes.
```

```text
/games -8ball is it worth waiting for the sale?
🎱 is it worth waiting for the sale?
Hazy, try again.
```

Without a question, it asks for one:

```text
/games -8ball
🎱 Ask a question: /games -8ball will I pass the exam?
```

## Truth and dare

```text
/games -truth
🗣️ Truth: What is the biggest lie you ever told and never got caught?
```

```text
/games -dare
🎯 Dare: Send a voice note imitating an animal of your choice.
```

To get the group going, let the bot start a round with a [`/cron`](cron.md) (the `{/command}` in
the text runs when it is sent):

```text
/cron friday 20h -to /Friends/ Friday round! {/games -truth}
```

## Trivia

The bot asks a general-knowledge question with four options and keeps it open **for 5 minutes in
that chat**. Answer with the letter:

```text
/games -trivia
🧠 Trivia

What is the capital of Australia?

A) Sydney
B) Melbourne
C) Canberra
D) Perth

💡 Answer with /games -trivia B (within 5 minutes).
```

```text
/games -trivia B
❌ Not this time. The answer was C) Canberra
```

```text
/games -trivia C
✅ Correct! C) Canberra
```

- The first answer closes the question (right or wrong); `/games -trivia` asks a new one.
- Without an open question, `/games -trivia C` says there is none. Anything that is not A, B, C or
  D is refused.
- The open question lives in memory: restarting the bot closes it.
- Trivia can't go in a [`/cron`](cron.md) (it needs the answer from someone), the others can.

## Playing by replying

You don't have to type the command to take part: **reply to the bot's message** with your move.

| Reply to | You write | What happens |
|---|---|---|
| a trivia question | `B` (or `b`, `B)`) | The bot says whether you got it right and closes the question |
| an 8 ball answer | another question | The 8 ball answers it, and you can keep replying |
| a truth or a dare | your answer, any text | The bot reacts with ✅ |
| a truth or a dare | `next` (or `outra`, `pass`) | The bot draws another one of the same game |

```text
/games -trivia
🧠 Trivia

Which chemical element has the symbol Fe?

A) Fluorine
B) Iron
C) Phosphorus
D) Francium

💡 Answer with /games -trivia B (within 5 minutes).

(Rafael replies to it)  b
✅ Correct! B) Iron
```

```text
/games -8ball will I pass the exam?
🎱 will I pass the exam?
Probably yes.

(Rafael replies to it)  and the one on Friday?
🎱 and the one on Friday?
Ask again later.
```

```text
/games -dare
🎯 Dare: Send a photo of what is in front of you right now.

(Rafael replies with the photo's caption)  there, my desk
✅ (reaction on his message)

(Maria replies)  next
🎯 Dare: Describe your day using only movie titles.
```

- Anyone who can use `/games` in that chat can reply; anyone else is ignored, as with any command.
- The bot remembers its game messages for **30 minutes** (trivia: 5). After that, reply to a new one.
- The 8 ball also takes the question from a message: reply to it with `/games -8ball`.
- Typing the command still works everywhere: `/games -trivia B`.

## More examples

```text
/games                                  → the list of games
/games -8ball will it rain tomorrow?    → 🎱 will it rain tomorrow? · Don't count on it.
/games -truth                           → a different question each time
/games -dare                            → a different dare each time
/games -trivia                          → asks; then /games -trivia A|B|C|D answers
```

## Adding questions

Each list is in `games.json`, per language (`en_US` and `pt_BR`): `ball`, `truth`, `dare` (texts) and
`trivia` (`{ "q": "question", "o": ["A", "B", "C", "D"], "a": index of the right option }`).
Rebuild the image after editing.
