# `/qr`

Gera o **QR Code** de um texto, como imagem PNG. Com `-decode` faz o contrário e lê o QR Code de uma
foto (igual ao [`/decodeqr`](decodeqr.md)). A biblioteca `qrcode` do próprio bot gera e a `jsqr` lê:
nada vai para um serviço externo.

```text
/qr [-decode|-d] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[<texto>]` | O texto do QR Code, até 1000 caracteres. Sem ele, usa o da mensagem respondida |
| `-decode`, `-d` | | Lê o QR Code de uma foto em vez de gerar um: responda a foto, ou envie com `/qr -d` na legenda |

```text
/qr https://exemplo.com      → o QR Code do link
/qr                          → respondendo um texto: o QR Code dele
/qr -d                       → respondendo uma foto: o texto do QR Code dela
```

- Foto sem QR Code legível recebe um aviso.
