import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_LIMIT,
  contextOf,
  droppedRevisions,
  findingPaths,
  jsonDiff,
} from '../../../src/projects/cyberia/saga/saga-workflow.js';

// The pure rules of a saga workflow: which candidates it keeps, the narrative context it accepts,
// the differences between two packages and the JSON path of each finding.
const candidates = (count, kindOf = () => 'edited') =>
  Array.from({ length: count }, (_, index) => ({ revision: index + 1, kind: kindOf(index + 1) }));

describe('saga workflow rules', () => {
  it('drops the oldest candidates past the limit, never the applied, the newest generated or the newest one', () => {
    expect(droppedRevisions(candidates(CANDIDATE_LIMIT), null)).toEqual([]);
    const many = candidates(CANDIDATE_LIMIT + 3, (revision) => (revision === 2 ? 'generated' : 'edited'));
    expect(droppedRevisions(many, { revision: 1 })).toEqual([3, 4, 5]);
  });

  it('takes the known context fields, each of its type, and refuses the rest', () => {
    expect(
      contextOf({
        prompt: '  A relay keeper ',
        temperature: 1.1,
        saga: { code: 'ash-relay', name: 7 },
        reuse: ['weapon.hatchet', ' weapon.hatchet ', ''],
      }),
    ).toEqual({
      prompt: 'A relay keeper',
      temperature: 1.1,
      saga: { code: 'ash-relay', name: '', description: '' },
      reuse: ['weapon.hatchet'],
    });
    expect(() => contextOf({ cells: [] })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => contextOf({ prompt: 3 })).toThrow('prompt must be text');
    expect(() => contextOf({ sagas: 'frontier' })).toThrow('sagas must be a list of codes');
  });

  it('pairs definitions by id and other lists by index', () => {
    const before = { definitions: [{ id: 'a.one', steps: [1, 2] }, { id: 'a.two' }] };
    const after = { definitions: [{ id: 'a.three' }, { id: 'a.one', steps: [1, 3, 4] }] };
    expect(jsonDiff(before, after)).toEqual([
      { path: ['definitions', 'a.two'], op: 'remove', before: { id: 'a.two' } },
      { path: ['definitions', 'a.three'], op: 'add', after: { id: 'a.three' } },
      { path: ['definitions', 'a.one', 'steps', 1], op: 'change', before: 2, after: 3 },
      { path: ['definitions', 'a.one', 'steps', 2], op: 'add', after: 4 },
    ]);
    expect(jsonDiff(before, structuredClone(before))).toEqual([]);
  });

  it('points each finding at the definition and the field its message names', () => {
    const pkg = { saga: { code: 'x' }, references: [], definitions: [{ id: 'quest.a', steps: [{}] }] };
    expect(
      findingPaths(pkg, [
        { id: 'quest.a', message: 'steps[0].objectives must not be empty' },
        { id: 'quest.a', message: 'a quest cannot require or unlock itself' },
        { id: 'package', message: 'saga.code must be a lowercase kebab-case slug' },
        { id: 'quest.gone', message: 'id is already used by quest.gone' },
      ]).map(({ path }) => path),
    ).toEqual([['definitions', 0, 'steps', 0, 'objectives'], ['definitions', 0], ['saga', 'code'], []]);
  });
});
