// SQLite database wrapper using better-sqlite3

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Database file path - can be overridden via environment variable
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'opencoach.db');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
	mkdirSync(DATA_DIR, { recursive: true });
}

// Create singleton database instance
let db: DatabaseType | null = null;

export function getDatabase(): DatabaseType {
	if (!db) {
		db = new Database(DB_PATH);
		// Enable WAL mode for better concurrent access
		db.pragma('journal_mode = WAL');
		// Enable foreign keys
		db.pragma('foreign_keys = ON');
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
	private db: DatabaseType;

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
					const row = stmt.get(...boundValues) as Record<string, unknown> | undefined;
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
					const rows = stmt.all(...boundValues) as T[];
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
					const info = stmt.run(...boundValues);
					return {
						results: [],
						success: true,
						meta: {
							changes: info.changes,
							last_row_id: Number(info.lastInsertRowid)
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
