# `/status` · admin

Relatório do bot nas últimas 24 h. Mande `/status` para ver agora, ou
`/status 06h` para receber todo dia nesse horário, no seu privado.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | O relatório agora |
| `<hora>` | | Hora do envio diário, no horário de Brasília: `06h`, `6h30`, `06:00` ou `às 18h`. Trocar a hora substitui a anterior |
| `-list`, `-l` | | Mostra o horário do envio diário e quando sai o próximo |
| `-off` | | Desliga o envio diário |

```
/status              → o relatório agora
/status 06h          → todo dia às 06:00
/status às 18h30     → todo dia às 18:30 (no lugar das 06:00)
/status -l           → o horário e o próximo envio
/status -off         → para de enviar
```

```
📊 Status do ZapBot 1.8 · últimas 24 h
qui 01/10 06:00

🤖 No ar: 2 dias, 3 horas · conectado: 2 dias, 2 horas
🗄️ Cache: 45.20 MB (banco 4.20 MB · mídias 40.10 MB) · 1.234 mensagens
👀 Watch: 5 ocorrências (#1 pix: 3, #2 boleto: 2)
🗑️ Apagadas: 12
✏️ Editadas: 4
📸 Status apagados: 2
🔇 Ignoradas (/mudo): 7 (apagadas 5, editadas 2)
💾 Último backup: qui 01/10 03:00 (automático)

⏰ Próximo status: sex 02/10 06:00 (todo dia às 06:00)
```

O que entra:

- **No ar**: há quanto tempo o processo está rodando e há quanto tempo está
  conectado ao WhatsApp (o mesmo do [`/uptime`](uptime.md)).
- **Cache**: o tamanho de `cache/` (banco e mídias) e quantas mensagens estão
  guardadas.
- **Watch**: ocorrências das regras do [`/watch`](watch.md), com o nº de cada
  regra (as 5 que mais casaram).
- **Apagadas**, **editadas** e **status apagados**: o que foi recuperado nas
  últimas 24 h, inclusive o que o [`/mudo`](mudo.md) silenciou.
- **Ignoradas (/mudo)**: os avisos que o `/mudo` cortou, por tipo.
- **Último backup**: o mais recente do [`/backup`](backup.md).

O envio diário fica na agenda do bot (tabela `schedules`), mas não aparece no
[`/agendar`](agendar.md) nem conta no limite dele. Se o bot estiver fora do ar
no horário, o relatório sai quando ele voltar.
