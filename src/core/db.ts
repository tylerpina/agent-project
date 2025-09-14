import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default database location
const DEFAULT_DB_PATH = path.join(process.cwd(), ".ideaforge.db");

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

export async function initializeDatabase(dbPath: string = DEFAULT_DB_PATH) {
  // Ensure the directory exists
  const dbDir = path.dirname(dbPath);
  await mkdir(dbDir, { recursive: true });

  // Create SQLite connection
  sqliteInstance = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  sqliteInstance.pragma("journal_mode = WAL");

  // Create Drizzle instance
  dbInstance = drizzle(sqliteInstance);

  return dbInstance;
}

export function getDatabase() {
  if (!dbInstance) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  }
  return dbInstance;
}

export function closeDatabaseConnection() {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  closeDatabaseConnection();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDatabaseConnection();
  process.exit(0);
});
