import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

// Object-level authorization of the Object Layer API over a stubbed store: who may delete a
// copy, who may change a lifecycle, and where a lifecycle is changed.
const models = {};
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/server/domain/object-layer-resolver.js', () => ({
  resolveLedgerBindings: async () => [],
  publishObjectLayer: async () => null,
}));

const { assertOwnerOrAdmin } = await import('../../../src/server/security/auth.js');
const { ObjectLayerService } = await import('../../../src/api/object-layer/object-layer.service.js');

const owner = new Types.ObjectId();
const admin = { _id: String(new Types.ObjectId()), role: 'admin' };
const other = { _id: String(new Types.ObjectId()), role: 'moderator' };
const service = { _id: 'service:www.cyberiaonline.com', role: 'moderator', service: true };
const authority = { host: 'objectlayer.org', path: '/', consumes: {} };
const consumer = { host: 'www.cyberiaonline.com', path: '/', consumes: { 'object-layer': 'object-layer' } };

describe('owner or admin', () => {
  it('lets the owner and an admin act, as a user id or as a domain principal', () => {
    expect(() => assertOwnerOrAdmin({ _id: String(owner), role: 'user' }, owner)).not.toThrow();
    expect(() => assertOwnerOrAdmin(admin, owner)).not.toThrow();
    expect(() => assertOwnerOrAdmin(service, 'service:www.cyberiaonline.com')).not.toThrow();
  });

  it('refuses everyone else with 403, and a resource with no owner to all but an admin', () => {
    expect(() => assertOwnerOrAdmin(other, owner)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertOwnerOrAdmin(other, '')).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertOwnerOrAdmin(undefined, owner)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertOwnerOrAdmin(admin, '')).not.toThrow();
  });
});

describe('the Object Layer lifecycle', () => {
  const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
  let stored;
  const archived = [];

  beforeEach(() => {
    archived.length = 0;
    stored = { _id: new Types.ObjectId(), cid, origin: 'canonical', createdBy: String(owner), archivedAt: null };
    models.ObjectLayer = {
      findByCid: () => stored,
      findById: async () => stored,
      setArchived: async (_cid, value) => {
        archived.push(value);
        return { ...stored, archivedAt: value ? new Date() : null };
      },
    };
  });

  const lifecycle = (user, options, body = { archived: true }) =>
    ObjectLayerService.lifecycle({ params: { id: cid }, body, auth: { user } }, {}, options);

  it('is changed at the authority by the owner or an admin', async () => {
    expect((await lifecycle({ _id: String(owner), role: 'moderator' }, authority)).archivedAt).toBeInstanceOf(Date);
    expect((await lifecycle(admin, authority, { archived: false })).archivedAt).toBeNull();
    expect(archived).toEqual([true, false]);
  });

  it('is refused to another moderator, before anything is written', async () => {
    await expect(lifecycle(other, authority)).rejects.toMatchObject({ status: 403 });
    expect(archived).toEqual([]);
  });

  it('belongs to the authority: a consumer changes only its drafts', async () => {
    await expect(lifecycle(admin, consumer)).rejects.toThrow(/belongs to the Object Layer authority/);
    stored.origin = 'draft';
    expect((await lifecycle(admin, consumer)).archivedAt).toBeInstanceOf(Date);
  });

  it('takes one explicit boolean', async () => {
    await expect(lifecycle(admin, authority, {})).rejects.toThrow(/archived: boolean/);
    await expect(lifecycle(admin, authority, { archived: 'yes' })).rejects.toThrow(/archived: boolean/);
  });
});

describe('deleting a copy of a definition', () => {
  const remove = (user, stored) => {
    models.ObjectLayer = { findById: async () => stored };
    return ObjectLayerService.delete({ params: { id: String(stored._id) }, auth: { user } }, {}, consumer);
  };

  it('refuses a stranger, and refuses to destroy a published definition even to its owner', async () => {
    const draft = { _id: new Types.ObjectId(), cid: 'bafkreidraft', origin: 'draft', createdBy: String(owner) };
    await expect(remove(other, draft)).rejects.toMatchObject({ status: 403 });
    const canonical = { ...draft, origin: 'canonical' };
    await expect(remove({ _id: String(owner), role: 'moderator' }, canonical)).rejects.toThrow(/archive it instead/);
  });
});
