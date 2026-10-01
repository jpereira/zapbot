# `/enquete` (`/enq`, `/quiz`) · admin

Cria uma enquete nativa do WhatsApp no chat atual. A pergunta e as opções (2 a
12) são separadas por `|` ou uma por linha (a 1ª linha é a pergunta). Por
padrão cada pessoa marca uma opção; com `-m` no começo, pode marcar várias.

| Opção | Descrição |
|---|---|
| `-multi`, `-m` | Permite marcar mais de uma opção. Só vale no começo do texto |
| `-result`, `-r` | Mostra o resultado da enquete mais recente do chat (ou da enquete respondida). Veja [Resultado](#resultado) |

```
/enquete Pizza ou hambúrguer? | Pizza | Hambúrguer
/enquete -r                  → o resultado da última enquete do chat
/enq -m Quais dias você pode? | Seg | Ter | Qua | Qui | Sex
/quiz Onde vamos?
Praia
Montanha
Campo
```

Limites do WhatsApp: pergunta com até 255 caracteres, opções com até 100 e sem
repetir. O `/quiz` é só um atalho: o WhatsApp Web não oferece o modo quiz (com
resposta certa) para bots.

## Resultado

`/enquete -r` mostra o placar da enquete mais recente do chat: votos por
opção, a porcentagem e quem votou em cada uma. Respondendo (reply) uma
enquete, o placar é o dela.

```
/enquete -r
📊 Resultado: Pizza ou hambúrguer?
3 votos de 3 pessoas · criada em 30/09/2026, 18:02:11

🏆 Pizza — 2 (67%) ███████
   Fulano, Tia
▫️ Hambúrguer — 1 (33%) ███
   Ciclano
▫️ Salada — 0 (0%) ▏
```

- O WhatsApp só entrega os votos a quem criou a enquete: o bot conta os votos
  das enquetes da **sua conta**, tanto as do `/enquete` quanto as que você cria
  no celular (essas entram no primeiro voto).
- Vale a escolha atual de cada pessoa: quem muda o voto conta uma vez só, e
  quem tira o voto sai do placar. Com `-m`, cada opção marcada conta um voto.
- Os votos começam a ser contados com o bot no ar: os dados em enquetes de
  antes disso (ou de quando ele estava desconectado) não aparecem.
- As enquetes e os votos ficam 90 dias (setting `enquete.retentionDays`), nas
  tabelas `polls` e `poll_votes`.

