import { execSync } from 'child_process';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';
import { DatabaseSync } from 'node:sqlite';

// --- Constants ---
export const SRD_PREFIX = '5e-SRD-';
export const INDEX_COLLECTION_SUFFIX = 'collections';
export const DEFAULT_SQLITE_DB_PATH = 'data/5e-database.sqlite';
export const SQLITE_INDEX_COLUMN = 'index';
export const SQLITE_DOCUMENT_COLUMN = 'document';
export const SQLITE_UPDATED_AT_COLUMN = 'updated_at';

/**
 * Normalizes repo-relative file paths so the path helpers behave consistently
 * across Windows and POSIX environments.
 */
function normalizeRepoPath(filepath: string): string {
  return filepath.replace(/\\/g, '/');
}

/**
 * Resolves the SQLite database path from the environment or the default project location.
 */
export function getSqliteDbPath(): string {
  const configuredPath = process.env.SQLITE_DB_PATH?.trim();
  return resolve(configuredPath || DEFAULT_SQLITE_DB_PATH);
}

/**
 * Ensures the directory that will hold the SQLite database exists.
 */
export function ensureSqliteDirectory(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}

/**
 * Validates that the SQLite database already exists for incremental updates.
 */
export function requireExistingSqliteDb(scriptCommand: string): string {
  const sqliteDbPath = getSqliteDbPath();
  if (!existsSync(sqliteDbPath)) {
    console.error(
      `SQLite database not found at ${sqliteDbPath}. Run 'npm run db:refresh' before '${scriptCommand}'.`
    );
    process.exit(1);
  }

  return sqliteDbPath;
}

/**
 * Deletes the SQLite database and any sidecar files left behind by SQLite.
 */
export function resetSqliteDatabase(dbPath: string): void {
  const pathsToDelete = [dbPath, `${dbPath}-shm`, `${dbPath}-wal`];

  for (const pathToDelete of pathsToDelete) {
    if (existsSync(pathToDelete)) {
      unlinkSync(pathToDelete);
    }
  }
}

/**
 * Opens a SQLite database, creating parent directories first when needed.
 */
export function openSqliteDatabase(dbPath: string): DatabaseSync {
  ensureSqliteDirectory(dbPath);

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec('PRAGMA synchronous = NORMAL');

  return db;
}

/**
 * Quotes a SQLite identifier so table names like "2014-classes" remain valid.
 */
export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Returns whether a table exists in the SQLite database.
 */
export function tableExists(db: DatabaseSync, tableName: string): boolean {
  const statement = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  );
  return Boolean(statement.get(tableName));
}

/**
 * Drops a table if it exists.
 */
export function dropTable(db: DatabaseSync, tableName: string): void {
  db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
}

/**
 * Creates the standard table shape used for every collection in the SQLite DB.
 */
export function createCollectionTable(db: DatabaseSync, tableName: string): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (` +
      `${quoteIdentifier(SQLITE_INDEX_COLUMN)} TEXT PRIMARY KEY, ` +
      `${quoteIdentifier(SQLITE_DOCUMENT_COLUMN)} TEXT NOT NULL, ` +
      `${quoteIdentifier(SQLITE_UPDATED_AT_COLUMN)} TEXT NOT NULL` +
      `)`
  );
}

type CollectionRecord = {
  index: string;
  [key: string]: unknown;
};

export type TableWriteResult = {
  skippedRecords: number;
  writtenRecords: number;
};

function isCollectionRecord(value: unknown): value is CollectionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function disposeStatement(statement: unknown): void {
  const disposable = statement as { [Symbol.dispose]?: () => void };
  if (typeof disposable[Symbol.dispose] === 'function') {
    disposable[Symbol.dispose]!();
  }
}

function runInTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function buildStoredDocument(record: CollectionRecord, updatedAt: string): string {
  return JSON.stringify({ ...record, updated_at: updatedAt });
}

/**
 * Replaces an entire collection table with the supplied records.
 */
export function replaceTableContents(
  db: DatabaseSync,
  tableName: string,
  records: unknown[]
): TableWriteResult {
  dropTable(db, tableName);
  createCollectionTable(db, tableName);

  if (records.length === 0) {
    return { skippedRecords: 0, writtenRecords: 0 };
  }

  const insertStatement = db.prepare(
    `INSERT INTO ${quoteIdentifier(tableName)} (` +
      `${quoteIdentifier(SQLITE_INDEX_COLUMN)}, ` +
      `${quoteIdentifier(SQLITE_DOCUMENT_COLUMN)}, ` +
      `${quoteIdentifier(SQLITE_UPDATED_AT_COLUMN)}) VALUES (?, ?, ?)`
  );

  try {
    return runInTransaction(db, () => {
      let skippedRecords = 0;
      let writtenRecords = 0;

      for (const record of records) {
        if (!isCollectionRecord(record)) {
          skippedRecords++;
          continue;
        }

        const recordIndex = record.index;
        if (typeof recordIndex !== 'string' || recordIndex.trim() === '') {
          skippedRecords++;
          continue;
        }

        const updatedAt = new Date().toISOString();
        insertStatement.run(recordIndex, buildStoredDocument(record, updatedAt), updatedAt);
        writtenRecords++;
      }

      return { skippedRecords, writtenRecords };
    });
  } finally {
    disposeStatement(insertStatement);
  }
}

/**
 * Upserts a single record into a collection table.
 */
export function upsertRecord(
  db: DatabaseSync,
  tableName: string,
  record: CollectionRecord
): void {
  createCollectionTable(db, tableName);

  const upsertStatement = db.prepare(
    `INSERT INTO ${quoteIdentifier(tableName)} (` +
      `${quoteIdentifier(SQLITE_INDEX_COLUMN)}, ` +
      `${quoteIdentifier(SQLITE_DOCUMENT_COLUMN)}, ` +
      `${quoteIdentifier(SQLITE_UPDATED_AT_COLUMN)}) VALUES (?, ?, ?)` +
      ` ON CONFLICT(${quoteIdentifier(SQLITE_INDEX_COLUMN)}) DO UPDATE SET ` +
      `${quoteIdentifier(SQLITE_DOCUMENT_COLUMN)} = excluded.${quoteIdentifier(SQLITE_DOCUMENT_COLUMN)}, ` +
      `${quoteIdentifier(SQLITE_UPDATED_AT_COLUMN)} = excluded.${quoteIdentifier(SQLITE_UPDATED_AT_COLUMN)}`
  );

  try {
    const updatedAt = new Date().toISOString();
    upsertStatement.run(record.index, buildStoredDocument(record, updatedAt), updatedAt);
  } finally {
    disposeStatement(upsertStatement);
  }
}

/**
 * Deletes a record from a collection table if the table exists.
 */
export function deleteRecord(db: DatabaseSync, tableName: string, recordIndex: string): void {
  if (!tableExists(db, tableName)) {
    return;
  }

  const deleteStatement = db.prepare(
    `DELETE FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(SQLITE_INDEX_COLUMN)} = ?`
  );

  try {
    deleteStatement.run(recordIndex);
  } finally {
    disposeStatement(deleteStatement);
  }
}

/**
 * Extracts the collection name from a JSON filepath.
 * It assumes a filename pattern like '5e-SRD-CollectionName.json'.
 * It also determines a prefix based on the parent directory (e.g., '2014-' for files in 'src/2014/').
 * @param filepath The full path to the JSON file (e.g., 'src/2014/5e-SRD-Ability-Scores.json').
 * @returns The determined collection name (e.g., '2014-ability-scores') or null if the pattern doesn't match.
 */
export function getCollectionNameFromJsonFile(filepath: string): string | null {
  const parts = normalizeRepoPath(filepath).split('/');
  const filename = parts.pop();
  if (!filename) return null;

  // Determine prefix based on parent directory
  let prefix = '';
  if (parts.length > 1) {
    // Check if there is a parent directory besides 'src'
    const parentDir = parts[parts.length - 1];
    // Use the parent directory name, lowercased, plus a hyphen as the prefix
    prefix = parentDir.toLowerCase() + '-';
  }

  // Extract data name from filename
  const jsonDbCollectionPrefix = SRD_PREFIX;
  const jsonDataPattern = `\\b${jsonDbCollectionPrefix}(.+)\\.json\\b`;
  const regex = new RegExp(jsonDataPattern);
  const match = regex.exec(filename);

  if (!match) return null;

  const dataName = match[1];
  // Convert to lowercase and replace spaces/underscores with hyphens
  const baseCollectionName = dataName.toLowerCase().replace(/[\s_]+/g, '-');

  return `${prefix}${baseCollectionName}`;
}

/**
 * Determines the collection prefix based on the directory structure.
 * e.g., 'src/2014/file.json' -> '2014-'
 *       'src/file.json' -> ''
 * @param filepath Path to the file.
 * @returns The prefix string (e.g., '2014-') or an empty string.
 */
export function getCollectionPrefix(filepath: string): string {
  const parts = normalizeRepoPath(filepath).split('/');
  // Needs at least 3 parts: 'src', 'subdir', 'filename.json' for a prefix
  if (parts.length >= 3) {
    const parentDir = parts[parts.length - 2]; // Directory containing the file
    if (parentDir && parentDir !== 'src') {
      // Allow any directory under src that isn't src itself to be a prefix
      return parentDir.toLowerCase() + '-';
    }
  }
  return ''; // No prefix if directly in 'src' or structure is unexpected
}

/**
 * Extracts the base index name from a JSON filename.
 * Assumes a pattern like '5e-SRD-IndexName.json'.
 * @param filename The filename (e.g., '5e-SRD-Ability-Scores.json').
 * @returns The base index name (e.g., 'ability-scores') or null if the pattern doesn't match.
 */
export function getIndexName(filename: string): string | null {
  const jsonDbCollectionPrefix = SRD_PREFIX;
  const jsonDataPattern = `\\b${jsonDbCollectionPrefix}(.+)\\.json\\b`;
  const regex = new RegExp(jsonDataPattern);
  const match = regex.exec(filename);

  if (!match) return null;

  const dataName = match[1];
  // Convert to lowercase and replace spaces/underscores with hyphens
  return dataName.toLowerCase().replace(/[\s_]+/g, '-');
}

/**
 * Constructs the full name for the index collection based on a prefix.
 * @param prefix The collection prefix (e.g., '2014-').
 * @returns The full index collection name (e.g., '2014-collections').
 */
export function getIndexCollectionName(prefix: string): string {
  return `${prefix}${INDEX_COLLECTION_SUFFIX}`;
}

/**
 * Checks if a command-line tool exists and is executable.
 * @param command The command to check (e.g., 'mongoimport', 'git').
 * @param versionFlag The flag to get the version (e.g., '--version').
 * @returns True if the command executes successfully, false otherwise.
 */
export function checkCommandExists(command: string, versionFlag = '--version'): boolean {
  try {
    execSync(`${command} ${versionFlag}`);
    return true;
  } catch (e) {
    return false;
  }
}
