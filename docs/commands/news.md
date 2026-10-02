# `/news` · admin

Junta as manchetes mais recentes dos feeds RSS de uma categoria, com fonte,
data e link. Sem categoria, mostra a ajuda com todas as opções. Só o dono do
bot (e os [admins extras](bot.md#admins-extras)) usa: o `/news` de qualquer
outra pessoa é ignorado em silêncio.

| Opção | Valor | Descrição |
|---|---|---|
| `-hack`, `-hacknews` | | Hacking/segurança: The Hacker News, BleepingComputer e Krebs on Security (setting `news.hack`) |
| `-g1` | | Últimas notícias do [g1](https://g1.globo.com/) (setting `news.g1`) |
| `-gazeta`, `-gaz` | | [Gazeta do Povo](https://www.gazetadopovo.com.br/), seção Brasil (setting `news.gazeta`) |
| `-brasil`, `-br` | | Blogs sobre o Brasil listados no [feedspot](https://rss.feedspot.com/brazil_rss_feeds/), a maioria em inglês (setting `news.brasil`) |
| `quantidade` | 1–10 | Quantas manchetes. Sem ela usa o setting `news.max` (5) |

```
/news                → ajuda com todas as opções
/news -g1            → as 5 mais recentes do g1
/news -gazeta 3      → as 3 mais recentes da Gazeta do Povo
/news -br 5          → as 5 mais recentes dos blogs sobre o Brasil
/news -hack 10       → as 10 mais recentes de hacking
/news -g1 -gazeta 6  → g1 e Gazeta juntos (3 de cada, no máximo)
/news -h             → ajuda do comando
```

Exemplo de resposta:

```
📰 g1

1. Debate com candidatos ao governo de Rondônia é marcado por acusações …
g1 · 30/09/2026, 00:29:33
https://g1.globo.com/ro/rondonia/eleicoes/2026/noticia/...
```

## Alterando os feeds

Cada categoria lê a lista do seu setting (`news.<categoria>`), que aceita
qualquer feed RSS:

```
/set news.g1 https://g1.globo.com/rss/g1/economia/
/set news.hack https://feeds.feedburner.com/TheHackersNews https://krebsonsecurity.com/feed/
/set -reset news.g1                → volta ao padrão
/set news.max 3                    → muda a quantidade padrão
```

Detalhes:

- Várias categorias no mesmo comando somam os feeds.
- Cada fonte ocupa no máximo a sua fatia da lista (ex.: 6 manchetes de 2
  feeds → até 3 de cada); senão a que publica mais toma tudo.
- Um feed fora do ar não derruba os outros: ele só aparece no log.
- O `-brasil` lê cerca de 15 feeds de uma vez; a página do feedspot é HTML,
  então os feeds dela foram copiados para o setting `news.brasil` (não é
  lida a cada uso).
- Os feeds precisam ser RSS (`<item>`); feeds só em Atom (`<entry>`) não são
  lidos.
