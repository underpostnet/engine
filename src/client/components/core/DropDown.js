import { Badge } from './Badge.js';
import { getId, newInstance } from './CommonJs.js';
import { darkTheme, ThemeEvents } from './Css.js';
import { Input } from './Input.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { append, s, htmls } from './VanillaJs.js';

/** Space between the trigger and the panel, in px. */
const PANEL_GAP = 4;
/** Least space the panel keeps from the edge of the visible viewport, in px. */
const VIEWPORT_MARGIN = 8;
/** Least height the panel needs below its trigger before it opens upward, in px. */
const PANEL_MIN_HEIGHT = 160;

/**
 * The fixed position of a floating panel beside its anchor, inside the visible viewport. The panel
 * opens below the anchor, or above it when the space below is short and the space above is larger.
 * Every value is in layout-viewport px.
 * @param {Object} geometry
 * @param {{top: number, bottom: number, left: number, width: number}} geometry.anchor - Anchor rect.
 * @param {number} geometry.contentHeight - Full height of the panel content.
 * @param {{top: number, left: number, width: number, height: number}} geometry.viewport - Visible viewport.
 * @returns {{top: number, left: number, width: number, maxHeight: number, side: 'bottom'|'top'}}
 * @memberof DropDown
 */
const floatingPlacement = ({ anchor, contentHeight, viewport }) => {
  const below = viewport.top + viewport.height - anchor.bottom - PANEL_GAP - VIEWPORT_MARGIN;
  const above = anchor.top - viewport.top - PANEL_GAP - VIEWPORT_MARGIN;
  const side = below >= Math.min(contentHeight, PANEL_MIN_HEIGHT) || below >= above ? 'bottom' : 'top';
  const maxHeight = Math.max(0, side === 'bottom' ? below : above);
  const width = Math.max(0, Math.min(anchor.width, viewport.width - 2 * VIEWPORT_MARGIN));
  const left = Math.min(
    Math.max(anchor.left, viewport.left + VIEWPORT_MARGIN),
    viewport.left + viewport.width - VIEWPORT_MARGIN - width,
  );
  const top =
    side === 'bottom' ? anchor.bottom + PANEL_GAP : anchor.top - PANEL_GAP - Math.min(contentHeight, maxHeight);
  return { top, left, width, maxHeight, side };
};

/** The visible viewport in layout-viewport px. */
const visibleViewport = () => {
  const vv = window.visualViewport;
  return vv
    ? { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height }
    : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
};

const dropdownStyle = () =>
  html`<style class="dropdown-style">
    .dropdown-panel {
      position: fixed;
      inset: auto;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      z-index: 2147483000;
      color: inherit;
      background: var(--dropdown-panel-background, #1e1e1e);
      border: 2px solid var(--dropdown-panel-border, #313131);
      border-radius: 6px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    }
    :root[data-theme='light'] .dropdown-panel {
      --dropdown-panel-background: #fafafa;
      --dropdown-panel-border: #bbb;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
    }
    .dropdown-panel .dropdown-option {
      box-sizing: border-box;
      width: auto;
      overflow-wrap: anywhere;
    }
    .dropdown-container [role='button']:focus-visible,
    .dropdown-panel [role='option']:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }
  </style>`;

class DropDown {
  static Tokens = {};
  static async instance(options) {
    const id = options.id ? options.id : getId(DropDown.Tokens, 'dropdown-');
    // The deferred work below acts only while this instance owns the id: a newer one replaces it.
    const token = (DropDown.Tokens[id] = {
      onClickEvents: {},
      lastSelectValue: undefined,
      oncheckvalues: {},
      originData: options.data ? newInstance(options.data) : [],
    });
    const owned = () => DropDown.Tokens[id] === token;
    const listboxId = `${id}-listbox`;
    const searchVisible = !options.disableSearchBox;
    const panel = () => s(`.dropdown-option-${id}`);
    const isOpen = () => panel()?.classList.contains('hide') === false;
    const trigger = () => s(`.dropdown-${options.disableSelectLabel ? 'current' : 'label'}-${id}`);
    const selectableOptions = () =>
      [...(document.getElementById(listboxId)?.querySelectorAll('[role="option"]') ?? [])].filter(
        (element) => !element.classList.contains('hide'),
      );
    let release = null;
    let frame = 0;
    const place = () => {
      const container = s(`.${id}`);
      const list = panel();
      if (!container?.isConnected || !list) return close();
      const anchor = container.getBoundingClientRect();
      const viewport = visibleViewport();
      if (anchor.bottom < viewport.top || anchor.top > viewport.top + viewport.height) return close();
      const { top, left, width, maxHeight, side } = floatingPlacement({
        anchor,
        contentHeight: list.scrollHeight,
        viewport,
      });
      Object.assign(list.style, {
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      });
      list.dataset.side = side;
    };
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          place();
        });
    };
    const setExpanded = (expanded) => trigger()?.setAttribute('aria-expanded', `${expanded}`);
    const close = ({ restoreFocus = false } = {}) => {
      release?.();
      release = null;
      const list = panel();
      if (!list) return;
      if (list.popover && list.matches(':popover-open')) list.hidePopover();
      list.classList.add('hide');
      setExpanded(false);
      if (restoreFocus) trigger()?.focus();
    };
    const open = () => {
      const list = panel();
      if (!list?.isConnected || isOpen()) return;
      list.classList.remove('hide');
      if (list.popover) list.showPopover();
      place();
      const observer = new ResizeObserver(schedule);
      observer.observe(s(`.${id}`));
      observer.observe(document.getElementById(listboxId));
      const closeOutside = (event) => {
        if (!s(`.${id}`)?.contains(event.target)) close();
      };
      window.addEventListener('scroll', schedule, { capture: true, passive: true });
      window.addEventListener('resize', schedule);
      window.visualViewport?.addEventListener('resize', schedule);
      window.visualViewport?.addEventListener('scroll', schedule);
      document.addEventListener('pointerdown', closeOutside, true);
      release = () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        frame = 0;
        window.removeEventListener('scroll', schedule, { capture: true });
        window.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('scroll', schedule);
        document.removeEventListener('pointerdown', closeOutside, true);
      };
      setExpanded(true);
    };
    const focusInitial = (edge) => {
      const items = selectableOptions();
      const selected = items.find((element) => element.getAttribute('aria-selected') === 'true');
      if (searchVisible) {
        s(`.search-box-${id}`)?.focus();
        selected?.scrollIntoView({ block: 'nearest' });
      } else (selected ?? (edge === 'last' ? items.at(-1) : items[0]))?.focus();
    };
    const onTriggerKeyDown = (event) => {
      if (event.key === 'Escape' && isOpen()) {
        event.preventDefault();
        return close({ restoreFocus: true });
      }
      if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      if (isOpen() && (event.key === 'Enter' || event.key === ' ')) return close({ restoreFocus: true });
      open();
      focusInitial(event.key === 'ArrowUp' ? 'last' : 'first');
    };
    const onPanelKeyDown = (event) => {
      const items = selectableOptions();
      const index = items.indexOf(document.activeElement);
      const focus = (element) => {
        event.preventDefault();
        element?.focus();
      };
      switch (event.key) {
        case 'ArrowDown':
          return focus(items[index + 1] ?? items[0]);
        case 'ArrowUp':
          return focus(index > 0 ? items[index - 1] : searchVisible ? s(`.search-box-${id}`) : items.at(-1));
        case 'Home':
          return index >= 0 && focus(items[0]);
        case 'End':
          return index >= 0 && focus(items.at(-1));
        case 'Enter':
        case ' ':
          if (index < 0) return;
          event.preventDefault();
          return items[index].click();
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          return close({ restoreFocus: true });
        case 'Tab':
          return close();
      }
    };
    const _renderSelectedBadges = async () => {
      if (options.type !== 'checkbox') return;
      const container = s(`.dropdown-current-${id}`);
      if (!container) return;
      const selected = Object.entries(DropDown.Tokens[id].oncheckvalues);
      if (selected.length === 0) {
        htmls(`.dropdown-current-${id}`, '');
        return;
      }
      let badgesHtml = '';
      for (const [key, val] of selected) {
        badgesHtml += html`<span class="inl" style="display:inline-flex;align-items:center;margin:2px;">
          ${await Badge.instance({
            text: html`<i class="fa-solid fa-tag" style="margin-right:3px;font-size:9px;"></i>${val.display}`,
            style: {
              background: darkTheme ? '#335' : '#cde',
              color: darkTheme ? '#adf' : '#246',
              'border-radius': '4px',
              'font-size': '11px',
              height: 'auto',
              'min-width': 'auto',
            },
          })}
          <span
            class="dd-badge-del-${id}"
            data-key="${key}"
            style="cursor:pointer;padding:0 4px;font-size:14px;color:${darkTheme ? '#f88' : '#a00'};line-height:1;"
            >&times;</span
          >
        </span>`;
      }
      htmls(`.dropdown-current-${id}`, badgesHtml);
      container.querySelectorAll(`.dd-badge-del-${id}`).forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const key = btn.dataset.key;
          delete DropDown.Tokens[id].oncheckvalues[key];
          const dataItem = options.data.find((d) => d.value.trim().replaceAll(' ', '-') === key);
          if (dataItem) dataItem.checked = false;
          if (ToggleSwitch.Tokens[`checkbox-role-${key}`]) {
            const checkbox = s(`.checkbox-role-${key}-checkbox`);
            if (checkbox && checkbox.checked) ToggleSwitch.Tokens[`checkbox-role-${key}`].click();
          }
          DropDown.Tokens[id].value = Object.values(DropDown.Tokens[id].oncheckvalues).map((v) => v.data);
          s(`.${id}`).value = DropDown.Tokens[id].value;
          await _renderSelectedBadges();
        };
      });
    };
    DropDown.Tokens[id]._renderSelectedBadges = _renderSelectedBadges;
    options.data.push({
      value: 'reset',
      display: html`<i class="fa-solid fa-broom"></i> ${Translate.instance('clear')}`,
      onClick: () => {
        console.log('DropDown onClick', DropDown.value);
        if (options && options.resetOnClick) options.resetOnClick();
        if (options && options.type === 'checkbox') {
          DropDown.Tokens[id].oncheckvalues = {};
          DropDown.Tokens[id].value = [];
          s(`.${id}`).value = [];
          htmls(`.dropdown-current-${id}`, '');
          if (options.serviceProvider) {
            htmls(`.${id}-render-container`, '');
          } else {
            for (const optionData of options.data) {
              if (optionData.value !== 'reset' && optionData.value !== 'close' && optionData.checked) {
                optionData.checked = false;
                const vd = optionData.value.trim().replaceAll(' ', '-');
                if (ToggleSwitch.Tokens[`checkbox-role-${vd}`]) {
                  const checkbox = s(`.checkbox-role-${vd}-checkbox`);
                  if (checkbox && checkbox.checked) ToggleSwitch.Tokens[`checkbox-role-${vd}`].click();
                }
              }
            }
          }
        } else DropDown.Tokens[id].value = undefined;
      },
    });
    if (!(options && options.disableClose))
      options.data.push({
        value: 'close',
        display: html`<i class="fa-solid fa-xmark"></i> ${Translate.instance('close')}`,
        onClick: function () {
          console.log('DropDown onClick', DropDown.value);
        },
      });
    const switchOptionsPanel = () => (isOpen() ? close() : open());
    const _render = async (data) => {
      let render = '';
      let index = -1;
      for (const optionData of data) {
        index++;
        const i = index;
        const optionValue = typeof optionData.value === 'string' ? optionData.value : `option-${i}`;
        const valueDisplay = optionValue.trim().replaceAll(' ', '-');
        const isGroup = optionData.kind === 'group' || optionData.nonSelectable === true;
        if (!isGroup) {
          setTimeout(() => {
            const onclick = async (e) => {
              if (options && options.lastSelectClass && s(`.dropdown-option-${DropDown.Tokens[id].lastSelectValue}`)) {
                s(`.dropdown-option-${DropDown.Tokens[id].lastSelectValue}`).classList.remove(options.lastSelectClass);
              }
              DropDown.Tokens[id].lastSelectValue = valueDisplay;
              if (options && options.lastSelectClass && s(`.dropdown-option-${DropDown.Tokens[id].lastSelectValue}`)) {
                s(`.dropdown-option-${DropDown.Tokens[id].lastSelectValue}`).classList.add(options.lastSelectClass);
              }
              if (
                !(options && options.disableClose) &&
                (options.type !== 'checkbox' || optionData.value === 'close' || optionData.value === 'reset')
              )
                close({ restoreFocus: Boolean(panel()?.contains(document.activeElement)) });
              if (options.type === 'checkbox' && ToggleSwitch.Tokens[`checkbox-role-${valueDisplay}`])
                ToggleSwitch.Tokens[`checkbox-role-${valueDisplay}`].click();
              const optionElement = s(`.dropdown-option-${id}-${i}`);
              if (optionData.value === 'reset')
                for (const element of selectableOptions()) element.setAttribute('aria-selected', 'false');
              else if (optionData.value !== 'close' && optionElement) {
                if (options.type === 'checkbox')
                  optionElement.setAttribute('aria-selected', `${Boolean(optionData.checked)}`);
                else
                  for (const element of selectableOptions())
                    element.setAttribute('aria-selected', `${element === optionElement}`);
              }
              if (optionData.value !== 'close') {
                if (optionData.value !== 'reset') {
                  if (options.type === 'checkbox') {
                    _renderSelectedBadges();
                  } else {
                    htmls(`.dropdown-current-${id}`, optionData.display);
                  }
                } else htmls(`.dropdown-current-${id}`, '');
                DropDown.Tokens[id].value =
                  options.type === 'checkbox'
                    ? options.serviceProvider
                      ? Object.values(DropDown.Tokens[id].oncheckvalues).map((v) => v.data)
                      : data.filter((d) => d.checked).map((d) => d.data)
                    : optionData.data;
                console.warn('current value dropdown id:' + id, DropDown.Tokens[id].value);
                s(`.${id}`).value = DropDown.Tokens[id].value;
                optionData.onClick(e);
              }
            };
            DropDown.Tokens[id].onClickEvents[`dropdown-option-${id}-${i}`] = onclick;
            DropDown.Tokens[id].onClickEvents[`dropdown-option-${id}-${valueDisplay}`] = onclick;
            DropDown.Tokens[id].onClickEvents[`dropdown-option-${valueDisplay}`] = onclick;
            s(`.dropdown-option-${id}-${i}`).onclick = onclick;
          });
        }
        render += html`
          <div
            class="in dropdown-option ${
              isGroup
                ? `dropdown-option-group dropdown-option-group-${id}`
                : `dropdown-option-${id}-${i} dropdown-option-${id}-${valueDisplay} dropdown-option-${valueDisplay} ${valueDisplay === 'reset' && options && !(options.resetOption === true) ? 'hide' : ''}`
            }"
            style="${
              isGroup
                ? 'cursor:default;opacity:.8;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding-top:8px;padding-bottom:6px;'
                : ''
            }"
            ${
              isGroup
                ? 'role="presentation"'
                : `role="option" tabindex="-1" aria-selected="${options.type === 'checkbox' ? Boolean(optionData.checked) : DropDown.Tokens[id].lastSelectValue === valueDisplay}"`
            }
          >
            ${
              !isGroup && options.type === 'checkbox' && optionData.value !== 'close' && optionData.value !== 'reset'
                ? html`
                    ${await ToggleSwitch.instance({
                      id: `checkbox-role-${valueDisplay}`,
                      type: 'checkbox',
                      disabledOnClick: true,
                      checked: optionData.checked,
                      on: {
                        unchecked: () => {
                          optionData.checked = false;
                          delete DropDown.Tokens[id].oncheckvalues[valueDisplay];
                        },
                        checked: () => {
                          optionData.checked = true;
                          DropDown.Tokens[id].oncheckvalues[valueDisplay] = {
                            data: optionData.data,
                            display: optionData.display,
                            value: optionData.value,
                          };
                        },
                      },
                    })}
                  `
                : ''
            }${optionData.display}
          </div>
        `;
      }
      return { render, index };
    };
    const selectInitial = (indexValue) =>
      setTimeout(() => owned() && s(`.dropdown-option-${id}-${indexValue}`)?.click());
    setTimeout(() => {
      if (!owned()) return;
      if (options.type === 'checkbox')
        options.data.map((optionData) => {
          const indexValue = options.data.findIndex((t) => optionData.checked && t.value === optionData.value);
          if (indexValue > -1) selectInitial(indexValue);
        });
      else {
        const indexValue = options.data.findIndex((t) => t.value === options.value);
        if (indexValue > -1) selectInitial(indexValue);
      }
      s(`.dropdown-label-${id}`).onclick = switchOptionsPanel;
      s(`.dropdown-current-${id}`).onclick = switchOptionsPanel;
      trigger().onkeydown = onTriggerKeyDown;
      panel().onkeydown = onPanelKeyDown;
      if (options && options.open) open();
      if (options.type === 'checkbox') {
        ThemeEvents[`dropdown-badge-${id}`] = () => _renderSelectedBadges();
      }
      const dropDownSearchHandle = async () => {
        const _data = [];
        if (!s(`.search-box-${id}`)) return;
        let _value = s(`.search-box-${id}`).value.toLowerCase();
        for (const objData of options.data) {
          if (
            options.excludeSelected &&
            options.type === 'checkbox' &&
            DropDown.Tokens[id].oncheckvalues[objData.value.trim().replaceAll(' ', '-')]
          )
            continue;
          const objValue = objData.value.toLowerCase();
          if (
            objValue.match(_value) ||
            (Translate.Data[objData.value] &&
              Object.keys(Translate.Data[objData.value]).find((t) =>
                Translate.Data[objData.value][t].toLowerCase().match(_value),
              ))
          ) {
            _data.push(objData);
          }
        }
        if (_data.length > 0) {
          const { render, index } = await _render(_data);
          htmls(`.${id}-render-container`, render);
        } else {
          // const { render, index } = await _render(options.data);
          htmls(
            `.${id}-render-container`,
            html` <div class="inl" style="padding: 10px; color: red">
              <i class="fas fa-exclamation-circle"></i> ${Translate.instance('no-result-found')}
            </div>`,
          );
        }
      };
      if (options.serviceProvider) {
        let serviceSearchTimeout = null;
        s(`.search-box-${id}`).oninput = () => {
          clearTimeout(serviceSearchTimeout);
          const q = s(`.search-box-${id}`).value.trim();
          if (!q) {
            htmls(`.${id}-render-container`, '');
            return;
          }
          serviceSearchTimeout = setTimeout(async () => {
            try {
              let results = await options.serviceProvider(q);
              if (options.type === 'checkbox') {
                if (options.excludeSelected) {
                  const selectedKeys = Object.keys(DropDown.Tokens[id].oncheckvalues);
                  results = results.filter((item) => !selectedKeys.includes(item.value.trim().replaceAll(' ', '-')));
                }
                results = results.map((item) => {
                  const vd = item.value.trim().replaceAll(' ', '-');
                  return { ...item, checked: !!DropDown.Tokens[id].oncheckvalues[vd] };
                });
              }
              const controlItems = options.data.filter((d) => d.value === 'reset' || d.value === 'close');
              const allData = [...results, ...controlItems];
              if (allData.length > controlItems.length) {
                const { render } = await _render(allData);
                htmls(`.${id}-render-container`, render);
              } else {
                htmls(
                  `.${id}-render-container`,
                  html` <div class="inl" style="padding: 10px; color: red">
                    <i class="fas fa-exclamation-circle"></i> ${Translate.instance('no-result-found')}
                  </div>`,
                );
              }
            } catch (e) {
              console.error('DropDown serviceProvider error:', e);
            }
          }, 200);
        };
      } else {
        s(`.search-box-${id}`).oninput = dropDownSearchHandle;
      }
      // Not use onblur generate bug on input toggle
      // s(`.search-box-${id}`).onblur = dropDownSearchHandle;
    });
    const { render, index } = await _render(options.data);
    if (!s(`.dropdown-style`)) append('head', dropdownStyle());
    const triggerAttributes = `role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listboxId}"`;
    return html`
      <div class="inl dropdown-container ${id} ${options?.containerClass ? options.containerClass : ''}">
        <div
          id="${id}-label"
          class="in dropdown-option dropdown-label-${id} ${options && options.disableSelectLabel ? 'hide' : ''}"
          ${options.disableSelectLabel ? '' : `${triggerAttributes} aria-labelledby="${id}-label ${id}-current"`}
        >
          <i class="fa-solid fa-caret-down" aria-hidden="true"> </i> ${options.label}
        </div>
        <div
          id="${id}-current"
          class="in dropdown-option dropdown-current-${id} ${
            options && options.disableSelectOptionsLabel ? 'hide' : ''
          }"
          ${options.disableSelectLabel ? triggerAttributes : ''}
        ></div>
        <div class="dropdown-option-${id} dropdown-panel hide" popover="manual">
          <div class="in dropdown-option ${options && options.disableSearchBox ? 'hide' : ''}">
            ${await Input.instance({
              id: `search-box-${id}`,
              label: html`<i class="fa-solid fa-magnifying-glass"></i> ${Translate.instance('search')}`,
              containerClass: 'in',
              placeholder: true,
            })}
          </div>
          <div
            id="${listboxId}"
            class="${id}-render-container"
            role="listbox"
            aria-labelledby="${id}-label"
            ${options.type === 'checkbox' ? 'aria-multiselectable="true"' : ''}
          >
            ${render}
          </div>
        </div>
      </div>
    `;
  }
}
export { DropDown, floatingPlacement };
