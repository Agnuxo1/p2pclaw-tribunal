// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
// Local-only synthetic demo profile. Existing app authorization and scoring stay active.
export const LOCAL_DEMO_ACTIONS = [
  "view-screen", "navigate", "create-paper", "save-draft", "get-paper",
  "submit-review", "tribunal-verdict", "list-papers", "agent-teams", "tool-search",
] as const;

export function localDemoContext(
  env: Record<string, string | undefined>,
  readRunContext?: () => { allowedActionNames?: readonly string[]; actionScope?: unknown } | undefined,
) {
  if (env.BUILDER_LOCAL_CONTEXT_PROFILE !== "1") return {};
  const required = {
    NODE_ENV: "development",
    APP_URL: "http://127.0.0.1:10000",
    OPENAI_BASE_URL: "http://127.0.0.1:4040/v1",
    AGENT_ENGINE: "ai-sdk:openai",
    AGENT_BUILT_IN_ENGINES: "ai-sdk:openai",
    AGENT_MODEL: "p2pclaw-qwen35-27b",
  };
  for (const [name, value] of Object.entries(required)) {
    if (env[name] !== value) throw new Error(`Invalid local demo context: ${name}`);
  }
  const allowed = new Set<string>(LOCAL_DEMO_ACTIONS);
  return {
    // The installed lean registry omits agent-teams. Native actions keep it available.
    leanPrompt: false,
    nativeActionsInDev: true,
    skipFilesContext: true,
    initialToolNames: [...LOCAL_DEMO_ACTIONS],
    resolveActionSurface: ({ availableActionNames }: { availableActionNames: readonly string[] }) => ({
      allowedActionNames: [...new Set(availableActionNames.filter(name => allowed.has(name)))],
      // A bounded request-scope marker prevents dev mode from re-adding shell/DB tools.
      // This narrows the registry; it neither grants rights nor replaces user authorization.
      actionScope: { profile: "builder-local-synthetic-demo", revision: 1 },
    }),
    // Core has consumed the HTTP body by prepareRequest. Validate its effective
    // request-scoped surface later, after resolution and before model dispatch.
    prepareRequest: async () => ({
      prepareAfterModel: ({ model }: { model: string }) => {
        if (model !== "p2pclaw-qwen35-27b") throw new Error("Invalid resolved local demo model");
        const context = readRunContext?.();
        const scope = context?.actionScope;
        if (!scope || typeof scope !== "object" || Array.isArray(scope) ||
            Object.keys(scope).length !== 2 ||
            (scope as Record<string, unknown>).profile !== "builder-local-synthetic-demo" ||
            (scope as Record<string, unknown>).revision !== 1) {
          throw new Error("Invalid effective local demo scope");
        }
        const names = context?.allowedActionNames;
        if (!Array.isArray(names) || names.length === 0 || names.some(name => !allowed.has(name))) {
          throw new Error("Invalid effective local demo action surface");
        }
      },
    }),
  };
}
