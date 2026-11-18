# `/call` · admin

Recusa as ligações de voz e de vídeo que chegam na conta do bot e responde uma vez com um texto seu, e também pode
**recusar sempre as ligações de uma pessoa**, com uma mensagem só para ela. É o mesmo que os settings `call.reject`,
`call.message` e `call.allow`, só que com comandos. A recusa geral vem desligada.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Como está: ligado ou desligado, a mensagem, quem sempre toca e quem é sempre recusado |
| `-on` | | Liga a recusa (`call.reject`) |
| `-off` | | Desliga: as ligações voltam a tocar |
| `-msg`, `-m` | `<texto\|off\|reset>` | A mensagem enviada a quem teve a ligação recusada (`call.message`). Com `off`, recusa em silêncio; com `reset`, volta ao texto padrão. Junto do `-deny`, é a mensagem só dessas pessoas |
| `-allow`, `-a` | `<pessoa...>` | Pessoas cujas ligações sempre tocam (`call.allow`): `/nome/`, `@menção` ou `+número` |
| `-deny`, `-d` | `<pessoa...>` | Pessoas cujas ligações são **sempre recusadas**, mesmo com a recusa desligada: `/nome/`, `@menção` ou `+número`. Com `-msg`, a mensagem é delas; sem, um texto padrão de quem foi negado |
| `-rm`, `-r` | `<pessoa...>` | Tira as pessoas das duas listas (as que sempre tocam e as sempre recusadas) |

```text
/call                                   → como está agora
/call -on                               → recusa as ligações
/call -msg Não atendo ligações aqui, mande uma mensagem ou um áudio 🙏
/call -on -msg Me chame por mensagem!   → liga e já com a mensagem nova, num comando só
/call -msg off                          → recusa em silêncio (sem mensagem)
/call -msg reset                        → volta ao texto padrão
/call -allow /Maria Lucia/ +5521999999999
/call -rm /Maria Lucia/
/call -deny /Fulano/ +5521977777777 -msg "Não quero falar agora!"
/call -d /Fulano/                       → recusa com o texto padrão de quem foi negado
/call -deny +5521977777777 -msg off     → recusa em silêncio
/call -rm /Fulano/                      → volta à regra geral
/call -off                              → as ligações voltam a tocar
```

## Recusar uma pessoa, com a mensagem dela

O `-deny` (ou `-d`) recusa as ligações dessas pessoas **mesmo com a recusa geral desligada**. A mensagem vai depois do
`-msg`, com ou sem aspas (vale até a próxima opção), e pode vir antes ou depois das pessoas:

```text
/call -deny /Fulano/ +5521977777777 -msg "Não quero falar agora!"
/call -msg Agora não, me chame por mensagem -d /Fulano/
/call -d /Fulano/                         → sem -msg: o texto padrão de quem foi negado
/call -d /Fulano/ -msg off                → recusa em silêncio, sem mensagem
/call -rm /Fulano/                        → as ligações voltam a tocar
```

O texto padrão de quem foi negado segue o idioma do bot (`Não posso falar agora. Me manda uma mensagem!`). Sem o
`-deny`, o `-msg` é a mensagem geral, a que todo mundo recebe quando a recusa geral está ligada.

## O que o status mostra

```text
📵 Recusar ligações: ligado
📝 Não atendo ligações aqui, mande uma mensagem ou um áudio 🙏
✅ Sempre tocam: +5521988887777, +5521999999999 (e os admins do bot)
🚷 Sempre recusados: +5521977777777 (Não quero falar agora!)
💡 /call -on|-off · -msg <texto|off|reset> · -allow|-deny|-rm <pessoas>
```

- O bot responde uma vez a cada pessoa, no máximo uma mensagem a cada 10 minutos, então quem liga dez vezes não
  recebe dez textos.
- As ligações dos `bot.admins` e das pessoas do `call.allow` sempre tocam.
- O **`-deny`** é o contrário: as ligações dessas pessoas são recusadas **mesmo com o `/call -off`**, cada uma com a
  própria mensagem (o texto padrão de quem foi negado é `Não posso falar agora. Me manda uma mensagem!`). Ele também
  tira a pessoa da lista de "sempre tocam", e o `-allow` tira da lista dos negados. Vale a mesma regra de uma mensagem
  a cada 10 minutos.
- Recusa também as ligações de grupos, e para quem liga parece uma chamada perdida, não um bloqueio.
- Os settings gerais continuam valendo pelo [`/set`](set.md) (`call.reject`, `call.message`, `call.allow`); a lista dos
  negados e as mensagens deles ficam só no `/call`. A página do [`/bot`](bot.md#recusando-ligações) tem os detalhes.
- O `call.message` vem vazio, o que significa o texto padrão do idioma do bot; o `/call -msg off` recusa em silêncio.

## Se nada acontecer

Toda ligação que o WhatsApp avisa ao bot vai para o log (`make logs`), até as que tocam normalmente:

```text
[Call] evento 'call': de 5521977777777@c.us, voz
[Call] ligação de 5521977777777 (5521977777777@c.us), negado pelo /call -deny; call.reject desligado
[Call] ligação de 5521977777777 recusada
```

Se não aparecer a linha `evento 'call'` quando alguém ligar, o WhatsApp Web não avisou o bot da ligação.
