# `/me`

Envia a mensagem digitada. Cada `{/comando args}` roda na hora e a resposta entra no lugar, como nos
[comandos no texto do `/cron`](cron.md#comandos-no-texto). Um `\n` digitado vira quebra de linha.

```text
/me [-repeat|-r <n>] <mensagem>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-repeat`, `-r` | `<n>` | Repete o texto `n` vezes (de 1 a 30), emendado, numa mensagem só: `/me -r 3 Haha!` envia `Haha!Haha!Haha!`. Os `{/comando}` rodam uma vez só |

```text
/me Minha mensagem
/me Linha 1\nLinha 2
/me -r 3 Haha!
/me O preço do Bitcoin está em {/crypto BTC}
```

- A mensagem sai direto no chat, sem citar o comando digitado.
- Rodam só os comandos de consulta do `/cron` (`/cotacao`, `/crypto`, `/tempo`...), sem as opções
  que mudam algo. Quem executa precisa de permissão para cada um deles.
- Uma resposta de várias linhas vira um parágrafo; uma de uma linha só fica na frase. Mídias
  (`/meme`, `/giphy`) saem depois do texto.
- Combina com o [`/alias`](alias.md): `/alias -q /haha /me Hahaha vc e burro!`.
