# `/translate` (`/traduzir`)

Traduz um texto pelo Google Translate, sem chave e sem custo. Respondendo (reply) uma mensagem,
traduz o texto dela. O idioma de origem é detectado sozinho; o de destino é o português, ou o do
`-para`.

| Opção | Valor | Descrição |
|---|---|---|
| `[texto]` | | O texto (até 5000 caracteres, com quebras de linha). Sem ele, a mensagem respondida |
| `-para`, `-p` | `<idioma>` | Idioma de destino, pelo código: `en`, `es`, `fr`, `it`, `de`, `ja`, `zh-CN`... Maiúsculas e minúsculas valem igual. Padrão: setting `traduzir.lang` (`pt`) |
| `-list`, `-l` | | Lista os idiomas aceitos, com o código |

```text
/translate Where is the nearest pharmacy?
/translate -para en Onde fica a farmácia mais próxima?
/translate -p es               (respondendo uma mensagem)
/translate -l                   → os idiomas e os códigos
/set traduzir.lang en          → muda o idioma padrão
```

```text
/translate Where is the nearest pharmacy?
🌐 Tradução (en → pt)

Onde fica a farmácia mais próxima?
```

Não é admin: quem estiver no `bot.users` usa (com ele em `true`, qualquer pessoa).

## Como funciona

O bot usa o pacote [`google-translate-api-x`](https://github.com/AidanWelch/google-translate-api),
que faz o mesmo pedido que o site `translate.google.com`. Por isso não precisa de chave, de projeto
no Google Cloud nem de faturamento.

É um acesso **não oficial**: o Google não garante que ele continue igual e pode limitar o uso por
endereço IP. Se isso acontecer, o bot avisa:

| Resposta | Causa |
|---|---|
| `💸 O Google Translate limitou os pedidos deste servidor` | Muitos pedidos do mesmo IP em pouco tempo. Tente mais tarde |
| `⛔ O Google recusou o pedido deste servidor` | O Google bloqueou o IP. Tente mais tarde |
| `⏱️ O Google Translate não respondeu` | Passou de 15 segundos sem resposta |
| `❌ Idioma inválido` | O código não existe: veja os aceitos com `/translate -l` |

Para uso pesado ou que não pode falhar, o Google tem a API oficial paga (Cloud Translation); o bot
não usa mais essa API.
