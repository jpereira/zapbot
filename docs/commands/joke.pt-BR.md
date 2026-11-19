# `/joke`

Piada em português, no estilo "piada de tiozão", sorteada da lista em
[`src/commands/jokes.json`](https://github.com/jpereira/zapbot/blob/main/src/commands/jokes.json).
Nenhuma se repete até todas terem saído, e a mesma nunca vem duas vezes seguidas.

| Opção | Valor | Descrição |
|---|---|---|
| `-tts` | | Fala a resposta em um áudio, com a voz padrão do [`/tts`](tts.md) (o mesmo que `/tts -q {/joke ...}`). Valem os settings `tts.*` |

```text
/joke
O que a impressora falou para a outra impressora?

... Essa folha é sua ou é impressão minha? 🥁
```

```text
```

Não depende de serviço externo. Para incluir piadas, acrescente
`{ "pergunta": "...", "resposta": "..." }` no `jokes.json` e refaça o build.
