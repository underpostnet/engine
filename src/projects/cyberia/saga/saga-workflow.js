/**
 * Saga workflows: how the Saga Engine authors a saga, from its narrative context to the content source.
 *
 * A workflow opens an existing saga package of the content source, or starts empty. Each candidate is
 * a revision of the package: the content file, a generation, or a moderator save. A check runs the
 * content rules on one revision and stores its findings, each with the JSON path it concerns. An apply
 * writes a checked revision to `src/content/sagas/<code>.json` in canonical form; it refuses while the
 * file holds content this workflow did not write. Nothing here imports, publishes or releases: the
 * build, the import and the release keep their own contracts.
 *
 * @module src/projects/cyberia/saga/saga-workflow.js
 * @namespace CyberiaSagaWorkflow
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DataBaseProviderService } from '../../../db/database-provider.js';
import { contentCheckoutRevision, hasContentSources, sagaSourceDir } from '../content/content-artifact.js';
import { assertContentSources, checkSagaPackage } from './content-cli.js';

/** The candidates a workflow keeps: the oldest go first, never the applied or the newest generated one. */
export const CANDIDATE_LIMIT = 24;
/** The history entries a workflow view shows, newest first. */
const HISTORY_VIEW = 100;
/** The entries a diff answers. */
const DIFF_LIMIT = 500;
/** The largest package a candidate holds, in canonical JSON bytes. */
const PACKAGE_LIMIT = 1024 * 1024;

const httpError = (status, message) => Object.assign(new Error(message), { status, expected: true });
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The models of the workflows.
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @returns {{CyberiaSagaWorkflow: import('mongoose').Model}}
 * @memberof CyberiaSagaWorkflow
 */
export const workflowModels = (options) => ({
  CyberiaSagaWorkflow: DataBaseProviderService.getModel('CyberiaSagaWorkflow', options),
});

/**
 * The canonical form of a package: the bytes its content file holds.
 * @param {Object} pkg
 * @returns {string}
 * @memberof CyberiaSagaWorkflow
 */
export const canonicalPackage = (pkg) => JSON.stringify(pkg, null, 2) + '\n';

/**
 * The digest of a package in canonical form.
 * @param {Object} pkg
 * @returns {string} `sha256:<hex>`
 * @memberof CyberiaSagaWorkflow
 */
export const packageDigest = (pkg) => `sha256:${createHash('sha256').update(canonicalPackage(pkg)).digest('hex')}`;

/** The content file of a saga, and its path in the checkout. */
const sagaFile = (code) => ({
  file: path.join(sagaSourceDir(), `${code}.json`),
  relative: path.join('src', 'content', 'sagas', `${code}.json`),
});

/** The package the content source holds for a saga, or null. */
const sourcePackage = (code) => {
  const { file } = sagaFile(code);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

/**
 * One history entry.
 * @param {string} action - One of the model's `HISTORY_ACTIONS`.
 * @param {string} actor
 * @param {string} [detail]
 * @param {Date} [at]
 * @returns {Object}
 * @memberof CyberiaSagaWorkflow
 */
export const historyEntry = (action, actor, detail = '', at = new Date()) => ({ action, actor, at, detail });

/** The code of the saga a package composes, or ''. */
const codeOf = (pkg) => (typeof pkg?.saga?.code === 'string' ? pkg.saga.code : '');

/**
 * Where a workflow stands, from its newest records: `generating`, `failed`, `applied`, `checked`,
 * `findings`, `draft` or `empty`.
 */
function stageOf({ candidates = [], generations = [], validation, applied }) {
  const generation = generations.at(-1);
  if (generation && ['queued', 'running'].includes(generation.status)) return 'generating';
  const latest = candidates.at(-1);
  if (!latest) return generation?.status === 'failed' ? 'failed' : 'empty';
  if (applied?.digest === latest.digest) return 'applied';
  if (validation?.digest === latest.digest) return validation.ok ? 'checked' : 'findings';
  return 'draft';
}

/** A candidate record of a package: the package and what a list shows of it. */
const candidateOf = (pkg, fields) => ({
  ...fields,
  package: pkg,
  digest: packageDigest(pkg),
  sagaCode: codeOf(pkg),
  name: typeof pkg?.saga?.name === 'string' ? pkg.saga.name : '',
  definitions: Array.isArray(pkg?.definitions) ? pkg.definitions.length : 0,
});

/** The metadata of a candidate, without its package. */
const candidateMeta = ({ package: pkg, ...meta }) => meta;

/** The summary a workflow list shows. */
const summaryOf = (workflow) => {
  const latest = workflow.candidates.at(-1);
  const generation = workflow.generations.at(-1);
  return {
    _id: workflow._id,
    sagaCode: workflow.sagaCode,
    name: workflow.context?.saga?.name || '',
    stage: stageOf(workflow),
    candidates: workflow.candidates.length,
    latest: latest ? { revision: latest.revision, kind: latest.kind, digest: latest.digest, at: latest.at } : null,
    generation: generation ? { attempt: generation.attempt, status: generation.status } : null,
    applied: workflow.applied ?? null,
    createdBy: workflow.createdBy,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
};

/** The heavy fields a view leaves out: the packages and the generator states. */
const LIGHT = Object.freeze({ 'candidates.package': 0, 'generations.state': 0 });

/** The fields a list leaves out besides: the lore texts and the history. */
const SUMMARY = Object.freeze({ ...LIGHT, 'context.lore': 0, 'generations.request': 0, history: 0 });

/**
 * A page of workflows, newest change first.
 * @param {Object} models - {@link workflowModels}.
 * @param {{query:Object,sort:Object,skip:number,limit:number}} page - A parsed data query.
 * @returns {Promise<{data:Object[],total:number}>}
 * @memberof CyberiaSagaWorkflow
 */
export async function listWorkflows({ CyberiaSagaWorkflow }, { query, sort, skip, limit }) {
  const [documents, total] = await Promise.all([
    CyberiaSagaWorkflow.find(query, SUMMARY)
      .sort(Object.keys(sort ?? {}).length > 0 ? sort : { updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CyberiaSagaWorkflow.countDocuments(query),
  ]);
  return { data: documents.map(summaryOf), total };
}

/** A stored workflow without its heavy fields. */
async function findWorkflow({ CyberiaSagaWorkflow }, id, projection = LIGHT) {
  const workflow = await CyberiaSagaWorkflow.findById(id, projection)
    .lean()
    .catch(() => null);
  if (!workflow) throw httpError(404, `Saga workflow ${id} not found`);
  return workflow;
}

/**
 * The view of a workflow: its summary, context, candidates without packages, the newest package,
 * generations without their state, the last check, the application, the exclusions and the newest
 * history.
 * @param {Object} models - {@link workflowModels}.
 * @param {string} id
 * @returns {Promise<Object>}
 * @memberof CyberiaSagaWorkflow
 */
export async function readWorkflow(models, id) {
  const [workflow, newest] = await Promise.all([
    findWorkflow(models, id),
    models.CyberiaSagaWorkflow.findById(id, { candidates: { $slice: -1 } }).lean(),
  ]);
  return {
    ...summaryOf(workflow),
    context: workflow.context,
    base: workflow.base,
    candidates: workflow.candidates.map(candidateMeta),
    package: newest?.candidates?.[0]?.package ?? null,
    generations: workflow.generations,
    validation: workflow.validation ?? null,
    exclusions: workflow.exclusions,
    history: workflow.history.slice(-HISTORY_VIEW).reverse(),
    capabilities: { sources: hasContentSources() },
  };
}

/**
 * One candidate with its package.
 * @param {Object} models - {@link workflowModels}.
 * @param {string} id
 * @param {number} revision
 * @returns {Promise<Object>}
 * @throws {Error} 404 when the workflow keeps no such revision.
 * @memberof CyberiaSagaWorkflow
 */
export async function readCandidate({ CyberiaSagaWorkflow }, id, revision) {
  const workflow = await CyberiaSagaWorkflow.findById(id, {
    candidates: { $elemMatch: { revision: Number(revision) } },
  })
    .lean()
    .catch(() => null);
  const candidate = workflow?.candidates?.[0];
  if (!candidate) throw httpError(404, `Saga workflow ${id} keeps no candidate ${revision}`);
  return candidate;
}

/** The context fields a moderator sets, each to its type. */
const CONTEXT_TEXT = Object.freeze([
  'prompt',
  'lore',
  'spaceContext',
  'tone',
  'factionContext',
  'characterContext',
  'culturalExposure',
  'thinkingLevel',
  'model',
]);

/**
 * A narrative context from a request body: only the known fields, each of its type.
 * @param {Object} body
 * @returns {Object}
 * @throws {Error} 400 for an unknown field or a value of another type.
 * @memberof CyberiaSagaWorkflow
 */
export function contextOf(body = {}) {
  if (!isPlainObject(body)) throw httpError(400, 'The context must be an object');
  const known = [...CONTEXT_TEXT, 'temperature', 'saga', 'reuse', 'sagas'];
  const unknown = Object.keys(body).filter((key) => !known.includes(key));
  if (unknown.length > 0) throw httpError(400, `Unknown context field(s): ${unknown.join(', ')}`);
  const context = {};
  for (const key of CONTEXT_TEXT)
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') throw httpError(400, `${key} must be text`);
      context[key] = body[key].trim();
    }
  if (body.temperature !== undefined && body.temperature !== null && !Number.isFinite(body.temperature))
    throw httpError(400, 'temperature must be a number');
  if (body.temperature !== undefined) context.temperature = body.temperature;
  if (body.saga !== undefined) {
    if (!isPlainObject(body.saga)) throw httpError(400, 'saga must be an object');
    context.saga = Object.fromEntries(
      ['code', 'name', 'description'].map((key) => [
        key,
        typeof body.saga[key] === 'string' ? body.saga[key].trim() : '',
      ]),
    );
  }
  for (const key of ['reuse', 'sagas'])
    if (body[key] !== undefined) {
      if (!Array.isArray(body[key]) || !body[key].every((value) => typeof value === 'string'))
        throw httpError(400, `${key} must be a list of codes`);
      context[key] = [...new Set(body[key].map((value) => value.trim()).filter(Boolean))];
    }
  return context;
}

/**
 * Creates a workflow: on the package the content source holds for `sagaCode`, or empty with a
 * narrative context.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {{sagaCode?:string, context?:Object}} params.body
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link readWorkflow}.
 * @throws {Error} 404 when the content source holds no such saga; 409 without a content source.
 * @memberof CyberiaSagaWorkflow
 */
export async function createWorkflow({ models, body = {}, actor }) {
  const now = new Date();
  const context = contextOf(body.context ?? {});
  const workflow = { context, createdBy: actor, candidates: [], history: [] };
  if (body.sagaCode) {
    assertContentSources();
    const pkg = sourcePackage(String(body.sagaCode));
    if (!pkg) throw httpError(404, `The content source holds no saga ${body.sagaCode}`);
    const digest = packageDigest(pkg);
    Object.assign(workflow, {
      sagaCode: codeOf(pkg),
      context: {
        ...context,
        saga: { code: codeOf(pkg), name: pkg.saga?.name ?? '', description: pkg.saga?.description ?? '' },
      },
      base: { source: 'content', digest, checkoutRevision: contentCheckoutRevision() },
      candidates: [candidateOf(pkg, { revision: 1, kind: 'content', actor, at: now })],
    });
  } else workflow.sagaCode = context.saga?.code ?? '';
  workflow.history.push(
    historyEntry('workflow.created', actor, body.sagaCode ? `opened saga ${body.sagaCode}` : 'new saga', now),
  );
  const created = await models.CyberiaSagaWorkflow.create(workflow);
  return await readWorkflow(models, created._id);
}

/**
 * Sets the narrative context of the next generation.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {Object} params.body - The context fields to set.
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link readWorkflow}.
 * @memberof CyberiaSagaWorkflow
 */
export async function updateContext({ models, id, body, actor }) {
  await findWorkflow(models, id, { _id: 1 });
  const context = contextOf(body);
  await models.CyberiaSagaWorkflow.updateOne(
    { _id: id },
    {
      $set: Object.fromEntries(Object.entries(context).map(([key, value]) => [`context.${key}`, value])),
      $push: { history: historyEntry('context.updated', actor, Object.keys(context).join(', ')) },
    },
    { runValidators: true },
  );
  return await readWorkflow(models, id);
}

/**
 * The revisions a workflow drops to keep {@link CANDIDATE_LIMIT}: the oldest, never the applied one
 * or the newest generated one.
 * @param {Object[]} candidates - Candidate metadata, oldest first.
 * @param {Object|null} applied
 * @returns {number[]}
 * @memberof CyberiaSagaWorkflow
 */
export function droppedRevisions(candidates, applied) {
  const generated = candidates.filter(({ kind }) => kind === 'generated').at(-1)?.revision;
  const keep = new Set([applied?.revision, generated, candidates.at(-1)?.revision]);
  const droppable = candidates.filter(({ revision }) => !keep.has(revision));
  return droppable.slice(0, Math.max(0, candidates.length - CANDIDATE_LIMIT)).map(({ revision }) => revision);
}

/**
 * Appends a candidate: the next revision of the workflow. A package equal to the newest candidate
 * adds nothing.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {Object} params.pkg - The package.
 * @param {'generated'|'edited'} params.kind
 * @param {string} params.actor
 * @param {number|null} [params.parent] - The revision the package comes from.
 * @param {number|null} [params.generation] - The generation that made it.
 * @returns {Promise<Object>} The candidate metadata.
 * @memberof CyberiaSagaWorkflow
 */
export async function appendCandidate({ models, id, pkg, kind, actor, parent = null, generation = null }) {
  if (Buffer.byteLength(canonicalPackage(pkg)) > PACKAGE_LIMIT)
    throw httpError(400, `A package holds at most ${PACKAGE_LIMIT / 1024} KB of JSON`);
  const digest = packageDigest(pkg);
  for (let attempt = 0; attempt < 3; attempt++) {
    const workflow = await findWorkflow(models, id, { candidates: { revision: 1, kind: 1, digest: 1 }, applied: 1 });
    const newest = workflow.candidates.at(-1);
    if (newest?.digest === digest) return newest;
    const revision = (newest?.revision ?? 0) + 1;
    const at = new Date();
    const candidate = candidateOf(pkg, { revision, kind, generation, parent, actor, at });
    const { modifiedCount } = await models.CyberiaSagaWorkflow.updateOne(
      { _id: id, 'candidates.revision': { $ne: revision } },
      {
        $push: {
          candidates: candidate,
          history: historyEntry('candidate.saved', actor, `revision ${revision} (${kind}) ${digest}`, at),
        },
        ...(codeOf(pkg) && { $set: { sagaCode: codeOf(pkg) } }),
      },
    );
    if (modifiedCount === 0) continue;
    const dropped = droppedRevisions([...workflow.candidates, candidate], workflow.applied);
    if (dropped.length > 0)
      await models.CyberiaSagaWorkflow.updateOne(
        { _id: id },
        { $pull: { candidates: { revision: { $in: dropped } } } },
      );
    return candidateMeta(candidate);
  }
  throw httpError(409, 'Another save took the revision meanwhile: reload the workflow');
}

/**
 * Saves a moderator's package as the next candidate. It changes nothing outside the workflow.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {{package:Object, parent?:number}} params.body
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link readWorkflow}.
 * @memberof CyberiaSagaWorkflow
 */
export async function saveCandidate({ models, id, body = {}, actor }) {
  if (!isPlainObject(body.package)) throw httpError(400, 'The package must be a JSON object');
  await appendCandidate({ models, id, pkg: body.package, kind: 'edited', actor, parent: body.parent ?? null });
  return await readWorkflow(models, id);
}

/** A JSON path of a field path the content rules name: `steps[0].type` → `['steps', 0, 'type']`. */
const fieldPath = (field) =>
  field
    .split(/\.|\[(\d+)\]/)
    .filter((part) => part !== undefined && part !== '')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));

/**
 * The findings of a check, each with the JSON path of the package it concerns: the definition its id
 * names, and the field its message starts with when the definition holds that field.
 * @param {Object} pkg
 * @param {Array<{id:string,message:string}>} findings
 * @returns {Array<{id:string,message:string,path:Array<string|number>}>}
 * @memberof CyberiaSagaWorkflow
 */
export function findingPaths(pkg, findings) {
  const definitions = Array.isArray(pkg?.definitions) ? pkg.definitions : [];
  return findings.map(({ id, message }) => {
    const field = /^([A-Za-z][\w]*(?:\[\d+\]|\.[A-Za-z][\w]*)*)\s/.exec(message)?.[1] ?? '';
    const index = definitions.findIndex((definition) => definition?.id === id);
    if (index < 0) {
      const root = field.split(/[.[]/)[0];
      return { id, message, path: isPlainObject(pkg) && root in pkg ? fieldPath(field) : [] };
    }
    const relative = field && field.split(/[.[]/)[0] in definitions[index] ? fieldPath(field) : [];
    return { id, message, path: ['definitions', index, ...relative] };
  });
}

/**
 * The differences between two JSON values: each changed, added or removed path. A list of objects
 * that each have an `id`, such as the definitions, pairs its entries by id.
 * @param {*} before
 * @param {*} after
 * @param {Array<string|number>} [at]
 * @returns {Array<{path:Array<string|number>, op:'add'|'remove'|'change', before?:*, after?:*}>}
 * @memberof CyberiaSagaWorkflow
 */
export function jsonDiff(before, after, at = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const keyed = (list) =>
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((entry) => isPlainObject(entry) && typeof entry.id === 'string');
  if (Array.isArray(before) && Array.isArray(after) && keyed(before) && keyed(after)) {
    const old = new Map(before.map((entry) => [entry.id, entry]));
    const next = new Map(after.map((entry) => [entry.id, entry]));
    return [
      ...before
        .filter(({ id }) => !next.has(id))
        .map((entry) => ({ path: [...at, entry.id], op: 'remove', before: entry })),
      ...after.flatMap((entry) =>
        old.has(entry.id)
          ? jsonDiff(old.get(entry.id), entry, [...at, entry.id])
          : [{ path: [...at, entry.id], op: 'add', after: entry }],
      ),
    ];
  }
  if (isPlainObject(before) && isPlainObject(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
      !(key in after)
        ? [{ path: [...at, key], op: 'remove', before: before[key] }]
        : !(key in before)
          ? [{ path: [...at, key], op: 'add', after: after[key] }]
          : jsonDiff(before[key], after[key], [...at, key]),
    );
  if (Array.isArray(before) && Array.isArray(after))
    return Array.from({ length: Math.max(before.length, after.length) }, (_, index) =>
      index >= after.length
        ? [{ path: [...at, index], op: 'remove', before: before[index] }]
        : index >= before.length
          ? [{ path: [...at, index], op: 'add', after: after[index] }]
          : jsonDiff(before[index], after[index], [...at, index]),
    ).flat();
  return [{ path: at, op: 'change', before, after }];
}

/**
 * The differences between a package and a candidate.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {{package:Object, revision:number}} params.body
 * @returns {Promise<{revision:number, total:number, entries:Object[]}>} At most {@link DIFF_LIMIT} entries.
 * @memberof CyberiaSagaWorkflow
 */
export async function diffCandidate({ models, id, body = {} }) {
  if (!isPlainObject(body.package)) throw httpError(400, 'The package must be a JSON object');
  const candidate = await readCandidate(models, id, body.revision);
  const entries = jsonDiff(candidate.package, body.package);
  return { revision: candidate.revision, total: entries.length, entries: entries.slice(0, DIFF_LIMIT) };
}

/**
 * Checks a candidate against the content source and stores the result as the workflow check.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {number} params.revision
 * @param {string} params.actor
 * @param {typeof checkSagaPackage} [params.check]
 * @returns {Promise<Object>} {@link readWorkflow}.
 * @memberof CyberiaSagaWorkflow
 */
export async function validateCandidate({ models, id, revision, actor, check = checkSagaPackage }) {
  const candidate = await readCandidate(models, id, revision);
  const { findings } = await check(candidate.package);
  const at = new Date();
  const validation = {
    revision: candidate.revision,
    digest: candidate.digest,
    ok: findings.length === 0,
    findings: findingPaths(candidate.package, findings),
    checkedAt: at,
  };
  await models.CyberiaSagaWorkflow.updateOne(
    { _id: id },
    {
      $set: { validation },
      $push: {
        history: historyEntry(
          'candidate.validated',
          actor,
          `revision ${candidate.revision}: ${findings.length} finding(s)`,
          at,
        ),
      },
    },
  );
  return await readWorkflow(models, id);
}

/**
 * Writes a checked candidate to the content source in canonical form. The file must hold what this
 * workflow last saw there: nothing for a new saga, the package it opened, or the revision it applied.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {number} params.revision
 * @param {string} params.actor
 * @param {typeof checkSagaPackage} [params.check]
 * @returns {Promise<Object>} {@link readWorkflow}.
 * @throws {Error} 409 when the revision is not checked clean, the file changed outside the workflow,
 *   or the content rules refuse it now.
 * @memberof CyberiaSagaWorkflow
 */
export async function applyCandidate({ models, id, revision, actor, check = checkSagaPackage }) {
  assertContentSources();
  const workflow = await findWorkflow(models, id, { validation: 1, applied: 1, base: 1 });
  const candidate = await readCandidate(models, id, revision);
  if (workflow.validation?.digest !== candidate.digest || !workflow.validation.ok)
    throw httpError(409, `Check revision ${candidate.revision} and clear its findings before you apply it`);
  const code = codeOf(candidate.package);
  const stored = sourcePackage(code);
  const current = stored ? packageDigest(stored) : '';
  const seen = workflow.applied?.digest ?? (workflow.base?.source === 'content' ? workflow.base.digest : '');
  if (current && current !== seen && current !== candidate.digest)
    throw httpError(
      409,
      `src/content/sagas/${code}.json changed outside this workflow. Open the saga again to work on its current content`,
    );
  const result = await check(candidate.package, { write: true });
  if (result.findings.length > 0)
    throw Object.assign(httpError(409, `The content rules refuse revision ${candidate.revision} now`), {
      findings: result.findings,
    });
  const at = new Date();
  const applied = {
    revision: candidate.revision,
    digest: candidate.digest,
    file: sagaFile(code).relative,
    checkoutRevision: contentCheckoutRevision(),
    at,
    actor,
  };
  await models.CyberiaSagaWorkflow.updateOne(
    { _id: id },
    {
      $set: { applied },
      $push: {
        history: historyEntry('candidate.applied', actor, `revision ${candidate.revision} to ${applied.file}`, at),
      },
    },
  );
  return await readWorkflow(models, id);
}

/**
 * The semantic input of the report of a candidate: the package as the content source checks and
 * compiles it, with the exclusions and the application of its workflow.
 * @param {Object} models - {@link workflowModels}.
 * @param {string} id
 * @param {number|string} [revision] - The newest candidate by default.
 * @param {typeof checkSagaPackage} [check]
 * @returns {Promise<{semantic:Object, exclusions:Object[], applied:Object|null}>}
 * @throws {Error} 404 when the workflow has no candidate.
 * @memberof CyberiaSagaWorkflow
 */
export async function candidateSemantic(models, id, revision, check = checkSagaPackage) {
  const workflow = await findWorkflow(models, id, { exclusions: 1, applied: 1, 'candidates.revision': 1 });
  const target = revision ? Number(revision) : workflow.candidates.at(-1)?.revision;
  if (!target) throw httpError(404, 'The workflow has no candidate yet: generate or save one');
  const candidate = await readCandidate(models, id, target);
  const result = await check(candidate.package);
  return {
    semantic: {
      code: codeOf(candidate.package),
      source: { kind: 'candidate', revision: candidate.revision, digest: candidate.digest },
      findings: findingPaths(candidate.package, result.findings),
      compiled: result.compiled ?? null,
      context: result.context ?? {
        definitions: {},
        sources: {},
        labels: {},
        entities: {},
        references: {},
        referencedBy: {},
      },
      package: candidate.package,
    },
    exclusions: workflow.exclusions,
    applied: workflow.applied ?? null,
  };
}

/**
 * Leaves a dependency of the report out on purpose, with the reason, or takes it back with an empty reason.
 * @param {Object} params
 * @param {Object} params.models - {@link workflowModels}.
 * @param {string} params.id
 * @param {{key:string, reason?:string}} params.body - The key of a report row.
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link readWorkflow}.
 * @memberof CyberiaSagaWorkflow
 */
export async function setExclusion({ models, id, body = {}, actor }) {
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!key) throw httpError(400, 'Name the report row to exclude');
  await findWorkflow(models, id, { _id: 1 });
  const at = new Date();
  await models.CyberiaSagaWorkflow.updateOne({ _id: id }, { $pull: { exclusions: { key } } });
  await models.CyberiaSagaWorkflow.updateOne(
    { _id: id },
    {
      $push: {
        ...(reason && { exclusions: { key, reason, actor, at } }),
        history: historyEntry(
          reason ? 'exclusion.set' : 'exclusion.removed',
          actor,
          reason ? `${key}: ${reason}` : key,
          at,
        ),
      },
    },
    { runValidators: true },
  );
  return await readWorkflow(models, id);
}
