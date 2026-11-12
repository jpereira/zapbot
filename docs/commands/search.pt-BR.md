# `/search` (`/buscar`) · admin

Busca mensagens no histórico do WhatsApp Web, com a mesma busca do campo de pesquisa do WhatsApp:
vale para as mensagens que o WhatsApp Web tem, inclusive as que nunca passaram pelo cache do bot. O
[`/show -q`](show.md#buscar) busca só no cache (apagadas, editadas, status e reações).

```text
/search [-N] <texto>
/search -read <id>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade de mensagens (padrão 10, máx. 50). Ex.: `-30` |
| *(nenhuma)* | `<texto>` | O que buscar, como na busca do WhatsApp (sem diferenciar maiúsculas) |
| `-read`, `-r` | `<id>` | Exibe inteira a mensagem de um id da lista da busca. Mesmo escopo da busca |
| `-mask`, `-m` | | Ofusca telefones na saída desta execução. Ex.: `+55219****44` |

O escopo é **este chat**; no **seu privado**, todos os chats, e cada resultado diz de qual chat é.
Os resultados vêm do mais recente para o mais antigo, com a data, quem mandou e o texto (numa mídia,
o tipo e a legenda). Textos longos são cortados em 200 caracteres.

```text
/search pix                 → as 10 mais recentes com "pix" neste chat
/search -30 boleto          → até 30
/buscar bom dia             → com espaços, sem aspas (/buscar é o mesmo que /search)
```

```text
/search pix
🔎 2 mensagens com "pix" (todos os chats)

1. 📅 13/10/2026, 11:02:10 · 💬 Família · 👤 Fulano
   "manda o pix que eu pago"
   🆔 false_5521988887777@c.us_3EB0A1B2

2. 📅 12/10/2026, 18:40:05 · 💬 Trabalho · 👤 Você
   📎 [image] "comprovante do pix"
   🆔 true_120363000000000000@g.us_3EB0C3D4
```

```text
/search -read false_5521988887777@c.us_3EB0A1B2
📅 13/10/2026, 11:02:10 · 💬 Família · 👤 Fulano

manda o pix que eu pago, o texto todo, sem corte
```

- Cada resultado traz o `🆔` para o `-read`. Com `-mask`, o id também é ofuscado (não serve para o `-read`).
- O `-read` vale só para este chat; no seu privado, para qualquer chat. Numa mídia, mostra o tipo e a legenda.
- A própria mensagem do `/search` não entra nos resultados.
- Quando vêm tantos resultados quanto o `-N`, o bot avisa que pode haver mais.
- O que o WhatsApp Web ainda não carregou do celular não aparece: é a mesma limitação da busca do
  WhatsApp Web.
