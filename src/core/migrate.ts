import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDatabase, initializeDatabase } from "./db.js";
import {
  projects,
  specs,
  tasks,
  reviews,
  artifacts,
  traces,
} from "../schemas/db.js";

export async function runMigrations(dbPath?: string) {
  const db = await initializeDatabase(dbPath);

  // For SQLite, we'll create tables directly since we're not using complex migrations yet
  // In production, you'd want to use proper migration files

  console.log("Creating database tables...");

  // Get the underlying SQLite database instance
  const sqlite = (db as any).session.client;

  // Enable foreign keys
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // Create projects table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW', 'COMPILED', 'RUNNING', 'ASSEMBLED', 'DONE', 'ERROR')),
      workspace_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create specs table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Create tasks table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RUNNING', 'NEEDS_CHANGES', 'APPROVED', 'MERGED', 'DONE', 'ERROR')),
      attempt INTEGER NOT NULL DEFAULT 0,
      score INTEGER,
      file_path TEXT,
      depends_on TEXT DEFAULT '[]',
      deliverables TEXT DEFAULT '[]',
      acceptance_criteria TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create reviews table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      pass INTEGER NOT NULL DEFAULT 0,
      attempt INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Create artifacts table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      sha TEXT,
      kind TEXT NOT NULL CHECK(kind IN ('code', 'test', 'doc', 'patch', 'config')),
      content BLOB,
      created_at INTEGER NOT NULL
    );
  `);

  // Create traces table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      agent TEXT,
      tool TEXT,
      payload TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost REAL,
      latency_ms INTEGER,
      status TEXT NOT NULL CHECK(status IN ('success', 'error', 'timeout')),
      error_message TEXT,
      timestamp INTEGER NOT NULL
    );
  `);

  // Create indexes for better performance
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_specs_project_id ON specs(project_id);"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);"
  );
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);");
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_reviews_task_id ON reviews(task_id);"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_traces_project_id ON traces(project_id);"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp);"
  );

  console.log("✅ Database tables created successfully");
  return db;
}
