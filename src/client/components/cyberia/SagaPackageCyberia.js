/**
 * The package view of the Saga Engine: the full JSON of a candidate in an editor, its definitions
 * grouped by kind with the references between them, the findings of its last check at their JSON
 * paths, the differences from another revision, and the save, check and apply of a revision. The
 * server checks, diffs, saves and applies; this view shows the results and sends the moderator's
 * decisions.
 *
 * @module src/client/components/cyberia/SagaPackageCyberia.js
 */
import { createJSONEditor } from 'vanilla-jsoneditor';
import { ThemeEvents, darkTheme } from '../core/Css.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getProxyPath } from '../core/Router.js';
import { append, escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaSagaWorkflowService } from '../../services/cyberia-saga-workflow/CyberiaSagaWorkflowService.js';

/** The kinds a summary shows first, in this order; any other kind follows by name. */
const KIND_ORDER = Object.freeze(['map', 'character', 'quest', 'action', 'ability']);
/** A definition id: `<kind>.<slug>`. */
const ID_PATTERN = /^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The longest value a diff entry shows. */
const VALUE_LENGTH = 160;

const canonical = (value) => JSON.stringify(value, null, 2);
const kindOf = (id) => String(id).split('.')[0];
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const shortValue = (value) => {
  const text = value === undefined ? '' : JSON.stringify(value);
  return text.length > VALUE_LENGTH ? `${text.slice(0, VALUE_LENGTH)}…` : text;
};

/** Every definition id a value names, with the top-level field that names it. */
const referencesOf = (definition) =>
  Object.entries(definition)
    .filter(([field]) => field !== 'id')
    .flatMap(([field, value]) => {
      const found = new Set();
      const walk = (entry) => {
        if (typeof entry === 'string' && ID_PATTERN.test(entry)) found.add(entry);
        else if (Array.isArray(entry)) entry.forEach(walk);
        else if (entry && typeof entry === 'object') Object.values(entry).forEach(walk);
      };
      walk(value);
      return [...found].map((id) => ({ field, id }));
    });

const notify = (html, status = 'success') => NotificationManager.Push({ html, status });

class SagaPackage {
  /** The workflow view the package belongs to. */
  static workflow = null;
  /** The candidate the editor holds: `{ revision, digest, package }`. */
  static candidate = null;
  /** The JSON in the editor, or null while it does not parse. */
  static current = null;
  static editor = null;
  static busy = false;
  static canMutate = false;
  /** Runs with the workflow view an operation answers. */
  static onChanged = async () => {};

  static style = css`
    .saga-package-bar {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: 6px 0;
      background: var(--editor-stage-background);
    }
    .saga-package-editor {
      min-height: 420px;
      height: 70vh;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-radius: 6px;
    }
    .saga-package-editor .jse-main {
      height: 100%;
    }
    .saga-package-side {
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .saga-package-definition {
      padding: 4px 0;
      border-top: 1px solid var(--studio-subtle-border, #8884);
    }
    .saga-package .saga-package-link {
      appearance: none;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-family: monospace;
      font-size: 12px;
      text-decoration: underline dotted;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .saga-package-finding,
    .saga-package-change {
      padding: 4px 0;
      border-top: 1px solid var(--studio-subtle-border, #8884);
      font-size: 12px;
    }
    .saga-package-change code {
      overflow-wrap: anywhere;
    }
  `;

  /** The view markup. Call {@link SagaPackage.mount} once it is in the page. */
  static render() {
    return html`<style>
        ${SagaPackage.style}
      </style>
      <div class="saga-package">
        <div class="studio-form-row saga-package-bar">
          <label class="studio-form-field" style="flex: 0 1 14rem;"
            ><span>Revision</span>
            <select class="saga-package-revision" aria-label="Candidate revision"></select
          ></label>
          <button type="button" class="studio-form-button saga-package-save">
            <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save draft
          </button>
          <button type="button" class="studio-form-button saga-package-reset">
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset
          </button>
          <button type="button" class="studio-form-button saga-package-validate">
            <i class="fa-solid fa-list-check" aria-hidden="true"></i> Validate
          </button>
          <button type="button" class="studio-form-button saga-package-apply">
            <i class="fa-solid fa-file-import" aria-hidden="true"></i> Apply to content source
          </button>
          <span class="studio-form-hint saga-package-state" role="status" aria-live="polite"></span>
        </div>
        <div class="saga-package-dirty"></div>
        <div class="studio-form-split">
          <div style="flex: 3 1 420px;"><div class="saga-package-editor"></div></div>
          <div class="saga-package-side">
            <div class="studio-form-card saga-package-findings"></div>
            <div class="studio-form-card saga-package-summary"></div>
            <div class="studio-form-card saga-package-diff">
              <h4>Differences</h4>
              <div class="studio-form-row">
                <label class="studio-form-field" style="flex: 1 1 10rem;"
                  ><span>Compare the editor with</span>
                  <select class="saga-package-diff-from"></select
                ></label>
                <button type="button" class="studio-form-button saga-package-diff-run">
                  <i class="fa-solid fa-code-compare" aria-hidden="true"></i> Compare
                </button>
              </div>
              <div class="saga-package-diff-list" aria-live="polite"></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /**
   * Connects the view to a workflow and shows its newest candidate.
   * @param {Object} params
   * @param {Object} params.workflow - The workflow view.
   * @param {boolean} params.canMutate
   * @param {(view:Object)=>Promise<void>} params.onChanged
   */
  static async mount({ workflow, canMutate, onChanged }) {
    Object.assign(SagaPackage, { workflow, canMutate, onChanged });
    if (!s('.saga-package')) return;
    const on = (selector, handler) => (s(selector).onclick = handler);
    on('.saga-package-save', () => SagaPackage.save());
    on('.saga-package-reset', () => SagaPackage.reset());
    on('.saga-package-validate', () => SagaPackage.validate());
    on('.saga-package-apply', () => SagaPackage.confirmApply());
    on('.saga-package-diff-run', () => SagaPackage.diff());
    s('.saga-package-revision').onchange = ({ target }) => SagaPackage.show(Number(target.value));
    SagaPackage.createEditor();
    const newest = workflow.candidates.at(-1);
    if (newest) SagaPackage.load({ ...newest, package: workflow.package });
    else SagaPackage.load(null);
  }

  /** The workflow the server answered; the editor keeps its content. */
  static refresh(workflow) {
    SagaPackage.workflow = workflow;
    SagaPackage.renderRevisions();
    SagaPackage.renderState();
    SagaPackage.renderFindings();
    SagaPackage.editor?.updateProps({ validator: () => SagaPackage.validationErrors() });
  }

  static createEditor() {
    if (!s('.jse-dark-theme-link'))
      append(
        'head',
        html`<link
          class="jse-dark-theme-link"
          rel="stylesheet"
          type="text/css"
          href="${getProxyPath()}styles/vanilla-jsoneditor/jse-theme-dark.css"
        />`,
      );
    SagaPackage.editor?.destroy();
    SagaPackage.editor = createJSONEditor({
      target: s('.saga-package-editor'),
      props: {
        content: { json: {} },
        mode: 'tree',
        readOnly: !SagaPackage.canMutate,
        mainMenuBar: true,
        navigationBar: true,
        statusBar: true,
        validator: () => SagaPackage.validationErrors(),
        onChange: (content) => SagaPackage.changed(content),
      },
    });
    const theme = () => s('.saga-package-editor')?.classList.toggle('jse-theme-dark', darkTheme);
    theme();
    ThemeEvents['saga-package-json-editor'] = theme;
  }

  /** The findings of the last check, at their paths, while the editor holds the revision it checked. */
  static validationErrors() {
    const { validation } = SagaPackage.workflow ?? {};
    if (!validation || validation.revision !== SagaPackage.candidate?.revision || SagaPackage.dirty()) return [];
    return validation.findings.map(({ path, message }) => ({ path, message, severity: 'error' }));
  }

  /** Puts a candidate in the editor: its package becomes the content to compare edits with. */
  static load(candidate) {
    SagaPackage.candidate = candidate;
    SagaPackage.current = candidate?.package ?? null;
    SagaPackage.editor?.set({ json: candidate?.package ?? {} });
    SagaPackage.renderRevisions();
    SagaPackage.renderState();
    SagaPackage.renderFindings();
    SagaPackage.renderSummary();
    htmls('.saga-package-diff-list', '');
  }

  /** Reads one candidate revision and puts it in the editor, once unsaved changes are confirmed away. */
  static async show(revision) {
    if (SagaPackage.dirty() && !(await SagaPackage.confirm('Leave the unsaved changes of the editor?'))) {
      SagaPackage.renderRevisions();
      return;
    }
    const { status, data, message } = await CyberiaSagaWorkflowService.getCandidate({
      id: SagaPackage.workflow._id,
      revision,
    });
    if (status !== 'success') return notify(escapeHtml(message), 'error');
    SagaPackage.load(data);
  }

  static changed(content) {
    try {
      SagaPackage.current = content.json !== undefined ? content.json : JSON.parse(content.text);
    } catch {
      SagaPackage.current = null;
    }
    SagaPackage.renderState();
    SagaPackage.renderSummary();
  }

  /** Whether the editor holds changes no candidate has. */
  static dirty() {
    if (!SagaPackage.candidate) return SagaPackage.current !== null && canonical(SagaPackage.current) !== '{}';
    return SagaPackage.current === null || canonical(SagaPackage.current) !== canonical(SagaPackage.candidate.package);
  }

  static renderRevisions() {
    const { candidates = [] } = SagaPackage.workflow ?? {};
    const option = ({ revision, kind, sagaCode, at }) =>
      html`<option value="${revision}" ${revision === SagaPackage.candidate?.revision ? 'selected' : ''}>
        ${revision} · ${escapeHtml(kind)} · ${escapeHtml(sagaCode || '—')} ·
        ${escapeHtml(new Date(at).toLocaleString())}
      </option>`;
    const options = [...candidates].reverse().map(option).join('');
    htmls('.saga-package-revision', options || html`<option value="">No candidate yet</option>`);
    htmls('.saga-package-diff-from', options);
    const generated = [...candidates].reverse().find(({ kind }) => kind === 'generated');
    if (generated && s('.saga-package-diff-from')) s('.saga-package-diff-from').value = String(generated.revision);
  }

  static renderState() {
    const { workflow, candidate } = SagaPackage;
    if (!workflow || !s('.saga-package-state')) return;
    const dirty = SagaPackage.dirty();
    const checked = workflow.validation?.digest === candidate?.digest ? workflow.validation : null;
    const applied = workflow.applied?.digest === candidate?.digest;
    const sources = workflow.capabilities?.sources;
    const text = !candidate
      ? 'No candidate yet: generate one, or write a package and save it.'
      : SagaPackage.current === null
        ? 'The editor holds text that is not JSON.'
        : dirty
          ? `Unsaved changes over revision ${candidate.revision}.`
          : applied
            ? `Revision ${candidate.revision} is in the content source.`
            : checked
              ? checked.ok
                ? `Revision ${candidate.revision} passes the content rules. Apply it to the content source.`
                : `Revision ${candidate.revision} has ${plural(checked.findings.length, 'finding')}.`
              : `Revision ${candidate.revision} is not checked yet.`;
    htmls('.saga-package-state', escapeHtml(text));
    htmls(
      '.saga-package-dirty',
      dirty && SagaPackage.current !== null
        ? html`<div class="studio-form-dirty" role="status">
            Unsaved changes. Save a draft to keep them as a new revision; nothing changes outside this workflow.
          </div>`
        : '',
    );
    const set = (selector, disabled, title = '') => {
      const button = s(selector);
      if (!button) return;
      button.disabled = disabled;
      button.title = title;
    };
    const idle = !SagaPackage.busy && SagaPackage.canMutate;
    set('.saga-package-save', !idle || !dirty || SagaPackage.current === null);
    set('.saga-package-reset', !dirty);
    set(
      '.saga-package-validate',
      !idle || !candidate || dirty || !sources,
      sources ? '' : 'This host has no content source checkout',
    );
    set(
      '.saga-package-apply',
      !idle || !candidate || dirty || !checked?.ok || applied || !sources,
      checked?.ok ? '' : 'Validate the revision and clear its findings first',
    );
  }

  static renderFindings() {
    const { workflow, candidate } = SagaPackage;
    if (!s('.saga-package-findings')) return;
    const validation = workflow?.validation;
    if (!candidate || validation?.revision !== candidate.revision) {
      htmls(
        '.saga-package-findings',
        html`<h4>Validation</h4>
          <div class="studio-form-hint">
            Validate runs the cyberia-content rules on this revision: the package schema, the foundation and every other
            saga, the quest graph and the interactions. It changes nothing.
          </div>`,
      );
      return;
    }
    htmls(
      '.saga-package-findings',
      html`<h4>Validation · ${validation.ok ? 'passes' : plural(validation.findings.length, 'finding')}</h4>
        <div class="studio-form-hint">Checked ${escapeHtml(new Date(validation.checkedAt).toLocaleString())}</div>
        ${validation.findings
          .map(
            (finding, index) =>
              html`<div class="saga-package-finding">
                <button type="button" class="saga-package-link" data-finding="${index}">
                  ${escapeHtml(finding.id)}
                </button>
                ${escapeHtml(finding.message)}
              </div>`,
          )
          .join('')}`,
    );
    for (const button of document.querySelectorAll('.saga-package-findings [data-finding]'))
      button.onclick = () => SagaPackage.focus(validation.findings[Number(button.dataset.finding)].path);
  }

  /** The definitions of the editor by kind, each with what it names; a name of the package opens it. */
  static renderSummary() {
    if (!s('.saga-package-summary')) return;
    const pkg = SagaPackage.current;
    const definitions = Array.isArray(pkg?.definitions) ? pkg.definitions.filter((entry) => entry?.id) : [];
    if (definitions.length === 0) {
      htmls(
        '.saga-package-summary',
        html`<h4>Definitions</h4>
          <div class="studio-form-hint">No definition yet.</div>`,
      );
      return;
    }
    const own = new Set(definitions.map(({ id }) => id));
    const groups = Map.groupBy(definitions, ({ id }) => kindOf(id));
    const kinds = [...groups.keys()].sort(
      (a, b) =>
        (KIND_ORDER.includes(a) ? KIND_ORDER.indexOf(a) : KIND_ORDER.length) -
          (KIND_ORDER.includes(b) ? KIND_ORDER.indexOf(b) : KIND_ORDER.length) || a.localeCompare(b),
    );
    const link = (id) =>
      own.has(id)
        ? html`<button type="button" class="saga-package-link" data-definition="${escapeHtml(id)}">
            ${escapeHtml(id)}
          </button>`
        : html`<span class="studio-form-mono" title="Defined by the foundation or another saga"
            >${escapeHtml(id)}</span
          >`;
    htmls(
      '.saga-package-summary',
      html`<h4>Definitions · ${definitions.length}</h4>
        <div class="studio-form-hint">
          ${escapeHtml(pkg.saga?.code ?? '')} · ${plural(pkg.references?.length ?? 0, 'reference')} to the foundation
          and other sagas
        </div>
        ${kinds
          .map(
            (kind) =>
              html`<details open>
                <summary>${escapeHtml(kind)} · ${groups.get(kind).length}</summary>
                ${groups
                  .get(kind)
                  .map((definition) => {
                    const references = referencesOf(definition);
                    return html`<div class="saga-package-definition">
                      ${link(definition.id)} ${escapeHtml(definition.name ?? '')}
                      ${
                        references.length > 0
                          ? html`<div class="studio-form-hint">
                              ${Object.entries(Object.groupBy(references, ({ field }) => field))
                                .map(
                                  ([field, entries]) =>
                                    `${escapeHtml(field)}: ${entries.map(({ id }) => link(id)).join(', ')}`,
                                )
                                .join(' · ')}
                            </div>`
                          : ''
                      }
                    </div>`;
                  })
                  .join('')}
              </details>`,
          )
          .join('')}`,
    );
    for (const button of document.querySelectorAll('.saga-package-summary [data-definition]'))
      button.onclick = () => SagaPackage.focusDefinition(button.dataset.definition);
  }

  /** Shows a JSON path of the editor. */
  static async focus(path) {
    if (!SagaPackage.editor || !Array.isArray(path)) return;
    s('.saga-package')?.scrollIntoView({ block: 'start' });
    await SagaPackage.editor.scrollTo(path).catch(() => {});
  }

  /** Shows the definition of an id. */
  static focusDefinition(id) {
    const index = (SagaPackage.current?.definitions ?? []).findIndex((definition) => definition?.id === id);
    if (index >= 0) SagaPackage.focus(['definitions', index]);
  }

  static confirm(text, confirmLabel = 'Confirm') {
    return Modal.RenderConfirm({
      id: 'saga-package-confirm',
      confirmLabel,
      html: async () => html`<div class="in section-mp" style="text-align: center">${text}</div>`,
    }).then(({ status }) => status === 'confirm');
  }

  /** Runs one server operation at a time; its answer is the new workflow view. */
  static async operate(run, done) {
    if (SagaPackage.busy) return null;
    SagaPackage.busy = true;
    SagaPackage.renderState();
    const result = await run().catch((error) => ({ status: 'error', message: error.message }));
    SagaPackage.busy = false;
    if (result.status !== 'success') {
      notify(escapeHtml(result.message), result.code === 409 ? 'warning' : 'error');
      SagaPackage.renderState();
      return null;
    }
    notify(done);
    await SagaPackage.onChanged(result.data);
    return result.data;
  }

  static async save() {
    const view = await SagaPackage.operate(
      () =>
        CyberiaSagaWorkflowService.saveCandidate({
          id: SagaPackage.workflow._id,
          body: { package: SagaPackage.current, parent: SagaPackage.candidate?.revision ?? null },
        }),
      'Draft saved as a new revision',
    );
    if (view) SagaPackage.load({ ...view.candidates.at(-1), package: view.package });
  }

  static async reset() {
    if (!(await SagaPackage.confirm('Drop the unsaved changes and show the revision again?', 'Reset'))) return;
    SagaPackage.load(SagaPackage.candidate);
  }

  static async validate() {
    const { revision } = SagaPackage.candidate ?? {};
    if (!revision) return;
    await SagaPackage.operate(
      () => CyberiaSagaWorkflowService.validate({ id: SagaPackage.workflow._id, revision }),
      `Revision ${revision} checked`,
    );
  }

  static async confirmApply() {
    const { revision, sagaCode } = SagaPackage.candidate ?? {};
    const code = sagaCode || SagaPackage.current?.saga?.code;
    if (
      !revision ||
      !(await SagaPackage.confirm(
        `Write revision ${revision} to src/content/sagas/${escapeHtml(code)}.json of the content source? Nothing is built,
        imported or released: commit, build and import it with the content release steps.`,
        'Apply',
      ))
    )
      return;
    await SagaPackage.operate(
      () => CyberiaSagaWorkflowService.apply({ id: SagaPackage.workflow._id, revision }),
      `Revision ${revision} is in the content source`,
    );
  }

  /** Lists the differences between the editor and a revision. */
  static async diff() {
    const revision = Number(s('.saga-package-diff-from')?.value);
    if (!revision || SagaPackage.current === null) return;
    const { status, data, message } = await CyberiaSagaWorkflowService.diff({
      id: SagaPackage.workflow._id,
      body: { package: SagaPackage.current, revision },
    });
    if (status !== 'success') return notify(escapeHtml(message), 'error');
    const OPS = { add: ['fa-plus', 'Added'], remove: ['fa-minus', 'Removed'], change: ['fa-pen', 'Changed'] };
    htmls(
      '.saga-package-diff-list',
      data.total === 0
        ? html`<div class="studio-form-hint">The editor holds revision ${data.revision} exactly.</div>`
        : html`<div class="studio-form-hint">
              ${plural(data.total, 'difference')} from revision
              ${data.revision}${data.total > data.entries.length ? `; the first ${data.entries.length} show` : ''}
            </div>
            ${data.entries
              .map(
                ({ path, op, before, after }) =>
                  html`<div class="saga-package-change">
                    <i class="fa-solid ${OPS[op][0]}" aria-hidden="true"></i> ${OPS[op][1]}
                    <code>${escapeHtml(path.join(' › ') || '(package)')}</code>
                    ${op !== 'add' ? html`<div class="studio-form-hint">was <code>${escapeHtml(shortValue(before))}</code></div>` : ''}
                    ${op !== 'remove' ? html`<div class="studio-form-hint">now <code>${escapeHtml(shortValue(after))}</code></div>` : ''}
                  </div>`,
              )
              .join('')}`,
    );
  }

  /** Frees the editor and its theme hook. */
  static unmount() {
    SagaPackage.editor?.destroy();
    SagaPackage.editor = null;
    delete ThemeEvents['saga-package-json-editor'];
  }
}

export { SagaPackage };
