# `/walissu`

Só em grupos: o Walissu CVE BOT sorteia 2 membros diferentes (fora o bot), os marca e responde com
uma CVE aleatória entre as 50 publicadas mais recentemente no [NVD](https://nvd.nist.gov/) nos
últimos 2 dias.

```text
/walissu
```

Exemplo ilustrativo de resposta:

```text
Hey @Fulano e @Beltrano, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊

🛡️ CVE-AAAA-NNNN — 9 CRITICAL
Descrição resumida da vulnerabilidade…
https://nvd.nist.gov/vuln/detail/CVE-AAAA-NNNN

Cadê o exploit? Preciso sair de Brasília!
```

Detalhes:

- Usa o mesmo sorteio do [`/bills`](bills.md) e a mesma consulta do [`/cve`](cve.md): grupos com
  menos de 2 membros (fora o bot) são recusados, e vale o limite do NVD sem chave (~5 consultas a
  cada 30 s).
- A CVE pode vir de qualquer severidade; nos raros dias sem nenhuma publicação o bot avisa em vez de
  marcar alguém. Fora de um grupo, responde `Apenas utilizado dentro de grupos.`; se o NVD falha,
  `❌ Não consegui consultar o NVD agora.`
