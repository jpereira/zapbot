# `/pixelart` (`/ansi`, `/px`)

Arte ANSI/ASCII aleatória do [16colo.rs](https://16colo.rs/), o arquivo da cena artística das BBS. A
imagem vem renderizada pelo próprio site; título, artista, grupo e data saem do registro SAUCE
gravado no fim do arquivo original (sem ele, a legenda leva o nome do arquivo e o ano do pack).

| Opção | Valor | Descrição |
|---|---|---|
| `-random`, `-r` | | Sorteia de qualquer pack do arquivo |
| `-year`, `-y` | `<ano>` | Sorteia de um pack do ano (ex.: 1996) |
| `pack` | | Nome do pack (ex.: `chuck-norris-lvl`). Sem ele usa o setting `pixelart.packs` |

```text
/pixelart                    → de um dos packs do setting pixelart.packs
/pixelart chuck-norris-lvl   → do pack informado
/pixelart -r                 → de qualquer pack do arquivo
/pixelart -y 1996            → de um pack de 1996
/px                          → o mesmo que /pixelart, pelo alias
```

Exemplo de resposta:

```text
[imagem da arte]
🎨 Chuck Norris
👤 lord jazz / ACiD
📦 chuck-norris-lvl (01/04/2021)
🔗 https://16colo.rs/pack/chuck-norris-lvl/LDJ-CHUCK.ANS
```

## Alterando os packs

```text
/set pixelart.packs mimic100 blocktronics_space       → sorteia entre esses
/set -reset pixelart.packs                            → volta ao padrão
```

Detalhes:

- Pixel art sofre com a compressão do WhatsApp: a imagem é dobrada sem suavizar e enviada em HD.
- Artes mais altas que 4096 px vão em partes, até o setting `pixelart.maxParts` (3); o que passar
  disso fica só no link.
- No `-r` e no `-y`, packs sem artes ANSI/ASCII (só executáveis ou textos) são trocados por outro
  sorteio, até 5 tentativas.
- A lista completa de packs do `-r` é baixada no máximo uma vez por dia.
