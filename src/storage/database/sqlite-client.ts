import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

function resolveDatabasePath(): string {
  const configuredPath = process.env.SQLITE_DATABASE_PATH || process.env.DATABASE_PATH;
  const databasePath = configuredPath || path.join(process.cwd(), 'data', 'llmmonitoring.db');

  return path.isAbsolute(databasePath)
    ? databasePath
    : path.resolve(process.cwd(), databasePath);
}

function ensureColumn(
  database: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some(column => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function initializeDatabase(database: Database.Database): void {
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');

  database.exec(`
    CREATE TABLE IF NOT EXISTS platforms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      api_endpoint TEXT NOT NULL,
      api_key TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS platforms_slug_idx ON platforms(slug);
    CREATE INDEX IF NOT EXISTS platforms_is_active_idx ON platforms(is_active);

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      model_id TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT,
      FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS models_platform_id_idx ON models(platform_id);
    CREATE INDEX IF NOT EXISTS models_model_id_idx ON models(model_id);
    CREATE INDEX IF NOT EXISTS models_is_active_idx ON models(is_active);
    CREATE INDEX IF NOT EXISTS models_platform_active_idx ON models(platform_id, is_active);

    CREATE TABLE IF NOT EXISTS ping_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      platform_id INTEGER NOT NULL,
      latency_ms INTEGER,
      ttft_ms INTEGER,
      total_time_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      request_params TEXT,
      response_data TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS ping_records_model_id_idx ON ping_records(model_id);
    CREATE INDEX IF NOT EXISTS ping_records_platform_id_idx ON ping_records(platform_id);
    CREATE INDEX IF NOT EXISTS ping_records_created_at_idx ON ping_records(created_at);
    CREATE INDEX IF NOT EXISTS ping_records_status_idx ON ping_records(status);
    CREATE INDEX IF NOT EXISTS ping_records_model_created_idx ON ping_records(model_id, created_at);

    CREATE TABLE IF NOT EXISTS evaluation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      platform_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      level TEXT NOT NULL,
      notes TEXT,
      risks TEXT,
      summary TEXT NOT NULL,
      raw_logs TEXT,
      total_calls INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 0,
      avg_latency_ms INTEGER,
      timeout_rate REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS evaluation_records_model_id_idx ON evaluation_records(model_id);
    CREATE INDEX IF NOT EXISTS evaluation_records_platform_id_idx ON evaluation_records(platform_id);
    CREATE INDEX IF NOT EXISTS evaluation_records_created_at_idx ON evaluation_records(created_at);
    CREATE INDEX IF NOT EXISTS evaluation_records_model_created_idx ON evaluation_records(model_id, created_at);

    CREATE TABLE IF NOT EXISTS health_check (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  ensureColumn(database, 'evaluation_records', 'raw_score', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'evaluation_records', 'latency_penalty', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(database, 'evaluation_records', 'evaluation_complete', 'INTEGER NOT NULL DEFAULT 1');
}

export function getSqliteClient(): Database.Database {
  if (db) return db;

  const databasePath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  db = new Database(databasePath);
  initializeDatabase(db);

  return db;
}

export function getSqliteDatabasePath(): string {
  return resolveDatabasePath();
}
