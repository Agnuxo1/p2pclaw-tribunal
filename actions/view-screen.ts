import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";
import { guarded, tribunalErrors } from "../server/tribunal/errors.js";
import { getOwnedPaper, requireUserEmail } from "../server/tribunal/store.js";
import { getMeasurementChecks } from "../server/tribunal/measurements.js";

export default defineAction({
  description:
    "Read current navigation and, on an owned paper, its status and recent numeric checks for the selected version, falling back to the current version. Other agents' open-round checks remain hidden. Use get-paper for the full draft.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  errors: tribunalErrors,
  run: async (_args, ctx) => guarded(async () => {
    const navigation = await readAppState("navigation");

    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;
    const paperId = navigation && typeof navigation === "object" && "paperId" in navigation
      ? navigation.paperId : undefined;
    if (typeof paperId === "string" && paperId) {
      const email = requireUserEmail(ctx?.userEmail);
      const paper = await getOwnedPaper(email, paperId);
      const selected = navigation && typeof navigation === "object" && "paperVersion" in navigation
        ? navigation.paperVersion : undefined;
      const version = typeof selected === "number" && Number.isSafeInteger(selected) && selected > 0
        ? selected : paper.currentVersion;
      screen.paper = { id: paper.id, question: paper.question, status: paper.status,
        currentVersion: paper.currentVersion, selectedVersion: version };
      if (version > 0) {
        screen.measurements = await getMeasurementChecks(email, paperId, version,
          { frontend: ctx?.caller === "frontend", threadId: ctx?.threadId });
      }
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  }),
});
