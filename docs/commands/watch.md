# `/watch` (`/w`) · admin

Vigia mensagens recebidas que casam com regras de texto ou regex e envia avisos ao seu privado
ou aos destinos de cada regra. Sem parâmetros, lista as regras e, quando há matches, acrescenta
as ocorrências mais recentes. `/watch -10` mostra os últimos dez matches de todas as regras,
limitado pelo setting `watch.showMax`.

```
/watch /Defesa.*Civil/i
/watch /Jorge/i -in /Mr.Robots do IPSEP/
/watch /pix/i -in /Jorge Pereira/
/watch /chuva/i -in /Defesa Civil/
/watch promoção -to /Grupo Ofertas/
/watch
/watch -10
/watch -s 3
/watch -s 3 -to /Jorge Pereira/
/watch -rem 3
/watch -flush 3
```

Uma regra sem `-in` vale em qualquer lugar. Com `-in`, você escolhe a origem:

- **Contato:** testa mensagens desse remetente, em privados, grupos e status. Aceita o nome,
  uma menção real do WhatsApp ou o telefone com DDI.
- **Grupo:** testa mensagens recebidas somente naquele grupo.
- **Canal:** testa publicações daquele `@newsletter`. Aceita o nome ou o ID do canal.

Nomes com espaços ficam entre barras ou aspas (`/Jorge Pereira/`, `"Grupo Ofertas"`). Se houver
vários resultados, o bot apresenta uma lista para escolher. E-mail não é uma origem aceita.
A origem fica guardada com a regra e sobrevive a reinícios.

Tipos de regra:

- **Texto:** casa se a mensagem contém o texto, sem diferenciar maiúsculas nem acentos.
- **`/regex/flags`:** expressão regular JavaScript, com espaços e escapes preservados. As flags
  `g` e `y` são ignoradas na detecção, para cada mensagem ser avaliada independentemente.

As regras são testadas contra o texto original da mensagem. Nos avisos e no histórico, menções
como `@100000000000001` aparecem com o nome do contato quando ele pode ser resolvido.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Lista regras, origens, destinos e contagens; acrescenta os matches recentes quando houver |
| `-N` | | Quantidade de matches recentes, de todas as regras. Ex.: `/watch -10` |
| `-list`, `-l` | | Lista somente as regras, origens, destinos e contagens |
| `-show`, `-s` | `[N]` | Mostra os textos completos dos matches da regra N; sem N, de todas. `-N` controla a quantidade |
| `-in` | `<origem>` | Restringe uma regra nova a contato, grupo ou canal |
| `-rem`, `-r` | `N` | Remove a regra N, suas ocorrências, origem e destinos; as seguintes são renumeradas |
| `-flush`, `-f` | `[N]` | Apaga as ocorrências da regra N; sem N, de todas. Mantém regras, origens e destinos |
| `-to` | `<destino|off>` | Define onde os avisos serão enviados, ao criar a regra ou com `-s N`. Repita para vários destinos; `off` volta ao seu privado |

Os números positivos após `-s`, `-rem` e `-flush` identificam **regras**, conforme a listagem.
O número com hífen `-N` é a quantidade de matches a exibir. A listagem normal resume os textos;
`-s` mostra os textos completos. A ordem é da ocorrência mais recente para a mais antiga.

```
👀 WATCH: REGRAS (2/20)

#1  /Defesa.*Civil/i  (1) apenas em 📰 Defesa Civil
#2  /pix/i  (0) apenas em 👤 Jorge Pereira

👀 WATCH: OCORRÊNCIAS
🔎 Regras: todas
📦 Total: 1

1. 📅 06/10/2026, 01:09:35 · 🔎 #1
    📰 Defesa Civil
    💬 "A Defesa Civil informa: alerta de chuva"
```

Em status e transmissões (`@broadcast`), o remetente é identificado pelo autor da mensagem.
Um `@lid` é convertido para telefone quando o WhatsApp fornece a correspondência. Sem ela,
o número fica indisponível; sem autor, o nome aparece como `Desconhecido`.

Publicações de canais (`@newsletter`) aparecem com `📰 Canal: <nome>` nos avisos; o histórico
usa 📰 e o nome do canal. Canais não exibem nome nem telefone de contato. Quando o canal não
pode ser consultado, o histórico usa o nome salvo.

## Avisar em outro lugar

O `-in` escolhe **onde detectar**; o `-to` escolhe **onde avisar**. Destinos aceitam contato,
grupo, número, menção ou e-mail, como nos outros comandos
([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)).

```
/watch /vaga de emprego/i -in /Grupo Trabalho/ -to /Grupo Carreira/ -to email
/watch -s 1 -to /Jorge Pereira/
/watch -s 1 -to email
/watch -s 1 -to off
```

E-mail exige SMTP configurado; `email` usa `QRCODE_EMAIL_SMTP_TO`. Uma ocorrência gera um aviso
por destino, reunindo as regras que casaram para aquele destino.

As suas mensagens e comandos ficam fora da detecção. A mesma mensagem não gera dois avisos
para a mesma regra. As regras ficam em `watch.rules`, com máximo definido por `watch.max`;
as ocorrências são retidas por `watch.hitsRetentionDays` ou até um `/watch -flush`.
As respostas saem no chat onde o comando foi digitado.
