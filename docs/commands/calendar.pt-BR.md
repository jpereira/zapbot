# `/calendar` `/cal`

Transforma um texto com um **compromisso** (a mensagem de "agendamento realizado" de uma clínica, uma reserva, um
convite) num **evento de agenda**: um arquivo `.ics` que abre no Google Agenda, no Calendário da Apple e no
Outlook, um **link que o adiciona ao Google Agenda** (o formulário já preenchido) e, se você pedir, o evento como
a **API do Google Calendar** quer. Mande o texto depois do comando ou **responda** a mensagem que o tem.

Ao responder a um convite, os avisos, os erros e o arquivo vão para o privado de quem chamou.
O bot tenta apagar a mensagem com o comando. Use `-d` ou `-dest` para manter a mensagem e receber
o resultado na conversa atual. Sem reply, o resultado vai para a conversa em que você digitou.

```text
/calendar [-quiet|-q] [-gpt|-g] [-local|-l] [-status|-s] [-dest|-d] [<texto>]
```

| Opção | Valor | Descrição |
|---|---|---|
| `-quiet`, `-q` | | Só o arquivo `.ics`: sem aviso, sem resumo, sem link e sem rodapé |
| `-gpt`, `-g` | | O ChatGPT lê o texto e responde o evento no **JSON do Google Calendar** (gasta a sua conta da OpenAI). Sem `-gpt` nem `-local`, vale o setting `calendar.engine` |
| `-local`, `-l` | | Lê localmente (sem chave, pelos rótulos e pelo formato das datas e horas), mesmo com o `calendar.engine` em `gpt` |
| `-dest`, `-d` | | Envia os avisos e o evento nesta conversa |
| `-status`, `-s` | | Com `-gpt`: acrescenta o consumo da chamada no rodapé (TX/RX, tokens, custo e saldo) |
| *(nenhuma)* | `[<texto>]` | O texto com o compromisso. O digitado vale mais; sem ele, a mensagem respondida |

```text
/calendar                              → respondendo a mensagem de confirmação
/calendar Dentista dia 25/11/2026 às 10:45h, Rua das Flores 10
/cal -q                                → só o .ics, respondendo
/calendar -g                           → o ChatGPT lê
```

## Criando um evento digitando

Sem uma mensagem de confirmação, descreva o evento numa frase:

```text
/calendar criar evento para dia 21 de maio as 22h, gere avisos
/calendar agendar dentista sexta às 15h, me avise 30 minutos antes
/calendar marcar reunião amanhã às 9h30
/calendar criar evento "Show do Djavan" dia 3 de dezembro 20h
/calendar festa de aniversário dia 20 de dezembro às 19h, avisos 1 dia, 6 horas e 15 minutos antes
/calendar voo para Lisboa dia 10 de janeiro às 6h, avisos 1 semana e 3 horas antes
/calendar escalada sábado às 9h
/calendar consulta no Centro Médico dia 1 de dezembro às 10:30
/calendar jantar com a Maria hoje às 20h
/calendar yoga amanhã às 7h
/calendar crossfit segunda às 18:30
/calendar anotar aniversário da Mãe dia 8 de abril
/calendar crie um lembrete amanhã às 9h30 pagar o boleto
```

Mais jeitos de dizer:

| Você digita | Você recebe |
|---|---|
| `/calendar reunião amanhã às 9h` | `💼 Reunião`, amanhã 09:00 |
| `/calendar dentista sexta às 15h, me avise 30 minutos antes` | `🦷 Dentista`, a próxima sexta 15:00, um lembrete 30 minutos antes |
| `/calendar criar evento para dia 21 de maio as 22h, gere avisos` | `📅 Evento`, o próximo 21 de maio às 22:00, lembretes 1 semana, 1 dia, 2 horas e 30 minutos antes |
| `/calendar criar evento "Show do Djavan" dia 3 de dezembro 20h` | `🎤 Show do Djavan`, 3 de dezembro às 20:00 |
| `/calendar reunião com o cliente sexta das 14h às 15h30` | um evento de 90 minutos |
| `/calendar -q corrida domingo às 7h` | só o arquivo `.ics`, sem resumo nem link |
| `/calendar -g` (respondendo um texto bagunçado) | o ChatGPT lê, para frases livres |

- **Data**: `dia 21 de maio`, `dia 25` (o próximo dia 25), `hoje`, `amanhã`, `depois de amanhã`, um dia da semana
  (`sexta`: a próxima) ou qualquer um dos formatos abaixo. Sem o ano, vale a próxima vez que esse dia chega.
- **Hora**: `22h`, `9h30`, `às 15:00`. Sem hora, o evento é de dia inteiro.
- **Título**: o que sobra depois dos verbos (`criar`, `marcar`, `agendar`, `add`...), da data e da hora
  (`Aniversário da Ana`), ou o texto entre aspas, ou o que vem depois de `chamado`. Só com a data e a hora o
  título é apenas `Evento` (ou `Lembrete`, `Reunião`... conforme você escreveu).
- **Lembretes** (`avisos`): `gere avisos` cria quatro (**1 semana, 1 dia, 2 horas e 30 minutos antes**); `me avise
  30 minutos antes` ou `avisos 1 dia, 6 horas e 15 minutos antes` cria exatamente esses. Sem uma palavra sobre isso, o padrão:
  **1 dia, 6 horas e 15 minutos antes por notificação**.

## O emoji do título

O título começa com um emoji do tipo do evento, para a agenda ficar fácil de varrer: `🩺 Consulta no Centro
Médico`, `🧗 Escalada`, `🏋🏽‍♂️ Crossfit`. Vale a primeira palavra que combina (consulta no dentista é `🦷`, não `🩺`).

| Emoji | Palavras |
|---|---|
| 🩺 | consulta, médico, exame, clínica, cardio, fisioterapia, terapia, dr, dra |
| 🦷 | dentista, ortodontia |
| 🧗 | escalada |
| 🏃🏽‍♂️ | corrida, correr, maratona |
| 🏋🏽‍♂️ | crossfit, treino, academia, musculação |
| 🧘 🏊 🚴 ⚽ 🎾 | yoga, pilates · natação · ciclismo · futebol, pelada · tênis |
| 🎂 💍 🎉 🍻 | aniversário · casamento · festa · happy hour, churrasco |
| 🍽️ 🎬 🎤 🎭 | jantar, almoço · cinema · show · teatro |
| ✈️ 🏨 🛂 | voo, viagem · hotel · passaporte |
| 💼 | reunião, call, entrevista, apresentação |
| 🎓 📝 | aula, curso, workshop · prova, teste |
| 💳 🛒 🛠️ 🚗 💇 🐶 💉 | pagar, boleto, IPTU · mercado · conserto · oficina · cabeleireiro · veterinário · vacina |
| ⏰ 📅 | lembrete · evento |

Quando nada combina, o título fica como está. No `-gpt`, o pedido ao ChatGPT inclui escolher o emoji, sem lista.
Para desligar, `/set calendar.addEmoji off`.

## O que ele entende

O leitor local procura os **rótulos** de uma confirmação e o **formato** das datas e horas:

- **Data**: `Data: 25/11/2026`, `25-11-2026`, `2026-11-25`, `25 de novembro de 2026`, `25 nov`, `Nov 25` (sem o
  ano, vale a próxima vez que esse dia chega).
- **Hora**: `Horário: 10:45h`, `10h`, `às 20:00`, e um intervalo como `10:00 às 11:00` (define o fim). Sem hora, o
  evento é de **dia inteiro**.
- **Título**: a `Especialidade:` e o `Profissional:`/`Médico:` (`Consulta: Reumatologia — Paula da Costa
  Paiva`); sem eles, a primeira linha do texto.
- **Local**: `Unidade:` e `Endereço:` (as linhas embaixo do endereço, que o WhatsApp quebra, são juntadas).
- **Descrição**: o profissional, a especialidade, o `Convênio:` e o `Plano:`, o paciente (`Nome:`), o método de
  agendamento e as observações no fim ("não esquecer documento com foto...").
- **Lembretes**: o padrão (1 dia, 6 horas e 15 minutos antes por notificação); se o texto
  diz *"chegar 20 minutos antes"*, mais um, antes da hora de chegada.

Os dois tipos de mensagem dos exemplos funcionam: a com as linhas `Data:`, `Horário:` e `Endereço:`, e a com
`*Nome*:`, `*Unidade*:`, `*Médico*:`, `*Especialidade*:`, `*Data*:` e `*Horário*:`.

Um texto **sem data** recebe uma resposta dizendo isso (tente o `-gpt`).

## Salvando no Google Agenda

Não há conta para conectar:

1. **O link** da resposta abre o Google Agenda com o evento já preenchido; você só aperta *Salvar*.
2. **O arquivo `.ics`**: abra no celular (ele pergunta em qual agenda) ou importe no Google Agenda
   (*Configurações → Importar*). O Calendário da Apple e o Outlook abrem com um clique.

## Motores

| Motor | Precisa de | Serve para |
|---|---|---|
| local (padrão) | nada | Confirmações com rótulos, datas em números ou com o nome do mês. De graça e na hora |
| `-gpt` | a chave da OpenAI (`gpt.api.key`) | Texto livre ("terça que vem às 15h no dentista"), outros idiomas, mensagens bagunçadas. A resposta é o JSON do Google Calendar, conferido como o local |

Com o `-gpt`, só os admins, ou quem tem um limite para o comando (`/bot +cmd /calendar +limit 5`), usam: o leitor
local é para todos. O fuso é o `calendar.timezone` (`America/Sao_Paulo` por padrão).

## Settings

| Setting | Padrão | O que faz |
|---|---|---|
| `calendar.engine` | `local` | `local` ou `gpt`; `-local` e `-gpt` escolhem na chamada |
| `calendar.outputToPrivate` | `on` | Envia o resultado dos replies no privado de quem chamou |
| `calendar.timezone` | `America/Sao_Paulo` | Fuso das datas e horas do texto (nome IANA) |
| `calendar.duration` | `60` | Minutos do evento quando o texto não diz |
| `calendar.addEmoji` | `on` | O título começa com um emoji do tipo do evento (`off` desliga) |
| `calendar.footer` | `on` | A linha `💡 Processado por <motor>` no fim |
| `calendar.googleLink` | `on` | O link "➕ Adicionar ao Google Agenda" (`off` desliga; o `-quiet` já esconde na chamada) |
