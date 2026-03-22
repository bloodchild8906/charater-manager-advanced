"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processFileUpdate = processFileUpdate;
const fs_1 = require("fs");
const dbUtils_1 = require("../dbUtils");
/**
 * Parses JSON array content and rejects malformed or unexpected shapes.
 */
function parseJsonArrayContent(content, sourceDescription) {
    if (!content.trim()) {
        return [];
    }
    let data;
    try {
        data = JSON.parse(content);
    }
    catch (err) {
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
function readFileContent(filepath) {
    return parseJsonArrayContent((0, fs_1.readFileSync)(filepath, 'utf8'), filepath);
}
/**
 * Replaces an entire collection table from a JSON source file.
 */
function syncCollectionFromFile(db, filepath) {
    const collectionName = (0, dbUtils_1.getCollectionNameFromJsonFile)(filepath);
    if (!collectionName) {
        return { collectionName: null, skippedRecords: 0, writtenRecords: 0 };
    }
    const currentData = readFileContent(filepath);
    const writeResult = (0, dbUtils_1.replaceTableContents)(db, collectionName, currentData);
    return Object.assign({ collectionName }, writeResult);
}
/**
 * Updates the index collection for additions, renames, and deletions.
 */
function updateIndexCollection(db, filepath, operationType) {
    const normalizedPath = filepath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop();
    if (!filename) {
        console.warn(`Could not extract filename from ${filepath}. Skipping index update.`);
        return;
    }
    const indexName = (0, dbUtils_1.getIndexName)(filename);
    if (!indexName) {
        return;
    }
    const collectionPrefix = (0, dbUtils_1.getCollectionPrefix)(filepath);
    const indexCollectionName = (0, dbUtils_1.getIndexCollectionName)(collectionPrefix);
    if (operationType === 'upsert') {
        console.log(`Upserting index '${indexName}' into collection '${indexCollectionName}'...`);
        (0, dbUtils_1.upsertRecord)(db, indexCollectionName, { index: indexName });
        return;
    }
    console.log(`Deleting index '${indexName}' from collection '${indexCollectionName}'...`);
    (0, dbUtils_1.deleteRecord)(db, indexCollectionName, indexName);
}
/**
 * Handles processing for a newly added file.
 */
function _handleFileAdded(db, filepath) {
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
function _handleFileModified(db, filepath) {
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
function _handleFileRenamed(db, filepath, oldFilepath) {
    const collectionName = (0, dbUtils_1.getCollectionNameFromJsonFile)(filepath);
    const oldCollectionName = (0, dbUtils_1.getCollectionNameFromJsonFile)(oldFilepath);
    console.log(`\nProcessing Renamed file ${oldFilepath} -> ${filepath} ` +
        `(Collections: ${oldCollectionName || 'N/A'} -> ${collectionName || 'N/A'})...`);
    if (collectionName) {
        const { skippedRecords, writtenRecords } = syncCollectionFromFile(db, filepath);
        console.log(`Replaced collection '${collectionName}' with ${writtenRecords} records.`);
        if (skippedRecords > 0) {
            console.warn(`Skipped ${skippedRecords} records in ${filepath} due to missing 'index' field.`);
        }
    }
    else {
        console.warn(`Could not determine new collection name for ${filepath}. Skipping data update.`);
    }
    if (oldCollectionName && oldCollectionName !== collectionName) {
        console.log(`Dropping old collection '${oldCollectionName}' due to rename...`);
        (0, dbUtils_1.dropTable)(db, oldCollectionName);
    }
    updateIndexCollection(db, oldFilepath, 'delete');
    updateIndexCollection(db, filepath, 'upsert');
}
/**
 * Handles processing for a deleted file.
 */
function _handleFileDeleted(db, filepath) {
    const collectionName = (0, dbUtils_1.getCollectionNameFromJsonFile)(filepath);
    console.log(`\nProcessing Deletion for ${filepath} (Collection: ${collectionName || 'N/A'})...`);
    if (collectionName) {
        (0, dbUtils_1.dropTable)(db, collectionName);
        console.log(`Dropped collection '${collectionName}' due to file deletion.`);
    }
    else {
        console.warn(`Could not determine collection name for deleted file ${filepath}. Cannot drop collection.`);
    }
    updateIndexCollection(db, filepath, 'delete');
}
/**
 * Processes a single JSON file update based on its status.
 */
function processFileUpdate(db, file) {
    return __awaiter(this, void 0, void 0, function* () {
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
                    console.error(`Error: Renamed file status 'R' requires 'oldFilepath' for ${filepath}. Skipping.`);
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
    });
}
