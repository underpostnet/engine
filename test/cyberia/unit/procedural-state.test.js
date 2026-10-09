import { describe, it, expect } from 'vitest';
import {
  ITEM_REVIEWABLE,
  ITEM_STATUS,
  ITEM_TRANSITIONS,
} from '../../../src/api/cyberia-procedural-job-item/cyberia-procedural-job-item.model.js';
import { AUDIT_ACTIONS } from '../../../src/api/cyberia-procedural-audit/cyberia-procedural-audit.model.js';

const reach = (from) => {
  const seen = new Set([from]);
  for (const status of seen) for (const next of ITEM_TRANSITIONS[status]) seen.add(next);
  return seen;
};

describe('the workflow of a procedural item', () => {
  it('has a transition entry for every status and no transition to an unknown one', () => {
    expect(Object.keys(ITEM_TRANSITIONS).sort()).toEqual([...ITEM_STATUS].sort());
    for (const targets of Object.values(ITEM_TRANSITIONS))
      for (const target of targets) expect(ITEM_STATUS).toContain(target);
  });

  it('runs from a queued task to a promoted candidate', () => {
    expect([...reach('queued')]).toEqual(
      expect.arrayContaining(['running', 'generated', 'review', 'approved', 'promoted']),
    );
  });

  it('ends at promoted and cancelled', () => {
    expect(ITEM_TRANSITIONS.promoted).toEqual([]);
    expect(ITEM_TRANSITIONS.cancelled).toEqual([]);
  });

  it('lets only a technically validated generation reach review, and a decision lead out of it', () => {
    const entries = ITEM_STATUS.filter((status) => ITEM_TRANSITIONS[status].includes('review'));
    expect(entries.sort()).toEqual(['approved', 'editing', 'generated', 'review']);
    expect(ITEM_REVIEWABLE).toEqual(['review', 'editing']);
    for (const status of ITEM_REVIEWABLE)
      expect(ITEM_TRANSITIONS[status]).toEqual(expect.arrayContaining(['approved', 'rejected', 'queued']));
  });

  it('sends a rejected or failed item only to a new generation', () => {
    expect(ITEM_TRANSITIONS.rejected).toEqual(['queued']);
    expect(ITEM_TRANSITIONS.failed).toEqual(['queued']);
  });

  it('lets a cancel stop an item that waits, runs or awaits a decision, and not one that is decided', () => {
    for (const status of ['queued', 'running', 'generated', 'review', 'editing'])
      expect(ITEM_TRANSITIONS[status]).toContain('cancelled');
    for (const status of ['approved', 'rejected', 'failed', 'promoted'])
      expect(ITEM_TRANSITIONS[status]).not.toContain('cancelled');
  });

  it('sends an approved candidate to promotion, back to review or out of approval, never to generation', () => {
    expect(ITEM_TRANSITIONS.approved).not.toContain('queued');
    expect(ITEM_TRANSITIONS.approved).toEqual(expect.arrayContaining(['promoted', 'review', 'editing', 'rejected']));
  });

  it('records the transitions that decide an asset', () => {
    expect(AUDIT_ACTIONS).toEqual(
      expect.arrayContaining([
        'job.created',
        'job.started',
        'job.completed',
        'job.cancelled',
        'item.generated',
        'item.validation_failed',
        'item.regenerated',
        'item.opened_for_edit',
        'item.revision_created',
        'item.approved',
        'item.rejected',
        'item.promoted',
        'item.created',
      ]),
    );
  });
});
