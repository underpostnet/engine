import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/client/components/core/Badge.js', () => ({ Badge: {} }));
vi.mock('../../../src/client/components/core/Css.js', () => ({ darkTheme: true, ThemeEvents: {} }));
vi.mock('../../../src/client/components/core/Input.js', () => ({ Input: {} }));
vi.mock('../../../src/client/components/core/ToggleSwitch.js', () => ({ ToggleSwitch: { Tokens: {} } }));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({ append: vi.fn(), s: vi.fn(), htmls: vi.fn() }));

const { floatingPlacement } = await import('../../../src/client/components/core/DropDown.js');

const viewport = { top: 0, left: 0, width: 400, height: 800 };
const anchor = (top, left = 20, width = 280, height = 44) => ({ top, bottom: top + height, left, width });

describe('dropdown floating placement', () => {
  it('opens below the trigger, with the space below as its scroll limit', () => {
    expect(floatingPlacement({ anchor: anchor(100), contentHeight: 300, viewport })).toEqual({
      top: 148,
      left: 20,
      width: 280,
      maxHeight: 800 - 144 - 4 - 8,
      side: 'bottom',
    });
  });

  it('opens above the trigger when the space below is short and the space above is larger', () => {
    const placement = floatingPlacement({ anchor: anchor(700), contentHeight: 400, viewport });
    expect(placement.side).toBe('top');
    expect(placement.maxHeight).toBe(700 - 4 - 8);
    expect(placement.top).toBe(700 - 4 - 400);
  });

  it('keeps a long list inside the viewport and scrolls it', () => {
    const placement = floatingPlacement({ anchor: anchor(700), contentHeight: 5000, viewport });
    expect(placement.top).toBeGreaterThanOrEqual(8);
    expect(placement.top + Math.min(5000, placement.maxHeight)).toBeLessThanOrEqual(700);
  });

  it('stays below a short list that fits under the trigger', () => {
    expect(floatingPlacement({ anchor: anchor(640), contentHeight: 90, viewport }).side).toBe('bottom');
  });

  it('clamps width and left edge to the viewport', () => {
    const narrow = { ...viewport, width: 240 };
    expect(floatingPlacement({ anchor: anchor(100, 120, 280), contentHeight: 100, viewport: narrow })).toMatchObject({
      left: 8,
      width: 224,
    });
    expect(floatingPlacement({ anchor: anchor(100, -50, 200), contentHeight: 100, viewport }).left).toBe(8);
  });

  it('follows the visible viewport when it is offset, as with a zoom or an on-screen keyboard', () => {
    const visual = { top: 300, left: 0, width: 400, height: 300 };
    const placement = floatingPlacement({ anchor: anchor(500), contentHeight: 600, viewport: visual });
    expect(placement.side).toBe('top');
    expect(placement.maxHeight).toBe(500 - 300 - 4 - 8);
  });
});
