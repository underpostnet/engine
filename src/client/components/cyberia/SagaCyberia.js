/**
 * The saga marks of the Cyberia Studio: one color per saga code, the badge that names a saga, the
 * context panel badges, and the table column of the sagas each row belongs to (see
 * `src/projects/cyberia/saga-associations.js`).
 *
 * @module src/client/components/cyberia/SagaCyberia.js
 */
import { CyberiaSagaService } from '../../services/cyberia-saga/cyberia-saga.service.js';
import { SAGA_FILTER_KEY } from './SharedDefaultsCyberia.js';

/** The color of a saga: a hue its code fixes, the same wherever the saga shows. */
export const sagaColor = (code) => {
  let hue = 0;
  for (const char of code) hue = (hue * 31 + char.codePointAt(0)) % 360;
  return `hsl(${hue}, 60%, 40%)`;
};

const sagaTitle = (code) => `Belongs to the saga ${code}`;

/** A badge that names a saga in its color; the theme styles `.saga-badge`. */
export const sagaBadge = (code) => {
  const badge = document.createElement('span');
  badge.className = 'saga-badge';
  badge.textContent = code;
  badge.title = sagaTitle(code);
  badge.style.background = sagaColor(code);
  return badge;
};

/** The context panel badges of the sagas a target belongs to. */
export const sagaBadges = (codes) =>
  codes.map((code) => ({ label: code, title: sagaTitle(code), color: sagaColor(code) }));

/**
 * A table column of the sagas each row belongs to; empty for a row no saga holds. Its filter takes
 * comma-separated saga codes, each matching the codes that contain it; the server resolves it.
 * @param {'items'|'maps'} family - What the rows are.
 * @param {(row: Object) => string} keyOf - The item label or map code of a row.
 * @returns {Object} AG Grid column definition.
 */
export const sagaColumn = (family, keyOf) => {
  const codes = CyberiaSagaService.getSources()
    .then(({ status, data }) => (status === 'success' ? data[family] : {}))
    .catch(() => ({}));
  return {
    field: SAGA_FILTER_KEY,
    headerName: 'Sagas',
    minWidth: 240,
    editable: false,
    sortable: false,
    filter: 'agTextColumnFilter',
    // The server resolves which rows belong to the sagas; every row it answers passes here.
    filterParams: {
      filterOptions: [{ displayKey: 'sagas', displayName: 'Sagas', predicate: () => true, numberOfInputs: 1 }],
      maxNumConditions: 1,
      filterPlaceholder: 'saga-a, saga-b',
    },
    cellRenderer: class {
      init(params) {
        this.gui = document.createElement('span');
        this.gui.style.cssText = 'display: inline-flex; flex-wrap: wrap; gap: 4px;';
        codes.then((byKey) => this.gui.append(...(byKey[keyOf(params.data ?? {})] ?? []).map(sagaBadge)));
      }
      getGui() {
        return this.gui;
      }
      refresh() {
        return false;
      }
    },
  };
};
