# `/tts` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /tts` ([Delegando](index.md#delegando-um-comando-admin)).

Transforma texto numa **nota de voz** de robô pelo ChatGPT (a API de voz da OpenAI), como o
[`/gpt -voice`](gpt.md#voz--voice). Usa a chave da OpenAI (`OPENAI_API_KEY` no `config/.env` ou o setting
`gpt.api.key`). O modelo, a voz e o estilo vêm dos settings `gpt.tts.*`.

```text
/tts [-status|-s] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Não mostra a dica do motor ("💡 ... por ChatGPT, Tesseract, Piper...") no fim da resposta. Para esconder sempre: o setting `tts.footer` em `off` |
| *(nenhuma)* | `[<texto>]` | O que falar, até 4096 caracteres. Respondendo uma mensagem, o estilo da fala |
| `-gpt`, `-g` | | Fala pelo ChatGPT (API de voz da OpenAI, gasta a sua conta) em vez da voz local do Piper. Sem `-gpt` nem `-local`, vale o setting [`tts.engine`](../settings.md) |
| `-local`, `-l` | | Fala com a voz local do Piper (sem chave, usa a CPU do servidor), mesmo com o `tts.engine` em `gpt` |
| `-status`, `-s` | | Acrescenta o consumo da chamada numa mensagem à parte: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo. Para deixar sempre ligado: `/set gpt.status true` |

```text
/tts Bom dia!                     → uma nota de voz falando isso
/tts                              → respondendo um texto: fala a mensagem
/tts fale devagar                 → respondendo um texto: fala no estilo pedido
/tts -s olá, tudo bem?         → a nota de voz mais o consumo no rodapé
```

- Respondendo um **áudio**, ele é transcrito antes e a transcrição é falada.
