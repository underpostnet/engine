import { describe, it, expect } from 'vitest';
import {
  OBJECT_LAYER_ORIGINS,
  OBJECT_LAYER_STATUSES,
  objectLayerStatus,
} from '../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { ObjectLayerSchema } from '../../../src/api/object-layer/object-layer.model.js';

const statusQuery = (statuses) => ObjectLayerSchema.statics.statusQuery(statuses);

describe('the status of a stored Object Layer', () => {
  it('is its origin while it is offered, and archived once it is archived', () => {
    expect(OBJECT_LAYER_STATUSES).toEqual([...OBJECT_LAYER_ORIGINS, 'archived']);
    expect(objectLayerStatus({ origin: 'canonical', archivedAt: null })).toBe('canonical');
    expect(objectLayerStatus({ origin: 'draft' })).toBe('draft');
    expect(objectLayerStatus({ origin: 'canonical', archivedAt: new Date() })).toBe('archived');
  });

  it('filters on the origin of the offered copies and on the archive', () => {
    expect(statusQuery(['canonical', 'draft'])).toEqual({
      $or: [{ archivedAt: null, origin: { $in: ['canonical', 'draft'] } }],
    });
    expect(statusQuery(['archived'])).toEqual({ $or: [{ archivedAt: { $ne: null } }] });
    expect(statusQuery(['cache', 'archived'])).toEqual({
      $or: [{ archivedAt: null, origin: { $in: ['cache'] } }, { archivedAt: { $ne: null } }],
    });
  });

  it('matches nothing for a filter that names no known status', () => {
    expect(statusQuery(['retired'])).toEqual({ _id: null });
    expect(statusQuery([])).toEqual({ _id: null });
  });
});
