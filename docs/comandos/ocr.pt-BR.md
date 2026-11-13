# `/ocr` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /ocr` ([Delegando](index.md#delegando-um-comando-admin)).

Lê o texto de uma **foto** pelo ChatGPT (visão) e responde com ele. Responda a foto, ou envie a foto
com `/ocr` na legenda. Usa a chave da OpenAI (`OPENAI_API_KEY` no `config/.env` ou o setting
`openai.api.key`), como o [`/gpt`](gpt.md).

```text
/ocr [-status|-s]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-status`, `-s` | | Acrescenta no rodapé da resposta o consumo da chamada: bytes enviados (TX) e recebidos (RX), tokens gastos, custo estimado e saldo. Para deixar sempre ligado: `/set openai.status true` |

```text
/ocr                         → respondendo uma foto: o texto dela
/ocr -s                      → com o rodapé de consumo
```

- O texto vem com um 📝 na frente e mantém as quebras de linha. Foto sem texto recebe um aviso.
- Fotos e figurinhas até o mesmo limite de tamanho do [`/gpt`](gpt.md#com-foto).
