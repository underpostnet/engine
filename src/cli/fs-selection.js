import fs from 'fs-extra';
import path from 'node:path';
import UnderpostRepository from './repository.js';

const manifestFilterNames = ['key', 'fromKey', 'toKey', 'keyRegex'];

const normalizeStoragePath = (value) => {
  if (value === undefined || value === '') return '';
  const absolute = path.resolve(value);
  const relative = path.relative(process.cwd(), absolute);
  return (
    path.isAbsolute(value) && (relative === '..' || relative.startsWith(`..${path.sep}`)) ? absolute : relative || '.'
  )
    .split(path.sep)
    .join('/');
};

const isWithinScope = (key, scope) => {
  if (scope === undefined || scope === '') return true;
  const relative = path.relative(path.resolve(scope), path.resolve(key));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const validateSelectionOptions = (scope, options) => {
  if (options.git && options.tracked) throw new Error('Use either --git or --tracked.');
  if (!options.tracked && !scope) throw new Error('Provide a filesystem path, or use --tracked.');
  if (options.rm && options.pull) throw new Error('Use either --rm or --pull.');
  if (options.omitUnzip && !options.pull) throw new Error('--omit-unzip requires --pull.');
};

const filterManifestEntries = (entries, options = {}, scope) => {
  const keys = entries.map(([key]) => key);
  const keyIndex = (name) => {
    const index = keys.indexOf(options[name]);
    if (index < 0) throw new Error(`Manifest key not found for ${name}: ${options[name]}`);
    return index;
  };
  const start = options.fromKey === undefined ? 0 : keyIndex('fromKey');
  const end = options.toKey === undefined ? keys.length - 1 : keyIndex('toKey');
  if (start > end && (options.fromKey !== undefined || options.toKey !== undefined))
    throw new Error('--from-key must precede or equal --to-key.');

  let regex;
  if (options.keyRegex !== undefined) {
    try {
      regex = new RegExp(options.keyRegex);
    } catch {
      throw new Error(`Invalid --key-regex: ${options.keyRegex}`);
    }
  }
  const matches = (key) => isWithinScope(key, scope) && (!regex || regex.test(key));
  if (options.key !== undefined) {
    const index = keyIndex('key');
    if (index < start || index > end || !matches(options.key))
      throw new Error('--key conflicts with the manifest range, path scope, or regex.');
  }
  return entries
    .slice(start, end + 1)
    .filter(([key]) => matches(key) && (options.key === undefined || key === options.key));
};

const resolveFilesystemSelection = (scope) => {
  const files = [];
  const visit = (target) => {
    const stats = fs.statSync(target);
    if (stats.isFile()) files.push(normalizeStoragePath(target));
    else if (stats.isDirectory()) {
      for (const entry of fs
        .readdirSync(target, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const child = path.join(target, entry.name);
        // Do not follow directory links during traversal.
        if (entry.isSymbolicLink()) {
          if (fs.statSync(child, { throwIfNoEntry: false })?.isFile()) files.push(normalizeStoragePath(child));
        } else visit(child);
      }
    } else throw new Error(`Storage requires a regular file or directory: ${target}`);
  };
  visit(scope);
  return files;
};

const resolveGitSelection = (files, scope) => {
  const context = fs.statSync(scope).isDirectory() ? scope : path.dirname(scope);
  const tracked = new Set(UnderpostRepository.API.getTrackedFiles(context));
  return files.filter((file) => tracked.has(path.resolve(file)));
};

const resolveTrackedSelection = (entries) => entries.map(([key]) => key);

const resolveSelection = (scope, manifest, options = {}) => {
  validateSelectionOptions(scope, options);
  const entries = Object.entries(manifest);
  const filtered = filterManifestEntries(entries, options, scope);
  if (options.tracked) return resolveTrackedSelection(filtered);

  let files = resolveFilesystemSelection(scope);
  if (options.git) files = resolveGitSelection(files, scope);
  const manifestKeys = new Map(entries.map(([key]) => [normalizeStoragePath(key), key]));
  files = files.map((file) => manifestKeys.get(file) ?? file);
  if (manifestFilterNames.some((name) => options[name] !== undefined)) {
    const selected = new Set(resolveTrackedSelection(filtered));
    files = files.filter((file) => selected.has(file));
  }
  return files;
};

export {
  normalizeStoragePath,
  filterManifestEntries,
  resolveFilesystemSelection,
  resolveGitSelection,
  resolveTrackedSelection,
  resolveSelection,
};
