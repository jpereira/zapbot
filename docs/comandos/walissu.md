# `/walissu` (`/ualisu`)

Groups only: the Walissu CVE BOT picks 2 different members (not counting the bot), tags them and
replies with a random CVE among the 50 most recently published on [NVD](https://nvd.nist.gov/) in the
last 2 days.

```text
/walissu
/ualisu        → the same, through the alias
```

Illustrative example of a reply:

```text
Hey @Fulano e @Beltrano, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊

🛡️ CVE-AAAA-NNNN — 9 CRITICAL
Descrição resumida da vulnerabilidade…
https://nvd.nist.gov/vuln/detail/CVE-AAAA-NNNN

Cadê o exploit? Preciso sair de Brasília!
```

Details:

- It uses the same draw as [`/bills`](bills.md) and the same query as [`/cve`](cve.md): groups
  with fewer than 2 members (not counting the bot) are refused, and the NVD limit without a key
  applies (~5 queries every 30 s).
- The CVE can be of any severity; on the rare days with no publications at all, the bot says so
  instead of tagging anyone. Outside a group, it replies `Apenas utilizado dentro de grupos.`; if
  the NVD fails, `❌ Não consegui consultar o NVD agora.`
