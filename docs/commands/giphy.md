# `/giphy` (`/gif`)

Envia um GIF do GIPHY como vídeo em loop: aleatório por tag ou específico por URL ou ID. Sem
argumento usa o setting `gif.tag`. Precisa de uma chave do GIPHY: `GIPHY_API_KEY` no `config/.env`
ou, se ela não existir, o setting `giphy.api.key` (`/set giphy.api.key <chave>`).

```text
/giphy          → tag padrão (setting gif.tag)
/giphy gatos    → GIF com a tag "gatos"
/gif gatos      → o mesmo, pelo alias
/giphy https://giphy.com/gifs/h5WUvmDSB0njFcFeCE
/giphy h5WUvmDSB0njFcFeCE  → o mesmo GIF pelo ID
```

URLs aceitas usam `giphy.com/gifs/<ID>` ou `giphy.com/gifs/<nome>-<ID>`. Um argumento alfanumérico
com pelo menos dez caracteres é interpretado como ID; os demais são tags. O vídeo é baixado em MP4,
com limite de 10 MB. Sem resultado, o bot avisa no chat.
