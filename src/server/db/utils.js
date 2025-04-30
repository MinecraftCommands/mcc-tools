// This file is intentionally .js instead of .ts, and doesn't import from anywhere else in the project so it can easily be called from github actions

/**
 * @param {number | undefined} prNum
 * @param {string} branchName
 */
export function previewDbId(prNum, branchName) {
    return `pr-${prNum}-${branchName}`.toLowerCase().replace(/\W/g, "").substring(0, 64);
}
