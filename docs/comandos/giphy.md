# `/giphy` (`/gif`)

GIF aleatório do GIPHY, enviado como vídeo em loop. Sem tag usa o setting
`gif.tag`. Precisa de uma chave do GIPHY: `GIPHY_API_KEY` no `config/.env` ou,
se ela não existir, o setting `gif.giphy.api.key` (`/set gif.giphy.api.key <chave>`).

```
/giphy          → tag padrão (setting gif.tag)
/giphy gatos    → GIF com a tag "gatos"
/gif gatos      → o mesmo, pelo alias
```
