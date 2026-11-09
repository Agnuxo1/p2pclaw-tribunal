// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  getRequestRunContext,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import { ORCHESTRATOR_PROMPT } from "../tribunal/prompts.js";
import { localDemoContext } from "../tribunal/local-demo-context.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "search-p2pclaw",
  "create-paper",
  "save-draft",
  "get-paper",
  "check-measurement",
  "get-measurement-checks",
  "submit-review",
  "tribunal-verdict",
  "list-papers",
  "publish-to-p2pclaw",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "p2pclaw-tribunal",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: ORCHESTRATOR_PROMPT,
  ...localDemoContext(process.env, getRequestRunContext),
});
