import { runMigrations } from "@agent-native/core/db";

// Every migration carries a stable `name` slug; append, never edit an applied entry.
export const runTribunalMigrations = runMigrations(
  [
    {
      version: 1,
      name: "create-papers",
      sql: `CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    question TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'tribunal',
    status TEXT NOT NULL DEFAULT 'drafting',
    current_version INTEGER NOT NULL DEFAULT 0,
    round INTEGER NOT NULL DEFAULT 0,
    published_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
    },
    {
      version: 2,
      name: "create-paper-versions",
      sql: `CREATE TABLE IF NOT EXISTS paper_versions (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT NOT NULL,
    body TEXT NOT NULL,
    changelog TEXT,
    created_at TEXT NOT NULL
  )`,
    },
    {
      version: 3,
      name: "create-reviews",
      sql: `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    reviewer TEXT NOT NULL,
    lens TEXT NOT NULL,
    novelty REAL NOT NULL,
    rigor REAL NOT NULL,
    evidence REAL NOT NULL,
    clarity REAL NOT NULL,
    reproducibility REAL NOT NULL,
    recommendation TEXT NOT NULL,
    comments TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
    },
    {
      version: 4,
      name: "tribunal-indexes",
      sql: `CREATE INDEX IF NOT EXISTS idx_papers_owner_updated ON papers (owner_email, updated_at);
  CREATE INDEX IF NOT EXISTS idx_versions_paper ON paper_versions (paper_id, version);
  CREATE INDEX IF NOT EXISTS idx_reviews_paper_version ON reviews (paper_id, version)`,
    },
    {
      version: 5,
      name: "agent-thread-provenance",
      sql: `ALTER TABLE paper_versions ADD COLUMN IF NOT EXISTS author_thread TEXT;
  ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_thread TEXT`,
    },
    {
      version: 6,
      name: "unique-paper-version",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_versions_paper_version ON paper_versions (paper_id, version)`,
    },
  ],
  { table: "tribunal_migrations" },
);

export default runTribunalMigrations;
