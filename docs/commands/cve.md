# `/cve`

Lists the most recently published CVEs from the [NVD](https://nvd.nist.gov/) (NIST's official
database), newest to oldest. Each one comes with the ID, the CVSS score and severity, a summary of
the description and the link to the NVD page.

| Option | Value | Description |
|---|---|---|
| `<id>` | | Looks up that CVE in the NVD, with or without the `CVE-` prefix. E.g.: `CVE-2026-1234`, `2026-1234` |
| `<texto>` | | Any other text searches the CVE descriptions and lists up to `cve.max`, from newest to oldest. E.g.: `PHP longjmp` |
| `-highscore`, `-high` | `[max]` | Only the `max` most recent critical ones (CVSS v3 `CRITICAL`, score ≥ 9), from 1 to 20, from the last `cve.maxDays` days (7). Without the value it uses the `cve.max` setting (10) |

```text
/cve                 → the 10 most recent from the last 2 days
/cve CVE-2026-1234   → the summary of that CVE (/cve 2026-1234 also works)
/cve -high           → the 10 most recent critical ones from the last 7 days
/cve -high 2         → only the 2 most recent critical ones from the last 7 days
/cve PHP longjmp     → the most recent CVEs that mention "PHP longjmp"
/set cve.max 5       → now shows 5 at a time
/set cve.maxDays 30  → -highscore now looks at the last 30 days
```

Illustrative example of a reply:

```text
🔥 1 CVE crítica mais recentes (CVSS ≥ 9, últimos 7 dias)

🛡️ CVE-AAAA-NNNN — 9 CRITICAL
Descrição resumida da vulnerabilidade…
https://nvd.nist.gov/vuln/detail/CVE-AAAA-NNNN
```

Details:

- The amount shown comes from the `cve.max` setting (default 10, max 20). The `max` of `-highscore`
  (`/cve -high 5`) overrides `cve.max` only for that call; values outside 1–20 (or that aren't
  numbers) are refused with a help message.
- With `<id>` (format `YYYY-NNNN`, 4 or more digits at the end), the bot queries the NVD for that CVE
  and, if it doesn't exist, tells you it wasn't found.
- With `<texto>`, the search is the NVD keyword search, from any period (without the days window).
  Each result brings the severity (🔴 critical, 🟠 high, 🟡 medium, 🟢 low, ⚪ no score), the ID, the
  publication date and the summarized description. If there are more than `cve.max`, the bot says how
  many were left out.
- The `-highscore` window comes from the `cve.maxDays` setting (default 7). The NVD doesn't accept
  windows larger than 120 days, which is why the setting goes from 1 to 120.
- The score shown follows the order CVSS v3.1 → v4.0 → v3.0 → v2, preferring the primary metric
  (from the NVD). Newly published CVEs may still come without a score.
- The critical filter uses the CVSS v3 severity: CVEs rated only in v4.0 or v2 aren't included in
  `-highscore`.
- Without an API key, the NVD accepts about 5 queries every 30 s and is sometimes slow. Each `/cve`
  makes 2 queries (the NVD only sorts from oldest to newest: one counts the total and the other
  fetches the end of the list). On error, the bot asks you to try again in 30 s.
