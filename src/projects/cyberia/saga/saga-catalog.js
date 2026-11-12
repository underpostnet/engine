/**
 * The saga catalog of a host: one row per saga that its content source checkout, its content
 * artifact, its workspace database or a Saga Engine workflow holds. A row keeps the state of each
 * source apart and never merges them into one status. A selected content release adds whether that
 * release holds the saga. The catalog reads every saga code once, then the details of one page.
 *
 * @module src/projects/cyberia/saga/saga-catalog.js
 * @namespace CyberiaSagaCatalog
 */
import fs from 'node:fs';
import path from 'node:path';
import { DataBaseProviderService } from '../../../db/database-provider.js';
import {
  hasContentSources,
  holdsContent,
  optionalContentArtifact,
  sagaSourceDir,
} from '../content/content-artifact.js';
import { listWorkflows, workflowModels } from './saga-workflow.js';

/** The most sagas, workflows or releases one catalog reads. */
export const CATALOG_LIMIT = 500;

/** The most rows of one page. */
const PAGE_LIMIT = 50;

/** The filters of a catalog and the values each one takes; `workflow` also takes a workflow stage. */
export const CATALOG_FILTERS = Object.freeze({
  source: Object.freeze(['present', 'absent']),
  artifact: Object.freeze(['present', 'absent']),
  workspace: Object.freeze(['in-sync', 'differs', 'stored', 'absent']),
  workflow: Object.freeze(['none', 'empty', 'generating', 'failed', 'draft', 'findings', 'checked', 'applied']),
});

const httpError = (status, message) => Object.assign(new Error(message), { status, expected: true });

/** The packages of the content checkout by code: name, description, places, definitions and file time. */
function sourceSagas() {
  const dir = sagaSourceDir();
  if (!hasContentSources() || !fs.existsSync(dir)) return new Map();
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .slice(0, CATALOG_LIMIT);
  return new Map(
    files.map((file) => {
      const full = path.join(dir, file);
      let pkg = {};
      try {
        pkg = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch {
        // A file that does not parse is still a saga of the checkout; the package check reports it.
      }
      return [file.slice(0, -'.json'.length), { pkg, modifiedAt: fs.statSync(full).mtime }];
    }),
  );
}

/** The dialogue groups the compiler gives a saga: one per item label it defines, one per quest talk. */
const dialogueCount = (context, code) =>
  Object.values(context.labels).filter((id) => context.sources[id] === code).length +
  Object.entries(context.definitions).filter(
    ([id, definition]) => id.startsWith('quest.') && context.sources[id] === code && definition.talk,
  ).length;

/** The saga codes a content release database stores. */
async function releaseSagaCodes(options, releaseId) {
  const release = await DataBaseProviderService.getModel('CyberiaContentRelease', options)
    .findOne({ releaseId }, { database: 1 })
    .lean();
  if (!release) throw httpError(404, `No content release ${releaseId}`);
  const { CyberiaSaga } = DataBaseProviderService.getProvider(options, 'mongoose').models;
  const db = DataBaseProviderService.getProvider(options, 'mongoose').connection.getClient().db(release.database);
  return new Set(await db.collection(CyberiaSaga.collection.collectionName).distinct('code'));
}

/**
 * Parses the query of a catalog request.
 * @param {Object} query - `q`, `source`, `artifact`, `workspace`, `release`, `instance`, `workflow`, `page`, `limit`.
 * @returns {Object} The filters, `page` and `limit`.
 * @throws {Error} 400 for an unknown filter value.
 * @memberof CyberiaSagaCatalog
 */
export function catalogQuery(query = {}) {
  const text = (key) => (typeof query[key] === 'string' ? query[key].trim() : '');
  const filters = { q: text('q').toLowerCase(), release: text('release'), instance: text('instance') };
  for (const [key, values] of Object.entries(CATALOG_FILTERS)) {
    filters[key] = text(key);
    if (filters[key] && !values.includes(filters[key]))
      throw httpError(400, `${key} must be one of ${values.join(', ')}`);
  }
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(PAGE_LIMIT, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  return { ...filters, page, limit };
}

/**
 * A page of the saga catalog of a host.
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @param {Object} [query] - {@link catalogQuery} input.
 * @returns {Promise<{data:Object[], total:number, page:number, limit:number, drafts:Object[],
 *   releases:Object[], capabilities:{sources:boolean, artifact:boolean}}>} Each row holds `code`, `name`,
 *   `description`, `source`, `artifact`, `workspace`, `release`, `workflow`, `counts`, `shared`, `instances`,
 *   `placement` and `updatedAt`. `drafts` are the workflows that name no saga yet.
 * @memberof CyberiaSagaCatalog
 */
export async function sagaCatalog(options, query = {}) {
  const filters = catalogQuery(query);
  const model = (name) => DataBaseProviderService.getModel(name, options);
  const artifact = optionalContentArtifact();
  const sources = sourceSagas();
  const artifactRecords = new Map((artifact?.manifest.sagas ?? []).map((code) => [code, artifact.sagaRecord(code)]));
  const stored = new Map(
    (
      await model('CyberiaSaga')
        .find({}, { code: 1, name: 1, description: 1, mapCodes: 1, placeCodes: 1, itemIds: 1, updatedAt: 1 })
        .limit(CATALOG_LIMIT)
        .lean()
    ).map((record) => [record.code, record]),
  );
  const { data: workflows } = await listWorkflows(workflowModels(options), {
    query: {},
    sort: { updatedAt: -1 },
    skip: 0,
    limit: CATALOG_LIMIT,
  });
  const workflowOf = new Map();
  for (const workflow of workflows)
    if (workflow.sagaCode && !workflowOf.has(workflow.sagaCode)) workflowOf.set(workflow.sagaCode, workflow);
  const releaseCodes = filters.release ? await releaseSagaCodes(options, filters.release) : null;
  const world = filters.instance
    ? await model('CyberiaInstance').findOne({ code: filters.instance }, { cyberiaMapCodes: 1 }).lean()
    : null;
  if (filters.instance && !world) throw httpError(404, `No world ${filters.instance}`);

  // The newest compiled view of each saga: the artifact record, else the stored one.
  const compiled = (code) => artifactRecords.get(code) ?? stored.get(code) ?? null;
  const codes = [...new Set([...sources.keys(), ...artifactRecords.keys(), ...stored.keys(), ...workflowOf.keys()])];
  const nameOf = (code) =>
    compiled(code)?.name || sources.get(code)?.pkg.saga?.name || workflowOf.get(code)?.name || code;
  const mapsOf = (code) => [...(compiled(code)?.mapCodes ?? []), ...(compiled(code)?.placeCodes ?? [])];

  let rows = codes.filter((code) => {
    const workflow = workflowOf.get(code);
    return (
      (!filters.q || code.includes(filters.q) || nameOf(code).toLowerCase().includes(filters.q)) &&
      (!filters.source || sources.has(code) === (filters.source === 'present')) &&
      (!filters.artifact || artifactRecords.has(code) === (filters.artifact === 'present')) &&
      (!filters.workflow || (filters.workflow === 'none' ? !workflow : workflow?.stage === filters.workflow)) &&
      (!releaseCodes || releaseCodes.has(code)) &&
      (!world || code === filters.instance || mapsOf(code).some((mapCode) => world.cyberiaMapCodes.includes(mapCode)))
    );
  });
  // A comparison needs the whole record: read it only for a workspace filter or the page.
  const full = new Map();
  const readFull = async (list) => {
    const missing = list.filter((code) => stored.has(code) && artifactRecords.has(code) && !full.has(code));
    if (missing.length === 0) return;
    for (const record of await model('CyberiaSaga')
      .find({ code: { $in: missing } })
      .lean())
      full.set(record.code, record);
  };
  const statusOf = (code) => {
    if (!stored.has(code)) return 'absent';
    if (!artifactRecords.has(code)) return 'stored';
    return holdsContent(full.get(code), artifactRecords.get(code)) ? 'in-sync' : 'differs';
  };
  if (['in-sync', 'differs'].includes(filters.workspace)) await readFull(rows);
  if (filters.workspace) rows = rows.filter((code) => statusOf(code) === filters.workspace);

  const updatedAtOf = (code) =>
    Math.max(
      ...[stored.get(code)?.updatedAt, workflowOf.get(code)?.updatedAt, sources.get(code)?.modifiedAt]
        .filter(Boolean)
        .map((date) => new Date(date).getTime()),
      0,
    );
  rows.sort((a, b) => updatedAtOf(b) - updatedAtOf(a) || a.localeCompare(b));
  const total = rows.length;
  const page = rows.slice((filters.page - 1) * filters.limit, filters.page * filters.limit);
  await readFull(page);

  // Shared content: what another saga also lists.
  const listings = [...new Set([...artifactRecords.keys(), ...stored.keys()])].map((code) => ({
    code,
    record: compiled(code),
  }));
  const othersListing = (code, field, key) =>
    listings.some((other) => other.code !== code && (other.record?.[field] ?? []).includes(key));

  const pageMaps = [...new Set(page.flatMap(mapsOf))];
  const quests = page.flatMap((code) => (compiled(code)?.questCodes ?? []).map(({ questCode }) => questCode));
  const actions = page.flatMap((code) => (compiled(code)?.actionCodes ?? []).map(({ actionCode }) => actionCode));
  const placed = { $nin: [null, ''] };
  const [mapsStored, questsPlaced, actionsPlaced, instances, releases] = await Promise.all([
    model('CyberiaMap').distinct('code', { code: { $in: pageMaps } }),
    model('CyberiaQuest').distinct('code', { code: { $in: quests }, sourceMapCode: placed }),
    model('CyberiaAction').distinct('code', { code: { $in: actions }, sourceMapCode: placed }),
    model('CyberiaInstance')
      .find({ $or: [{ code: { $in: page } }, { cyberiaMapCodes: { $in: pageMaps } }] }, { code: 1, cyberiaMapCodes: 1 })
      .lean(),
    model('CyberiaContentRelease').find({}, { releaseId: 1, status: 1 }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const share = (list, done) => ({ done: list.filter((code) => done.includes(code)).length, total: list.length });

  const data = page.map((code) => {
    const record = compiled(code);
    const source = sources.get(code);
    const definitions = record?.definitions ?? source?.pkg.definitions ?? [];
    const ofKind = (kind) => definitions.filter((definition) => definition?.id?.startsWith(`${kind}.`)).length;
    const own = record?.mapCodes ?? [];
    const maps = mapsOf(code);
    const workflow = workflowOf.get(code);
    return {
      code,
      name: nameOf(code),
      description: record?.description ?? source?.pkg.saga?.description ?? '',
      source: { present: Boolean(source), modifiedAt: source?.modifiedAt ?? null },
      artifact: { present: artifactRecords.has(code) },
      workspace: { status: statusOf(code), updatedAt: stored.get(code)?.updatedAt ?? null },
      release: releaseCodes ? { releaseId: filters.release, present: releaseCodes.has(code) } : null,
      workflow: workflow
        ? { _id: workflow._id, stage: workflow.stage, generation: workflow.generation, updatedAt: workflow.updatedAt }
        : null,
      counts: {
        maps: record ? own.length : ofKind('map'),
        places: (record?.placeCodes ?? source?.pkg.places ?? []).length,
        items: record?.itemIds?.length ?? null,
        quests: record?.questCodes?.length ?? ofKind('quest'),
        actions: record?.actionCodes?.length ?? ofKind('action'),
        dialogues: artifactRecords.has(code) ? dialogueCount(artifact.context, code) : null,
      },
      shared: {
        maps: maps.filter((mapCode) => ['mapCodes', 'placeCodes'].some((field) => othersListing(code, field, mapCode))),
        items: (record?.itemIds ?? []).filter((itemId) => othersListing(code, 'itemIds', itemId)).length,
      },
      instances: instances
        .filter(
          (instance) => instance.code === code || instance.cyberiaMapCodes.some((mapCode) => maps.includes(mapCode)),
        )
        .map((instance) => instance.code),
      placement: {
        maps: share(own, mapsStored),
        quests: share(
          (record?.questCodes ?? []).map(({ questCode }) => questCode),
          questsPlaced,
        ),
        actions: share(
          (record?.actionCodes ?? []).map(({ actionCode }) => actionCode),
          actionsPlaced,
        ),
      },
      updatedAt: updatedAtOf(code) ? new Date(updatedAtOf(code)) : null,
    };
  });
  return {
    data,
    total,
    page: filters.page,
    limit: filters.limit,
    drafts: workflows.filter((workflow) => !workflow.sagaCode).slice(0, 20),
    releases,
    capabilities: { sources: hasContentSources(), artifact: Boolean(artifact) },
  };
}
