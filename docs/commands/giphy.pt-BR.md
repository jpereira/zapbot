# `/giphy`

Envia um GIF do GIPHY como vídeo em loop: aleatório por tag ou específico por URL ou ID. Sem
argumento usa o setting `gif.tag`. Precisa de uma chave do GIPHY: `GIPHY_API_KEY` no `config/.env`
ou, se ela não existir, o setting `giphy.api.key` (`/set giphy.api.key <chave>`).

```text
/giphy          → tag padrão (setting gif.tag)
/giphy gatos    → GIF com a tag "gatos"
/giphy https://giphy.com/gifs/h5WUvmDSB0njFcFeCE
/giphy h5WUvmDSB0njFcFeCE  → o mesmo GIF pelo ID
```

URLs aceitas usam `giphy.com/gifs/<ID>` ou `giphy.com/gifs/<nome>-<ID>`. Um argumento alfanumérico
com pelo menos dez caracteres é interpretado como ID; os demais são tags. O vídeo é baixado em MP4,
com limite de 10 MB. Sem resultado, o bot responde `❌ Nenhum GIF encontrado.`; se a busca ou o
download falha, `❌ Não consegui buscar esse GIF.`. Sem a chave, responde
`⚠️ Chave do GIPHY não configurada: defina GIPHY_API_KEY no config/.env ou use /set giphy.api.key <chave>.`.
O GIF aleatório tem classificação de até PG-13. A tag padrão é `fail` (`/set gif.tag <tag>` muda).
