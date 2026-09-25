import { describe, it, expect } from 'vitest';
import express from 'express';
import {
  canonicalJsonBytes,
  canonicalObjectLayerBytes,
  canonicalRender,
  parseIdentityJson,
  payloadCid,
  renderContractOf,
  renderMetadataCid,
} from '../../../src/api/object-layer/object-layer.identity.js';
import { STAT_RECORD_RULE } from '../../../src/client/components/object-layer/ObjectLayerProtocol.js';
import { keepRawBody } from '../../../src/server/network/middlewares.js';

// RFC 8785 over the schema version 1 domain. The expected bytes are the ones Python `rfc8785`
// and Go `gowebpki/jcs` write for the same values: the rule is the RFC, not this runtime.
const text = (value) => canonicalJsonBytes(value).toString('utf8');

describe('canonical JSON bytes', () => {
  it('orders properties by UTF-16 code units, recursively, and keeps array order', () => {
    expect(text({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
    expect(text({ z: { y: 1, x: [{ b: 2, a: 1 }] }, a: 0 })).toBe('{"a":0,"z":{"x":[{"a":1,"b":2}],"y":1}}');
    expect(text([3, 1, 2])).toBe('[3,1,2]');
    expect(text({ é: 1, e: 2, ü: 3, z: 4, E: 5 })).toBe('{"E":5,"e":2,"z":4,"é":1,"ü":3}');
    expect(text({ '😀': 1, ﬁ: 2, a: 3, '\u0080': 4 })).toBe('{"a":3,"\u0080":4,"😀":1,"ﬁ":2}');
  });

  it('writes one form for a string, escaped or not, and escapes only what JSON requires', () => {
    expect(text(parseIdentityJson('{"s":"\\u00e9\\u20ac"}'))).toBe(text(parseIdentityJson('{"s":"é€"}')));
    expect(text({ s: '\u0000\u0001\u001f\n\t\r\b\f"\\/' })).toBe(
      '{"s":"\\u0000\\u0001\\u001f\\n\\t\\r\\b\\f\\"\\\\/"}',
    );
    expect(text({ s: '  ' })).toBe('{"s":"  "}');
    expect(canonicalJsonBytes({ s: 'é' })).toEqual(Buffer.from('{"s":"é"}', 'utf8'));
  });

  it('writes integers within ±(2^53 − 1), and zero for negative zero', () => {
    expect(text([0, -0, 1, -1, 100, -100])).toBe('[0,0,1,-1,100,-100]');
    expect(text([Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])).toBe('[9007199254740991,-9007199254740991]');
    expect(text({ a: null, t: true, f: false })).toBe('{"a":null,"f":false,"t":true}');
  });

  it('refuses every value outside the domain instead of converting it', () => {
    const refused = [
      [[Number.MAX_SAFE_INTEGER + 1], /\$\[0\] is 9007199254740992/],
      [parseIdentityJson('[9007199254740993]'), /not an integer/],
      [[NaN], /\$\[0\] is NaN/],
      [[Infinity], /Infinity/],
      [[-Infinity], /-Infinity/],
      [parseIdentityJson('[1e400]'), /Infinity/],
      [{ frame_duration: 1.5 }, /\$\.frame_duration is 1\.5/],
      [{ s: '\ud800' }, /\$\.s is not well-formed Unicode/],
      [{ ['\udc00']: 1 }, /property name in \$ is not well-formed/],
      [{ a: undefined }, /\$\.a is undefined/],
      [[undefined], /\$\[0\] is undefined/],
      [undefined, /\$ is undefined/],
      [new Array(2), /\$\[0\] is undefined/],
      [{ at: new Date(0) }, /\$\.at is object/],
      [{ bytes: Buffer.from('a') }, /\$\.bytes is object/],
      [{ big: 1n }, /\$\.big is bigint/],
    ];
    for (const [value, message] of refused) expect(() => canonicalJsonBytes(value)).toThrow(message);
  });

  it('writes the same bytes on every run', () => {
    const value = { data: { stats: { b: 2, a: 1 }, item: { id: 'hatchet' } }, profile: { version: 2, id: 'cyberia' } };
    const first = canonicalJsonBytes(value);
    for (let run = 0; run < 5; run++) expect(canonicalJsonBytes(structuredClone(value)).equals(first)).toBe(true);
  });
});

describe('identity JSON input', () => {
  it('refuses a repeated property name, as written or escaped, at any depth', () => {
    expect(() => parseIdentityJson('{"a":1,"a":2}')).toThrow('Duplicate property "a"');
    expect(() => parseIdentityJson('{"a":1,"\\u0061":2}')).toThrow('Duplicate property "a"');
    expect(() => parseIdentityJson('{"x":{"y":[{"k":1,"k":1}]}}')).toThrow('Duplicate property "k"');
    expect(() => parseIdentityJson('{"a":"x","b":"a","a":{}}')).toThrow('Duplicate property "a"');
  });

  it('keeps the same name in sibling objects, and names inside strings', () => {
    expect(parseIdentityJson('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseIdentityJson('{"a":{"a":1},"b":"\\"a\\":"}')).toEqual({ a: { a: 1 }, b: '"a":' });
  });

  it('refuses text that is not JSON', () => {
    expect(() => parseIdentityJson('{"a":NaN}')).toThrow(SyntaxError);
  });

  it('refuses an Object Layer request body that repeats a property name', async () => {
    const { ObjectLayerRouter } = await import('../../../src/api/object-layer/object-layer.router.js');
    const app = express();
    app.use(express.json({ verify: keepRawBody }));
    app.use('/object-layer', ObjectLayerRouter.router({ authMiddleware: (req, res, next) => next() }));
    const server = app.listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/object-layer/canonical`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"data":{"stats":{"effect":1,"effect":5}}}',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        status: 'error',
        message: 'Duplicate property "effect" in identity JSON',
      });
    } finally {
      server.close();
    }
  });
});

describe('the canonical payloads of a definition', () => {
  const definition = (stats) => ({ profile: { id: 'cyberia', version: 2 }, data: { item: { id: 'hatchet' }, stats } });

  it('refuses stats that are not an integer record instead of dropping them', () => {
    for (const stats of [{ effect: 0.5 }, { effect: NaN }, { effect: '5' }, [1, 2], 5])
      expect(() => canonicalObjectLayerBytes(definition(stats))).toThrow(STAT_RECORD_RULE);
    expect(() => canonicalObjectLayerBytes({ profile: { id: 'cyberia', version: 'x' }, data: {} })).toThrow(
      /\$\.profile\.version is NaN/,
    );
  });

  it('names a render by the exact bytes a pin stores', () => {
    const primary = Buffer.from('primary render');
    const metadata = { itemKey: 'hatchet', atlasWidth: 2, atlasHeight: 1, cellPixelDim: 1 };
    const { payloads, contract } = canonicalRender({ primary, metadata });
    expect(payloads.primary).toBe(primary);
    expect(payloads.metadata.toString('utf8')).toBe(
      '{"atlasHeight":1,"atlasWidth":2,"cellPixelDim":1,"itemKey":"hatchet"}',
    );
    expect(contract).toEqual({ cid: payloadCid(primary), metadataCid: payloadCid(payloads.metadata) });
    expect(renderContractOf({ primary, metadata })).toEqual(contract);
    expect(renderMetadataCid(metadata)).toBe(contract.metadataCid);
  });
});
