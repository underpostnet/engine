import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Types } from 'mongoose';
import { authMiddlewareFactory, jwtSign } from '../../../src/server/security/auth.js';
import { CyberiaProceduralAuditRouter } from '../../../src/api/cyberia-procedural-audit/cyberia-procedural-audit.router.js';
import { CyberiaProceduralJobItemRouter } from '../../../src/api/cyberia-procedural-job-item/cyberia-procedural-job-item.router.js';
import { CyberiaProceduralJobRouter } from '../../../src/api/cyberia-procedural-job/cyberia-procedural-job.router.js';
import { CyberiaProceduralProfileRouter } from '../../../src/api/cyberia-procedural-profile/cyberia-procedural-profile.router.js';
import { mount } from '../../../src/projects/cyberia/object-layer.extension.js';
import { stopProceduralWorkers } from '../../../src/projects/cyberia/procedural/jobs/worker.js';
import {
  fromWire,
  sourceFromDirectionFrames,
  toWire,
} from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { STAT_TYPES } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { mongodBinary } from '../../support/mongod.js';
import { paletteFixture } from '../../support/procedural-content.js';
import {
  cids,
  createRequest,
  definitionOf,
  host,
  models,
  rebind,
  startEngine,
  stopEngine,
  updateRequest,
} from '../../support/procedural-engine.js';

const JOBS = '/cyberia-procedural-job';
const PROFILES = '/cyberia-procedural-profile';
const filterOf = (field, filter, type = 'equals', filterType = 'text') =>
  encodeURIComponent(JSON.stringify({ [field]: { filterType, type, filter } }));
const sortOf = (colId, sort = 'asc') => encodeURIComponent(JSON.stringify([{ colId, sort }]));

describe.skipIf(!mongodBinary)('the Procedural Engine HTTP API on a real MongoDB', () => {
  const tokens = {};
  let server;
  let origin;
  let job;
  let created;

  beforeAll(async () => {
    await startEngine();
    process.env.JWT_SECRET = 'procedural-engine-test-secret';
    for (const role of ['user', 'moderator'])
      tokens[role] = jwtSign({ _id: `${new Types.ObjectId()}`, role }, host, 5, 10);
    const options = { ...host, authMiddleware: authMiddlewareFactory(host) };
    const app = express();
    app.use(express.json());
    const studio = express.Router();
    mount(studio, options);
    app.use('/api/v1/object-layer', studio);
    app.use(`/api/v1${PROFILES}`, CyberiaProceduralProfileRouter.router(options));
    app.use(`/api/v1${JOBS}`, CyberiaProceduralJobRouter.router(options));
    app.use('/api/v1/cyberia-procedural-job-item', CyberiaProceduralJobItemRouter.router(options));
    app.use('/api/v1/cyberia-procedural-audit', CyberiaProceduralAuditRouter.router(options));
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}/api/v1`;
  }, 60000);

  afterAll(async () => {
    stopProceduralWorkers();
    await new Promise((resolve) => server?.close(resolve));
    delete process.env.JWT_SECRET;
    await stopEngine();
  });

  /** A request as a guest, or with the token of a role. */
  const call = async (role, path, { method = 'GET', body } = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(role && { authorization: `Bearer ${tokens[role]}` }) },
      body: body && JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const post = (body, role = 'moderator') => call(role, JOBS, { method: 'POST', body });

  it('serves the engine to moderators only, and the profiles and the configuration to everyone', async () => {
    expect((await call(null, JOBS)).status).toBe(401);
    expect((await call('user', JOBS)).status).toBe(403);
    expect((await call('user', `${JOBS}/sources`)).status).toBe(403);
    expect((await post(createRequest(), 'user')).status).toBe(403);
    const profile = await call(null, `${PROFILES}/skin-default`);
    expect(profile.body.data).toMatchObject({ profileId: 'skin-default', itemType: 'skin' });
    expect((await call(null, PROFILES)).body.data.total).toBe(4);
  });

  it('serves the configuration a client builds a request from, with the palette catalog and no frontend copy', async () => {
    const { status, body } = await call(null, `${PROFILES}/config`);
    expect(status).toBe(200);
    expect(body.data.generators).toMatchObject([
      { id: 'skin-variant', itemType: 'skin', profile: { profileId: 'skin-default' } },
      { id: 'portal-variant', itemType: 'portal', profile: { profileId: 'portal-default' } },
      { id: 'obstacle-variant', itemType: 'obstacle', profile: { profileId: 'obstacle-default' } },
      { id: 'floor-tile', itemType: 'floor', profile: { profileId: 'floor-default' } },
    ]);
    expect(body.data.templates).toMatchObject([
      { id: 'skin.humanoid', itemType: 'skin', canvas: { width: 25, height: 25 }, problems: [] },
      { id: 'floor.terrain', itemType: 'floor', canvas: { width: 12, height: 12 }, problems: [] },
      { id: 'portal.vortex', itemType: 'portal', canvas: { width: 12, height: 12 }, problems: [] },
      { id: 'obstacle.rock-pile', itemType: 'obstacle', canvas: { width: 12, height: 12 }, problems: [] },
    ]);
    expect(body.data.templates[0].preview).toMatchObject({ width: 25, height: 25 });
    const { families, palettes } = body.data.palettes;
    expect(families).toEqual(['natural', 'dark', 'light', 'warm', 'cool', 'biome', 'exotic']);
    expect(palettes.find(({ id }) => id === 'exotic-teal')).toEqual(paletteFixture('exotic-teal'));
    expect(body.data.templates[0].roles.torso).toMatchObject({ palette: 'primary', artDirection: true });
    expect(body.data.templates[0]).not.toHaveProperty('palettes');
  });

  it('draws random colors for the color slots of a Genesis Template, one scheme each time', async () => {
    const [template] = (await call(null, `${PROFILES}/config`)).body.data.templates;
    const first = await call(null, `${PROFILES}/templates/skin.humanoid/random-slots`);
    expect(first.status).toBe(200);
    expect(Object.keys(first.body.data.slots)).toEqual(template.slots.map(({ id }) => id));
    expect(Object.values(first.body.data.slots).every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    const second = await call(null, `${PROFILES}/templates/skin.humanoid/random-slots`);
    expect(second.body.data.slots).not.toEqual(first.body.data.slots);
    expect((await call(null, `${PROFILES}/templates/skin.winged/random-slots`)).status).toBe(400);
  });

  describe('the items an update can target', () => {
    it('lists the existing items with their render and cid, a page at a time', async () => {
      const { body } = await call('moderator', `${JOBS}/sources?page=1&limit=3&sortModel=${sortOf('itemId')}`);
      expect(body.data).toMatchObject({ total: 6, page: 1, totalPages: 2 });
      expect(body.data.data.map(({ itemId }) => itemId)).toEqual(['aether-agent', 'ash-raider', 'bare-skin']);
      expect(body.data.data[0]).toMatchObject({
        itemId: 'aether-agent',
        itemType: 'skin',
        hasRender: true,
        currentCid: cids['aether-agent'],
        updatedAt: expect.any(String),
        artDirection: expect.any(String),
        biome: expect.any(Array),
        palette: expect.any(Array),
      });
      expect(body.data.data[2]).toMatchObject({ itemId: 'bare-skin', hasRender: false });
    });

    it('filters and sorts on the server', async () => {
      const skins = await call('moderator', `${JOBS}/sources?limit=20&filterModel=${filterOf('itemType', 'skin')}`);
      expect(skins.body.data.data.every(({ itemType }) => itemType === 'skin')).toBe(true);
      expect(skins.body.data.total).toBe(5);
      const rendered = await call(
        'moderator',
        `${JOBS}/sources?limit=20&filterModel=${encodeURIComponent(JSON.stringify({ hasRender: { filterType: 'text', type: 'equals', filter: true } }))}`,
      );
      expect(rendered.body.data.data.every(({ hasRender }) => hasRender)).toBe(true);
      const named = await call('moderator', `${JOBS}/sources?filterModel=${filterOf('itemId', 'skin', 'contains')}`);
      expect(named.body.data.data.map(({ itemId }) => itemId).sort()).toEqual([
        'bare-skin',
        'base-skin',
        'violet-skin',
      ]);
      const descending = await call('moderator', `${JOBS}/sources?limit=2&sortModel=${sortOf('itemId', 'desc')}`);
      expect(descending.body.data.data.map(({ itemId }) => itemId)).toEqual(['violet-skin', 'iron-sword']);
    });

    it('lists the base colors of the foundation palettes of each item', async () => {
      const { body } = await call('moderator', `${JOBS}/sources?filterModel=${filterOf('itemId', 'violet-skin')}`);
      expect(body.data.data[0]).toMatchObject({ itemId: 'violet-skin', biome: ['Violet Strata'] });
      expect(body.data.data[0].palette).toEqual(['#2f5a34', '#6a3fa0', '#4f4a6b']);
    });

    it('answers the palette an update starts from for one item: its template and each slot with its origin', async () => {
      const { status, body } = await call('moderator', `${JOBS}/sources/violet-skin/palette`);
      expect(status).toBe(200);
      expect(body.data).toMatchObject({
        templateId: 'skin.humanoid',
        palettes: [{ id: 'biome.violet-strata', name: 'Violet Strata', group: 'biome' }],
      });
      expect(body.data.slots).toMatchObject({
        'torso.base': { color: '#2f5a34', origin: 'foundation' },
        'legs.highlight': { color: '#9b6fe0', origin: 'foundation' },
        outline: { color: '#120d1c', origin: 'foundation' },
        'hair.base': { origin: 'render' },
      });
      const plain = (await call('moderator', `${JOBS}/sources/bare-skin/palette`)).body.data.slots;
      expect(Object.values(plain).every(({ origin }) => origin === 'template')).toBe(true);
      const teal = (await call('moderator', `${JOBS}/sources/violet-skin/palette?paletteId=exotic-teal`)).body.data;
      expect(teal.slots['torso.base']).toEqual({
        color: paletteFixture('exotic-teal').roles.primary,
        origin: 'palette',
      });
      expect((await call('user', `${JOBS}/sources/violet-skin/palette`)).status).toBe(403);
      expect((await call('moderator', `${JOBS}/sources/nobody/palette`)).status).toBe(404);
      expect((await call('moderator', `${JOBS}/sources/violet-skin/palette?paletteId=random`)).status).toBe(400);
    });

    it('answers the palette a create starts from with a Genesis Template, under a palette', async () => {
      const plain = await call(null, `${PROFILES}/templates/skin.humanoid/palette`);
      expect(plain.status).toBe(200);
      expect(plain.body.data).toMatchObject({ templateId: 'skin.humanoid', palettes: [] });
      expect(Object.values(plain.body.data.slots).every(({ origin }) => origin === 'template')).toBe(true);
      const teal = await call(null, `${PROFILES}/templates/skin.humanoid/palette?paletteId=exotic-teal`);
      expect(teal.body.data.slots.outline).toEqual({
        color: paletteFixture('exotic-teal').roles.outline,
        origin: 'palette',
      });
      const rift = await call(null, `${PROFILES}/templates/obstacle.rock-pile/palette?paletteId=natural-deep`);
      expect(rift.body.data.slots['chunk.base']).toEqual({
        color: paletteFixture('natural-deep').roles.primary,
        origin: 'palette',
      });
      expect((await call(null, `${PROFILES}/templates/skin.winged/palette`)).status).toBe(400);
      expect((await call(null, `${PROFILES}/templates/skin.humanoid/palette?paletteId=skin.exotic-teal`)).status).toBe(
        400,
      );
    });
  });

  describe('a generation request', () => {
    it('creates an update job and answers at once, with the same job for the same spec', async () => {
      const body = updateRequest({
        source: { itemIds: ['base-skin', 'violet-skin'] },
        seed: { mode: 'fixed', value: 7 },
      });
      const first = await post(body);
      expect(first).toMatchObject({
        status: 200,
        body: { status: 'success', data: { status: 'queued', counts: { queued: 4 } } },
      });
      job = first.body.data;
      expect(job.spec).toMatchObject({ mode: 'update-existing', seed: { mode: 'fixed', value: 7 } });
      expect((await post(body)).body.data._id).toBe(job._id);
      expect((await call('moderator', `${JOBS}/${job._id}`)).body.data).toMatchObject({ _id: job._id });
    });

    it('creates a create job, with no source and the proposed item ids', async () => {
      const response = await post(createRequest({ output: { variants: 2, itemIdPrefix: 'http-skin' } }));
      expect(response.status).toBe(200);
      created = response.body.data;
      expect(created.spec).toMatchObject({
        mode: 'create-new',
        sources: [],
        palette: { paletteId: 'random', slots: {} },
      });
      expect(created.spec.candidates.map(({ targetItemId }) => targetItemId)).toEqual([
        'http-skin-001',
        'http-skin-002',
      ]);
    });

    it('rejects a mode and a source that do not belong together, and a request the mode does not take', async () => {
      const refused = async (body) => (await post(body)).body.message;
      expect(await refused(createRequest({ source: { itemIds: ['base-skin'] } }))).toMatch(/does not take source/);
      const { source, ...withoutSource } = updateRequest();
      expect(await refused(withoutSource)).toMatch(/needs source.itemIds/);
      expect(await refused(updateRequest({ itemType: 'skin' }))).toMatch(/does not take itemType/);
      expect(await refused(updateRequest({ mode: 'mutate' }))).toMatch(/mode must be/);
      expect(await refused(updateRequest({ palette: { paletteId: 'random' } }))).toMatch(
        /palette does not take paletteId/,
      );
      expect((await post(updateRequest({ source: { itemIds: ['nobody'] } }))).status).toBe(404);
      expect((await post(createRequest({ seed: { mode: 'fixed', value: -4 } }))).status).toBe(400);
    });

    it('lists the jobs with a filter and a sort on the server', async () => {
      const all = await call('moderator', `${JOBS}?limit=20`);
      expect(all.body.data.data.map(({ _id }) => _id)).toEqual(expect.arrayContaining([job._id, created._id]));
      const updates = await call('moderator', `${JOBS}?filterModel=${filterOf('spec.mode', 'update-existing')}`);
      expect(updates.body.data.data.every(({ spec }) => spec.mode === 'update-existing')).toBe(true);
      expect(updates.body.data.data.map(({ _id }) => _id)).toContain(job._id);
      expect(updates.body.data.data.map(({ _id }) => _id)).not.toContain(created._id);
      const byMode = await call('moderator', `${JOBS}?sortModel=${sortOf('spec.mode')}`);
      expect(byMode.body.data.data[0].spec.mode).toBe('create-new');
    });
  });

  describe('the candidates of a run', () => {
    it('generates in the background and shows the persisted progress', async () => {
      let counts;
      for (let attempt = 0; attempt < 120 && counts?.review !== 4; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        counts = (await call('moderator', `${JOBS}/${job._id}`)).body.data.counts;
      }
      expect(counts).toMatchObject({ review: 4, queued: 0, running: 0 });
    });

    it('lists the candidates a page at a time, filtered and sorted on the server', async () => {
      const page = await call('moderator', `${JOBS}/${job._id}/items?page=1&limit=3`);
      expect(page.body.data).toMatchObject({ total: 4, page: 1 });
      expect(page.body.data.data.map(({ targetItemId }) => targetItemId)).toEqual([
        'base-skin',
        'base-skin',
        'violet-skin',
      ]);
      const reviewed = await call('moderator', `${JOBS}/${job._id}/items?filterModel=${filterOf('status', 'review')}`);
      expect(reviewed.body.data.total).toBe(4);
      const approved = await call(
        'moderator',
        `${JOBS}/${job._id}/items?filterModel=${filterOf('status', 'approved')}`,
      );
      expect(approved.body.data.total).toBe(0);
      const byTarget = await call('moderator', `${JOBS}/${job._id}/items?sortModel=${sortOf('targetItemId', 'desc')}`);
      expect(byTarget.body.data.data[0].targetItemId).toBe('violet-skin');
      const valid = await call(
        'moderator',
        `${JOBS}/${job._id}/items?filterModel=${filterOf('validation.ok', true, 'equals', 'text')}`,
      );
      expect(valid.body.data.total).toBe(4);
    });

    it('takes the decisions of a moderator and refuses a stale or unnamed approval', async () => {
      const [first, second] = (await call('moderator', `${JOBS}/${job._id}/items`)).body.data.data;
      const decide = (item, action, body) =>
        call('moderator', `${JOBS}/${job._id}/items/${item._id}/${action}`, { method: 'POST', body });
      expect((await decide(first, 'approve', {})).status).toBe(400);
      expect((await decide(first, 'approve', { cid: second.candidateCid })).status).toBe(409);
      const context = await decide(first, 'edit');
      expect(context.body.data).toMatchObject({
        jobItemId: first._id,
        targetItemId: 'base-skin',
        candidateRevision: 0,
        candidateCid: first.candidateCid,
      });
      expect((await decide(first, 'approve', { cid: first.candidateCid, reason: 'good' })).body.data).toMatchObject({
        status: 'approved',
        review: { decision: 'approved', cid: first.candidateCid },
      });
      expect((await decide(second, 'approve', { cid: second.candidateCid })).status).toBe(409);
      expect((await decide(second, 'reject', { reason: 'flat' })).body.data.status).toBe('rejected');
      expect((await decide(second, 'regenerate')).body.data).toMatchObject({ status: 'queued', attempt: 0 });
    });

    it('promotes an approved candidate to its target item, and answers 409 for a changed item', async () => {
      const [first, , third] = (await call('moderator', `${JOBS}/${job._id}/items`)).body.data.data;
      const promote = (item) => call('moderator', `${JOBS}/${job._id}/items/${item._id}/promote`, { method: 'POST' });
      expect((await promote(third)).status).toBe(409);
      await rebind('base-skin', cids['bare-skin']);
      const conflict = await promote(first);
      expect(conflict.status).toBe(409);
      expect(conflict.body.message).toBe(`'base-skin' runs ${cids['bare-skin']}, not ${cids['base-skin']}`);
      await rebind('base-skin', cids['base-skin']);
      const promoted = await promote(first);
      expect(promoted.body.data).toMatchObject({
        status: 'promoted',
        promotion: { cid: first.candidateCid, previousCid: cids['base-skin'] },
      });
      expect((await models().CyberiaItemCatalog.findOne({ itemId: 'base-skin' }).lean()).objectLayerCid).toBe(
        first.candidateCid,
      );
    });

    it('promotes the approved candidates of a job and cancels what is left', async () => {
      const items = (await call('moderator', `${JOBS}/${created._id}/items`)).body.data.data;
      let counts;
      for (let attempt = 0; attempt < 120 && counts?.review !== 2; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        counts = (await call('moderator', `${JOBS}/${created._id}`)).body.data.counts;
      }
      const [one] = (await call('moderator', `${JOBS}/${created._id}/items`)).body.data.data;
      await call('moderator', `${JOBS}/${created._id}/items/${one._id}/approve`, {
        method: 'POST',
        body: { cid: one.candidateCid },
      });
      expect((await call('moderator', `${JOBS}/${created._id}/promote`, { method: 'POST' })).body.data).toEqual({
        promoted: ['http-skin-001'],
        failed: [],
      });
      expect(items).toHaveLength(2);
      const cancelled = await call('moderator', `${JOBS}/${created._id}/cancel`, { method: 'POST' });
      expect(cancelled.body.data).toMatchObject({ status: 'cancelled' });
    });

    it('deletes a run for a moderator: one with a promoted candidate, and one that still works after it stops', async () => {
      expect((await call('user', `${JOBS}/${created._id}`, { method: 'DELETE' })).status).toBe(403);
      const deleted = await call('moderator', `${JOBS}/${created._id}`, { method: 'DELETE' });
      expect(deleted.body.data).toMatchObject({ stopped: 0, candidates: 2, drafts: [expect.any(String)] });
      const live = (await post(createRequest({ output: { variants: 1, itemIdPrefix: 'http-live' } }))).body.data;
      const stopped = await call('moderator', `${JOBS}/${live._id}`, { method: 'DELETE' });
      expect(stopped.body.data).toMatchObject({ stopped: 1, candidates: 1 });
      expect((await call('moderator', `${JOBS}/${live._id}`)).status).toBe(404);
      expect((await call('moderator', `${JOBS}/${created._id}`)).status).toBe(404);
      expect((await call('moderator', `${JOBS}/${created._id}`, { method: 'DELETE' })).status).toBe(404);
    });

    it('reads the provenance of a candidate, its record and its audit trail', async () => {
      const [first] = (await call('moderator', `${JOBS}/${job._id}/items`)).body.data.data;
      const provenance = (await call('moderator', `${JOBS}/${job._id}/items/${first._id}`)).body.data;
      expect(provenance.job).toMatchObject({ generationRunId: job.generationRunId, rootSeed: 7 });
      expect(provenance.audit.map(({ action }) => action)).toEqual([
        'item.generated',
        'item.opened_for_edit',
        'item.approved',
        'item.promoted',
      ]);
      expect((await call('moderator', `/cyberia-procedural-job-item/${first._id}`)).body.data).toMatchObject({
        targetItemId: 'base-skin',
        status: 'promoted',
      });
      const byTarget = await call('moderator', `/cyberia-procedural-job-item?targetItemId=base-skin`);
      expect(byTarget.body.data.total).toBeGreaterThanOrEqual(2);
      const audit = await call('moderator', `/cyberia-procedural-audit?jobItemId=${first._id}`);
      expect(audit.body.data.total).toBe(4);
      expect((await call('moderator', '/cyberia-procedural-job-item/64b0000000000000000000ff')).status).toBe(404);
      expect((await call('user', `/cyberia-procedural-audit`)).status).toBe(403);
    });
  });

  it('serves the palette of a frame import: the foundation palettes of the item, else a palette of the library', async () => {
    const read = (query) => call(null, `${PROFILES}/import-palette?${new URLSearchParams(query)}`);
    const foundation = await read({ itemId: 'aether-agent' });
    expect(foundation.status).toBe(200);
    expect(foundation.body.data.palettes.length).toBeGreaterThan(0);
    expect(Object.values(foundation.body.data.slots).every(({ origin }) => origin === 'foundation')).toBe(true);
    const teal = paletteFixture('exotic-teal');
    const chosen = await read({ itemId: 'aether-agent', paletteId: 'exotic-teal' });
    expect(chosen.body.data.slots.primary).toEqual({ color: teal.roles.primary, origin: 'palette' });
    expect((await read({ itemId: 'no-such-item' })).body.data).toMatchObject({ templateId: '', palettes: [] });
    expect((await read({ paletteId: 'no-such-theme' })).status).toBe(400);
  });

  it('serves the frames of an item in the palette of the import, with a seeded mutation, for the Studio editor', async () => {
    const id = cids['violet-skin'];
    const send = (body, role = 'moderator') => call(role, '/object-layer/import-frames', { method: 'POST', body });
    const frames = (response) => toWire(fromWire(response.body.data.renderFrames));
    const colorsOf = (response) =>
      fromWire(response.body.data.renderFrames)
        .palette.filter((color) => !color.endsWith('00'))
        .map((color) => color.slice(0, 7));
    const teal = { paletteId: 'exotic-teal' };
    const stored = await models().ObjectLayerRenderFrames.findOne({ objectLayerCid: id }).lean();
    const plain = await send({ id, palette: teal, seed: 1 });
    expect(plain.status).toBe(200);
    expect(plain.body.data).toMatchObject({ frames: 12, accepted: 0, frameDurationMs: 250 });
    // Without Mutate the frames come as stored, so the palette of the body changes nothing.
    expect(frames(await send({ id, palette: { slots: { primary: '#204060' } }, seed: 1 }))).toEqual(frames(plain));
    const remapped = await send({ id, palette: teal, mutate: true, mutationFactor: 0, seed: 1 });
    expect(
      colorsOf(remapped).every((color) => Object.values(paletteFixture('exotic-teal').roles).includes(color)),
    ).toBe(true);
    expect(frames(remapped)).not.toEqual(frames(plain));
    const set = { ...teal, slots: { primary: '#123456', secondary: '#654321' } };
    const overridden = await send({ id, palette: set, mutate: true, seed: 1 });
    const effective = { ...paletteFixture('exotic-teal').roles, ...set.slots };
    expect(colorsOf(overridden).every((color) => Object.values(effective).includes(color))).toBe(true);
    expect(frames(overridden)).not.toEqual(frames(remapped));
    const foundation = (await call(null, `${PROFILES}/import-palette?itemId=aether-agent`)).body.data.slots;
    const own = await send({ id, palette: {}, mutate: true, seed: 1, target: 'aether-agent' });
    expect(colorsOf(own).every((color) => Object.values(foundation).some((slot) => slot.color === color))).toBe(true);
    const mutated = await send({ id, palette: teal, mutate: true, mutationFactor: 1, seed: 3 });
    expect(mutated.body.data.accepted).toBeGreaterThan(0);
    expect(frames(await send({ id, palette: teal, mutate: true, mutationFactor: 1, seed: 3 }))).toEqual(
      frames(mutated),
    );
    expect(frames(await send({ id, palette: teal, mutate: true, mutationFactor: 1, seed: 4 }))).not.toEqual(
      frames(mutated),
    );
    expect(await models().ObjectLayerRenderFrames.findOne({ objectLayerCid: id }).lean()).toEqual(stored);
    const refusal = async (palette) => {
      const { status, body } = await send({ id, palette, mutate: true });
      return [status, body.message];
    };
    expect(await refusal({ paletteId: 'no-such-theme' })).toEqual([400, 'There is no palette no-such-theme']);
    expect(await refusal({ slots: { hair: '#123456' } })).toEqual([
      400,
      'hair is not an import slot: primary, secondary, detail, feature, outline, accent',
    ]);
    expect(await refusal({ slots: { primary: 'red' } })).toEqual([400, 'primary is not a #rrggbb color']);
    expect(
      (await send({ id: 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab', palette: teal })).status,
    ).toBe(404);
    expect((await send({ id: cids['bare-skin'], palette: teal })).status).toBe(404);
    expect((await send({ id, palette: teal }, 'user')).status).toBe(403);
  });

  it('checks the stats of a save against the bounds it declares: the item type, else custom bounds inside the contract', async () => {
    const frames = toWire(
      sourceFromDirectionFrames({ framesByCode: { '08': [[[[200, 40, 40, 255]]]] }, frameDurationMs: 100 }),
    );
    const save = (data, statBounds) =>
      call('moderator', '/object-layer', {
        method: 'POST',
        body: { data, objectLayerRenderFramesData: frames, ...(statBounds && { statBounds }) },
      });
    const base = definitionOf('bold-skin', 'skin');
    const strong = { ...base, stats: { ...base.stats, effect: 30 } };
    const open = Object.fromEntries(STAT_TYPES.map((key) => [key, [-100, 100]]));
    expect(await save(strong)).toMatchObject({
      status: 400,
      body: { message: 'Stats outside the skin bounds: effect 30 is outside 1 to 1' },
    });
    expect((await save(strong, { ...open, effect: [20, 40] })).status).toBe(200);
    expect(await save(strong, { ...open, effect: [40, 20] })).toMatchObject({
      status: 400,
      body: { message: 'Custom stat bounds: effect: the minimum 40 is above the maximum 20.' },
    });
    expect(await save(strong, { ...open, effect: [0, 10] })).toMatchObject({
      status: 400,
      body: { message: 'Stats outside the custom bounds: effect 30 is outside 0 to 10' },
    });
    expect(await save(strong, { ...open, utility: [0, 200] })).toMatchObject({
      status: 400,
      body: { message: 'Custom stat bounds: utility: 200 is outside -100 to 100.' },
    });
  });
});
