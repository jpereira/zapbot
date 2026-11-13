# `/decodeqr`

Lê o **QR Code** de uma foto e responde com o texto dele. Responda a foto, ou envie com `/decodeqr`
na legenda. Com `-encode` faz o contrário e gera o QR Code de um texto (igual ao [`/qr`](qr.md)).

```text
/decodeqr [-encode|-e] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[<texto>]` | Com `-encode`, o texto do QR Code, até 1000 caracteres (sem ele, o da mensagem respondida) |
| `-encode`, `-e` | | Gera o QR Code do texto em vez de ler um |

```text
/decodeqr                    → respondendo uma foto: o texto do QR Code dela
/decodeqr -e https://exemplo.com   → o QR Code do link
```

- O texto vem com um 📱 na frente. Foto sem QR Code legível recebe um aviso.
