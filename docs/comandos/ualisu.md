# `/ualisu` · admin

Só em grupos: o Walissu CVE BOT sorteia 2 membros diferentes (fora o bot), os
marca e responde com uma CVE aleatória entre as 50 publicadas mais
recentemente no [NVD](https://nvd.nist.gov/) nos últimos 2 dias.

```
/ualisu
```

Exemplo de resposta:

```
Hey @Fulano e @Beltrano, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊

🛡️ CVE-2026-103056 — 9 CRITICAL
AiSOC versions 7.2.0 before 12.0.0 contain a command injection …
https://nvd.nist.gov/vuln/detail/CVE-2026-103056

Cadê o exploit? Preciso sair de Brasília!
```

Detalhes:

- Usa o mesmo sorteio do [`/boletos`](boletos.md) e a mesma consulta do
  [`/cve`](cve.md): grupos com menos de 2 membros (fora o bot) são recusados, e
  vale o limite do NVD sem chave (~5 consultas a cada 30 s).
- A CVE pode vir de qualquer severidade; nos raros dias sem nenhuma publicação
  o bot avisa em vez de marcar alguém.
