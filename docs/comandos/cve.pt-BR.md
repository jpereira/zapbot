# `/cve`

Lista as CVEs publicadas mais recentemente no [NVD](https://nvd.nist.gov/) (base oficial do NIST),
da mais nova para a mais antiga. Cada uma vem com o ID, a nota CVSS e a severidade, um resumo da
descrição e o link para a página no NVD.

| Opção | Valor | Descrição |
|---|---|---|
| `<id>` | | Consulta essa CVE no NVD, com ou sem o prefixo `CVE-`. Ex.: `CVE-2026-1234`, `2026-1234` |
| `<texto>` | | Qualquer outro texto busca nas descrições das CVEs e lista até `cve.max`, das mais recentes para as mais antigas. Ex.: `PHP longjmp` |
| `-highscore`, `-high` | `[max]` | Só as `max` críticas (CVSS v3 `CRITICAL`, nota ≥ 9) mais recentes, de 1 a 20, dos últimos `cve.maxDays` dias (7). Sem o valor usa o setting `cve.max` (10) |

```text
/cve                 → as 10 mais recentes dos últimos 2 dias
/cve CVE-2026-1234   → o resumo dessa CVE (também vale /cve 2026-1234)
/cve -high           → as 10 críticas mais recentes dos últimos 7 dias
/cve -high 2         → só as 2 críticas mais recentes dos últimos 7 dias
/cve PHP longjmp     → as CVEs mais recentes que citam "PHP longjmp"
/set cve.max 5       → passa a exibir 5 por vez
/set cve.maxDays 30  → o -highscore passa a olhar os últimos 30 dias
```

Exemplo ilustrativo de resposta:

```text
🔥 1 CVE crítica mais recentes (CVSS ≥ 9, últimos 7 dias)

🛡️ CVE-AAAA-NNNN — 9 CRITICAL
Descrição resumida da vulnerabilidade…
https://nvd.nist.gov/vuln/detail/CVE-AAAA-NNNN
```

Detalhes:

- A quantidade exibida vem do setting `cve.max` (padrão 10, máx. 20). O `max` do `-highscore`
  (`/cve -high 5`) sobrepõe o `cve.max` só naquela chamada; valores fora de 1–20 (ou que não são
  números) são recusados com uma mensagem de ajuda.
- Com `<id>` (formato `AAAA-NNNN`, 4 ou mais dígitos no fim), o bot consulta o NVD por essa CVE e,
  se ela não existe, avisa que não encontrou.
- Com `<texto>`, a busca é a de palavras-chave do NVD, em qualquer época (sem a janela de dias). Cada
  resultado traz a severidade (🔴 crítica, 🟠 alta, 🟡 média, 🟢 baixa, ⚪ sem nota), o ID, a data de
  publicação e a descrição resumida. Se há mais do que `cve.max`, o bot diz quantas ficaram de fora.
- A janela do `-highscore` vem do setting `cve.maxDays` (padrão 7). O NVD não aceita janelas maiores
  que 120 dias, por isso o setting vai de 1 a 120.
- A nota exibida segue a ordem CVSS v3.1 → v4.0 → v3.0 → v2, preferindo a métrica principal (do
  NVD). CVEs recém-publicadas podem vir ainda sem nota.
- O filtro de críticas usa a severidade CVSS v3: CVEs avaliadas só em v4.0 ou v2 não entram no
  `-highscore`.
- Sem chave de API, o NVD aceita cerca de 5 consultas a cada 30 s e às vezes demora. Cada `/cve` faz
  2 consultas (o NVD só ordena da mais antiga para a mais nova: uma conta o total e a outra busca o
  final da lista). Em erro, o bot pede para tentar de novo em 30 s.
