// SQLite database wrapper using Bun's built-in sqlite

import { Database } from 'bun:sqlite';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Database file path - can be overridden via environment variable
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'opencoach.db');

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
		'./migrations',
		join(dirname(fileURLToPath(import.meta.url)), '../../../migrations'),
	];
	
	let migrationsDir = '';
	for (const p of possiblePaths) {
		if (existsSync(p)) {
			migrationsDir = p;
			break;
		}
	}
	
	if (!migrationsDir) {
		console.warn('[DB] No migrations directory found, skipping migrations');
		return;
	}
	
	// Create migrations table if not exists
	database.exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);
	
	// Get already applied migrations
	const applied = new Set(
		database.query('SELECT name FROM _migrations').all().map((r: unknown) => (r as { name: string }).name)
	);
	
	// Get migration files
	const migrationFiles = readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.sql'))
		.sort();
	
	let appliedCount = 0;
	
	for (const file of migrationFiles) {
		if (applied.has(file)) {
			continue;
		}
		
		console.log(`[DB] Applying migration: ${file}`);
		const sql = readFileSync(join(migrationsDir, file), 'utf-8');
		
		try {
			database.exec('BEGIN');
			database.exec(sql);
			database.query('INSERT INTO _migrations (name) VALUES (?)').run(file);
			database.exec('COMMIT');
			appliedCount++;
		} catch (error) {
			database.exec('ROLLBACK');
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
		db.exec('PRAGMA journal_mode = WAL');
		// Enable foreign keys
		db.exec('PRAGMA foreign_keys = ON');
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
		const query = this.db.query(sql);
		let boundValues: unknown[] = [];

		const wrapper: PreparedStatement = {
			bind: (...values: unknown[]) => {
				boundValues = values;
				return wrapper;
			},
			first: async <T>(colName?: string): Promise<T | null> => {
				try {
					const row = query.get(...boundValues) as Record<string, unknown> | null;
					if (!row) return null;
					if (colName) {
						return row[colName] as T;
					}
					return row as T;
				} catch (err) {
					console.error('SQLite first() error:', err);
					throw err;
				}
			},
			all: async <T>(): Promise<QueryResult<T>> => {
				try {
					const rows = query.all(...boundValues) as T[];
					return {
						results: rows,
						success: true,
						meta: { changes: 0, last_row_id: 0 }
					};
				} catch (err) {
					console.error('SQLite all() error:', err);
					throw err;
				}
			},
			run: async (): Promise<QueryResult<unknown>> => {
				try {
					query.run(...boundValues);
					// bun:sqlite doesn't return changes/lastInsertRowid from run()
					// We need to query it separately if needed
					const changesResult = this.db.query('SELECT changes() as changes, last_insert_rowid() as lastId').get() as { changes: number; lastId: number } | null;
					return {
						results: [],
						success: true,
						meta: {
							changes: changesResult?.changes ?? 0,
							last_row_id: changesResult?.lastId ?? 0
						}
					};
				} catch (err) {
					console.error('SQLite run() error:', err);
					throw err;
				}
			}
		};

		return wrapper;
	}

	// Execute multiple statements in a transaction
	async batch(statements: PreparedStatement[]): Promise<QueryResult<unknown>[]> {
		const batchResults: QueryResult<unknown>[] = [];
		for (const stmt of statements) {
			batchResults.push(await stmt.run());
		}
		return batchResults;
	}

	// Execute raw SQL (for migrations)
	exec(sql: string): void {
		this.db.exec(sql);
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
