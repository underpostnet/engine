/**
 * Object Layer identity: canonical bytes, content hash and CID.
 *
 * The identity is computed here, before any pin or token registration:
 *
 * | step            | rule                                                                     |
 * |-----------------|--------------------------------------------------------------------------|
 * | domain          | plain objects, arrays, well-formed strings, booleans, null, and integers |
 * |                 | within ±(2^53 − 1); anything else is refused, never converted            |
 * | serialization   | RFC 8785 JSON Canonicalization Scheme (JCS), UTF-8                       |
 * | size            | at most {@link MAX_CANONICAL_BYTES}, so the payload is one block         |
 * | digest          | sha2-256                                                                 |
 * | CID version     | 1                                                                        |
 * | multicodec      | raw (0x55)                                                               |
 * | multihash       | sha2-256 (0x12), 32 bytes                                                |
 * | multibase       | base32 lower (`b`)                                                       |
 * | pin parameters  | `add?pin=true&cid-version=1`, raw leaves, one chunk                      |
 *
 * Every identity-bearing JSON payload, a definition and the metadata of its render, becomes bytes
 * through {@link canonicalJsonBytes}, and a pin stores those exact bytes. JSON text that feeds an
 * identity is read with {@link parseIdentityJson}, which refuses duplicate properties.
 *
 * The size limit is what makes the one-block form exact: Kubo chunks at 256 KiB, so a payload
 * above the limit would become a DAG with another CID. A payload over the limit is refused
 * rather than published under an identity this module cannot reproduce.
 *
 * @module src/api/object-layer/object-layer.identity.js
 * @namespace ObjectLayerIdentity
 */
import crypto from 'crypto';
import canonicalize from 'canonicalize';
import { canonicalObjectLayer } from '../../client/components/object-layer/ObjectLayerProtocol.js';

/** Multicodec prefix of a CIDv1 raw block hashed with sha2-256: version, codec, hash code, length. */
const CID_V1_RAW_SHA256_PREFIX = Buffer.from([0x01, 0x55, 0x12, 0x20]);
/** Largest canonical payload that stays one raw block under the pin parameters (256 KiB). */
export const MAX_CANONICAL_BYTES = 262144;
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const OBJECT_LAYER_CID_PATTERN = /^bafkrei[a-z2-7]{52}$/;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

const base32Encode = (bytes) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (text) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of text) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

const isPlainObject = (value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/* Refuses a value outside the canonical domain, naming its path. */
const assertCanonicalValue = (value, path) => {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new Error(`${path} is not well-formed Unicode`);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${path} is ${value}, not an integer within ±(2^53 − 1)`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertCanonicalValue(value[index], `${path}[${index}]`);
    return;
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (!key.isWellFormed()) throw new Error(`A property name in ${path} is not well-formed Unicode`);
      assertCanonicalValue(value[key], `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} is ${value === undefined ? 'undefined' : typeof value}, not a canonical JSON value`);
};

/**
 * The canonical bytes of an identity-bearing JSON payload: its RFC 8785 serialization in UTF-8.
 * @param {*} value - A value of the canonical domain.
 * @returns {Buffer}
 * @throws {Error} When the value, or a value it holds, is outside the domain.
 * @memberof ObjectLayerIdentity
 */
export const canonicalJsonBytes = (value) => {
  assertCanonicalValue(value, '$');
  return Buffer.from(canonicalize(value), 'utf8');
};

/**
 * Parses JSON text that feeds an identity. Plain `JSON.parse` keeps the last of two equal
 * property names, so two texts would name one payload; this refuses them.
 * @param {string} text
 * @returns {*}
 * @throws {Error} When the text is not JSON or an object repeats a property name.
 * @memberof ObjectLayerIdentity
 */
export const parseIdentityJson = (text) => {
  const value = JSON.parse(text);
  const objects = [];
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '"') {
      let end = at + 1;
      while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      const object = objects.at(-1);
      if (object?.expectsName) {
        const name = JSON.parse(text.slice(at, end + 1));
        if (object.names.has(name)) throw new Error(`Duplicate property "${name}" in identity JSON`);
        object.names.add(name);
        object.expectsName = false;
      }
      at = end;
    } else if (char === '{') objects.push({ names: new Set(), expectsName: true });
    else if (char === '[') objects.push(null);
    else if (char === '}' || char === ']') objects.pop();
    else if (char === ',' && objects.at(-1)) objects.at(-1).expectsName = true;
  }
  return value;
};

/**
 * The bytes whose hash is the identity: the canonical bytes of the canonical payload.
 * @param {Object} input - Document, DTO or `{ data }` payload.
 * @returns {Buffer}
 * @memberof ObjectLayerIdentity
 */
export const canonicalObjectLayerBytes = (input) => canonicalJsonBytes(canonicalObjectLayer(input));

/**
 * Hex sha2-256 of a payload that pins as one raw block.
 * @param {Buffer} bytes
 * @returns {string}
 * @throws {Error} When the payload is over {@link MAX_CANONICAL_BYTES}: it would pin as a DAG.
 * @memberof ObjectLayerIdentity
 */
const payloadDigest = (bytes) => {
  if (bytes.length > MAX_CANONICAL_BYTES)
    throw new Error(`A ${bytes.length} byte payload pins as a DAG; the protocol allows ${MAX_CANONICAL_BYTES}`);
  return crypto.createHash('sha256').update(bytes).digest('hex');
};

/**
 * Hex SHA-256 of the canonical bytes.
 * @param {Object} input
 * @returns {string}
 * @memberof ObjectLayerIdentity
 */
export const computeObjectLayerContentHash = (input) => payloadDigest(canonicalObjectLayerBytes(input));

/**
 * CIDv1 raw sha2-256 (`bafkrei…`) for a hex SHA-256 digest.
 * @param {string} hex - 64 hex characters.
 * @returns {string}
 * @memberof ObjectLayerIdentity
 */
export const cidFromSha256Hex = (hex) => {
  if (!CONTENT_HASH_PATTERN.test(hex)) throw new Error('cidFromSha256Hex expects a 64 character hex digest');
  return `b${base32Encode(Buffer.concat([CID_V1_RAW_SHA256_PREFIX, Buffer.from(hex, 'hex')]))}`;
};

/**
 * Hex SHA-256 digest carried by a `bafkrei…` CID.
 * @param {string} cid
 * @returns {string}
 * @memberof ObjectLayerIdentity
 */
export const sha256HexFromCid = (cid) => {
  if (!isObjectLayerCid(cid)) throw new Error(`Not an Object Layer CID: ${cid}`);
  return base32Decode(cid.slice(1)).subarray(CID_V1_RAW_SHA256_PREFIX.length).toString('hex');
};

/**
 * True for the CID form the protocol uses: CIDv1, raw, sha2-256, base32.
 * @param {*} cid
 * @returns {boolean}
 * @memberof ObjectLayerIdentity
 */
export const isObjectLayerCid = (cid) => typeof cid === 'string' && OBJECT_LAYER_CID_PATTERN.test(cid);

/**
 * Canonical CID of an Object Layer.
 * @param {Object} input
 * @returns {string}
 * @memberof ObjectLayerIdentity
 */
export const computeObjectLayerCid = (input) => cidFromSha256Hex(computeObjectLayerContentHash(input));

/**
 * Both identity fields, from the same canonical bytes.
 * @param {Object} input
 * @returns {{contentHash:string,cid:string}}
 * @memberof ObjectLayerIdentity
 */
export const objectLayerIdentity = (input) => {
  const contentHash = computeObjectLayerContentHash(input);
  return { contentHash, cid: cidFromSha256Hex(contentHash) };
};

/**
 * The CID a payload pins under the protocol parameters: one raw block, so the CID is the
 * sha2-256 of the bytes themselves.
 * @param {Buffer} bytes
 * @returns {string}
 * @throws {Error} When the payload is over {@link MAX_CANONICAL_BYTES}: it would pin as a DAG.
 * @memberof ObjectLayerIdentity
 */
export const payloadCid = (bytes) => cidFromSha256Hex(payloadDigest(bytes));

/**
 * The canonical metadata CID of a render layout: the CID of its canonical bytes.
 * @param {Object} metadata - Layout of the primary render.
 * @returns {string}
 * @memberof ObjectLayerIdentity
 */
export const renderMetadataCid = (metadata) => payloadCid(canonicalJsonBytes(metadata));

/**
 * A render as content: the payloads a pin stores, the primary render as given and its metadata
 * as canonical bytes, and the render contract that names them, `data.render`. Computed from the
 * bytes, so every host derives the same pair and no pin can assign another.
 * @param {Object} params
 * @param {Buffer} params.primary - PNG bytes of the primary render.
 * @param {Object} params.metadata - Layout of the primary render.
 * @returns {{payloads: {primary: Buffer, metadata: Buffer}, contract: {cid: string, metadataCid: string}}}
 * @memberof ObjectLayerIdentity
 */
export const canonicalRender = ({ primary, metadata }) => {
  const payloads = { primary, metadata: canonicalJsonBytes(metadata) };
  return { payloads, contract: { cid: payloadCid(payloads.primary), metadataCid: payloadCid(payloads.metadata) } };
};

/**
 * The canonical render contract of a definition, `data.render`: the CID of its primary render
 * and the CID of the layout that describes it.
 * @param {{primary: Buffer, metadata: Object}} render
 * @returns {{cid: string, metadataCid: string}}
 * @memberof ObjectLayerIdentity
 */
export const renderContractOf = (render) => canonicalRender(render).contract;

export { OBJECT_LAYER_CID_PATTERN, CONTENT_HASH_PATTERN };
