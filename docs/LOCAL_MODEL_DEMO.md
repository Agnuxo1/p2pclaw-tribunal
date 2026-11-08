# Local model demonstration profile

Francisco Angulo de Lafuente · [ORCID 0009-0001-1634-7063](https://orcid.org/0009-0001-1634-7063). SPDX-License-Identifier: MIT.

The opt-in profile makes the researcher and reviewer workflow available to a locally served model while reducing its initial action surface. Agent teams remain available. The profile validates the effective request scope after the framework has resolved it, without trying to read the HTTP body a second time. The existing application authorization and deterministic tribunal scoring still apply.

With the profile disabled, the original chat configuration is used. Enable it only with these matching development settings and an OpenAI-compatible service you operate on the loopback endpoint:

```bash
export BUILDER_LOCAL_CONTEXT_PROFILE=1
export NODE_ENV=development
export APP_URL=http://127.0.0.1:10000
export OPENAI_BASE_URL=http://127.0.0.1:4040/v1
export OPENAI_API_KEY=local-placeholder # non-secret value for the local service
export AGENT_ENGINE=ai-sdk:openai
export AGENT_BUILT_IN_ENGINES=ai-sdk:openai
export AGENT_MODEL=p2pclaw-qwen35-27b
pnpm exec agent-native dev --host 127.0.0.1 --port 10000 --strictPort
```

The service must expose the configured model alias. Model provisioning, model licensing and resource limits are handled by the operator separately; this change does not distribute weights or provide a serving process. Use the Node version required by package.json. A local Qwen3.5-27B quantized model was used for the observed demonstration. The profile is an action-surface restriction, not a security sandbox or proof of model identity.

Run the focused configuration regression without a model or network:

```bash
node --experimental-strip-types scripts/check-local-demo-context.mjs
```

Two separate functional checks were completed locally on 8 November 2026. One persisted three reviews in distinct application threads and produced a deterministic **Revise, 6.47/10** verdict on an existing draft about 20 synthetic cases. Another created a new paper in solo mode and saved version 1 from a fresh researcher thread:146 words, all five requested sections, zero reviews and no publication reference. The new paper used the supplied synthetic counts TN=6, FP=1, FN=2, TP=11. These are separate checks of drafting and review, rather than a single combined run. Thread separation does not establish statistical independence, and neither check establishes scientific improvement or a competition result. No paper was published to P2PCLAW. The optional local profile omits the publication action; the normal application retains its existing approval flow.

For a recording, show the new solo draft and the earlier reviewed paper as two distinct examples. Identify both as synthetic and the reviewed draft as pre-existing. Do not present planned revision rounds as completed. The original framework, template, dependencies and earlier application work retain their existing notices and licenses.
