# `/monitor` · admin

👀 Monitora até cinco contatos, consultando uma pessoa por vez e guardando os horários distintos
de **visto por último observados**. Disponível para o dono do bot e os admins. O cadastro e o
histórico ficam no SQLite e sobrevivem a reinícios; o backup do banco também os inclui.

| Opção | Descrição |
|---|---|
| *(nenhuma)* | Contatos cadastrados, ids, intervalo, estado observado, última verificação e últimos `monitor.maxRecords` horários por contato |
| `-add`, `-a` | Cadastra uma pessoa pelo nome da agenda, `/nome com espaços/`, menção ou número com DDI e DDD |
| `-rem`, `-r` | Remove pelo id da lista ou por nome, `/nome com espaços/`, menção real ou telefone; apaga o histórico local do cadastro |
| `-list`, `-l` | Todos os contatos e os últimos `monitor.maxRecords` horários distintos por contato; relatório extenso vai em `.txt` |

```text
/monitor
/monitor -add Jorge Chip L200
/monitor -a /Jorge Chip L200/
/monitor -a "Jorge Chip L200"
/monitor -a @Fulano
/monitor -add +5521999999999
/monitor -list
/monitor -l
/monitor -rem 1
/monitor -r #1
/monitor -r 2
/monitor -rem Jorge Chip L200
/monitor -r /Jorge Chip L200/
/monitor -r "Jorge Chip L200"
/monitor -rem @Fulano
/monitor -r +5521999999999
```

Os nomes usam a mesma busca dos [destinos](index.md#destinos-contato-grupo-número-ou-e-mail).
Se vários contatos corresponderem, o bot oferece uma lista para escolher. A menção precisa ser
selecionada na lista do WhatsApp. Grupos e e-mails não são aceitos. Uma pessoa já cadastrada não
ocupa outra vaga; o LID vira telefone quando o WhatsApp fornece essa correspondência.
O `-rem` usa o mesmo resolvedor de contatos do `-add`, incluindo escolhas por nome ambíguo.
Os ids mostrados em `/monitor` e `/monitor -l` são estáveis: remover o contato `#1` não renumera
o `#2`. O prefixo `#` é opcional no id. Só dígitos com até nove posições são id da lista;
números com dez ou mais dígitos
passam pelo resolvedor de telefone. Grupos e e-mails não são aceitos na remoção.

Sem cadastros, `/monitor` informa `👀 Nenhum contato cadastrado.`. Com cadastros, mostra:

```text
👀 MONITOR · ativo
⏱️ Verificação de cada contato a cada 5 min (300 s), no mínimo.
👥 Contatos: 1/5 · horários de São Paulo

📹 #1 · Jorge Chip L200
   ⚫ offline · horário observado
   🔎 Verificado: 14/10/2026, 16:55:10
   🕒 Último horário observado: 14/10/2026, 16:49:59
   📜 Histórico: 1 horário(s) distinto(s) · limite: 30
   • 14/10/2026, 16:49:59 · observado em 14/10/2026, 16:55:10
     Origem: presença do WhatsApp · horário não confirmado
```

Tanto `/monitor` quanto `/monitor -l` mostram até `monitor.maxRecords` entradas por contato
(padrão: 30), do horário mais recente para o mais antigo, com o horário observado, a hora em que o bot o encontrou e a fonte. Um mesmo
horário não se repete no histórico, mesmo que apareça em várias verificações.
Relatórios acima de 7.000 caracteres são enviados completos como `monitor-historico.txt`
para evitar vários replies.

## Intervalo e limite

| Setting | Padrão | Valores | Efeito |
|---|---|---|---|
| `monitor.pool` | `300` | 120–86400 segundos | Intervalo mínimo entre verificações de cada contato; 300 s = 5 min, 120 s = 2 min |
| `monitor.max` | `5` | 1–5 | Limita os cadastros; remova contatos antes de reduzir abaixo do total cadastrado |
| `monitor.maxRecords` | `30` | 1–1000 | Máximo de entradas no banco e nas listas por contato; preserva os horários mais recentes |
| `monitor.enabled` | `true` | true/false | Pausa ou retoma as consultas sem apagar cadastros nem histórico |

```text
/set monitor.pool
/set monitor.pool 300
/set monitor.pool=120
/set monitor.max
/set monitor.max=5
/set monitor.max 3
/set monitor.maxRecords=30
/set monitor.maxRecords 50
/set monitor.enabled false
/set monitor.enabled=true
/set monitor
```

A forma `chave=valor` é aceita para os quatro settings de monitoramento; a forma com espaço também
funciona. As mudanças valem sem reiniciar. **300 segundos é o padrão para reduzir a frequência,
sem ser uma garantia de segurança.** 120 segundos faz mais consultas; aumentar o intervalo reduz
a frequência e também aumenta a possibilidade de perder acessos breves.

O agendador confere os contatos pendentes a cada dez segundos, apenas localmente. A primeira
consulta ocorre na próxima passagem após o cadastro, quando o bot estiver conectado. Cada pessoa
recebe no máximo uma verificação por `monitor.pool` segundos, contando do início da tentativa;
as pessoas são consultadas em sequência. Uma consulta aguarda dados por até cinco segundos,
dentro do prazo de dez segundos para suas tentativas. Falhas também respeitam o intervalo,
sem tentativas imediatas em loop. O comando de listagem lê somente o banco: não força consultas.

O monitoramento pausa com `monitor.enabled false`, `/bot -off`, conexão indisponível ou
`/set commands.disabled monitor`. Retoma quando essas condições forem resolvidas. Uma consulta
já iniciada pode terminar. Remover um cadastro impede que seu resultado pendente recrie
o histórico.

O banco mantém no máximo `monitor.maxRecords` entradas por contato, inclusive após reinícios.
Reduzir esse valor remove imediatamente as entradas mais antigas excedentes de cada contato.
Aumentar o limite permite guardar mais entradas futuras; não recupera as já removidas.

## O que o histórico representa

- O estado pode ser `🟢 online`, `⚫ offline · horário observado`, `❔ sem dados`,
  `❔ sem horário disponível`, `🔒 horário indisponível` ou `⚠️ consulta falhou`.
- O bot prefere a coleção de presença pelo LID, mantendo indicadores e horário na mesma fonte.
  Reaproveita a assinatura ativa e só solicita presença se não houver assinatura ativa.
  O monitor não abre chats automaticamente nem altera a presença online da conta do bot.
- O horário `chatstate.t` de um estado offline sem `deny` é um **candidato** ao visto por último.
  A fonte técnica e essa classificação ficam no banco. Na lista e no relatório, aparece
  `Origem: presença do WhatsApp · horário não confirmado`; compare com o aplicativo.
- Dados já em cache podem ser observados e guardados. Um horário distinto não prova que houve
  uma atualização durante aquela consulta. Um contato online não gera um horário offline novo.
- `null`, falhas e dados sem horário válido não geram entradas fictícias. Um horário
  já observado continua no resumo mesmo quando a consulta atual estiver sem dados.
- Não é um registro completo de entradas e saídas: acessos entre consultas podem passar sem
  observação. Privacidade do contato, cache, conexão e mudanças do WhatsApp podem impedir dados.

## Risco de bloqueio

⚠️ **Intervalos curtos e mais contatos aumentam o volume de consultas e podem contribuir para
bloqueio pelo WhatsApp.** Não há frequência ou quantidade garantidamente segura, incluindo
cinco pessoas a cada cinco minutos. O limite de cinco e o mínimo de dois minutos são limites do
bot, não limites aprovados pelo WhatsApp. Os avisos aparecem no cadastro, na lista e ao alterar
`monitor.pool` ou `monitor.max` pelo `/set`.

O WhatsApp informa que a coleta automatizada de informações para finalidades não permitidas
pode causar suspensão temporária ou permanente da conta. Consulte a
[orientação oficial sobre coleta de informações](https://faq.whatsapp.com/general/security-and-privacy/about-harvesting-personal-information).

Para interromper as verificações sem perder dados:

```text
/set monitor.enabled false
```

A assinatura nativa pode permanecer ativa na sessão do WhatsApp. Remover o cadastro apaga seu
histórico local, mas cópias já feitas no backup do banco continuam nos respectivos backups.
