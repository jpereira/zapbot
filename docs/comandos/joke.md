# `/joke`

Joke in Portuguese, "dad joke" style, drawn from the list in
[`src/comandos/piadas.json`](https://github.com/jpereira/zapbot/blob/main/src/comandos/piadas.json).
None repeats until all of them have come out, and the same one never comes up twice in a row.

```text
/joke
O que a impressora falou para a outra impressora?

... Essa folha é sua ou é impressão minha? 🥁
```

```text
```

It doesn't depend on an external service. To add jokes, append
`{ "pergunta": "...", "resposta": "..." }` to `piadas.json` and rebuild.
