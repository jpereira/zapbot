# `/enquete` (`/enq`, `/quiz`) · admin

Cria uma enquete nativa do WhatsApp no chat atual. A pergunta e as opções (2 a
12) são separadas por `|` ou uma por linha (a 1ª linha é a pergunta). Por
padrão cada pessoa marca uma opção; com `-m` no começo, pode marcar várias.

| Opção | Descrição |
|---|---|
| `-multi`, `-m` | Permite marcar mais de uma opção. Só vale no começo do texto |

```
/enquete Pizza ou hambúrguer? | Pizza | Hambúrguer
/enq -m Quais dias você pode? | Seg | Ter | Qua | Qui | Sex
/quiz Onde vamos?
Praia
Montanha
Campo
```

Limites do WhatsApp: pergunta com até 255 caracteres, opções com até 100 e sem
repetir. O `/quiz` é só um atalho: o WhatsApp Web não oferece o modo quiz (com
resposta certa) para bots.
