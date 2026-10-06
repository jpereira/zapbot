# `/joke` (`/piada`, `/humor`)

Piada em português, no estilo "piada de tiozão", sorteada da lista em
[`src/comandos/piadas.json`](https://github.com/jpereira/zapbot/blob/main/src/comandos/piadas.json).
Nenhuma se repete até todas terem saído, e a mesma nunca vem duas vezes seguidas.

```text
/joke
O que a impressora falou para a outra impressora?

... Essa folha é sua ou é impressão minha? 🥁
```

```text
/piada          → o mesmo, pelo alias
```

Não depende de serviço externo. Para incluir piadas, acrescente
`{ "pergunta": "...", "resposta": "..." }` no `piadas.json` e refaça o build.
