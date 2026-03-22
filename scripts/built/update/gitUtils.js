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
exports.getChangedJsonFilesWithStatus = getChangedJsonFilesWithStatus;
exports.getOldFileContent = getOldFileContent;
const child_process_1 = require("child_process");
/**
 * Parses the output of `git diff --name-status`.
 * Handles regular status lines (e.g., "M\tpath/to/file.json")
 * and rename lines (e.g., "R100\told/path.json\tnew/path.json").
 * @param output The raw string output from git diff.
 * @returns An array of ChangedFile objects.
 */
function parseNameStatusOutput(output) {
    return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
        const parts = line.split('\t');
        const status = parts[0][0]; // Take first char of status
        if (status === 'R') {
            return { status, oldFilepath: parts[1], filepath: parts[2] };
        }
        else {
            return { status, filepath: parts[1] };
        }
    });
}
/**
 * Parses the output of `git ls-files --others` and maps them to Added ('A') status.
 * @param output The raw string output from git ls-files.
 * @returns An array of ChangedFile objects with status 'A'.
 */
function parseLsFilesOutput(output) {
    return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((filepath) => ({ status: 'A', filepath }));
}
function isGitRepository() {
    try {
        const output = (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return output.trim() === 'true';
    }
    catch (error) {
        return false;
    }
}
/**
 * Gets the list of changed JSON files with their status within the src/ directory
 * comparing the current HEAD to the previous commit (HEAD~1).
 * Includes fallback logic for initial commits or shallow clones.
 * @returns An array of ChangedFile objects.
 */
function getChangedJsonFilesWithStatus() {
    var _a;
    console.log('Checking for changed JSON files with status in the last commit...');
    if (!isGitRepository()) {
        throw new Error('db:update must be run inside a git repository.');
    }
    let diffOutput = '';
    let isFallback = false;
    // 1. Try comparing HEAD vs the previous commit
    try {
        diffOutput = (0, child_process_1.execSync)('git diff --name-status -M HEAD~1 HEAD -- src/**/*.json', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    catch (error) {
        // Check if the error is due to missing history (e.g., first commit)
        if ((_a = error.stderr) === null || _a === void 0 ? void 0 : _a.includes('unknown revision or path not in the working tree')) {
            console.warn('Could not find previous commit (HEAD~1). Checking working tree status against index...');
            isFallback = true;
            // 2. If history is missing, try comparing HEAD vs the working tree/index
            try {
                diffOutput = (0, child_process_1.execSync)('git diff --name-status -M HEAD -- src/**/*.json', {
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
            }
            catch (fallbackError) {
                console.error('Error diffing working tree against HEAD:', fallbackError);
                throw new Error(`Failed to get changed files from git (fallback): ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
            }
        }
        else {
            // Re-throw other errors
            console.error('Error diffing HEAD~1..HEAD:', error);
            throw new Error(`Failed to get changed files from git: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 3. Parse the output from the successful diff command
    let changedFiles = parseNameStatusOutput(diffOutput);
    // 4. If the diff was empty (and we potentially used the fallback), check for untracked files.
    // This handles the case of the very first commit where files are added but not yet in HEAD.
    if (changedFiles.length === 0 && isFallback) {
        console.log('No changes found in diff HEAD, checking for untracked files...');
        try {
            const untrackedOutput = (0, child_process_1.execSync)('git ls-files --others --exclude-standard -- src/**/*.json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            changedFiles = parseLsFilesOutput(untrackedOutput);
        }
        catch (untrackedError) {
            console.error('Error checking for untracked files:', untrackedError);
            throw new Error(`Failed to check untracked files: ${untrackedError instanceof Error ? untrackedError.message : String(untrackedError)}`);
        }
    }
    return changedFiles;
}
/**
 * Fetches JSON content string of a file from the previous commit (HEAD~1).
 * Uses spawn to stream output, avoiding buffer limits.
 * @param gitPath The path used in the git command (could be old path for renames).
 * @returns A promise resolving to the raw string content, or an empty string on error.
 */
function getOldFileContent(gitPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const gitShow = (0, child_process_1.spawn)('git', ['show', `HEAD~1:${gitPath}`]);
            let oldFileContent = '';
            let errorOutput = '';
            gitShow.stdout.on('data', (data) => {
                oldFileContent += data.toString();
            });
            gitShow.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            gitShow.on('error', (err) => {
                // Handle errors spawning the process itself
                console.error(`Error spawning git show for HEAD~1:${gitPath}:`, err);
                resolve(''); // Resolve with empty string on spawn error
            });
            gitShow.on('close', (code) => {
                if (code === 0) {
                    resolve(oldFileContent);
                }
                else {
                    // Handle errors reported by git show (like file not found)
                    if (errorOutput.includes('exists on disk, but not in')) {
                        console.warn(`Previous version not found in git history (HEAD~1:${gitPath}).`);
                    }
                    else {
                        console.error(`Error running git show for HEAD~1:${gitPath} (code ${code}): ${errorOutput}`);
                    }
                    resolve(''); // Resolve with empty string if git show fails
                }
            });
        });
    });
}
