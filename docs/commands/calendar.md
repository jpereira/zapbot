# `/calendar` `/cal`

Turns a text with an **appointment** (a clinic's "appointment confirmed" message, a booking, an invitation) into a
**calendar event**: an `.ics` file that opens in Google Calendar, Apple Calendar and Outlook, a **link that adds
it to Google Calendar** (the form already filled) and, on request, the event as the **Google Calendar API** wants
it. Send the text after the command or **reply** to the message with it.

```text
/calendar [-quiet|-q] [-gpt|-g] [-local|-l] [-status|-s] [<text>]
```

| Option | Value | Description |
|---|---|---|
| `-quiet`, `-q` | | Only the `.ics` file: no notice, no summary, no link and no footer |
| `-gpt`, `-g` | | ChatGPT reads the text and answers with the event in the **Google Calendar JSON** (spends your OpenAI account). Without `-gpt` or `-local`, the `calendar.engine` setting |
| `-local`, `-l` | | Reads locally (no key, by the labels and the shape of the dates and times), even when `calendar.engine` is `gpt` |
| `-status`, `-s` | | With `-gpt`: adds the call usage to the footer (TX/RX, tokens, cost and balance) |
| *(none)* | `[<text>]` | The text with the appointment. Typed text wins; without it, the replied message |

```text
/calendar                              → replying to the confirmation message
/calendar Dentist on 25/11/2026 at 10:45h, Rua das Flores 10
/cal -q                                → only the .ics, replying
/calendar -g                           → ChatGPT reads it
```

## Creating an event by typing

Without a confirmation message, describe the event in a sentence:

```text
/calendar create an event for May 21 at 10pm, generate reminders
/calendar add dentist friday at 3pm, remind me 30 minutes before
/calendar schedule a meeting tomorrow at 9:30am
/calendar create event "Djavan concert" on Dec 3 at 8pm
/calendar birthday party Dec 20 at 7pm, remind me 1 day and 2 hours before
/calendar flight to Lisbon on Jan 10 at 6am, remind me 1 week and 3 hours before
/calendar climbing saturday at 9am
/calendar doctor appointment Dec 1 at 10:30am
/calendar dinner with Maria today at 8pm
/calendar yoga tomorrow at 7am
/calendar crossfit monday at 6:30pm
/calendar create event Mom's birthday on Apr 8
```

More ways to say it:

| You type | You get |
|---|---|
| `/calendar meeting tomorrow at 9am` | `💼 Meeting`, tomorrow 09:00 |
| `/calendar dentist friday at 3pm, remind me 30 minutes before` | `🦷 Dentist`, next Friday 15:00, one reminder 30 minutes before |
| `/calendar create an event for May 21 at 10pm, generate reminders` | `📅 Event`, the next May 21 at 22:00, reminders 1 week, 1 day, 2 hours and 30 minutes before |
| `/calendar create event "Djavan concert" on Dec 3 at 8pm` | `🎤 Djavan concert`, Dec 3 at 20:00 |
| `/calendar client meeting friday 2pm to 3:30pm` | a 90-minute event |
| `/calendar -q running sunday at 7am` | only the `.ics` file, no summary or link |
| `/calendar -g` (replying to a messy text) | ChatGPT reads it, for free-form phrases |

- **Date**: `May 21`, `Dec 3`, `tomorrow`, `today`, a day of the week (`friday`: the next one), `dia 25` (the next
  25th) or any of the formats below. Without the year, the next time that day comes.
- **Time**: `3pm`, `10:30am`, `9h30`, `15:00`. Without a time, the event is an all-day one.
- **Title**: what is left after the verbs (`create`, `add`, `schedule`...), the date and the time
  (`Mom's birthday`), or the text in quotes. With only the date and the time the title is just `Event`.
- **Reminders**: `generate reminders` makes four (**1 week, 1 day, 2 hours and 30 minutes before**); `remind me 30
  minutes before` or `remind me 1 day and 2 hours before` makes exactly those. Without a word about it, the
  default: **1 day and 2 hours before by notification, and 1 day before by email too**.

## The emoji of the title

The title starts with an emoji of the kind of event, so the calendar is easy to scan: `🩺 Consulta no Centro
Médico`, `🧗 Climbing`, `🏋🏽‍♂️ Crossfit`. The first word that fits wins (a dentist appointment is `🦷`, not `🩺`).

| Emoji | Words (the Portuguese ones too) |
|---|---|
| 🩺 | doctor, appointment, consulta, médico, exame, clínica, cardio, physio, therapy |
| 🦷 | dentist, dentista, orthodontist |
| 🧗 | climbing, escalada |
| 🏃🏽‍♂️ | running, corrida, marathon |
| 🏋🏽‍♂️ | crossfit, workout, treino, academia, gym |
| 🧘 🏊 🚴 ⚽ 🎾 | yoga, pilates · swimming · cycling · soccer · tennis |
| 🎂 💍 🎉 🍻 | birthday · wedding · party · happy hour |
| 🍽️ 🎬 🎤 🎭 | dinner, lunch · movie · concert, show · theater |
| ✈️ 🏨 🛂 | flight, trip · hotel · passport |
| 💼 | meeting, call, interview, presentation |
| 🎓 📝 | class, course, workshop · exam, test |
| 💳 🛒 🛠️ 🚗 💇 🐶 💉 | pay, bill, rent · groceries · repair · car · haircut · vet · vaccine |
| ⏰ 📅 | reminder · event |

When nothing fits, the title is left as it is. With `-gpt`, the prompt asks ChatGPT to pick the emoji, with no
list. To turn it off, `/set calendar.addEmoji off`.

## What it understands

The local reader looks for the **labels** of a confirmation and for the **shape** of the dates and times:

- **Date**: `Data: 25/11/2026`, `25-11-2026`, `2026-11-25`, `25 de novembro de 2026`, `25 nov`, `Nov 25` (without
  the year, the next time that day comes).
- **Time**: `Horário: 10:45h`, `10h`, `às 20:00`, and a range such as `10:00 às 11:00` (it sets the end). Without a
  time, the event is **all day**.
- **Title**: the `Especialidade:` and the `Profissional:`/`Médico:` (`Consulta: Reumatologia — Paula da Costa
  Paiva`); without them, the first line of the text.
- **Place**: `Unidade:` and `Endereço:` (the lines under the address, which WhatsApp wraps, are joined).
- **Description**: the professional, the specialty, the `Convênio:` and `Plano:`, the patient (`Nome:`), the
  scheduling method and the notes at the end ("não esquecer documento com foto...").
- **Reminders**: the default (1 day and 2 hours before by notification, 1 day before by email too); if the
  text says *"chegar 20 minutos antes"*, one more, before the arrival time.

Both kinds of message from the examples work: the one with `Data:`, `Horário:` and `Endereço:` lines, and the one
with `*Nome*:`, `*Unidade*:`, `*Médico*:`, `*Especialidade*:`, `*Data*:` and `*Horário*:`.

A text with **no date** gets an answer saying so (try `-gpt`).

## Saving it in Google Calendar

There is no account to connect:

1. **The link** in the reply opens Google Calendar with the event already filled; you only press *Save*.
2. **The `.ics` file**: open it on the phone (it asks which calendar) or import it in Google Calendar
   (*Settings → Import*). Apple Calendar and Outlook open it with a click.

## Engines

| Engine | Needs | What it is good at |
|---|---|---|
| local (default) | nothing | Confirmations with labels, dates in numbers or with the month name. Free and instant |
| `-gpt` | the OpenAI key (`gpt.api.key`) | Free text ("next Tuesday at 3pm at the dentist"), other languages, messy messages. The answer is the Google Calendar JSON, checked like the local one |

With `-gpt`, only the admins, or someone with a limit for the command (`/bot +cmd /calendar +limit 5`), can use it:
the local reader is for everyone. The time zone is `calendar.timezone` (`America/Sao_Paulo` by default).

## Settings

| Setting | Default | What it does |
|---|---|---|
| `calendar.engine` | `local` | `local` or `gpt`; `-local` and `-gpt` choose per call |
| `calendar.timezone` | `America/Sao_Paulo` | Time zone of the dates and times in the text (IANA name) |
| `calendar.duration` | `60` | Minutes of the event when the text does not say |
| `calendar.addEmoji` | `on` | The title starts with an emoji of the kind of event (`off` to turn it off) |
| `calendar.footer` | `on` | The `💡 Processed by <engine>` line at the end |
| `calendar.googleLink` | `on` | The "➕ Add to Google Calendar" link (`off` to turn it off; `-quiet` already hides it per call) |
