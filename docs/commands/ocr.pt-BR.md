# `/ocr` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /ocr` ([Delegando](index.md#delegando-um-comando-admin)).

Lê o texto de uma **foto** e responde com ele. Responda a foto, ou envie a foto com `/ocr` na legenda.
Há dois motores: o **local** (Tesseract, roda na CPU do servidor, sem chave; o padrão) e o **ChatGPT**
(visão, com `-gpt`), que usa a chave da OpenAI (`OPENAI_API_KEY` no `config/.env` ou o setting
`gpt.api.key`), como o [`/gpt`](gpt.md). O setting `ocr.engine` escolhe o padrão e o `ocr.language`, os
idiomas do local (`por+eng`).

```text
/ocr [-gpt|-g] [-local|-l] [-status|-s]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-gpt`, `-g` | | Lê com o ChatGPT (visão da OpenAI, gasta a sua conta) em vez do Tesseract local. Sem `-gpt` nem `-local`, o setting `ocr.engine` decide |
| `-local`, `-l` | | Lê com o Tesseract local (sem chave, roda na CPU do servidor), mesmo com `ocr.engine` em `gpt` |
| `-status`, `-s` | | Com `-gpt`: acrescenta no rodapé da resposta o consumo da chamada: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo. Para deixar sempre ligado: `/set gpt.status true` |

```text
/ocr                         → respondendo uma foto: o texto dela
/ocr -gpt                    → com o ChatGPT
/ocr -s -gpt                 → com o ChatGPT e o rodapé de consumo
```

- O texto vem com um 📝 na frente e mantém as quebras de linha, e uma dica diz qual motor leu. Foto sem texto recebe um aviso.
- Fotos e figurinhas até o mesmo limite de tamanho do [`/gpt`](gpt.md#com-foto).
