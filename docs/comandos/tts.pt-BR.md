# `/tts` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /tts` ([Delegando](index.md#delegando-um-comando-admin)).

Transforma texto numa **nota de voz** de robô pela API de voz da OpenAI, como o
[`/gpt -voz`](gpt.md#voz--voz). Usa a chave da OpenAI (`OPENAI_API_KEY` no `config/.env` ou o setting
`openai.api.key`). O modelo, a voz e o estilo vêm dos settings `openai.tts.*`.

```text
/tts [-status|-s] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[<texto>]` | O que falar, até 4096 caracteres. Respondendo uma mensagem, o estilo da fala |
| `-status`, `-s` | | Acrescenta o consumo da chamada numa mensagem à parte: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo. Para deixar sempre ligado: `/set openai.status true` |

```text
/tts Bom dia!                     → uma nota de voz falando isso
/tts                              → respondendo um texto: fala a mensagem
/tts fale devagar                 → respondendo um texto: fala no estilo pedido
```

- Respondendo um **áudio**, ele é transcrito antes e a transcrição é falada.
