# `/cotacao` (`/cambio`)

Cotação contra o real das moedas habilitadas (setting `cotacao.coins`, padrão:
EUR e USDT), ou só das pedidas: valor atual, abertura e fechamento anterior,
máxima e mínima do dia e variação (🟢 alta, 🔴 queda). Suportadas: `USD`,
`EUR`, `GBP` e `USDT`.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[MOEDA...]` | Cotação das habilitadas, ou só das moedas informadas |
| `-list`, `-l` | | Lista as suportadas; as habilitadas vêm com ✅ |
| `-add`, `-a` | `<MOEDA>` | Habilita uma moeda suportada (só o dono do bot ou um admin do [`bot.admins`](bot.md#admins-extras)) |
| `-del`, `-d` | `<MOEDA>` | Desabilita uma moeda (só o dono do bot ou um admin do [`bot.admins`](bot.md#admins-extras)) |
| `-alerta` | `[regra]` | Sem regra, lista os alertas; com regra (ex.: `USD > 5.30`), cria um. A moeda também pode vir antes: `/cotacao USD -alerta > 5.30`. Veja [Alertas de preço](#alertas-de-preço) |
| `-msg` | `<texto>` | Junto com `-alerta`: o texto vai no início do aviso. Vai até o fim do comando. Veja [Mensagem no aviso](#mensagem-no-aviso) |
| `-rm` | `<nº...\|all>` | Junto com `-alerta`: remove os alertas com esses nºs (`-rm 2`, `-rm 1 2 3` ou `-rm 1,2,3`), ou todos (`all`). Se algum nº não existe, nenhum sai |
| `-to` | `<destino>` | Junto com `-alerta`: avisa num contato (`/Jorge Pereira/`), numa menção (`@Fulano Da Silva`), num grupo (`/Grupo L200/`), num número (`+5521999999999`) ou por e-mail (`email`) em vez do seu privado. Repita para vários: um alerta só, que avisa em todos. Veja [Avisar em outro chat ou por e-mail](#avisar-em-outro-chat-ou-por-e-mail) |

- **USD, EUR, GBP**: Yahoo Finance. Se ele falhar, a AwesomeAPI (que não
  informa a abertura: aparece `—`).
- **USDT**: candles diários da Binance. O "dia" da Binance vira às 21h de
  Brasília (00h UTC), então a abertura é a desse horário.

```
/cotacao             → as habilitadas (padrão: EUR e USDT)
/cotacao usd         → só o dólar
/cambio usd eur gbp  → dólar, euro e libra
/cotacao -l          → suportadas, com ✅ nas habilitadas
/cotacao -a usd      → passa a mostrar o dólar
/cotacao -d eur      → deixa de mostrar o euro
```

```
💱 COTAÇÕES (em reais)

🇪🇺 EUR/BRL (Euro)
   💰 R$ 5,8569  🔴 -0,67%
   🔔 Abertura: R$ 5,8811 (🔴 -0,41% desde a abertura)
   🏁 Fechamento anterior: R$ 5,8962
   📈 Máx: R$ 5,9117  📉 Mín: R$ 5,8531

🪙 USDT/BRL (Tether)
   💰 R$ 5,1816  🔴 -0,70%
   🔔 Abertura: R$ 5,2181 (🔴 -0,70% desde a abertura)
   🏁 Fechamento anterior: R$ 5,2181
   📈 Máx: R$ 5,2259  📉 Mín: R$ 5,1725

🕐 30/09/2026, 16:57 · Yahoo Finance, Binance
💡 % ao lado do valor: variação desde o fechamento anterior.
```

## Alertas de preço

O `/cotacao` e o `/crypto` avisam no **seu privado** (ou, com
[`-to`](#avisar-em-outro-chat-ou-por-e-mail), em contatos, grupos, números ou
por e-mail) quando um preço passa de um valor, com um texto seu no início, se
quiser ([`-msg`](#mensagem-no-aviso)). Cada alerta dispara uma vez e é
removido. Só o dono do bot (e os [admins extras](bot.md#admins-extras)) cria,
lista e remove.

```
/cotacao -alerta USD > 5.30    → quando o dólar passar de R$ 5,30
/cotacao -alerta eur < 5,50    → quando o euro ficar abaixo de R$ 5,50
/crypto -alerta BTC < 90000    → quando o BTC ficar abaixo de $90.000
/crypto BTC -alerta > 120000   → a moeda também pode vir antes do -alerta
/cotacao -alerta               → lista os alertas do /cotacao, numerados
/cotacao -alerta -rm 2         → remove o nº 2 da lista
/crypto -alerta -rm 1 2 3      → remove os nº 1, 2 e 3 (também -rm 1,2,3)
/crypto -alerta -rm all        → remove todos os do /crypto
```

- A regra é `<MOEDA> > valor` ou `<MOEDA> < valor`. O valor aceita `.` ou `,`
  como decimal, **sem** separador de milhar (`90000`, não `90.000`).
- O `/cotacao` compara em reais; o `/crypto`, em dólares (par `<TOKEN>USDT`).
- Se o preço **já** está do lado pedido, o alerta não é criado (dispararia na
  hora): o bot mostra o valor atual.
- Os preços são consultados a cada 5 minutos (setting `alerta.intervalMin`),
  uma vez por moeda. O limite é de 20 alertas no total (setting `alerta.max`).
- No `-rm` com vários nºs, se algum não existir, nenhum é removido (o bot diz
  quais faltam). Os nºs são os da lista de antes de remover.
- Os alertas ficam na tabela `price_alerts` e sobrevivem a reinícios.

### Mensagem no aviso

Com `-msg <texto>`, o texto vai no início do aviso, antes do `🔔 ALERTA DE
PREÇO`. Ele vai até o fim do comando, então pode ter espaços e pontuação; o
`-to` pode vir antes ou depois dele.

```
/crypto BTC -alerta > 90000 -to /Jorge Pereira/ -msg Isso é uma mensagem que vai no início!
/cotacao USD -alerta > 6 -msg Dólar nas alturas! -to /Família/
```

```
Isso é uma mensagem que vai no início!

🔔 ALERTA DE PREÇO

📈 ₿ BTC/USDT ficou acima de $90,000.00
💰 Agora: $90,512.30 (🟢 +0,57% desde a criação)
📅 Alerta criado em 02/10/2026, 18:40:12
```

- A lista (`-alerta`) mostra o texto embaixo do alerta: `💬 Isso é uma
  mensagem...`.
- O texto só não pode ter um ` -to ` solto no meio: ele é lido como destino.

### Avisar em outro chat ou por e-mail

Com `-to <destino>`, o aviso vai para outro chat (ou por e-mail) em vez do seu
privado; repita o `-to` para avisar em vários. No WhatsApp, ele sai da sua
conta, como qualquer mensagem do bot. O destino é um contato (buscado
primeiro), um grupo, um número ou e-mail, como em
[Destinos: contato, grupo, número ou e-mail](index.md#destinos-contato-grupo-número-ou-e-mail).

```
/crypto -alerta BTC < 90000 -to /Grupo L200/      → no grupo "Grupo sobre L200"
/cotacao -alerta USD > 5.30 -to /Jorge Pereira/   → no privado do contato
/cotacao -alerta USD > 5.30 -to +5521999999999    → no privado do número
/cotacao -alerta EUR < 5,50 -to @Fulano Da Silva  → num grupo, mencionando a pessoa
/crypto -alerta SOL > 200 -to email               → por e-mail (QRCODE_EMAIL_SMTP_TO)
/crypto -alerta BTC < 90000 -to /Grupo L200/ -to email  → no grupo e por e-mail
/cotacao -alerta -to familia EUR < 5,50           → o -to pode vir antes da regra
```

- Com vários `-to`, é um alerta só (conta 1 no `alerta.max`): ele dispara uma
  vez e avisa em todos os destinos. Se o envio falhar num, os outros recebem
  assim mesmo. O mesmo destino repetido conta uma vez.
- Se o nome servir para mais de um contato (ou grupo), o bot lista e você
  responde com o nº; o alerta só é criado depois da escolha.
- O grupo precisa ser um em que a sua conta está; o número, uma conta do
  WhatsApp (o bot confere).
- A lista (`-alerta`) mostra o destino de cada alerta: `→ 👥 Grupo sobre L200`
  ou `→ 📧 voce@exemplo.com` (vários: `→ 👥 Grupo sobre L200, 📧 voce@exemplo.com`).

```
🔔 ALERTA DE PREÇO

📈 🇺🇸 USD/BRL ficou acima de R$ 5,3000
💰 Agora: R$ 5,3100 (🟢 +2,12% desde a criação)
📅 Alerta criado em 30/09/2026, 10:12:03
```
