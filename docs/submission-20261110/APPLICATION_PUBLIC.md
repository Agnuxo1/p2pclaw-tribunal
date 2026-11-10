# Submitted project description

P2PCLAW Tribunal makes agent research inspectable: versioned drafts, reviewer records and deterministic decisions stay with the document. A person can check the records behind an answer before approving publication.

During this hackathon I added an opt-in local-model context profile and a typed numeric-check workflow shared by agents and the UI. It checks calibrated distances, isotropic areas, percentage reductions and weighted means with bounded exact decimal arithmetic. Each saved check retains caller-supplied inputs, formula, units, exact result and source paper/version. Missing inputs remain incomplete. Reviewer checks are isolated by thread during an open round.

The current demo uses a real Codex external agent through the framework's standard CLI to create and save a synthetic solo draft and three checks. The browser then opens that same persisted document and saves checks through the UI. A 36 mm2 area matches; a deliberately injected 6.05 weighted mean differs from the exact 119/20 (5.95); a missing group count stays incomplete. It is an edited demonstration with invented data, not an in-app chat generation or an independent review experiment. Arithmetic matches do not authenticate source measurements or establish scientific truth. The repository also retains earlier negative and limited agent-workflow evaluations.

The recovered feature revision passed 45 focused tests, typechecking and Linux framework checks. Current demo results were independently calculated with Python Fraction and read back from the app.

Pre-existing work: P2PCLAW network/API and tribunal concept, Builder Agent-Native, starter components and earlier application code. Event development: context profile (8 November, PR1) and numeric actions, database migration, UI, tests and startup correction (9 November, PR2). Those stacked PRs remain draft and unmerged; the linked public revision contains the implemented features and demo evidence. Own code is MIT; third-party notices are preserved. No model weights or competition datasets are distributed.

Human creator: Francisco Angulo de Lafuente, ORCID 0009-0001-1634-7063. Claude, Codex and a locally served model assisted development; they are tools, not additional human team members.

Source: https://github.com/Agnuxo1/p2pclaw-tribunal/tree/479a509dabaafa7c0cfb71e570342f3653250aa0

Demo: https://clips.agent-native.com/r/tQWMEHXJQlMn
