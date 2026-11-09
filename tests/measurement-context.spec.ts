// SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
// SPDX-License-Identifier: MIT
import { expect, it, vi } from "vitest";
vi.mock("@agent-native/core/application-state", () => ({
  readAppState: async () => ({ view: "paper", paperId: "p", paperVersion: 1 }),
}));
vi.mock("../server/tribunal/store.js", () => ({
  requireUserEmail: (email: string) => email,
  getOwnedPaper: async () => ({ id: "p", question: "Synthetic", status: "under_review", currentVersion: 2 }),
}));
vi.mock("../server/tribunal/measurements.js", () => ({
  getMeasurementChecks: vi.fn(async (_email: string, _id: string, version: number) => ({ version, checks: [], visibility: "own-thread" })),
}));
import viewScreen from "../actions/view-screen.js";
it("fresh screen follows the selected older paper version", async () => {
  const screen = await viewScreen.run({}, { userEmail: "owner@example.invalid", caller: "agent", threadId: "A" } as any) as any;
  expect(screen.measurements.version).toBe(1);
});

