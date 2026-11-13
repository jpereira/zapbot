# `/walissu`

A **joke**. Groups only: the Walissu CVE BOT picks 2 different members (not counting the bot), tags them and
replies with a random CVE among the 50 most recently published on [NVD](https://nvd.nist.gov/) in the
last 2 days.

```text
/walissu
```

Illustrative example of a reply:

```text
Hey @Fulano and @Beltrano, this is the Walissu CVE BOT! Take a look at this CVE or you are leaving the rave 😊

🛡️ CVE-AAAA-NNNN — 9 CRITICAL
Short description of the vulnerability…
https://nvd.nist.gov/vuln/detail/CVE-AAAA-NNNN

Where is the exploit? I need to get out of Brasília!

🤡 Just a joke from the Walissu CVE BOT: nobody is leaving Brasília, but the CVE is real.
```

Details:

- It uses the same draw as [`/bills`](bills.md) and the same query as [`/cve`](cve.md): groups
  with fewer than 2 members (not counting the bot) are refused, and the NVD limit without a key
  applies (~5 queries every 30 s).
- The CVE can be of any severity; on the rare days with no publications at all, the bot says so
  instead of tagging anyone. Outside a group, it replies `Only usable inside groups.`; if
  the NVD fails, `❌ I couldn't query the NVD right now.`
