# `/games`

Jogos de grupo, para quando o chat precisa de uma pausa: a **bola 8 mágica**, **verdade**,
**desafio** e **trivia**. As listas seguem o idioma do bot (`zapbot.lang`) e ficam em
[`src/commands/games.json`](https://github.com/jpereira/zapbot/blob/main/src/commands/games.json).

| Opção | Valor | Descrição |
|---|---|---|
| `-8ball` | | A bola 8 mágica: faça uma pergunta de sim ou não e ela responde (sim, não ou talvez) |
| `-truth` | | Uma pergunta de verdade para o grupo |
| `-dare` | | Um desafio para o grupo |
| `-trivia` | | Uma pergunta de conhecimentos gerais com 4 opções. Responda com a letra (A, B, C ou D) em até 5 minutos: `-trivia B`. Uma pergunta aberta por chat |

## Bola 8 mágica

```text
/games -8ball vou passar na prova?
🎱 vou passar na prova?
Os sinais apontam que sim.
```

```text
/games -8ball vale esperar a promoção?
🎱 vale esperar a promoção?
Resposta nebulosa, tente de novo.
```

Sem a pergunta, ela pede uma:

```text
/games -8ball
🎱 Faça uma pergunta: /games -8ball vou passar na prova?
```

## Verdade e desafio

```text
/games -truth
🗣️ Verdade: Qual foi a maior mentira que você já contou e nunca foi descoberto?
```

```text
/games -dare
🎯 Desafio: Mande um áudio imitando um animal à sua escolha.
```

Para animar o grupo, deixe o bot puxar uma rodada com um [`/cron`](cron.md) (o `{/comando}` do
texto roda na hora do envio):

```text
/cron sexta 20h -to /Amigos/ Rodada de sexta! {/games -truth}
```

## Trivia

O bot faz uma pergunta de conhecimentos gerais com quatro opções e a mantém aberta **por 5 minutos
naquele chat**. Responda com a letra:

```text
/games -trivia
🧠 Trivia

Qual é a capital da Austrália?

A) Sydney
B) Melbourne
C) Camberra
D) Perth

💡 Responda com /games -trivia B (em até 5 minutos).
```

```text
/games -trivia B
❌ Dessa vez não. A resposta era C) Camberra
```

```text
/games -trivia C
✅ Acertou! C) Camberra
```

- A primeira resposta fecha a pergunta (certa ou errada); `/games -trivia` faz uma nova.
- Sem pergunta aberta, `/games -trivia C` avisa que não há. O que não for A, B, C ou D é recusado.
- A pergunta aberta fica na memória: reiniciar o bot a fecha.
- O trivia não pode ir num [`/cron`](cron.md) (precisa da resposta de alguém), os outros podem.

## Jogando por reply

Não precisa digitar o comando para participar: **responda (reply) a mensagem do bot** com a sua jogada.

| Responda a | Você escreve | O que acontece |
|---|---|---|
| uma pergunta do trivia | `B` (ou `b`, `B)`) | O bot diz se você acertou e fecha a pergunta |
| uma resposta da bola 8 | outra pergunta | A bola 8 responde, e dá para continuar respondendo |
| uma verdade ou um desafio | a sua resposta, qualquer texto | O bot reage com ✅ |
| uma verdade ou um desafio | `outra` (ou `next`, `pular`) | O bot sorteia mais um do mesmo jogo |

```text
/games -trivia
🧠 Trivia

Qual é o elemento químico de símbolo Fe?

A) Flúor
B) Ferro
C) Fósforo
D) Frâncio

💡 Responda com /games -trivia B (em até 5 minutos).

(Rafael responde a ela)  b
✅ Acertou! B) Ferro
```

```text
/games -8ball vou passar na prova?
🎱 vou passar na prova?
Provavelmente sim.

(Rafael responde a ela)  e a de sexta?
🎱 e a de sexta?
Pergunte mais tarde.
```

```text
/games -dare
🎯 Desafio: Mande uma foto do que está na sua frente agora.

(Rafael responde com a legenda da foto)  olha, minha mesa
✅ (reação na mensagem dele)

(Maria responde)  outra
🎯 Desafio: Descreva o seu dia usando apenas títulos de filmes.
```

- Quem pode usar o `/games` naquele chat pode responder; os outros são ignorados, como em qualquer comando.
- O bot lembra das suas mensagens de jogo por **30 minutos** (trivia: 5). Depois, responda a uma nova.
- A bola 8 também pega a pergunta de uma mensagem: responda a ela com `/games -8ball`.
- Digitar o comando continua valendo em todo lugar: `/games -trivia B`.

## Mais exemplos

```text
/games                                  → a lista de jogos
/games -8ball vai chover amanhã?        → 🎱 vai chover amanhã? · Não conte com isso.
/games -truth                           → uma pergunta diferente a cada vez
/games -dare                            → um desafio diferente a cada vez
/games -trivia                          → pergunta; depois /games -trivia A|B|C|D responde
```

## Adicionando perguntas

Cada lista está no `games.json`, por idioma (`en_US` e `pt_BR`): `ball`, `truth`, `dare` (textos) e
`trivia` (`{ "q": "pergunta", "o": ["A", "B", "C", "D"], "a": índice da opção certa }`).
Reconstrua a imagem depois de editar.
