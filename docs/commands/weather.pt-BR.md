# `/weather`

Tempo agora (condição, temperatura, sensação, umidade e vento), máxima, mínima e chance de chuva do
dia, pela [Open-Meteo](https://open-meteo.com/) (gratuita, sem chave de API). Com um número de dias,
mostra também a previsão dos próximos dias.

| Argumento | Descrição |
| `-tts` | Fala a resposta em um áudio, com a voz padrão do [`/tts`](tts.md) (o mesmo que `/tts -q {/weather -q ...}`). Valem os settings `tts.*` |
|---|---|
| `-quiet`, `-q` | Só uma frase natural, sem emoji nem markdown (veja [Modo quieto](#modo-quieto)) |
| `[N]` ou `[Nd]` | Previsão de N dias, contando hoje (`16` ou `16d`). De 1 até o setting `weather.maxDays` (padrão 16, máximo da Open-Meteo). Só vale como primeiro argumento |
| `[cidade]` | Cidade a consultar, opcionalmente com estado ou país após uma vírgula. Sem ela usa o setting `weather.city` |

```text
/weather                         → cidade padrão (weather.city)
/weather Rio de Janeiro          → Rio de Janeiro, RJ
/weather Paris, Texas            → Paris dos EUA (não a da França)
/temp Lisboa                    → idem, completado pelo começo do nome
/weather 7d Niteroi              → agora + previsão de hoje e dos próximos 6 dias
/weather 16d Niteroi             → hoje e os próximos 15 dias
/weather 3                       → cidade padrão, hoje e os próximos 2 dias
/weather -q Niteroi              → só a frase, para ler ou falar
/weather -h                      → ajuda do comando
```

Exemplo de resposta:

```text
⛅ Niterói, Rio de Janeiro · Parcialmente nublado
🌡️ 24°C (sensação 25°C) · 📈 27° 📉 20°
💧 78%  🌬️ 12 km/h SE (rajadas 28)
☔ 35% · 2,1 mm  ☀️ UV 8
🌅 05:12  🌇 17:40

_atualizado às 14:00 · fonte: Open-Meteo_
```

Toda resposta termina com a fonte dos dados (a licença da Open-Meteo pede o crédito) e, quando ela
informa, a hora da leitura. O título traz o lugar com o estado (o país só quando não há estado) e a condição. À noite o céu limpo
vira 🌙. O vento tem a direção, e as rajadas só aparecem quando passam 5 km/h da média. O volume de
chuva (mm), o UV, o nascer e o pôr do sol e a hora da atualização aparecem quando a Open-Meteo informa.

Com dias (`/weather 3d Niteroi`), depois do tempo de agora:

```text
📅 Próximos 3 dias
🌦️ Hoje (qua 30/09): 32°/22° · ☔ 29% · Pancadas de chuva
🌦️ qui 01/10: 33°/22° · ☔ 92% · Garoa
🌦️ sex 02/10: 22°/20° · ☔ 100% · Pancadas de chuva
📊 Mín 20° · Máx 33° · chuva provável em 2 dias
```

A última linha (a partir de 2 dias) traz a faixa do período e quantos dias têm 50% ou mais de chance
de chuva.

## Modo quieto

O `-q` troca a resposta inteira por **uma frase natural**, sem emoji, markdown, outras fontes nem rodapé.
Foi feito para um texto, como `{/weather -q}` no [`/tts`](tts.md#comandos-no-texto), e os dias de previsão
são ignorados. Só fala o que importa:

- sempre: a cidade, a condição, a temperatura, a máxima e a mínima;
- a sensação só quando difere da temperatura em 2° ou mais;
- a chuva só a partir de 30% de chance (e o volume, quando é de 1 mm ou mais);
- o vento só com rajadas de 40 km/h ou mais, e o UV só a partir de 8.

```text
/weather -q Niterói
Em Niterói, parcialmente nublado, 28 graus, com sensação de 34. Máxima de 32 e mínima de 23. Chance de chuva de 100%, cerca de 12 milímetros. Vento com rajadas de 45 km/h. UV muito alto.

/tts Bom dia! {/weather -q}
```

Acima do máximo o bot recusa e diz o limite. Para limitar as consultas, use `/set weather.maxDays 7`;
`/set -reset weather.maxDays` define o limite de 16 dias. Um limite salvo continua valendo após
reiniciar. Sem N, a resposta traz só o tempo de hoje. Os dias seguem o fuso da cidade consultada.
Com `1`, o bloco da previsão se chama "Previsão de hoje". Com 5°C ou menos a resposta termina
com "🥶 Tá congelando!", e com 30°C ou mais, com "🔥 Que calor!". Os textos das condições e os nomes dos lugares seguem o
setting `zapbot.lang`.

## Outras fontes

Além da Open-Meteo (a fonte principal, sempre usada), a resposta do tempo de agora pode trazer a leitura
de outras fontes, para conferir:

```text
🔎 Outras fontes
• MET Norway: 25°C · 💧 80% · 🌬️ 14 km/h SE
• CPTEC/INPE: 📈 26° 📉 22° · Chuva
⚠️ As fontes divergem em 5°C            ← só quando a diferença é de 3°C ou mais
```

| Fonte | O que traz | Cobertura |
|---|---|---|
| `met` | [MET Norway](https://api.met.no/): temperatura, umidade e vento de agora | Mundial, sem chave |
| `cptec` | CPTEC/INPE (pela [BrasilAPI](https://brasilapi.com.br/)): mín/máx e condição de hoje | Cidades do Brasil, sem chave |

O setting `weather.sources` escolhe quais (`/set weather.sources met`; vazio deixa só a Open-Meteo). Uma
fonte fora do ar, ou que não cobre o lugar, simplesmente não aparece, e o rodapé lista só as que
responderam. A CPTEC só é consultada para cidades do Brasil, e a cidade é casada pelo nome **e** pelo
estado: ela nunca chuta outra. Todas as fontes usam `zapbot.client.userAgent`; adicione um contato nesse
setting se necessário.

## Alterando a cidade padrão

A cidade usada pelo `/weather` sem argumento fica no setting `weather.city` (padrão
`Niteroi, Rio de Janeiro, Brazil`). Para trocar, mande no WhatsApp (o `/set` aceita o dono e os
admins extras):

```text
/set weather.city São Paulo, Brazil
/set weather.city                  → mostra o valor atual
/set -r weather.city           → volta para Niteroi, Rio de Janeiro, Brazil
```

A mudança vale na hora, sem reiniciar. Dicas:

- Use `cidade, estado` ou `cidade, país` quando o nome se repete em outros lugares: só `Niteroi`
  também funciona, mas a busca escolhe a mais relevante com esse nome (normalmente a mais populosa).
- Acentos são opcionais (`Niteroi` ou `Niterói`) e o país pode estar em português ou inglês.
- Se a cidade não for encontrada o bot responde `❌ Cidade não encontrada`; teste antes com
  `/weather <cidade>` e só depois grave no `weather.city`.
