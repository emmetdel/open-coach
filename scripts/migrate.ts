// Database migration script using Bun's built-in sqlite
// Run with: bun scripts/migrate.ts

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'opencoach.db');
const MIGRATIONS_DIR = './migrations';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
	mkdirSync(DATA_DIR, { recursive: true });
}

console.log(`Migrating database at: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// Create migrations table if not exists
db.exec(`
	CREATE TABLE IF NOT EXISTS _migrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL,
		applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)
`);

// Get already applied migrations
const applied = new Set(
	db.query('SELECT name FROM _migrations').all().map((r: unknown) => (r as { name: string }).name)
);

// Get migration files
const migrationFiles = readdirSync(MIGRATIONS_DIR)
	.filter((f) => f.endsWith('.sql'))
	.sort();

console.log(`Found ${migrationFiles.length} migration files`);

let appliedCount = 0;

for (const file of migrationFiles) {
	if (applied.has(file)) {
		console.log(`  ✓ ${file} (already applied)`);
		continue;
	}

	console.log(`  → Applying ${file}...`);
	
	const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
	
	try {
		// Run migration in a transaction
		db.exec('BEGIN');
		db.exec(sql);
		db.query('INSERT INTO _migrations (name) VALUES (?)').run(file);
		db.exec('COMMIT');
		console.log(`  ✓ ${file} applied`);
		appliedCount++;
	} catch (error) {
		db.exec('ROLLBACK');
		console.error(`  ✗ ${file} failed:`, error);
		process.exit(1);
	}
}

db.close();

console.log(`\nMigration complete. Applied ${appliedCount} new migration(s).`);
