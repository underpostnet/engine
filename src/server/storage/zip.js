/**
 * ZIP archive helpers built on JSZip, shared by the file-storage CLI and the client builder.
 * @module src/server/storage/zip.js
 * @namespace Zip
 */

import JSZip from 'jszip';
import * as dir from 'path';
import fs from 'fs-extra';

const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Reports whether a buffer starts with the ZIP local file header signature.
 * @function isZipBuffer
 * @param {Buffer} buffer - Candidate archive bytes.
 * @returns {boolean} True when the buffer looks like a ZIP archive.
 * @memberof Zip
 */
const isZipBuffer = (buffer) => Buffer.isBuffer(buffer) && buffer.subarray(0, 4).equals(ZIP_LOCAL_FILE_HEADER);

/**
 * Loads a ZIP archive from a buffer or a local path.
 * @function loadZip
 * @param {Buffer|string} source - Archive bytes or a path to the archive.
 * @returns {Promise<JSZip>} The loaded archive.
 * @memberof Zip
 */
const loadZip = async (source) => JSZip.loadAsync(Buffer.isBuffer(source) ? source : fs.readFileSync(source));

/**
 * Resolves an archive entry by exact name, then by trailing path segment, then by
 * falling back to the only entry of a single-file archive.
 * @function findZipEntry
 * @param {JSZip} zip - The loaded archive.
 * @param {string} entryName - Entry name or basename to look up.
 * @returns {object|null} The matching JSZip entry, or null when nothing matches.
 * @memberof Zip
 */
const findZipEntry = (zip, entryName) => {
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  return (
    files.find((entry) => entry.name === entryName) ??
    files.find((entry) => entry.name.endsWith(`/${entryName}`)) ??
    (files.length === 1 ? files[0] : null)
  );
};

/**
 * Reads a single entry out of an archive.
 * @function readZipEntry
 * @param {Buffer|string} source - Archive bytes or a path to the archive.
 * @param {string} entryName - Entry name or basename to read.
 * @returns {Promise<Buffer|null>} The entry contents, or null when the entry is absent.
 * @memberof Zip
 */
const readZipEntry = async (source, entryName) => {
  const entry = findZipEntry(await loadZip(source), entryName);
  return entry ? await entry.async('nodebuffer') : null;
};

/**
 * Builds an archive buffer from local files.
 * @function zipFromLocalFiles
 * @param {Array<{localPath: string, entryName: string}>} entries - Files to archive.
 * @returns {Promise<Buffer>} The generated archive bytes.
 * @memberof Zip
 */
const zipFromLocalFiles = async (entries) => {
  const zip = new JSZip();
  for (const { localPath, entryName } of entries) {
    const stats = fs.statSync(localPath);
    zip.file(entryName, fs.readFileSync(localPath), {
      date: stats.mtime,
      unixPermissions: stats.mode & 0o777,
    });
  }
  return await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
};

/**
 * Resolves an entry name against an output directory, rejecting archive paths that
 * escape it (zip slip).
 * @function resolveEntryTarget
 * @param {string} outputPath - Extraction root.
 * @param {string} entryName - Entry name from the archive.
 * @returns {string} The absolute target path.
 * @throws {Error} When the entry resolves outside the extraction root.
 * @memberof Zip
 */
const resolveEntryTarget = (outputPath, entryName) => {
  const root = dir.resolve(outputPath);
  const target = dir.resolve(root, entryName);
  if (target !== root && !target.startsWith(root + dir.sep)) {
    throw new Error(`Blocked zip entry outside extraction directory: ${entryName}`);
  }
  return target;
};

/**
 * Extracts every entry of an archive into a directory.
 * @function extractZipTo
 * @param {Buffer|string} source - Archive bytes or a path to the archive.
 * @param {string} outputPath - Extraction root; created when missing.
 * @returns {Promise<string[]>} The written file paths.
 * @memberof Zip
 */
const extractZipTo = async (source, outputPath) => {
  const zip = await loadZip(source);
  fs.mkdirSync(outputPath, { recursive: true });

  const writtenPaths = [];
  for (const entry of Object.values(zip.files)) {
    const target = resolveEntryTarget(outputPath, entry.name);
    if (entry.dir) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(dir.dirname(target), { recursive: true });
    fs.writeFileSync(target, await entry.async('nodebuffer'));
    if (entry.unixPermissions) fs.chmodSync(target, entry.unixPermissions & 0o777);
    writtenPaths.push(target);
  }
  return writtenPaths;
};

/**
 * Extracts a single archive entry into a directory, flattening its archive path.
 * @function extractZipEntryTo
 * @param {Buffer|string} source - Archive bytes or a path to the archive.
 * @param {string} entryName - Entry name or basename to extract.
 * @param {string} targetDir - Destination directory; created when missing.
 * @returns {Promise<string>} The written file path.
 * @throws {Error} When the entry is not present in the archive.
 * @memberof Zip
 */
const extractZipEntryTo = async (source, entryName, targetDir) => {
  const entry = findZipEntry(await loadZip(source), entryName);
  if (!entry) throw new Error(`Zip entry not found: ${entryName}`);

  const target = resolveEntryTarget(targetDir, dir.basename(entryName));
  fs.mkdirSync(dir.dirname(target), { recursive: true });
  fs.writeFileSync(target, await entry.async('nodebuffer'));
  if (entry.unixPermissions) fs.chmodSync(target, entry.unixPermissions & 0o777);
  return target;
};

export { isZipBuffer, loadZip, findZipEntry, readZipEntry, zipFromLocalFiles, extractZipTo, extractZipEntryTo };
