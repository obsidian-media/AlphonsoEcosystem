# Alphonso Pricing

Alphonso is free for local-first use. Upgrade to Pro or Enterprise for premium connectors, cloud fallback, and team features.

---

## Compare Plans

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| **Price** | $0 | $12/mo ($99/yr) | $49/mo ($499/yr) |
| **One-Time License** | — | $199 (1yr updates) | Contact |
| | | | |
| **Agents** | | | |
| All 9 specialized agents | ✓ | ✓ | ✓ |
| Priority routing | — | ✓ | ✓ |
| | | | |
| **Connectors** | | | |
| Ollama (local) | ✓ | ✓ | ✓ |
| Brave Search | ✓ | ✓ | ✓ |
| Telegram | ✓ | ✓ | ✓ |
| WhatsApp Cloud | ✓ | ✓ | ✓ |
| YouTube | ✓ | ✓ | ✓ |
| GitHub | — | ✓ | ✓ |
| Slack | — | ✓ | ✓ |
| Claude API | — | ✓ | ✓ |
| ChatGPT | — | ✓ | ✓ |
| Notion | — | ✓ | ✓ |
| ClickUp | — | ✓ | ✓ |
| SD WebUI | — | ✓ | ✓ |
| ComfyUI | — | ✓ | ✓ |
| | | | |
| **Execution** | | | |
| Parallel execution | ✓ | Unlimited | Unlimited |
| Durable queue | ✓ | ✓ | ✓ |
| Dead-letter replay | ✓ | ✓ | ✓ |
| Batch orchestration | ✓ | ✓ | ✓ |
| Approval workflows | ✓ | ✓ | ✓ |
| | | | |
| **Cloud & Storage** | | | |
| Local-only | ✓ | ✓ | ✓ |
| Cloud model fallback (BYOK) | — | ✓ | ✓ |
| SQLite memory (on-device) | ✓ | ✓ | ✓ |
| Audit export | — | — | ✓ |
| Compliance reports | — | — | ✓ |
| | | | |
| **Deployment** | | | |
| Single desktop | ✓ | ✓ | ✓ |
| Multi-desktop agent teams | — | — | ✓ |
| Self-hosted cloud gateway | — | — | ✓ |
| SLA | — | — | ✓ |
| Priority support | — | — | ✓ |

---

## One-Time License

For users who prefer a perpetual license over a subscription:

- **$199** — Same features as Pro
- Includes 1 year of updates
- After 1 year, app continues working but updates require renewal or subscription
- Paid via [Lemon Squeezy](https://lemonsqueezy.com)

---

## Feature Breakdown

### All plans include:
- 9 specialized agents with enforced role contracts
- Policy-gated security (fail-closed on every outbound call)
- Local Ollama inference — your data never leaves your machine
- Durable orchestration queue with dead-letter replay
- SQLite memory with governance metadata
- 10 structured workflows
- Plugin system
- Screen intelligence
- Voice service
- Auto-updater

### Pro adds:
- All 13 connectors (Claude, ChatGPT, GitHub, Slack, Notion, ClickUp, SD WebUI, ComfyUI)
- Priority task routing
- Cloud LLM fallback (BYOK — bring your own API key)
- Unlimited parallel execution concurrency

### Enterprise adds:
- Multi-desktop agent coordination (pair 2+ desktops)
- Audit log export (CSV, JSON)
- Compliance reports
- Self-hosted cloud gateway option
- Priority support with SLA
- Dedicated onboarding

---

## Frequently Asked Questions

**Is Alphonso really free?**
Yes. The Free tier includes all 9 agents, 6 connectors, and full local execution — no time limits, no feature gating on core agent capabilities.

**Can I use Pro features without paying?**
No. Premium connectors (GitHub, Slack, Claude, ChatGPT, Notion, ClickUp, SD WebUI, ComfyUI) require a Pro or Enterprise license. The license tier is enforced by `licenseService.ts` — it does not gate local-only operations.

**What happens to my data when I upgrade?**
Nothing. All memory, conversations, and settings are stored locally in SQLite. Upgrading merely unlocks connector capabilities — your data stays on your machine.

**Is there a trial period?**
Pro features are available for a 14-day trial period after installation. After the trial, you must purchase a license or the connectors revert to free-tier.

**Can I downgrade?**
Yes. If you cancel your subscription, your account reverts to Free tier at the end of the billing period. Premium connectors will stop working, but your local data is unaffected.

**Is the One-Time License really perpetual?**
The app continues to function after the 1-year update window. You simply won't receive new features or security patches unless you renew or switch to a subscription.

**Do you offer team/volume pricing?**
Contact [pricing@obsidianmedia.online](mailto:pricing@obsidianmedia.online) for team discounts, educational licenses, and volume pricing.

**How do I pay?**
Payments are processed through Lemon Squeezy (credit card, PayPal). Enterprise invoices are available on request.

---

## License

Alphonso is licensed under **BSL 1.1** (Business Source License). Personal use is free. Commercial use of connectors beyond the Free tier requires a paid license. See [LICENSE](https://github.com/obsidian-studios/AlphonsoEcosystem/blob/main/LICENSE) for details.
