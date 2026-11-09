// @vitest-environment happy-dom
// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
vi.mock("@agent-native/core/client/agent-chat", () => ({ sendToAgentChat: vi.fn() }));
vi.mock("@agent-native/core/client/hooks", () => ({
  useActionMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useActionQuery: (action: string, args: { id: string }) => action === "get-paper" ? ({
    data: { paper: { id: args.id, status: "under_review", mode: "tribunal", currentVersion: 1, round: 1 },
      versions: [{ version: 1, title: args.id, abstract: "Synthetic", body: "Synthetic body" }],
      reviews: [], tribunal: { reason: "Pending", dimensionMeans: null } },
    isLoading: false, error: null,
  }) : ({ data: { checks: [] }, isLoading: false, error: null }),
}));
import PaperRoute from "../app/routes/papers.$id.js";
it("resets numeric form state when moving between cached same-version papers", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    await act(async () => { root.render(
      <MemoryRouter initialEntries={["/papers/A"]}>
        <Link to="/papers/B">Next synthetic paper</Link>
        <Routes><Route path="/papers/:id" element={<PaperRoute />} /></Routes>
      </MemoryRouter>,
    ); });
    const button = [...node.querySelectorAll("button")].find(x => x.textContent === "Weighted mean")!;
    await act(async () => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const link = [...node.querySelectorAll("a")].find(x => x.textContent === "Next synthetic paper")!;
    await act(async () => link.click());
    expect(node.querySelector("h1")?.textContent).toBe("B");
    expect([...node.querySelectorAll("button")].find(x => x.textContent === "Distance")?.getAttribute("aria-pressed")).toBe("true");
  } finally { await act(async () => root.unmount()); node.remove(); }
});
