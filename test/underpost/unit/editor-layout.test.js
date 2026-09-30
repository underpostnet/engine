import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/client/components/core/Css.js', () => ({ ThemeEvents: {} }));
const template = (parts, ...values) => parts.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
vi.stubGlobal('html', template);
vi.stubGlobal('css', template);
const observers = [];
vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      observers.push(this);
    }
    observe(target) {
      this.targets.push(target);
    }
  },
);
const { EditorLayout } = await import('../../../src/client/components/core/EditorLayout.js');
afterAll(() => vi.unstubAllGlobals());

const fixture = (toolsLeft) => {
  const stage = { offsetLeft: 0, offsetWidth: 600, offsetHeight: 420 };
  const tools = { offsetLeft: toolsLeft };
  const layout = {
    style: { setProperty: vi.fn() },
    querySelector: (selector) => (selector.includes('stage') ? stage : tools),
  };
  const root = { querySelectorAll: (selector) => (selector === '.editor-layout' ? [layout] : []) };
  EditorLayout.bind(root);
  const observer = observers.at(-1);
  observer.callback();
  return { layout, stage, observer };
};

describe('editor layout tools offset', () => {
  it('pins the tools under the modal bar while they sit beside the stage', () => {
    const { layout, stage, observer } = fixture(608);
    expect(layout.style.setProperty).toHaveBeenCalledWith('--editor-tools-top', 'var(--editor-stage-top, 0px)');
    expect(observer.targets).toEqual([layout, stage]);
  });

  it('pins the tools under the stage while they sit under it', () => {
    const { layout } = fixture(0);
    expect(layout.style.setProperty).toHaveBeenCalledWith(
      '--editor-tools-top',
      'calc(var(--editor-stage-top, 0px) + 420px)',
    );
  });
});
