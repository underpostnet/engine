/**
 * MongoDB collection operations: inspect, clone, move and rename one collection. A clone or a move
 * takes the File documents the collection references with it (`file.ref.json`), and the referenced
 * documents of each business aggregate named for it. Every read and write goes through the native
 * driver with BSON values unpromoted, so each value keeps its type.
 *
 * A transfer is staged: copy, verify, then delete the source. It holds no transaction: the source
 * takes no writes for the time of the operation. A record in the target database tracks each
 * transfer, so an interrupted one resumes.
 *
 * @module src/db/mongo/mongo-collection-operations.js
 * @namespace MongoCollectionOperations
 */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongooseDB } from './mongoose-db.js';
import { DataBaseProviderService } from '../database-provider.js';
import { FILE_MODEL, documentFileRefs, fileRefApis, fileRefFields, heldFileIds } from '../../api/file/file.ref.js';
import { getCapVariableName } from '../../client/components/core/CommonJs.js';
import { restoreMongoArchive } from '../../server/storage/mongo-archive.js';

const { BSON } = mongoose.mongo;

/** Read options that keep every BSON value in its own type. */
const READ = Object.freeze({ promoteValues: false });

/** The collection of the operation records, in the base database of the target. */
export const OPERATIONS_COLLECTION = 'underpost-data-operations';

/** The default number of documents in one batch. */
export const DEFAULT_BATCH_SIZE = 500;

/** The most bytes of whole documents one read holds. */
const BATCH_BYTES = 32 * 1024 * 1024;

/** The most ids one `$in` query holds. */
const ID_BATCH = 1000;

/** The most examples a report lists for one defect. */
const SAMPLE = 10;

/** The index options that change what an index accepts or how it orders. */
const INDEX_OPTIONS = Object.freeze([
  'unique',
  'sparse',
  'partialFilterExpression',
  'expireAfterSeconds',
  'collation',
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',
  '2dsphereIndexVersion',
  'bits',
  'min',
  'max',
  'wildcardProjection',
]);

/** The collection options a transfer carries to the target. */
const COLLECTION_OPTIONS = Object.freeze([
  'capped',
  'size',
  'max',
  'collation',
  'validator',
  'validationLevel',
  'validationAction',
  'changeStreamPreAndPostImages',
]);

/** The collection options no transfer reproduces. */
const UNSUPPORTED_OPTIONS = Object.freeze(['timeseries', 'clusteredIndex', 'encryptedFields']);

/** The transfer stages, in order. */
const STAGES = Object.freeze(['copy', 'verify', 'verified', 'delete-source', 'clean-files', 'completed']);

/**
 * @typedef {Object} MongoEndpoint
 * @property {string} label - `<deployId> <host><path>`, or the backup it reads.
 * @property {string} server - The host list of the server, without credentials.
 * @property {string[]} databases - Every database of the target: its own and its partitions.
 * @property {(api:string) => string} databaseOf - The database the model of an API binds to.
 * @property {(database:string) => import('mongodb').Db} db
 * @property {() => Promise<void>} close
 * @memberof MongoCollectionOperations
 */

/**
 * @typedef {Object} CollectionLayout
 * @property {string} collection
 * @property {string} owner - The API whose model owns the collection, or `''`.
 * @property {string[]} fileFields - The File reference paths of the owner.
 * @property {string} files - The collection of the File model.
 * @property {Array<{api:string, collection:string, paths:string[], fileFields:string[]}>} aggregates
 * @property {Array<{path:string, ref:string|null}>} relationships - The non-File references of the owner.
 * @memberof MongoCollectionOperations
 */

/** An error that names what blocks an operation; `defects` lists each one. */
const blocked = (message, defects = []) =>
  Object.assign(new Error(defects.length ? `${message}: ${defects.join('; ')}` : message), { defects });

const chunks = (values, size) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !value._bsontype &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** A value with the keys of every plain object sorted, so two documents compare by content. */
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
};

/**
 * Whether two documents hold the same fields with the same BSON values, in any field order.
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 * @memberof MongoCollectionOperations
 */
export const sameDocument = (a, b) => BSON.serialize(canonical(a)).equals(BSON.serialize(canonical(b)));

/** The identity of an `_id` value, with its BSON type. */
const idKey = (id) => (id?._bsontype ? `${id._bsontype}:${id.toString()}` : `${typeof id}:${String(id)}`);

/** The values not yet in `seen`, each once; adds them to `seen`. */
const unseen = (seen, values) =>
  values.filter((value) => {
    const key = idKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

const projectionOf = (paths) => Object.fromEntries(paths.map((path) => [path, 1]));

const indexKeyOf = (spec) => JSON.stringify(Object.entries(spec.key));

const indexDefinitionOf = (spec) =>
  JSON.stringify([
    Object.entries(spec.key),
    ...INDEX_OPTIONS.filter((option) => spec[option] !== undefined).map((option) => [option, spec[option]]),
  ]);

const collectionOptionsOf = (info) =>
  Object.fromEntries(
    COLLECTION_OPTIONS.filter((option) => info?.options?.[option] !== undefined).map((option) => [
      option,
      info.options[option],
    ]),
  );

/**
 * One collection of an endpoint.
 * @typedef {Object} CollectionHandle
 * @property {import('mongodb').Db} db
 * @property {import('mongodb').Collection} collection
 * @property {string} name
 */

/** @returns {CollectionHandle} */
const handleOf = (endpoint, database, name) => {
  const db = endpoint.db(database);
  return { db, collection: db.collection(name), name };
};

/** The `listCollections` entry of a collection, or null. */
const infoOf = async ({ db, name }) => (await db.listCollections({ name }).toArray())[0] ?? null;

/** The indexes of a collection without its `_id` index. */
const indexesOf = async ({ collection }) =>
  (await collection.indexes()).filter(({ name }) => name !== '_id_').map(({ v, ns, ...spec }) => spec);

/**
 * How the indexes of a target differ from those of its source: a source index it lacks, a source
 * index it defines another way, and an index of its own.
 * @param {Object[]} sourceIndexes
 * @param {Object[]} targetIndexes
 * @returns {string[]}
 */
const indexDefects = (sourceIndexes, targetIndexes) => {
  const target = new Map(targetIndexes.map((spec) => [indexKeyOf(spec), spec]));
  const source = new Set(sourceIndexes.map(indexKeyOf));
  const defects = [];
  for (const spec of sourceIndexes) {
    const match = target.get(indexKeyOf(spec));
    if (!match) defects.push(`index ${spec.name} is missing in the target`);
    else if (indexDefinitionOf(match) !== indexDefinitionOf(spec))
      defects.push(`target index ${match.name} differs from source index ${spec.name}`);
  }
  for (const spec of targetIndexes)
    if (!source.has(indexKeyOf(spec))) defects.push(`target index ${spec.name} is not an index of the source`);
  return defects;
};

const optionDefects = (sourceInfo, targetInfo) =>
  JSON.stringify(canonical(collectionOptionsOf(sourceInfo))) ===
  JSON.stringify(canonical(collectionOptionsOf(targetInfo)))
    ? []
    : ['the target collection options differ from the source'];

/**
 * Why a collection cannot be transferred: it is a view, or it uses an option no transfer
 * reproduces.
 * @param {Object|null} info - `listCollections` entry.
 * @returns {string[]}
 */
const unsupported = (info) => [
  ...(info && info.type !== 'collection' ? [`${info.name} is a ${info.type}, not a collection`] : []),
  ...UNSUPPORTED_OPTIONS.filter((option) => info?.options?.[option] !== undefined).map(
    (option) => `${info.name} uses the ${option} option, which no transfer reproduces`,
  ),
];

/**
 * The documents of a collection in `_id` order, in batches of at most `batchSize` documents and
 * {@link BATCH_BYTES}. The cursor closes on every exit.
 * @param {CollectionHandle} handle
 * @param {Object} params
 * @param {Object} [params.projection]
 * @param {number} params.batchSize
 * @returns {AsyncGenerator<Object[]>}
 */
async function* batchesOf({ collection }, { projection, batchSize }) {
  const cursor = collection
    .find({}, { ...READ, ...(projection ? { projection } : {}) })
    .sort({ _id: 1 })
    .batchSize(batchSize);
  try {
    let batch = [];
    let bytes = 0;
    for await (const doc of cursor) {
      batch.push(doc);
      bytes += BSON.calculateObjectSize(doc);
      if (batch.length >= batchSize || bytes >= BATCH_BYTES) {
        yield batch;
        batch = [];
        bytes = 0;
      }
    }
    if (batch.length) yield batch;
  } finally {
    await cursor.close();
  }
}

/** The documents of `ids` a collection holds, by {@link idKey}. */
const documentsById = async ({ collection }, ids, projection) => {
  const found = new Map();
  for (const group of chunks(ids, ID_BATCH))
    for (const doc of await collection
      .find({ _id: { $in: group } }, { ...READ, ...(projection ? { projection } : {}) })
      .toArray())
      found.set(idKey(doc._id), doc);
  return found;
};

/**
 * The whole documents of `ids`, in reads of at most {@link BATCH_BYTES}.
 * @param {CollectionHandle} handle
 * @param {Array<*>} ids
 * @returns {AsyncGenerator<Object[]>}
 */
async function* documentsInByteBatches({ collection }, ids) {
  for (const group of chunks(ids, ID_BATCH)) {
    const sizes = await collection
      .aggregate([{ $match: { _id: { $in: group } } }, { $project: { bytes: { $bsonSize: '$$ROOT' } } }])
      .toArray();
    let batch = [];
    let bytes = 0;
    for (const { _id, bytes: size } of sizes) {
      if (batch.length && bytes + size > BATCH_BYTES) {
        yield await collection.find({ _id: { $in: batch } }, READ).toArray();
        batch = [];
        bytes = 0;
      }
      batch.push(_id);
      bytes += size;
    }
    if (batch.length) yield await collection.find({ _id: { $in: batch } }, READ).toArray();
  }
}

/**
 * The layout of a transfer: the collection, the File references of its owner and the aggregates
 * named for it, read from the model schemas.
 * @param {Object} params
 * @param {string} params.collection
 * @param {string} params.owner - API name, or `''` for a collection no model owns.
 * @param {string[]} [params.aggregates=[]] - API or model names.
 * @returns {Promise<CollectionLayout>}
 * @throws {Error} When an aggregate is unknown, implicit, the collection itself, or not a static
 *   reference of the owner schema.
 * @memberof MongoCollectionOperations
 */
export async function layoutOf({ collection, owner, aggregates = [] }) {
  const relationships = owner ? MongooseDB.referencesOf(await MongooseDB.schemaOf(owner)) : [];
  const dynamic = relationships.filter(({ ref }) => ref === null).map(({ path }) => path);
  const defects = [];
  const resolved = [];
  for (const name of [...new Set(aggregates)]) {
    const api = MongooseDB.apiOf(name);
    const model = getCapVariableName(api || name);
    const paths = relationships.filter(({ ref }) => ref === model).map(({ path }) => path);
    if (!api) defects.push(`--aggregate ${name}: no API ships that model`);
    else if (api === 'file') defects.push('--aggregate file: File documents always go with their references');
    else if (!owner) defects.push(`--aggregate ${name}: no model owns ${collection}, so it declares no reference`);
    else if (api === owner) defects.push(`--aggregate ${name}: the collection itself is transferred whole`);
    else if (!paths.length)
      defects.push(
        `--aggregate ${name}: the ${owner} schema declares no reference to ${model}` +
          (dynamic.length ? ` (the dynamic references at ${dynamic.join(', ')} cannot be resolved)` : '') +
          `; declare it with ref: '${model}'`,
      );
    else
      resolved.push({ api, collection: await MongooseDB.collectionName(api), paths, fileFields: fileRefFields(api) });
  }
  if (defects.length) throw blocked('Unknown or ambiguous relationship', defects);
  return {
    collection,
    owner,
    fileFields: owner ? fileRefFields(owner) : [],
    files: await MongooseDB.collectionName('file'),
    aggregates: resolved,
    relationships: relationships.filter(({ ref }) => ref !== FILE_MODEL),
  };
}

/**
 * The collections one side of a transfer reads or writes.
 * @param {MongoEndpoint} endpoint
 * @param {CollectionLayout} layout
 */
const sideOf = (endpoint, layout) => {
  const main = handleOf(endpoint, endpoint.databaseOf(layout.owner), layout.collection);
  return {
    endpoint,
    database: main.db.databaseName,
    main,
    files: handleOf(endpoint, endpoint.databaseOf('file'), layout.files),
    aggregate: ({ api, collection }) => handleOf(endpoint, endpoint.databaseOf(api), collection),
  };
};

/** The plan view of a side, without credentials. */
const describe = (side) => ({ endpoint: side.endpoint.label, server: side.endpoint.server, database: side.database });

/** Whether two sides are the same collection of the same server. */
const sameCollection = (a, b) =>
  a.endpoint.server === b.endpoint.server && a.database === b.database && a.main.name === b.main.name;

/**
 * Scans the references of a collection: the distinct ids it holds of each aggregate and of File
 * (its own and those of the referenced aggregate documents), and the ids the source lacks.
 * @param {Object} params
 * @param {ReturnType<typeof sideOf>} params.side
 * @param {CollectionLayout} params.layout
 * @param {number} params.batchSize
 * @returns {Promise<{files:Object, aggregates:Object<string,Object>}>} Each `{distinct, missing, missingCount}`.
 */
async function scanReferences({ side, layout, batchSize }) {
  const tally = () => ({ seen: new Set(), missing: [], missingCount: 0 });
  const files = tally();
  const aggregates = Object.fromEntries(layout.aggregates.map(({ api }) => [api, tally()]));
  /**
   * Checks the references of `docs` at `paths` not seen yet; answers the documents found, with
   * `projection`. A missing one names the `holder` document that references it.
   */
  const check = async (entry, handle, docs, paths, label, holder, projection = { _id: 1 }) => {
    const fresh = unseen(entry.seen, documentFileRefs(docs, paths));
    const found = fresh.length ? await documentsById(handle, fresh, projection) : new Map();
    for (const value of fresh)
      if (!found.has(idKey(value))) {
        entry.missingCount++;
        if (entry.missing.length >= SAMPLE) continue;
        const by = docs.find((doc) => documentFileRefs([doc], paths).some((ref) => idKey(ref) === idKey(value)));
        entry.missing.push(`${holder} ${by._id} -> ${label} ${value}`);
      }
    return [...found.values()];
  };
  const paths = [...layout.fileFields, ...layout.aggregates.flatMap(({ paths }) => paths)];
  if (paths.length)
    for await (const batch of batchesOf(side.main, { projection: projectionOf(paths), batchSize })) {
      await check(files, side.files, batch, layout.fileFields, 'File', layout.collection);
      for (const aggregate of layout.aggregates) {
        const docs = await check(
          aggregates[aggregate.api],
          side.aggregate(aggregate),
          batch,
          aggregate.paths,
          aggregate.api,
          layout.collection,
          projectionOf(['_id', ...aggregate.fileFields]),
        );
        await check(files, side.files, docs, aggregate.fileFields, 'File', aggregate.collection);
      }
    }
  const summary = ({ seen, missing, missingCount }) => ({ distinct: seen.size, missing, missingCount });
  return {
    files: summary(files),
    aggregates: Object.fromEntries(Object.entries(aggregates).map(([api, entry]) => [api, summary(entry)])),
  };
}

/**
 * The state of the target for a transfer. A conflict of the target collection blocks the transfer;
 * an index difference of a shared File or aggregate collection is a warning.
 * @returns {Promise<{exists:boolean, documents:number, conflicts:string[], warnings:string[]}>}
 */
async function destinationOf({ source, target, layout, sourceInfo }) {
  const info = await infoOf(target.main);
  const status = { exists: !!info, documents: 0, conflicts: [], warnings: [] };
  if (info) {
    status.documents = await target.main.collection.countDocuments();
    status.conflicts.push(...unsupported(info));
    if (sourceInfo)
      status.conflicts.push(
        ...optionDefects(sourceInfo, info),
        ...indexDefects(await indexesOf(source.main), await indexesOf(target.main)).filter(
          (defect) => !defect.endsWith('is missing in the target'),
        ),
      );
  }
  for (const [label, from, to] of [
    ['File', source.files, target.files],
    ...layout.aggregates.map((aggregate) => [aggregate.api, source.aggregate(aggregate), target.aggregate(aggregate)]),
  ])
    if ((await infoOf(from)) && (await infoOf(to)))
      for (const defect of indexDefects(await indexesOf(from), await indexesOf(to)))
        status.warnings.push(`${label}: ${defect}`);
  return status;
}

/**
 * Inspects one collection, and the target collection when a target is given. Reads only.
 * @param {Object} params
 * @param {MongoEndpoint} params.source
 * @param {MongoEndpoint} [params.target]
 * @param {CollectionLayout} params.layout
 * @param {number} [params.batchSize]
 * @returns {Promise<Object>} The report.
 * @memberof MongoCollectionOperations
 */
export async function inspectCollection({ source, target, layout, batchSize = DEFAULT_BATCH_SIZE }) {
  const side = sideOf(source, layout);
  const info = await infoOf(side.main);
  const references =
    info?.type === 'collection'
      ? await scanReferences({ side, layout: { ...layout, aggregates: [] }, batchSize })
      : { files: { distinct: 0, missing: [], missingCount: 0 } };
  const report = {
    ...describe(side),
    collection: layout.collection,
    owner: layout.owner || null,
    exists: !!info,
    type: info?.type ?? null,
    options: collectionOptionsOf(info),
    documents: info ? await side.main.collection.countDocuments() : 0,
    indexes: info ? await indexesOf(side.main) : [],
    fileReferences: { paths: layout.fileFields, ...references.files },
    relationships: layout.relationships.map(({ path, ref }) => ({ path, ref: ref ?? 'dynamic' })),
    target: null,
  };
  if (target) {
    const destination = sideOf(target, layout);
    report.target = {
      ...describe(destination),
      ...(await destinationOf({ source: side, target: destination, layout, sourceInfo: info })),
    };
  }
  return report;
}

/** The key of a transfer: the same operation between the same collections resumes under it. */
const operationKey = ({ operation, source, target, layout, fileSync, allowMissingFiles }) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        operation,
        describe(source),
        describe(target),
        layout.collection,
        layout.aggregates.map(({ api }) => api),
        fileSync,
        allowMissingFiles,
      ]),
    )
    .digest('hex');

const recordsOf = (target) => handleOf(target.endpoint, target.endpoint.databaseOf(''), OPERATIONS_COLLECTION);

/**
 * Plans a transfer: what it reads and writes, what blocks it, and the record it resumes.
 * @returns {Promise<Object>}
 */
async function planTransfer({ operation, source, target, layout, fileSync, allowMissingFiles, batchSize }) {
  const key = operationKey({ operation, source, target, layout, fileSync, allowMissingFiles });
  const resumable = await recordsOf(target).collection.findOne({
    key,
    status: { $in: ['running', 'failed', 'verified'] },
  });
  const sourceInfo = await infoOf(source.main);
  // A move that dropped its source resumes at its File cleanup.
  const cleaning = !sourceInfo && STAGES.indexOf(resumable?.stage) >= STAGES.indexOf('delete-source');
  const conflicts = [];
  if (sameCollection(source, target)) conflicts.push('the source and the target are the same collection');
  if (!sourceInfo && !cleaning) conflicts.push(`collection ${layout.collection} does not exist in ${source.database}`);
  conflicts.push(...unsupported(sourceInfo));
  const destination = await destinationOf({ source, target, layout, sourceInfo });
  conflicts.push(...destination.conflicts);
  if (destination.documents && !resumable)
    conflicts.push(`the target collection ${layout.collection} already holds ${destination.documents} document(s)`);
  const references = sourceInfo ? await scanReferences({ side: source, layout, batchSize }) : null;
  if (references?.files.missingCount && !allowMissingFiles)
    conflicts.push(
      `${references.files.missingCount} referenced File document(s) are missing in the source (${references.files.missing.join(', ')})`,
    );
  for (const [api, entry] of Object.entries(references?.aggregates ?? {}))
    if (entry.missingCount)
      conflicts.push(
        `${entry.missingCount} referenced ${api} document(s) are missing in the source (${entry.missing.join(', ')})`,
      );
  return {
    plan: {
      operation,
      resume: resumable ? { operationId: resumable._id, stage: resumable.stage, status: resumable.status } : null,
      source: describe(source),
      target: describe(target),
      collection: layout.collection,
      owner: layout.owner || null,
      documents: sourceInfo ? await source.main.collection.countDocuments() : 0,
      fileSync,
      allowMissingFiles,
      fileReferences: {
        paths: layout.fileFields,
        ...(references?.files ?? { distinct: 0, missing: [], missingCount: 0 }),
      },
      aggregates: layout.aggregates.map(({ api, collection, paths }) => ({
        api,
        collection,
        paths,
        ...references?.aggregates[api],
      })),
      destination: { exists: destination.exists, documents: destination.documents, warnings: destination.warnings },
      consistency: {
        snapshot: false,
        transaction: false,
        sameServer: source.endpoint.server === target.endpoint.server,
        assumption:
          'The source takes no writes until the operation completes: a document or File written during it is not part of it.',
      },
      conflicts,
    },
    key,
    resumable,
  };
}

/**
 * Makes the target hold `docs`: inserts those it lacks and compares those it holds. A target
 * document with the same `_id` and other content stops the transfer.
 * @param {Object[]} docs - Whole source documents.
 * @param {CollectionHandle} to
 * @param {string} label
 * @returns {Promise<{copied:number, satisfied:number}>}
 */
async function writeDocuments(docs, to, label) {
  const held = await documentsById(
    to,
    docs.map(({ _id }) => _id),
  );
  const conflicting = docs.filter((doc) => held.has(idKey(doc._id)) && !sameDocument(doc, held.get(idKey(doc._id))));
  if (conflicting.length)
    throw blocked(
      `${conflicting.length} ${label} document(s) of the target hold other content under the same _id`,
      conflicting.slice(0, SAMPLE).map(({ _id }) => String(_id)),
    );
  const missing = docs.filter((doc) => !held.has(idKey(doc._id)));
  if (missing.length) await to.collection.insertMany(missing, { ordered: true });
  return { copied: missing.length, satisfied: docs.length - missing.length };
}

/**
 * Makes the target hold the source documents of `ids` ({@link writeDocuments}). An id the source
 * lacks stops the transfer, unless `allowMissing` counts it.
 * @param {Object} params
 * @param {CollectionHandle} params.from
 * @param {CollectionHandle} params.to
 * @param {Array<*>} params.ids - Distinct ids.
 * @param {string} params.label
 * @param {boolean} [params.write=true] - False writes nothing and only requires the target to hold each one.
 * @param {boolean} [params.allowMissing=false] - Counts an id the source lacks instead of stopping.
 * @returns {Promise<{copied:number, satisfied:number, missing:number}>}
 */
async function ensureDocuments({ from, to, ids, label, write = true, allowMissing = false }) {
  const result = { copied: 0, satisfied: 0, missing: 0 };
  if (!ids.length) return result;
  if (!write) {
    const present = await documentsById(to, ids, { _id: 1 });
    let absent = ids.filter((id) => !present.has(idKey(id)));
    if (absent.length && allowMissing) {
      const held = await documentsById(from, absent, { _id: 1 });
      result.missing = absent.filter((id) => !held.has(idKey(id))).length;
      absent = absent.filter((id) => held.has(idKey(id)));
    }
    if (absent.length)
      throw blocked(
        `${absent.length} referenced ${label} document(s) are missing in the target, and File synchronization is disabled`,
        absent.slice(0, SAMPLE).map(String),
      );
    return { ...result, satisfied: ids.length - result.missing };
  }
  for await (const batch of documentsInByteBatches(from, ids)) {
    const { copied, satisfied } = await writeDocuments(batch, to, label);
    result.copied += copied;
    result.satisfied += satisfied;
  }
  result.missing = ids.length - result.copied - result.satisfied;
  if (result.missing && !allowMissing)
    throw blocked(`${result.missing} referenced ${label} document(s) are missing in the source`);
  return result;
}

/** Creates a target collection with the options and indexes of its source, when it does not exist. */
async function prepareCollection(from, to) {
  const info = await infoOf(from);
  if (!info) return;
  if (!(await infoOf(to))) await to.db.createCollection(to.name, collectionOptionsOf(info));
  const present = new Set((await indexesOf(to)).map(indexKeyOf));
  const missing = (await indexesOf(from)).filter((spec) => !present.has(indexKeyOf(spec)));
  if (missing.length) await to.collection.createIndexes(missing);
}

/**
 * Copies, or with File synchronization off checks, the dependencies of one batch: the aggregate
 * documents it references after their Files, then its own Files. `visited` holds the aggregate
 * documents a former batch took.
 */
async function ensureDependencies({ batch, source, target, layout, fileSync, allowMissingFiles, visited, counts }) {
  const files = async (ids) => {
    const { copied, missing } = await ensureDocuments({
      from: source.files,
      to: target.files,
      ids,
      label: 'File',
      write: fileSync,
      allowMissing: allowMissingFiles,
    });
    counts.missingFiles += missing;
    return { copied };
  };
  for (const aggregate of layout.aggregates) {
    const ids = unseen((visited[aggregate.api] ??= new Set()), documentFileRefs(batch, aggregate.paths));
    if (!ids.length) continue;
    const from = source.aggregate(aggregate);
    if (aggregate.fileFields.length) {
      const docs = [...(await documentsById(from, ids, projectionOf(aggregate.fileFields))).values()];
      counts.files += (await files(documentFileRefs(docs, aggregate.fileFields))).copied;
    }
    const { copied } = await ensureDocuments({ from, to: target.aggregate(aggregate), ids, label: aggregate.api });
    counts.aggregates[aggregate.api] = (counts.aggregates[aggregate.api] ?? 0) + copied;
  }
  counts.files += (await files(documentFileRefs(batch, layout.fileFields))).copied;
}

/**
 * Copies the collection batch by batch, each batch after its dependencies. A document the target
 * already holds is compared, not written again: an interrupted copy resumes from its first batch.
 */
async function copyCollection({ source, target, layout, fileSync, allowMissingFiles, batchSize, record }) {
  await prepareCollection(source.main, target.main);
  await prepareCollection(source.files, target.files);
  for (const aggregate of layout.aggregates)
    await prepareCollection(source.aggregate(aggregate), target.aggregate(aggregate));
  const counts = { documents: 0, satisfied: 0, files: 0, missingFiles: 0, aggregates: {} };
  const visited = {};
  let batches = 0;
  for await (const batch of batchesOf(source.main, { batchSize })) {
    await ensureDependencies({ batch, source, target, layout, fileSync, allowMissingFiles, visited, counts });
    const { copied, satisfied } = await writeDocuments(batch, target.main, layout.collection);
    counts.documents += copied;
    counts.satisfied += satisfied;
    batches++;
    await record.update({ completed: counts, checkpoint: { batches, lastId: String(batch.at(-1)._id) } });
  }
  return counts;
}

/**
 * Proves the target holds the collection: every source document with the same content, every File
 * and aggregate document it references byte for byte, the same document count, indexes and options.
 * With `allowMissingFiles`, a File the source lacks is counted, not a defect.
 * @returns {Promise<{documents:number, files:number, missingFiles:number, aggregates:Object<string,number>}>}
 * @throws {Error} With the defects found, at most {@link SAMPLE} of them listed.
 */
async function verifyTransfer({ source, target, layout, allowMissingFiles, batchSize }) {
  const defects = [];
  const note = (defect) => defects.push(defect);
  const verified = { documents: 0, files: 0, missingFiles: 0, aggregates: {} };
  /** Compares source documents with their target copies; answers how many match. */
  const compareDocuments = async (docs, to, label) => {
    const held = await documentsById(
      to,
      docs.map(({ _id }) => _id),
    );
    let matched = 0;
    for (const doc of docs) {
      const copy = held.get(idKey(doc._id));
      if (!copy) note(`${label} ${doc._id} is missing in the target`);
      else if (!sameDocument(doc, copy)) note(`${label} ${doc._id} differs in the target`);
      else matched++;
    }
    return matched;
  };
  /** Compares the source documents of `ids` with their target copies; answers how many match. */
  const compare = async (from, to, ids, label) => {
    let matched = 0;
    let found = 0;
    for await (const batch of documentsInByteBatches(from, ids)) {
      found += batch.length;
      matched += await compareDocuments(batch, to, label);
    }
    if (found === ids.length) return matched;
    if (label === 'File' && allowMissingFiles) verified.missingFiles += ids.length - found;
    else note(`${ids.length - found} referenced ${label} document(s) are missing in the source`);
    return matched;
  };
  const seen = { File: new Set(), ...Object.fromEntries(layout.aggregates.map(({ api }) => [api, new Set()])) };
  for await (const batch of batchesOf(source.main, { batchSize })) {
    verified.documents += await compareDocuments(batch, target.main, layout.collection);
    for (const aggregate of layout.aggregates) {
      const ids = unseen(seen[aggregate.api], documentFileRefs(batch, aggregate.paths));
      const from = source.aggregate(aggregate);
      verified.aggregates[aggregate.api] =
        (verified.aggregates[aggregate.api] ?? 0) +
        (await compare(from, target.aggregate(aggregate), ids, aggregate.api));
      if (!aggregate.fileFields.length || !ids.length) continue;
      const docs = [...(await documentsById(from, ids, projectionOf(aggregate.fileFields))).values()];
      verified.files += await compare(
        source.files,
        target.files,
        unseen(seen.File, documentFileRefs(docs, aggregate.fileFields)),
        'File',
      );
    }
    verified.files += await compare(
      source.files,
      target.files,
      unseen(seen.File, documentFileRefs(batch, layout.fileFields)),
      'File',
    );
  }
  const sourceCount = await source.main.collection.countDocuments();
  const targetCount = await target.main.collection.countDocuments();
  if (sourceCount !== targetCount)
    note(`${layout.collection}: the source holds ${sourceCount} document(s), the target ${targetCount}`);
  defects.push(
    ...optionDefects(await infoOf(source.main), await infoOf(target.main)),
    ...indexDefects(await indexesOf(source.main), await indexesOf(target.main)),
  );
  if (defects.length) throw blocked('The target does not hold the collection', defects.slice(0, SAMPLE * 3));
  return verified;
}

/** Opens the operation record of a transfer, or reopens the one it resumes. */
async function openRecord({ plan, key, resumable, target, layout }) {
  const { collection: records } = recordsOf(target);
  const now = new Date();
  const _id =
    resumable?._id ??
    `${plan.operation}-${now.toISOString().replace(/[-:.]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
  if (resumable)
    await records.updateOne({ _id }, { $set: { status: 'running', updatedAt: now }, $unset: { failure: '' } });
  else
    await records.insertOne({
      _id,
      key,
      operation: plan.operation,
      source: plan.source,
      target: plan.target,
      collection: layout.collection,
      aggregates: layout.aggregates.map(({ api }) => api),
      fileSync: plan.fileSync,
      allowMissingFiles: plan.allowMissingFiles,
      planned: { documents: plan.documents, files: plan.fileReferences.distinct },
      status: 'running',
      stage: 'copy',
      createdAt: now,
      updatedAt: now,
    });
  return {
    operationId: _id,
    stage: resumable?.stage ?? 'copy',
    update: (fields) => records.updateOne({ _id }, { $set: { ...fields, updatedAt: new Date() } }),
    fail: (stage, error) =>
      records.updateOne(
        { _id },
        {
          $set: {
            status: 'failed',
            failure: { stage, message: error.message, defects: error.defects ?? [], at: new Date() },
            updatedAt: new Date(),
          },
        },
      ),
  };
}

/**
 * The candidates no registered collection of the source references any more, in any database of
 * the source.
 */
async function orphanedFiles({ source, candidates }) {
  const readers = [];
  for (const database of source.endpoint.databases)
    for (const api of fileRefApis()) {
      const { collection } = handleOf(source.endpoint, database, await MongooseDB.collectionName(api));
      readers.push({
        fields: fileRefFields(api),
        find: (filter, projection) => collection.find(filter, { ...READ, projection }).toArray(),
      });
    }
  const orphans = [];
  for (const group of chunks(candidates, ID_BATCH)) {
    const held = await heldFileIds({ ids: group, readers });
    orphans.push(...group.filter((id) => !held.has(String(id))));
  }
  return orphans;
}

/** The File ids the transferred documents reference, read from the target copy. */
async function transferredFileIds({ target, layout, batchSize }) {
  const seen = new Set();
  const ids = [];
  if (layout.fileFields.length)
    for await (const batch of batchesOf(target.main, { projection: projectionOf(layout.fileFields), batchSize }))
      ids.push(...unseen(seen, documentFileRefs(batch, layout.fileFields)));
  return ids;
}

/**
 * Drops the source collection, then deletes the source Files no registered collection references
 * any more, and proves both are gone.
 */
async function deleteSource({ source, target, layout, batchSize, record }) {
  await record.update({ stage: 'delete-source' });
  if (await infoOf(source.main)) await source.main.collection.drop();
  await record.update({ stage: 'clean-files' });
  const candidates = await transferredFileIds({ target, layout, batchSize });
  const orphans = await orphanedFiles({ source, candidates });
  let removed = 0;
  for (const group of chunks(orphans, ID_BATCH))
    removed += (await source.files.collection.deleteMany({ _id: { $in: group } })).deletedCount ?? 0;
  const left = [];
  if (await infoOf(source.main)) left.push(`the source collection ${layout.collection} still exists`);
  const remaining = (await documentsById(source.files, orphans, { _id: 1 })).size;
  if (remaining) left.push(`${remaining} orphaned File document(s) are still in the source`);
  if (left.length) throw blocked('The source cleanup is incomplete', left);
  return { candidates: candidates.length, removed, kept: candidates.length - orphans.length };
}

/** Runs a planned transfer through its stages, from the stage its record reached. */
async function runTransfer({
  plan,
  key,
  resumable,
  source,
  target,
  layout,
  fileSync,
  allowMissingFiles,
  batchSize,
  confirmSourceDelete,
  log,
}) {
  const record = await openRecord({ plan, key, resumable, target, layout });
  let stage = record.stage;
  log(`${resumable ? 'Resuming' : 'Starting'} operation ${record.operationId}`, { stage });
  const result = { operationId: record.operationId, status: 'running', copied: null, verified: null, cleanup: null };
  try {
    if (STAGES.indexOf(stage) < STAGES.indexOf('clean-files') && (await infoOf(source.main))) {
      if (stage === 'copy') {
        result.copied = await copyCollection({
          source,
          target,
          layout,
          fileSync,
          allowMissingFiles,
          batchSize,
          record,
        });
        log('Copied', result.copied);
      }
      stage = 'verify';
      await record.update({ stage });
      result.verified = await verifyTransfer({ source, target, layout, allowMissingFiles, batchSize });
      await record.update({ verification: { ...result.verified, at: new Date() } });
      log('Verified', result.verified);
    }
    if (plan.operation === 'move' && !confirmSourceDelete) {
      await record.update({ status: 'verified', stage: 'verified' });
      return { ...result, status: 'verified' };
    }
    if (plan.operation === 'move') {
      stage = 'delete-source';
      result.cleanup = await deleteSource({ source, target, layout, batchSize, record });
      log('Source deleted', result.cleanup);
    }
    await record.update({
      status: 'completed',
      stage: 'completed',
      ...(result.cleanup ? { cleanup: result.cleanup } : {}),
    });
    return { ...result, status: 'completed' };
  } catch (error) {
    await record.fail(stage, error);
    error.operationId = record.operationId;
    throw error;
  }
}

async function transferCollection({
  operation,
  source,
  target,
  layout,
  fileSync = true,
  allowMissingFiles = false,
  batchSize = DEFAULT_BATCH_SIZE,
  apply = false,
  confirmSourceDelete = false,
  log = () => {},
}) {
  const from = sideOf(source, layout);
  const to = sideOf(target, layout);
  const { plan, key, resumable } = await planTransfer({
    operation,
    source: from,
    target: to,
    layout,
    fileSync,
    allowMissingFiles,
    batchSize,
  });
  if (!apply) return { plan, result: null };
  log('Plan', plan);
  if (plan.conflicts.length) throw blocked(`The ${operation} is blocked`, plan.conflicts);
  const result = await runTransfer({
    plan,
    key,
    resumable,
    source: from,
    target: to,
    layout,
    fileSync,
    allowMissingFiles,
    batchSize,
    confirmSourceDelete,
    log,
  });
  return { plan, result };
}

/**
 * Clones a collection: copies it with its Files and the named aggregates, then verifies the target.
 * Plans only, unless `apply`.
 * @param {Object} params
 * @param {MongoEndpoint} params.source
 * @param {MongoEndpoint} params.target
 * @param {CollectionLayout} params.layout
 * @param {boolean} [params.fileSync=true] - False copies no File and requires the target to hold each one.
 * @param {boolean} [params.allowMissingFiles=false] - Copies a reference to a File the source lacks as it is, and counts it.
 * @param {number} [params.batchSize]
 * @param {boolean} [params.apply=false]
 * @param {(message:string, detail?:Object) => void} [params.log] - Receives the plan before any write, then the progress.
 * @returns {Promise<{plan:Object, result:Object|null}>}
 * @throws {Error} With `defects` when the plan is blocked or the target cannot be proven complete.
 * @memberof MongoCollectionOperations
 */
export const cloneCollection = (params) => transferCollection({ ...params, operation: 'clone' });

/**
 * Moves a collection: clones it and verifies the target; with `confirmSourceDelete` it then drops
 * the source collection and deletes the source Files nothing else references. Without the
 * confirmation it stops after the verification.
 * @param {Object} params - As {@link cloneCollection}, with `confirmSourceDelete`.
 * @returns {Promise<{plan:Object, result:Object|null}>}
 * @memberof MongoCollectionOperations
 */
export const moveCollection = (params) => transferCollection({ ...params, operation: 'move' });

/**
 * Renames a collection inside its database. Documents and indexes stay; no File moves. Plans only,
 * unless `apply`.
 * @param {Object} params
 * @param {MongoEndpoint} params.source
 * @param {CollectionLayout} params.layout
 * @param {string} params.to - The new collection name.
 * @param {boolean} [params.apply=false]
 * @param {(message:string, detail?:Object) => void} [params.log] - Receives the plan before the rename.
 * @returns {Promise<{plan:Object, result:Object|null}>}
 * @throws {Error} When the source is missing or the new name is taken.
 * @memberof MongoCollectionOperations
 */
export async function renameCollection({ source, layout, to, apply = false, log = () => {} }) {
  const side = sideOf(source, layout);
  const info = await infoOf(side.main);
  const renamed = handleOf(source, side.database, to || layout.collection);
  const conflicts = [];
  if (!to) conflicts.push('give the new name with --to');
  else if (to === layout.collection) conflicts.push('the new name is the current name');
  else if (await infoOf(renamed)) conflicts.push(`collection ${to} already exists in ${side.database}`);
  if (!info) conflicts.push(`collection ${layout.collection} does not exist in ${side.database}`);
  conflicts.push(...unsupported(info));
  const plan = {
    operation: 'rename',
    ...describe(side),
    collection: layout.collection,
    to,
    documents: info ? await side.main.collection.countDocuments() : 0,
    indexes: info ? (await indexesOf(side.main)).map(({ name }) => name) : [],
    warning: layout.owner
      ? `The ${layout.owner} model reads ${layout.collection}: update the model or its configuration to read ${to}`
      : null,
    conflicts,
  };
  if (!apply) return { plan, result: null };
  log('Plan', plan);
  if (conflicts.length) throw blocked('The rename is blocked', conflicts);
  await side.main.db.renameCollection(layout.collection, to, { dropTarget: false });
  const result = {
    documents: await renamed.collection.countDocuments(),
    indexes: (await indexesOf(renamed)).map(({ name }) => name),
  };
  if (result.documents !== plan.documents || result.indexes.length !== plan.indexes.length)
    throw blocked('The renamed collection differs from the source', [
      `${result.documents} document(s), ${result.indexes.length} index(es)`,
    ]);
  return { plan, result };
}

/**
 * The databases of a target, read from its configuration alone: its own database and its
 * partitions, or the one database an override names.
 * @param {{db:Object, database?:string}} target
 * @returns {{databases:string[], databaseOf:(api:string) => string}}
 * @memberof MongoCollectionOperations
 */
export const databaseLayout = ({ db, database = '' }) => {
  const partitions = DataBaseProviderService.partitionsOf(db);
  return {
    databases: database ? [database] : [db.name, ...Object.values(partitions).map(({ name }) => name)],
    databaseOf: (api) => database || (api && MongooseDB.partitionDatabase(api, partitions)) || db.name,
  };
};

/**
 * Connects to a target through the provider service of its host path. The connection binds no
 * model, so it creates no collection.
 * @param {import('../data-operations.js').DataOperationTarget} target
 * @returns {Promise<MongoEndpoint & {client: import('mongodb').MongoClient}>}
 * @throws {Error} When the database does not answer.
 * @memberof MongoCollectionOperations
 */
export async function openEndpoint(target) {
  const { deployId, host, path, db } = target;
  const bucket = await DataBaseProviderService.load({ apis: [], host, path, db });
  if (!bucket?.connection) throw new Error(`No MongoDB connection for ${deployId} ${host}${path}`);
  await bucket.connection.db.admin().command({ ping: 1 });
  const client = bucket.connection.getClient();
  return {
    label: `${deployId} ${host}${path}`,
    server: MongooseDB.normalizeConfig(db).hosts.join(','),
    ...databaseLayout(target),
    db: (name) => client.db(name),
    client,
    close: () => bucket.close(),
  };
}

/**
 * Restores the archives of a backup into staging databases of a server, one per database of the
 * live endpoint, and answers them as a source. Only the named collections are restored. `close`
 * drops the staging databases.
 * @param {Object} params
 * @param {MongoEndpoint & {client: import('mongodb').MongoClient}} params.server - Holds the staging databases.
 * @param {ReturnType<typeof databaseLayout>} params.of - The databases the backup was taken from.
 * @param {string} params.label - The backup, for reports.
 * @param {Array<{database:string, open:() => AsyncIterable<Buffer>}>} params.archives
 * @param {string[]} params.collections
 * @returns {Promise<MongoEndpoint & {staged:Object<string,number>}>}
 * @memberof MongoCollectionOperations
 */
export async function stageArchives({ server, of, label, archives, collections }) {
  const prefix = `underpost-staging-${crypto.randomBytes(4).toString('hex')}`;
  const names = new Map(of.databases.map((database, index) => [database, `${prefix}-${index}`]));
  const staged = {};
  const endpoint = {
    label,
    server: server.server,
    databases: [...names.values()],
    databaseOf: (api) => names.get(of.databaseOf(api)),
    db: server.db,
    staged,
    close: async () => {
      const left = [];
      for (const name of names.values())
        await server
          .db(name)
          .dropDatabase()
          .catch((error) => left.push(`${name}: ${error.message}`));
      if (left.length) throw blocked('The staging databases were not all dropped', left);
    },
  };
  try {
    for (const { database, open } of archives) {
      const { restored } = await restoreMongoArchive({
        client: server.client,
        source: open(),
        target: (db, collection) => (db === database && collections.includes(collection) ? names.get(db) : null),
      });
      Object.assign(staged, restored);
    }
  } catch (error) {
    await endpoint.close().catch((cleanup) => (error.message += `; ${cleanup.message}`));
    throw error;
  }
  return endpoint;
}

/**
 * The MongoDB data-operations provider.
 * @type {import('../data-operations.js').DataOperationsProvider}
 * @memberof MongoCollectionOperations
 */
export const MongoCollectionOperations = Object.freeze({
  provider: 'mongoose',
  capabilities: Object.freeze({ inspect: true, clone: true, move: true, rename: true }),
  databaseLayout,
  openEndpoint,
  stageArchives,
  layoutOf,
  inspectCollection,
  cloneCollection,
  moveCollection,
  renameCollection,
});
