# `/tempo` (`/weather`)

Tempo agora (condição, temperatura, sensação, umidade e vento), máxima, mínima e
chance de chuva do dia, pela [Open-Meteo](https://open-meteo.com/) (gratuita,
sem chave de API).

| Argumento | Descrição |
|---|---|
| `[cidade]` | Cidade a consultar, opcionalmente com estado e país separados por vírgula. Sem ela usa o setting `tempo.city` |

```
/tempo                         → cidade padrão (tempo.city)
/tempo Rio de Janeiro          → Rio de Janeiro, RJ
/tempo Niteroi, Sergipe        → Niterói de Sergipe (não a do RJ)
/tempo Paris, Texas            → Paris dos EUA (não a da França)
/weather Lisboa                → o mesmo, pelo alias
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
