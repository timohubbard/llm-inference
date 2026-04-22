import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  researchQuestion: text("research_question"),
  unitOfAnalysis: text("unit_of_analysis"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const constructs = pgTable(
  "constructs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull().default(1),
    name: text("name").notNull(),
    definition: text("definition").notNull(),
    scaleMin: integer("scale_min").notNull(),
    scaleMax: integer("scale_max").notNull(),
    anchors: jsonb("anchors").$type<Record<string, string>>().notNull(),
    citations: jsonb("citations").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueVersion: unique().on(t.projectId, t.name, t.version),
  }),
);

export const hypotheses = pgTable("hypotheses", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  text: text("text").notNull(),
  preRegisteredAt: timestamp("pre_registered_at"),
  osfUrl: text("osf_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const corpora = pgTable("corpora", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  source: text("source"),
  docCount: integer("doc_count").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const llmPrompts = pgTable("llm_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  constructId: uuid("construct_id")
    .references(() => constructs.id)
    .notNull(),
  template: text("template").notNull(),
  variablesSchema: jsonb("variables_schema").notNull(),
  promptVersion: text("prompt_version").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const traditionalRuns = pgTable("traditional_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  corpusId: uuid("corpus_id")
    .references(() => corpora.id)
    .notNull(),
  method: text("method").notNull(),
  params: jsonb("params").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const llmRuns = pgTable("llm_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  corpusId: uuid("corpus_id")
    .references(() => corpora.id)
    .notNull(),
  promptId: uuid("prompt_id")
    .references(() => llmPrompts.id)
    .notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  modelVersion: text("model_version"),
  temperature: real("temperature").notNull(),
  seed: integer("seed"),
  keyMode: text("key_mode").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  costTokensIn: integer("cost_tokens_in"),
  costTokensOut: integer("cost_tokens_out"),
  summary: jsonb("summary"),
});

export const reflexivityNotes = pgTable("reflexivity_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  linkedRunId: uuid("linked_run_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  actorId: text("actor_id").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
