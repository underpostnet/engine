import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
}));
const template = (parts, ...values) => parts.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
vi.stubGlobal('html', template);
vi.stubGlobal('css', template);
const { Tabs } = await import('../../../src/client/components/core/Tabs.js');
afterAll(() => vi.unstubAllGlobals());

const fixture = () => {
  const buttons = ['map', 'paint', 'library'].map((id, index) => ({
    dataset: { tab: id },
    attributes: { 'aria-selected': String(index === 0) },
    tabIndex: index === 0 ? 0 : -1,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus: vi.fn(),
  }));
  const panels = buttons.map((button, index) => ({
    dataset: { panel: button.dataset.tab },
    hidden: index !== 0,
    input: { value: 'Unsaved work' },
  }));
  const root = {
    dataset: { activeTab: 'map' },
    querySelectorAll: (selector) => (selector === ':scope > [role="tabpanel"]' ? panels : buttons),
  };
  return { root, buttons, panels };
};

const keyEvent = (key) => ({ key, preventDefault: vi.fn(), stopPropagation: vi.fn() });

describe('shared editor tabs', () => {
  it('selects a panel without replacing its form state or changing another tab group', () => {
    const { root, buttons, panels } = fixture();
    const other = fixture();
    const input = panels[0].input;
    expect(Tabs.select(root, 'paint')).toBe(true);
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true]);
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
    expect(buttons.map((button) => button.attributes['aria-selected'])).toEqual(['false', 'true', 'false']);
    Tabs.select(root, 'map');
    expect(panels[0].input).toBe(input);
    expect(input.value).toBe('Unsaved work');
    expect(other.root.dataset.activeTab).toBe('map');
  });

  it('ignores unknown tabs and missing roots', () => {
    const { root, panels } = fixture();
    expect(Tabs.select(root, 'missing')).toBe(false);
    expect(root.dataset.activeTab).toBe('map');
    expect(panels[0].hidden).toBe(false);
    expect(Tabs.select(null, 'map')).toBe(false);
    expect(() => Tabs.bind(null)).not.toThrow();
  });

  it('notifies once per user selection and replaces old bindings', () => {
    const { root, buttons } = fixture();
    const old = vi.fn();
    const onChange = vi.fn();
    Tabs.bind(root, { onChange: old });
    Tabs.bind(root, { onChange });
    buttons[1].onclick();
    buttons[1].onclick();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('paint');
    expect(old).not.toHaveBeenCalled();
    Tabs.select(root, 'library');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves focus and selection with arrow keys, Home, and End', () => {
    const { root, buttons } = fixture();
    Tabs.bind(root);
    for (const [index, key, expected] of [
      [0, 'ArrowLeft', 2],
      [2, 'ArrowRight', 0],
      [0, 'End', 2],
      [2, 'Home', 0],
    ]) {
      const event = keyEvent(key);
      buttons[index].onkeydown(event);
      expect(buttons[expected].focus).toHaveBeenCalled();
      expect(root.dataset.activeTab).toBe(buttons[expected].dataset.tab);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
    }
    const event = keyEvent('Tab');
    buttons[0].onkeydown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('renders linked tab and panel labels with a valid initial selection', () => {
    const markup = Tabs.render({
      id: 'tools',
      label: 'Map tools',
      selected: 'missing',
      tabs: [
        { id: 'map', label: 'Map & metadata', content: '<input value="draft">' },
        { id: 'paint', label: 'Paint', content: 'Brush' },
      ],
    });
    expect(markup).toContain('data-active-tab="map"');
    expect(markup).toContain('aria-controls="tools-panel-map"');
    expect(markup).toContain('aria-labelledby="tools-tab-map"');
    expect(markup).toContain('Map &amp; metadata');
    expect(markup).toContain('<input value="draft">');
  });

  it('renders a Font Awesome icon or an icon image before a tab label', () => {
    const markup = Tabs.render({
      id: 'tools',
      label: 'Item tools',
      tabs: [
        { id: 'paint', label: 'Paint', icon: 'fa-solid fa-paintbrush', content: '' },
        { id: 'context', label: 'Context', image: '/assets/ui-icons/lore.png?a="b"', content: '' },
      ],
    });
    expect(markup).toContain('<i class="fa-solid fa-paintbrush" aria-hidden="true"></i>Paint');
    expect(markup).toContain('<img src="/assets/ui-icons/lore.png?a=&quot;b&quot;" alt="" />Context');
  });
});
