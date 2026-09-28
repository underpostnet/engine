import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../../../src/client/components/core/CommandHistory.js';

describe('command history', () => {
  it('undoes and redoes named commands in order, and a new command drops what was undone', () => {
    const changes = [];
    const history = new CommandHistory({ onChange: () => changes.push(history.done.length) });
    history.record('DrawStroke', 'a', 'b');
    history.record('FillRegion', 'b', 'c');
    expect([history.canUndo, history.canRedo]).toEqual([true, false]);

    expect(history.undo()).toEqual({ name: 'FillRegion', before: 'b', after: 'c' });
    expect(history.undo()).toEqual({ name: 'DrawStroke', before: 'a', after: 'b' });
    expect(history.undo()).toBe(null);
    expect(history.redo().name).toBe('DrawStroke');

    history.record('PlaceEntity', 'b', 'd');
    expect(history.canRedo).toBe(false);
    expect(history.done.map(({ name }) => name)).toEqual(['DrawStroke', 'PlaceEntity']);
    expect(changes.length).toBeGreaterThan(0);
  });

  it('keeps at most its limit of commands', () => {
    const history = new CommandHistory({ limit: 2 });
    for (const name of ['a', 'b', 'c']) history.record(name, 0, 1);
    expect(history.done.map(({ name }) => name)).toEqual(['b', 'c']);
    history.clear();
    expect([history.canUndo, history.canRedo]).toEqual([false, false]);
  });
});
