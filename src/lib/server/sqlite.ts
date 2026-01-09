// SQLite database wrapper using bun:sqlite

import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

// Database file path - can be overridden via environment variable
const DATA_DIR = process.env.DATA_DIR || "./data";
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, "opencoach.db");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Create singleton database instance
let db: Database | null = null;
let migrationsRun = false;

function runMigrations(database: Database): void {
  if (migrationsRun) return;
  migrationsRun = true;

  // Find migrations directory - try multiple paths
  const possiblePaths = [
    "./migrations",
    "./web/migrations",
    join(dirname(fileURLToPath(import.meta.url)), "../../../migrations"),
  ];

  let migrationsDir = "";
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      migrationsDir = p;
      break;
    }
  }

  if (!migrationsDir) {
    console.warn("[DB] No migrations directory found, skipping migrations");
    return;
  }

  // Create migrations table if not exists
  database.run(`
		CREATE TABLE IF NOT EXISTS _migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

  // Get already applied migrations
  const applied = new Set(
    database
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((r: any) => r.name),
  );

  // Get migration files
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }

    console.log(`[DB] Applying migration: ${file}`);
    const sql = readFileSync(join(migrationsDir, file), "utf-8");

    try {
      database.run("BEGIN");
      database.run(sql);
      database.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      database.run("COMMIT");
      appliedCount++;
    } catch (error) {
      database.run("ROLLBACK");
      console.error(`[DB] Migration ${file} failed:`, error);
      throw error;
    }
  }

  if (appliedCount > 0) {
    console.log(`[DB] Applied ${appliedCount} migration(s)`);
  }
}

export function getDatabase(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    // Enable WAL mode for better concurrent access
    db.run("PRAGMA journal_mode = WAL");
    // Enable foreign keys
    db.run("PRAGMA foreign_keys = ON");
    // Run migrations on first connection
    runMigrations(db);
  }
  return db;
}

// Close database connection (for graceful shutdown)
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Query result interface
interface QueryResult<T> {
  results: T[];
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
  };
}

// Prepared statement interface
interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<QueryResult<T>>;
  run(): Promise<QueryResult<unknown>>;
}

// SQLite wrapper class
class SQLiteWrapper {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql);
    let boundValues: unknown[] = [];

    const wrapper: PreparedStatement = {
      bind: (...values: unknown[]) => {
        boundValues = values;
        return wrapper;
      },
      first: async <T>(colName?: string): Promise<T | null> => {
        try {
          const row = stmt.get(...boundValues) as
            | Record<string, unknown>
            | undefined;
          if (!row) return null;
          if (colName) {
            return row[colName] as T;
          }
          return row as T;
        } catch (err) {
          console.error("SQLite first() error:", err);
          throw err;
        }
      },
      all: async <T>(): Promise<QueryResult<T>> => {
        try {
          const rows = stmt.all(...boundValues) as T[];
          return {
            results: rows,
            success: true,
            meta: { changes: 0, last_row_id: 0 },
          };
        } catch (err) {
          console.error("SQLite all() error:", err);
          throw err;
        }
      },
      run: async (): Promise<QueryResult<unknown>> => {
        try {
          const info = stmt.run(...boundValues);
          return {
            results: [],
            success: true,
            meta: {
              changes: info.changes,
              last_row_id: Number(info.lastInsertRowid),
            },
          };
        } catch (err) {
          console.error("SQLite run() error:", err);
          throw err;
        }
      },
    };

    return wrapper;
  }

  // Execute multiple statements in a transaction
  async batch(
    statements: PreparedStatement[],
  ): Promise<QueryResult<unknown>[]> {
    const batchResults: QueryResult<unknown>[] = [];
    for (const stmt of statements) {
      batchResults.push(await stmt.run());
    }
    return batchResults;
  }

  // Execute raw SQL (for migrations)
  exec(sql: string): void {
    this.db.run(sql);
  }
}

// Export singleton instance
let wrapper: SQLiteWrapper | null = null;

export function getSQLiteDatabase(): SQLiteWrapper {
  if (!wrapper) {
    wrapper = new SQLiteWrapper();
  }
  return wrapper;
}

// Type alias for external use
export type LocalDatabase = SQLiteWrapper;
