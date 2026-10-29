// Exports the app's prompts and tribunal verdicts on fixed fixtures, so the
// Python harness runs the exact same protocol as the app.
import { writeFileSync } from "node:fs";

import { RESEARCHER_PROMPT, REVIEW_INSTRUCTIONS, REVIEWER_PROMPTS } from "../server/tribunal/prompts";
import { tribunalVerdict, type ReviewScores } from "../server/tribunal/score";

writeFileSync(
  new URL("./prompts.json", import.meta.url),
  JSON.stringify({ RESEARCHER_PROMPT, REVIEWER_PROMPTS, REVIEW_INSTRUCTIONS }, null, 2),
);

const recs = ["accept", "revise", "reject"] as const;
let state = 7;
const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
const fixtures = [];
for (let i = 0; i < 300; i++) {
  const n = 1 + Math.floor(rand() * 4);
  const lenses = ["methodologist", "domain-expert", "skeptic"];
  const strong = rand() < 0.4; // cover the accept branch too
  const score = () => Math.round((strong ? 55 + rand() * 45 : rand() * 100)) / 10;
  const reviews: ReviewScores[] = Array.from({ length: n }, (_, j) => ({
    reviewer: `r${Math.floor(rand() * 4)}${j % 2}`,
    lens: rand() < 0.85 ? lenses[j % 3]! : lenses[Math.floor(rand() * 3)]!,
    scores: { novelty: score(), rigor: score(), evidence: score(), clarity: score(), reproducibility: score() },
    recommendation: strong && rand() < 0.7 ? "accept" : recs[Math.floor(rand() * 3)]!,
  }));
  const round = 1 + Math.floor(rand() * 2);
  fixtures.push({ reviews, round, expected: tribunalVerdict(reviews, round) });
}
writeFileSync(new URL("./verdict_fixtures.json", import.meta.url), JSON.stringify(fixtures));
console.log(`exported prompts.json and ${fixtures.length} verdict fixtures`);
