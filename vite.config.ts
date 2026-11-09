// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { agentNative } from "@agent-native/core/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

// Keep dev optimization on the app's installed dependency graph when previews
// move between folders. Production builds keep the framework's normal resolver.
function scopedAssistantDependencies(): Plugin {
  return {
    name: "p2pclaw:scoped-assistant-dependencies",
    apply: "serve",
    enforce: "post",
    config(config) {
      const appRequire = createRequire(resolve(config.root ?? ".", "package.json"));
      const toolkitRequire = createRequire(appRequire.resolve("@agent-native/toolkit"));
      const assistantRequire = createRequire(toolkitRequire.resolve("@assistant-ui/react"));
      const specifiers = [
        "@assistant-ui/react", "@assistant-ui/core", "@assistant-ui/store",
        "@assistant-ui/tap", "assistant-stream", "assistant-stream/utils",
      ] as const;
      return { resolve: { alias: specifiers.map(name => ({
        find: new RegExp("^" + name + "$"),
        replacement: assistantRequire.resolve(name),
      })) } };
    },
  };
}

const reactRouterPlugins = reactRouter as unknown as () => any[];
const agentNativePlugins = agentNative as unknown as (
  options?: Parameters<typeof agentNative>[0],
) => any[];
export default defineConfig({
  optimizeDeps: {
    include: [
      "@agent-native/toolkit > @assistant-ui/react > assistant-stream > secure-json-parse",
    ],
    entries: [
      "app/entry.client.tsx",
      "app/root.tsx",
      "app/components/layout/{Layout,Sidebar}.tsx",
      "app/components/chat/ChatRouteContent.tsx",
      "app/routes/{home,chat.$threadId}.tsx",
    ],
  },
  plugins: [
    ...reactRouterPlugins(),
    ...agentNativePlugins({
      ssrStubs: ["shiki"],
    }),
    scopedAssistantDependencies(),
  ],
});
