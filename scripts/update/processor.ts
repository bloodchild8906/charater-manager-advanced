import { readFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import {
  deleteRecord,
  dropTable,
  getCollectionNameFromJsonFile,
  getCollectionPrefix,
  getIndexCollectionName,
  getIndexName,
  replaceTableContents,
  upsertRecord,
} from '../dbUtils';
import { ChangedFile } from './gitUtils';

type CollectionRecord = {
  index: string;
  [key: string]: unknown;
};

/**
 * Parses JSON array content and rejects malformed or unexpected shapes.
 */
function parseJsonArrayContent(content: string, sourceDescription: string): unknown[] {
  if (!content.trim()) {
    return [];
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new Error(`Error parsing JSON from ${sourceDescription}: ${String(err)}`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`Expected ${sourceDescription} to contain a JSON array.`);
  }

  return data;
}

/**
 * Reads and parses JSON content from a file path.
 */
function readFileContent(filepath: string): unknown[] {
  return parseJsonArrayContent(readFileSync(filepath, 'utf8'), filepath);
}

/**
 * Replaces an entire collection table from a JSON source file.
 */
function syncCollectionFromFile(
  db: DatabaseSync,
  filepath: string
): { collectionName: string | null; skippedRecords: number; writtenRecords: number } {
  const collectionName = getCollectionNameFromJsonFile(filepath);
  if (!collectionName) {
    return { collectionName: null, skippedRecords: 0, writtenRecords: 0 };
  }

  const currentData = readFileContent(filepath);
  const writeResult = replaceTableContents(db, collectionName, currentData);

  return { collectionName, ...writeResult };
}

/**
 * Updates the index collection for additions, renames, and deletions.
 */
function updateIndexCollection(
  db: DatabaseSync,
  filepath: string,
  operationType: 'upsert' | 'delete'
): void {
  const normalizedPath = filepath.replace(/\\/g, '/');
  const filename = normalizedPath.split('/').pop();

  if (!filename) {
    console.warn(`Could not extract filename from ${filepath}. Skipping index update.`);
    return;
  }

  const indexName = getIndexName(filename);
  if (!indexName) {
    return;
  }

  const collectionPrefix = getCollectionPrefix(filepath);
  const indexCollectionName = getIndexCollectionName(collectionPrefix);

  if (operationType === 'upsert') {
    console.log(`Upserting index '${indexName}' into collection '${indexCollectionName}'...`);
    upsertRecord(db, indexCollectionName, { index: indexName });
    return;
  }

  console.log(`Deleting index '${indexName}' from collection '${indexCollectionName}'...`);
  deleteRecord(db, indexCollectionName, indexName);
}

/**
 * Handles processing for a newly added file.
 */
function _handleFileAdded(db: DatabaseSync, filepath: string): void {
  console.log(`\nProcessing Added file ${filepath}...`);
  const { collectionName, skippedRecords, writtenRecords } = syncCollectionFromFile(db, filepath);

  if (!collectionName) {
    console.warn(`Could not determine collection name for added file ${filepath}. Skipping.`);
    return;
  }

  console.log(`Replaced collection '${collectionName}' with ${writtenRecords} records.`);
  if (skippedRecords > 0) {
    console.warn(`Skipped ${skippedRecords} records in ${filepath} due to missing 'index' field.`);
  }

  updateIndexCollection(db, filepath, 'upsert');
}

/**
 * Handles processing for a modified file.
 */
function _handleFileModified(db: DatabaseSync, filepath: string): void {
  console.log(`\nProcessing Modified file ${filepath}...`);
  const { collectionName, skippedRecords, writtenRecords } = syncCollectionFromFile(db, filepath);

  if (!collectionName) {
    console.warn(`Could not determine collection name for modified file ${filepath}. Skipping.`);
    return;
  }

  console.log(`Replaced collection '${collectionName}' with ${writtenRecords} records.`);
  if (skippedRecords > 0) {
    console.warn(`Skipped ${skippedRecords} records in ${filepath} due to missing 'index' field.`);
  }
}

/**
 * Handles processing for a renamed file.
 */
function _handleFileRenamed(db: DatabaseSync, filepath: string, oldFilepath: string): void {
  const collectionName = getCollectionNameFromJsonFile(filepath);
  const oldCollectionName = getCollectionNameFromJsonFile(oldFilepath);

  console.log(
    `\nProcessing Renamed file ${oldFilepath} -> ${filepath} ` +
      `(Collections: ${oldCollectionName || 'N/A'} -> ${collectionName || 'N/A'})...`
  );

  if (collectionName) {
    const { skippedRecords, writtenRecords } = syncCollectionFromFile(db, filepath);
    console.log(`Replaced collection '${collectionName}' with ${writtenRecords} records.`);

    if (skippedRecords > 0) {
      console.warn(`Skipped ${skippedRecords} records in ${filepath} due to missing 'index' field.`);
    }
  } else {
    console.warn(`Could not determine new collection name for ${filepath}. Skipping data update.`);
  }

  if (oldCollectionName && oldCollectionName !== collectionName) {
    console.log(`Dropping old collection '${oldCollectionName}' due to rename...`);
    dropTable(db, oldCollectionName);
  }

  updateIndexCollection(db, oldFilepath, 'delete');
  updateIndexCollection(db, filepath, 'upsert');
}

/**
 * Handles processing for a deleted file.
 */
function _handleFileDeleted(db: DatabaseSync, filepath: string): void {
  const collectionName = getCollectionNameFromJsonFile(filepath);
  console.log(`\nProcessing Deletion for ${filepath} (Collection: ${collectionName || 'N/A'})...`);

  if (collectionName) {
    dropTable(db, collectionName);
    console.log(`Dropped collection '${collectionName}' due to file deletion.`);
  } else {
    console.warn(
      `Could not determine collection name for deleted file ${filepath}. Cannot drop collection.`
    );
  }

  updateIndexCollection(db, filepath, 'delete');
}

/**
 * Processes a single JSON file update based on its status.
 */
export async function processFileUpdate(db: DatabaseSync, file: ChangedFile): Promise<void> {
  const { status, filepath, oldFilepath } = file;

  switch (status) {
    case 'A':
      _handleFileAdded(db, filepath);
      break;
    case 'M':
      _handleFileModified(db, filepath);
      break;
    case 'R':
      if (!oldFilepath) {
        console.error(
          `Error: Renamed file status 'R' requires 'oldFilepath' for ${filepath}. Skipping.`
        );
        return;
      }
      _handleFileRenamed(db, filepath, oldFilepath);
      break;
    case 'D':
      _handleFileDeleted(db, filepath);
      break;
    default:
      console.log(`\nSkipping file ${filepath} with unhandled status ${status}.`);
  }
}
