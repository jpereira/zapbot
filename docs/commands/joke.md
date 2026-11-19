# `/joke`

Joke in Portuguese, "dad joke" style, drawn from the list in
[`src/commands/jokes.json`](https://github.com/jpereira/zapbot/blob/main/src/commands/jokes.json).
None repeats until all of them have come out, and the same one never comes up twice in a row.

| Option | Value | Description |
|---|---|---|
| `-tts` | | Speaks the reply as a voice note, with the default voice of [`/tts`](tts.md) (same as `/tts -q {/joke ...}`). Settings `tts.*` apply |

```text
/joke
O que a impressora falou para a outra impressora?

... Essa folha é sua ou é impressão minha? 🥁
```

```text
```

It doesn't depend on an external service. To add jokes, append
`{ "pergunta": "...", "resposta": "..." }` to `jokes.json` and rebuild.
