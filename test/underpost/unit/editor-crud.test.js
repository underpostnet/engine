import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const confirm = vi.fn();
const push = vi.fn();
vi.mock('../../../src/client/components/core/Modal.js', () => ({ Modal: { RenderConfirm: confirm } }));
vi.mock('../../../src/client/components/core/NotificationManager.js', () => ({
  NotificationManager: { Push: push },
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
}));
const template = (parts, ...values) => parts.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
vi.stubGlobal('html', template);
vi.stubGlobal('css', template);
vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      this.callback([{ target }]);
    }
  },
);
const { EditorCrud } = await import('../../../src/client/components/core/EditorCrud.js');
afterAll(() => vi.unstubAllGlobals());

const fixture = () => {
  const status = { innerHTML: '' };
  const buttons = ['new', 'save', 'clone', 'reset', 'delete'].map((action) => ({
    dataset: { crud: action },
    hidden: true,
    disabled: false,
  }));
  const root = {
    offsetHeight: 48,
    parentElement: { style: { setProperty: vi.fn() } },
    querySelector: () => status,
    querySelectorAll: () => buttons,
  };
  const button = (action) => buttons.find(({ dataset }) => dataset.crud === action);
  return { root, status, button };
};

const service = () => ({
  post: vi.fn(async ({ body }) => ({ status: 'success', data: { _id: 'new-id', ...body } })),
  put: vi.fn(async ({ id, body }) => ({ status: 'success', data: { _id: id, ...body } })),
  delete: vi.fn(async () => ({ status: 'success', data: {} })),
});

beforeEach(() => {
  confirm.mockReset();
  push.mockReset();
});

describe('editor CRUD bar', () => {
  it('keeps its height on its parent, where the tab list below it pins', () => {
    const { root } = fixture();
    EditorCrud.bind(root, () => ({ subject: 'map' }));
    expect(root.parentElement.style.setProperty).toHaveBeenCalledWith('--editor-crud-height', '48px');
  });

  it('shows only the handled actions, and holds Reset and Delete until a document is loaded', () => {
    const { root, status, button } = fixture();
    const state = { subject: 'map', new: vi.fn(), save: vi.fn(), reset: vi.fn(), delete: vi.fn() };
    const crud = EditorCrud.bind(root, () => state);
    expect(status.innerHTML).toContain('New map');
    expect(button('clone').hidden).toBe(true);
    expect([button('new'), button('save'), button('delete')].map(({ hidden }) => hidden)).toEqual([
      false,
      false,
      false,
    ]);
    expect(button('save').disabled).toBe(false);
    expect([button('reset'), button('delete')].map(({ disabled }) => disabled)).toEqual([true, true]);

    Object.assign(state, { id: 'map-id', name: '<forest>' });
    crud.refresh();
    expect(status.innerHTML).toContain('&lt;forest>');
    expect([button('reset'), button('delete')].map(({ disabled }) => disabled)).toEqual([false, false]);
  });

  it('asks before New and Reset, and runs neither without a confirmation', async () => {
    const { root, button } = fixture();
    const state = { subject: 'map', id: 'm', name: 'forest', new: vi.fn(), reset: vi.fn(), save: vi.fn() };
    EditorCrud.bind(root, () => state);
    confirm.mockResolvedValueOnce({ status: 'cancelled' });
    await button('reset').onclick();
    expect(state.reset).not.toHaveBeenCalled();
    expect(await confirm.mock.calls[0][0].html()).toContain('Reset the map &quot;forest&quot; to its saved state?');

    confirm.mockResolvedValueOnce({ status: 'confirm' });
    await button('new').onclick();
    expect(state.new).toHaveBeenCalledOnce();
    await button('save').onclick();
    expect(state.save).toHaveBeenCalledOnce();
    expect(confirm.mock.calls.map(([{ id }]) => id)).toEqual(['editor-crud-reset-confirm', 'editor-crud-new-confirm']);
  });

  it('locks every button while an action runs, and reads the handler at click time', async () => {
    const { root, button } = fixture();
    let finish;
    const first = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const second = vi.fn();
    const state = { subject: 'quest', id: 'q', save: first, new: vi.fn() };
    EditorCrud.bind(root, () => state);
    const running = button('save').onclick();
    expect(button('save').disabled).toBe(true);
    expect(button('new').disabled).toBe(true);
    state.save = second;
    finish();
    await running;
    expect(button('save').disabled).toBe(false);
    await button('save').onclick();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('renders every action hidden, so a guest never sees a mutation before bind', () => {
    const markup = EditorCrud.render({ id: 'map-engine-crud', label: 'Map & tools' });
    expect(markup).toContain('class="editor-crud map-engine-crud"');
    expect(markup).toContain('aria-label="Map &amp; tools"');
    expect(markup.match(/data-crud="[a-z]+" hidden/g)).toHaveLength(5);
    expect(markup).not.toContain('slot=');
    expect(EditorCrud.render({ id: 'ol-crud', label: 'Object layer', slot: 'actions' })).toContain('slot="actions"');
  });
});

describe('editor CRUD requests', () => {
  it('puts a loaded document and posts a new one', async () => {
    const docs = service();
    await EditorCrud.save(docs, { id: 'a', body: { code: 'a' } });
    await EditorCrud.save(docs, { id: null, body: { code: 'b' } });
    expect(docs.put).toHaveBeenCalledExactlyOnceWith({ id: 'a', body: { code: 'a' } });
    expect(docs.post).toHaveBeenCalledExactlyOnceWith({ body: { code: 'b' } });
    expect(push.mock.calls.map(([{ html }]) => html)).toEqual(['success-update-item', 'success-create-item']);
  });

  it('posts a clone under a fresh code, and keeps a body without a code key', async () => {
    const docs = service();
    const source = { code: 'forest', name: 'Forest' };
    const { body } = await EditorCrud.clone(docs, source, 'code');
    expect(body).toEqual({ code: 'forest-clone', name: 'Forest' });
    expect(source.code).toBe('forest');
    await EditorCrud.clone(docs, { entityType: 'skin' });
    expect(docs.post).toHaveBeenLastCalledWith({ body: { entityType: 'skin' } });
  });

  it('deletes only a loaded document the author confirms', async () => {
    const docs = service();
    expect(await EditorCrud.remove(docs, { id: null, subject: 'map', name: 'x' })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();

    confirm.mockResolvedValueOnce({ status: 'cancelled' });
    expect(await EditorCrud.remove(docs, { id: 'm', subject: 'map', name: 'forest' })).toBeNull();
    expect(docs.delete).not.toHaveBeenCalled();

    confirm.mockResolvedValueOnce({ status: 'confirm' });
    const result = await EditorCrud.remove(docs, { id: 'm', subject: 'map', name: 'forest' });
    expect(result.status).toBe('success');
    expect(docs.delete).toHaveBeenCalledExactlyOnceWith({ id: 'm' });
    expect(push).toHaveBeenCalledExactlyOnceWith({ html: 'item-success-delete', status: 'success' });
  });

  it('shows the error of a failed request', async () => {
    const docs = service();
    docs.post.mockResolvedValueOnce({ status: 'error', message: 'code taken' });
    await EditorCrud.save(docs, { body: { code: 'a' } });
    expect(push).toHaveBeenCalledExactlyOnceWith({ html: 'code taken', status: 'error' });
  });
});
