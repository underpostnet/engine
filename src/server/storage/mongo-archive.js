/**
 * The archive format of `mongodump --archive`, read without the Database Tools.
 *
 * An archive is a magic number, a prelude and a body. The prelude is one block: the archive header,
 * then the metadata of each collection, then a terminator. The body is a sequence of blocks: a
 * namespace header, then that namespace's documents, then a terminator. The header of the last
 * block of a namespace says `EOF`. With `--gzip`, the whole archive is one gzip stream.
 *
 * `mongorestore` stays the restore tool of a cluster. This reader serves a host without it: a
 * restore through the driver and the inventory of a backup.
 *
 * @module src/server/storage/mongo-archive.js
 * @namespace MongoArchive
 */
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';

const { BSON } = mongoose.mongo;

/** The first four bytes of every archive. */
export const MONGO_ARCHIVE_MAGIC = 0x8199e26d;
const TERMINATOR = -1;
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

/** Pulls exact byte counts from an async iterable of chunks. */
class ByteReader {
  constructor(source) {
    this.iterator = source[Symbol.asyncIterator]();
    this.buffer = Buffer.alloc(0);
  }

  async fill(length) {
    while (this.buffer.length < length) {
      const { value, done } = await this.iterator.next();
      if (done) return false;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    }
    return true;
  }

  async take(length) {
    if (!(await this.fill(length))) throw new Error('The archive ends inside a block');
    const bytes = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return bytes;
  }

  /** The int32 at the head of the stream, or null at its end. */
  async peekInt32() {
    if (!(await this.fill(4))) return null;
    return this.buffer.readInt32LE(0);
  }
}

/** One BSON document, or null at a terminator. */
async function readDocumentOrTerminator(reader) {
  const size = await reader.peekInt32();
  if (size === null) throw new Error('The archive ends where a document or a terminator belongs');
  if (size === TERMINATOR) {
    await reader.take(4);
    return null;
  }
  if (size < 5) throw new Error(`Invalid BSON size ${size} in the archive`);
  return await reader.take(size);
}

/**
 * Gunzips a source that starts with the gzip magic, and passes any other through.
 * @param {AsyncIterable<Buffer>} source
 * @returns {AsyncGenerator<Buffer>}
 */
async function* plainArchive(source) {
  const iterator = source[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return;
  const rest = (async function* () {
    yield first.value;
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) yield next.value;
  })();
  if (!Buffer.from(first.value).subarray(0, 2).equals(GZIP_MAGIC)) {
    yield* rest;
    return;
  }
  yield* Readable.from(rest).pipe(zlib.createGunzip());
}

/**
 * Reads an archive, gzip or plain. Events:
 * - `{type:'header', header}`
 * - `{type:'collection', db, collection, metadata, kind}`: `metadata` is the parsed collection metadata.
 * - `{type:'documents', db, collection, documents}`: raw BSON documents of one block.
 * - `{type:'end', db, collection}`: the namespace is complete.
 * @param {AsyncIterable<Buffer>} source
 * @returns {AsyncGenerator<Object>}
 * @throws {Error} On a stream that is not an archive, or ends inside one.
 * @memberof MongoArchive
 */
export async function* readMongoArchive(source) {
  const reader = new ByteReader(plainArchive(source));
  if (!(await reader.fill(4))) throw new Error('The stream is not a mongodump archive: it is empty');
  if ((await reader.take(4)).readUInt32LE(0) !== MONGO_ARCHIVE_MAGIC)
    throw new Error('The stream is not a mongodump archive');
  const header = await readDocumentOrTerminator(reader);
  if (!header) throw new Error('The archive has no header');
  yield { type: 'header', header: BSON.deserialize(header) };
  for (let raw = await readDocumentOrTerminator(reader); raw; raw = await readDocumentOrTerminator(reader)) {
    const { db, collection, metadata, type } = BSON.deserialize(raw);
    yield {
      type: 'collection',
      db,
      collection,
      kind: type || 'collection',
      metadata: metadata ? BSON.EJSON.parse(metadata, { relaxed: false }) : {},
    };
  }
  while ((await reader.peekInt32()) !== null) {
    const raw = await readDocumentOrTerminator(reader);
    if (!raw) throw new Error('The archive holds a terminator where a namespace header belongs');
    const { db, collection, EOF } = BSON.deserialize(raw);
    const documents = [];
    for (
      let document = await readDocumentOrTerminator(reader);
      document;
      document = await readDocumentOrTerminator(reader)
    )
      documents.push(document);
    if (documents.length) yield { type: 'documents', db, collection, documents };
    if (EOF) yield { type: 'end', db, collection };
  }
}

/**
 * The inventory of an archive: per namespace, its documents and its indexes.
 * @param {AsyncIterable<Buffer>} source
 * @returns {Promise<{toolVersion:string, serverVersion:string, namespaces:Object<string,{documents:number, indexes:number, kind:string}>}>}
 * @memberof MongoArchive
 */
export async function inspectMongoArchive(source) {
  const inventory = { toolVersion: '', serverVersion: '', namespaces: {} };
  const namespace = (db, collection) => {
    const name = db ? `${db}.${collection}` : collection;
    return (inventory.namespaces[name] ??= { documents: 0, indexes: 0, kind: 'collection' });
  };
  for await (const event of readMongoArchive(source)) {
    if (event.type === 'header') {
      inventory.toolVersion = event.header.tool_version ?? '';
      inventory.serverVersion = event.header.server_version ?? '';
    } else if (event.type === 'collection') {
      const entry = namespace(event.db, event.collection);
      entry.indexes = event.metadata.indexes?.length ?? 0;
      entry.kind = event.kind;
    } else if (event.type === 'documents') namespace(event.db, event.collection).documents += event.documents.length;
  }
  return inventory;
}

/**
 * A tap for {@link import('./backup.js').writeBackup}: it reads the plaintext of a dump stream as it
 * is stored and returns the archive inventory.
 * @returns {{write:(chunk:Buffer) => void, end:() => Promise<Object>}}
 * @memberof MongoArchive
 */
export function mongoArchiveTap() {
  const feed = new Readable({ read() {} });
  const inventory = inspectMongoArchive(feed);
  inventory.catch(() => {});
  return {
    write: (chunk) => feed.push(chunk),
    end: async () => {
      feed.push(null);
      return await inventory;
    },
  };
}

/** Collection metadata options `createCollection` accepts. */
const collectionOptions = (metadata) => {
  const { uuid, ...options } = metadata.options ?? {};
  return options;
};

/**
 * Restores an archive through the driver, byte for byte: every value keeps its BSON type. Each
 * collection is created with its options and indexes before its documents arrive. The oplog of a
 * `--oplog` dump is never applied: this restore is collection by collection.
 * @param {Object} params
 * @param {import('mongodb').MongoClient} params.client
 * @param {AsyncIterable<Buffer>} params.source - The archive.
 * @param {(db:string) => string|null} [params.target] - The database a source database restores
 *   into, or null to skip it. Default: the same name.
 * @param {boolean} [params.indexes=true] - Create the indexes of the archive.
 * @param {number} [params.batchSize=500]
 * @returns {Promise<{restored:Object<string,number>, skipped:string[]}>} Documents per target namespace.
 * @memberof MongoArchive
 */
export async function restoreMongoArchive({ client, source, target = (db) => db, indexes = true, batchSize = 500 }) {
  const restored = {};
  const skipped = new Set();
  const destination = (db, collection) => {
    const name = db ? target(db) : null;
    return name ? { db: client.db(name), collection: client.db(name).collection(collection) } : null;
  };
  for await (const event of readMongoArchive(source)) {
    if (event.type === 'collection') {
      const found = destination(event.db, event.collection);
      if (!found || event.kind !== 'collection') {
        skipped.add(event.db ? `${event.db}.${event.collection}` : event.collection);
        continue;
      }
      const { db, collection } = found;
      restored[`${collection.dbName}.${collection.collectionName}`] = 0;
      await db.createCollection(event.collection, collectionOptions(event.metadata)).catch((error) => {
        if (error?.codeName !== 'NamespaceExists') throw error;
      });
      const specs = (event.metadata.indexes ?? [])
        .filter(({ name: indexName }) => indexName !== '_id_')
        .map(({ v, ns, ...spec }) => spec);
      if (indexes && specs.length) await collection.createIndexes(specs);
    } else if (event.type === 'documents') {
      const collection = destination(event.db, event.collection)?.collection;
      if (!collection) {
        skipped.add(event.db ? `${event.db}.${event.collection}` : event.collection);
        continue;
      }
      const name = `${collection.dbName}.${collection.collectionName}`;
      for (let index = 0; index < event.documents.length; index += batchSize) {
        const batch = event.documents
          .slice(index, index + batchSize)
          .map((raw) => BSON.deserialize(raw, { promoteValues: false }));
        await collection.insertMany(batch, { ordered: true });
        restored[name] = (restored[name] ?? 0) + batch.length;
      }
    }
  }
  return { restored, skipped: [...skipped] };
}
