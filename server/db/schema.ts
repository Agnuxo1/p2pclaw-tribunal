import { integer, pgTable, real, text } from "drizzle-orm/pg-core";

export const papers = pgTable("papers", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  question: text("question").notNull(),
  mode: text("mode").notNull().default("tribunal"),
  status: text("status").notNull().default("drafting"),
  currentVersion: integer("current_version").notNull().default(0),
  round: integer("round").notNull().default(0),
  publishedRef: text("published_ref"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const paperVersions = pgTable("paper_versions", {
  id: text("id").primaryKey(),
  paperId: text("paper_id").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  body: text("body").notNull(),
  changelog: text("changelog"),
  authorThread: text("author_thread"),
  createdAt: text("created_at").notNull(),
});

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  paperId: text("paper_id").notNull(),
  version: integer("version").notNull(),
  reviewer: text("reviewer").notNull(),
  lens: text("lens").notNull(),
  novelty: real("novelty").notNull(),
  rigor: real("rigor").notNull(),
  evidence: real("evidence").notNull(),
  clarity: real("clarity").notNull(),
  reproducibility: real("reproducibility").notNull(),
  recommendation: text("recommendation").notNull(),
  comments: text("comments").notNull(),
  reviewerThread: text("reviewer_thread"),
  createdAt: text("created_at").notNull(),
});
