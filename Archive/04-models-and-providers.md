# 04 — Models: Many Providers, Local Options, Bring-Your-Own

Nothing about a vendor is hardcoded anywhere in this design. Models are configuration, chosen per purpose, swappable at runtime.

- **Provider layer.** We use the **pi harness's AI layer** (`@earendil-works/pi-ai`), which abstracts many providers behind one interface and treats models as config records (id, costs, context size). The **persona frontmatter names which model to use for what** (`model:` for chat, `judge_model:` for evaluation); nothing about a vendor is hardcoded. Editing the model catalog reloads without restart, and config values support `$ENV` interpolation so keys never live in files.

- **Model-per-purpose (all config):**
  - ambient chat → a cheap fast model;
  - task generation and submission judging → a stronger model (rarer calls, quality matters);
  - embeddings for duplicate detection and memory search → an embedding model.

  Upgrading any of these later is a config edit — "easy switch to stronger models" is a requirement, and this is how it's met. Because the model choice sits in *persona* frontmatter, different personas (and therefore different **places**, via per-place binding) can run on different models: a premium place on a premium model, a playground place on a local one.

- **Local/self-hosted models.** Local runners (Ollama, vLLM, LM Studio) expose OpenAI-compatible APIs, which the pi layer speaks — so pointing a persona at `http://localhost:11434/v1` works the same as pointing it at a cloud vendor. Honest trade-offs: full cost control and tweakability, but at real multi-user scale a self-hosted GPU fleet is its own cost/ops problem, and small local models judge less reliably. Recommended stance: support it as a **first-class config path** (great for development, testing, and cost-capped places), decide the production mix by load.

- **Bring-your-own-AI.** A user can attach their own API key/endpoint; their private-context AI usage then bills to them, not us. The provider layer supports per-user credentials cleanly. Two policy notes: (a) consumer chat subscriptions (the flat-fee apps) don't legally cover API use — BYO means an *API key*; (b) content generated on a user's own key still appears inside *our* product, so our moderation rails apply regardless of whose key paid for the tokens.

- **Cost awareness is built in.** Every pi-ai response carries token usage and computed cost, so per-user/per-place accounting, quotas, and cost dashboards fall out of the types for free.

- **Testing without any provider.** A scripted fake model (pi's `faux` provider pattern) stands in for every real one, so the entire system — moods, layers, tools, memory — runs and tests **without network or API keys**. The demo in `demo/` follows exactly this rule.
