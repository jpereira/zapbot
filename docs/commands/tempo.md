# `/tempo` (`/t`, `/weather`)

Tempo agora (condição, temperatura, sensação, umidade e vento), máxima, mínima e
chance de chuva do dia, pela [Open-Meteo](https://open-meteo.com/) (gratuita,
sem chave de API). Com um número de dias, mostra também a previsão dos
próximos dias.

| Argumento | Descrição |
|---|---|
| `[N]` ou `[Nd]` | Previsão dos próximos N dias, contando hoje (`16` ou `16d`). De 1 até o setting `tempo.maxDays` (padrão 16, máximo da Open-Meteo). Só vale como primeiro argumento |
| `[cidade]` | Cidade a consultar, opcionalmente com estado e país separados por vírgula. Sem ela usa o setting `tempo.city` |

```
/tempo                         → cidade padrão (tempo.city)
/tempo Rio de Janeiro          → Rio de Janeiro, RJ
/tempo Niteroi, Sergipe        → Niterói de Sergipe (não a do RJ)
/tempo Paris, Texas            → Paris dos EUA (não a da França)
/weather Lisboa                → o mesmo, pelo alias
/t Lisboa                      → idem, pelo alias curto
/tempo 7d Niteroi              → agora + previsão dos próximos 7 dias
/tempo 16d Niteroi             → hoje e os próximos 15 dias
/tempo 3                       → cidade padrão, próximos 3 dias
/tempo -h                      → ajuda do comando
```

Exemplo de resposta:

```
⛅ Tempo em Niterói, Rio de Janeiro, Brasil

Parcialmente nublado
🌡️ Agora: 24°C (sensação 25°C)
📈 Máx: 27°C  📉 Mín: 20°C
💧 Umidade: 78%  🌬️ Vento: 12 km/h
☔ Chance de chuva: 35%
```

Com dias (`/tempo 3d Niteroi`), depois do tempo de agora:

```
📅 Próximos 3 dias
🌦️ Hoje (qua 30/09): 32°/22° · ☔ 29% · Pancadas de chuva
🌦️ qui 01/10: 33°/22° · ☔ 92% · Garoa
🌦️ sex 02/10: 22°/20° · ☔ 100% · Pancadas de chuva
```

Acima do máximo o bot recusa e diz o limite. Para limitar as consultas, use
`/set tempo.maxDays 7`; `/set -reset tempo.maxDays` define o limite de 16 dias.
Um limite salvo continua valendo após reiniciar. Sem N, a resposta traz só o tempo de hoje.
Os dias seguem o fuso da cidade consultada.

## Alterando a cidade padrão

A cidade usada pelo `/tempo` sem argumento fica no setting `tempo.city`
(padrão `Niteroi, Rio de Janeiro, Brazil`). Para trocar, mande no WhatsApp
(o `/set` é só do dono do bot):

```
/set tempo.city São Paulo, Sao Paulo, Brazil
/set tempo.city                  → mostra o valor atual
/set -reset tempo.city           → volta para Niteroi, Rio de Janeiro, Brazil
```

A mudança vale na hora, sem reiniciar. Dicas:

- Use `cidade, estado, país` quando o nome se repete em outros lugares: só
  `Niteroi` também funciona, mas a busca escolhe a mais relevante com esse nome
  (normalmente a mais populosa).
- Acentos são opcionais (`Niteroi` ou `Niterói`) e o país pode estar em
  português ou inglês.
- Se a cidade não for encontrada o bot responde `❌ Cidade não encontrada`;
  teste antes com `/tempo <cidade>` e só depois grave no `tempo.city`.
