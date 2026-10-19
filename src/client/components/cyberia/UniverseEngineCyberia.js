/**
 * The universe editor of the Cyberia Studio: the worlds a universe holds, their cells on its graph,
 * the routes between them, and what serves each world now.
 *
 * Membership, cells and routes are the authored universe; a save names the revision it read, so a
 * newer save is never overwritten. The content of a member and its live servers are read-only here:
 * a member stays on the graph while its servers are offline or the served release lacks it.
 *
 * @module src/client/components/cyberia/UniverseEngineCyberia.js
 */
import { commonModeratorGuard } from '../core/CommonJs.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { Input } from '../core/Input.js';
import { ListPager } from '../core/ListPager.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getQueryParams, listenQueryParamsChange, setQueryParams, unlistenQueryParamsChange } from '../core/Router.js';
import { Tabs } from '../core/Tabs.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { CyberiaServerRegistryService } from '../../services/cyberia-server-registry/cyberia-server-registry.service.js';
import { CyberiaUniverseService } from '../../services/cyberia-universe/cyberia-universe.service.js';
import { GraphLayoutCyberia } from './GraphLayoutCyberia.js';
import { InstanceEngineCyberia } from './InstanceEngineCyberia.js';
import { CONTENT_CODE_PATTERN, resolveGraphLayout } from './SharedDefaultsCyberia.js';

const ROUTES = Object.freeze([
  { id: 'none', label: 'No route' },
  { id: 'out', label: 'One way, to it' },
  { id: 'in', label: 'One way, from it' },
  { id: 'both', label: 'Both ways' },
]);

const blankDraft = () => ({ code: '', name: '', description: '', instances: [], links: [] });

/** The content release the servers of an endpoint build their world from: one once they converge. */
const releaseLine = (releases) => {
  const named = releases.map((release) => escapeHtml(release || 'workspace'));
  if (named.length <= 1) return `Release ${named[0] ?? 'unknown'}`;
  return `Releases ${named.join(', ')}: the replicas have not converged yet`;
};

/** The topology a save sends, in a stable form for the comparison with the stored one. */
const topologyKey = ({ name, description, instances, links }) =>
  JSON.stringify({
    name,
    description,
    instances: instances.map(({ instanceCode, x, y }) => [instanceCode, x, y]),
    links: links.map(({ sourceInstanceCode, targetInstanceCode, bidirectional }) => [
      sourceInstanceCode,
      targetInstanceCode,
      !!bidirectional,
    ]),
  });

/** The route between a member and another one, as the side panel names it. */
const routeOf = (links, from, to) => {
  const link = links.find(
    (l) =>
      (l.sourceInstanceCode === from && l.targetInstanceCode === to) ||
      (l.sourceInstanceCode === to && l.targetInstanceCode === from),
  );
  if (!link) return 'none';
  if (link.bidirectional) return 'both';
  return link.sourceInstanceCode === from ? 'out' : 'in';
};

const withRoute = (links, from, to, route) => {
  const others = links.filter(
    (l) =>
      !(
        (l.sourceInstanceCode === from && l.targetInstanceCode === to) ||
        (l.sourceInstanceCode === to && l.targetInstanceCode === from)
      ),
  );
  if (route === 'none') return others;
  const [source, target] = route === 'in' ? [to, from] : [from, to];
  return [...others, { sourceInstanceCode: source, targetInstanceCode: target, bidirectional: route === 'both' }];
};

class UniverseEngineCyberia {
  static style = css`
    .universe-engine-stage {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: flex-start;
    }
    .universe-engine-graph {
      flex: 3 1 420px;
      min-width: 0;
    }
    .universe-engine-side {
      flex: 1 1 260px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;
    }
    .universe-engine-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .universe-engine-row > input,
    .universe-engine-row > select {
      flex: 1 1 10rem;
      min-height: 32px;
      min-width: 0;
    }
    .universe-engine-side button,
    .universe-engine-row button {
      min-height: 32px;
      padding: 4px 10px;
      border: 1px solid var(--studio-border, #8885);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .universe-engine-side button:disabled,
    .universe-engine-row button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .universe-engine-card {
      padding: 8px;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-radius: 8px;
    }
    .universe-engine-preview {
      display: grid;
      place-items: center;
      width: 100%;
      min-height: 120px;
      background: var(--studio-subtle-border, #8882);
      border-radius: 6px;
      overflow: hidden;
    }
    .universe-engine-preview img {
      width: 100%;
      max-height: 240px;
      object-fit: contain;
    }
    .universe-engine-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 8px;
      border-radius: 10px;
      background: var(--studio-tag, #8883);
      color: var(--studio-tag-ink, inherit);
      font-size: 12px;
    }
    .universe-engine-dirty {
      padding: 4px 8px;
      border-left: 3px solid var(--studio-accent-warm, #f80);
      font-size: 12px;
    }
    .universe-engine-route {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
      gap: 4px 8px;
      align-items: center;
    }
    .universe-engine-mono {
      font-family: monospace;
      overflow-wrap: anywhere;
    }
  `;

  static async render({ appStore }) {
    const canMutate = commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest');
    const idCode = 'universe-engine-input-code';
    const idName = 'universe-engine-input-name';
    const idDescription = 'universe-engine-input-description';
    const idAdd = 'universe-engine-add-code';
    const libraryId = 'universe-engine-library';

    const state = {
      id: null,
      revision: 1,
      saved: topologyKey(blankDraft()),
      draft: blankDraft(),
      members: new Map(),
      endpoints: [],
      selected: null,
      graph: null,
      crud: null,
      unpin: null,
      pager: null,
      active: true,
      refresh: 0,
      load: 0,
      runtime: 'loading',
    };

    const dirty = () => topologyKey(readForm()) !== state.saved;
    const readForm = () => ({
      ...state.draft,
      code: s(`.${idCode}`)?.value?.trim() ?? state.draft.code,
      name: s(`.${idName}`)?.value?.trim() ?? state.draft.name,
      description: s(`.${idDescription}`)?.value ?? state.draft.description,
    });

    const renderGraph = () => {
      if (!state.graph) return;
      htmls(
        '.universe-engine-runtime',
        {
          loading: 'Loading content and server status…',
          ready: 'Server status loaded. Refresh to check again.',
          stale: 'Server status is stale. Refresh to check availability.',
          error: 'Server status is unavailable. Refresh to try again.',
        }[state.runtime],
      );
      const { instances, links } = state.draft;
      state.graph.update({
        nodes: instances.map(({ instanceCode, x, y }) => {
          const member = state.members.get(instanceCode);
          return {
            code: instanceCode,
            label: member?.name || instanceCode,
            sublabel: member?.name && member.name !== instanceCode ? instanceCode : '',
            note: member?.served === false ? 'Not in the served content' : '',
            x,
            y,
            image: member?.previewUrl || '',
            status: state.runtime === 'ready' ? (member?.status ?? '') : '',
            muted: member?.served === false,
          };
        }),
        edges: links.map(({ sourceInstanceCode, targetInstanceCode, bidirectional }) => ({
          source: sourceInstanceCode,
          target: targetInstanceCode,
          bidirectional,
        })),
        selected: state.selected,
        empty: 'Add a world to start a new universe, or open one from the Library.',
        hint: canMutate ? 'Drag a world to a free cell. Arrow keys move the selected world.' : 'Read only.',
      });
      htmls(
        '.universe-engine-dirty-slot',
        dirty() ? html`<div class="universe-engine-dirty" role="status">Unsaved changes. Save to keep them.</div>` : '',
      );
      renderSide();
    };

    const renderSide = () => {
      const code = state.selected;
      if (!code) {
        htmls(
          '.universe-engine-selection',
          html`<div class="universe-engine-card">
            Select a world on the graph to see what serves it and its routes.
          </div>`,
        );
        return;
      }
      const member = state.members.get(code);
      const endpoints = state.endpoints.filter((e) => e.instanceCode === code);
      const others = state.draft.instances.filter(({ instanceCode }) => instanceCode !== code);
      htmls(
        '.universe-engine-selection',
        html`<div class="universe-engine-card">
            <div><b>${escapeHtml(member?.name || code)}</b></div>
            <div class="universe-engine-mono">${escapeHtml(code)}</div>
            ${
              member?.thumbnailUrl
                ? html`<div class="universe-engine-preview">
                    <span>Thumbnail unavailable</span>
                    <img
                      class="universe-engine-preview-image"
                      src="${escapeHtml(member.thumbnailUrl)}"
                      alt="${escapeHtml(member.name || code)} thumbnail"
                    />
                  </div>`
                : html`<p>No thumbnail set.</p>`
            }
            <p>${escapeHtml(member?.description || 'No description available.')}</p>
            <div><b>Maps</b>: ${(member?.mapCodes ?? []).map(escapeHtml).join(', ') || 'No map data available'}</div>
            ${
              !member || member.served === null
                ? html`<div>Content status is unknown.</div>`
                : html`<div>${member?.served ? 'In the served content' : 'Not in the served content'}</div>`
            }
          </div>
          <div class="universe-engine-card" aria-label="Serving endpoints">
            <div><b>Serving now</b></div>
            ${
              state.runtime !== 'ready'
                ? html`<div role="status">Availability is ${state.runtime === 'loading' ? 'loading' : 'unknown'}.</div>`
                : endpoints.length === 0
                  ? html`<div><span class="universe-engine-chip">Offline</span> No live server.</div>`
                  : endpoints
                      .map(
                        (e) =>
                          html`<div>
                            <span class="universe-engine-chip">${e.status === 'available' ? 'Online' : 'Closing'}</span>
                            <span class="universe-engine-mono">${escapeHtml(e.url)}</span>
                            <div>${e.ready} ready, ${e.draining} draining</div>
                            <div>${releaseLine(e.releases ?? [])}</div>
                          </div>`,
                      )
                      .join('')
            }
          </div>
          <div class="universe-engine-card">
            <div><b>Routes</b></div>
            ${
              others.length === 0
                ? html`<div>No other world.</div>`
                : html`<div class="universe-engine-route">
                    ${others
                      .map(
                        ({ instanceCode }, i) =>
                          html`<label for="universe-engine-route-${i}" class="universe-engine-mono"
                              >${escapeHtml(instanceCode)}</label
                            >
                            <select
                              id="universe-engine-route-${i}"
                              class="universe-engine-route-select"
                              data-target="${escapeHtml(instanceCode)}"
                              ${canMutate ? '' : 'disabled'}
                            >
                              ${ROUTES.map(
                                (route) =>
                                  html`<option
                                    value="${route.id}"
                                    ${routeOf(state.draft.links, code, instanceCode) === route.id ? 'selected' : ''}
                                  >
                                    ${route.label}
                                  </option>`,
                              ).join('')}
                            </select>`,
                      )
                      .join('')}
                  </div>`
            }
          </div>
          <div class="universe-engine-row">
            <button type="button" class="universe-engine-open-instance">
              <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Open in the instance editor
            </button>
            ${
              canMutate
                ? html`<button type="button" class="universe-engine-remove">
                    <i class="fa-solid fa-minus" aria-hidden="true"></i> Remove from the universe
                  </button>`
                : ''
            }
          </div>`,
      );
      const preview = s('.universe-engine-preview-image');
      if (preview) {
        preview.onload = () => {
          preview.previousElementSibling.hidden = true;
        };
        preview.onerror = () => {
          preview.hidden = true;
          preview.previousElementSibling.hidden = false;
        };
      }
      for (const select of document.querySelectorAll('.universe-engine-route-select'))
        select.onchange = () => {
          state.draft.links = withRoute(state.draft.links, code, select.dataset.target, select.value);
          renderGraph();
        };
      s('.universe-engine-open-instance').onclick = () => InstanceEngineCyberia.open({ instanceCode: code });
      if (s('.universe-engine-remove'))
        s('.universe-engine-remove').onclick = () => {
          state.draft.instances = state.draft.instances.filter(({ instanceCode }) => instanceCode !== code);
          state.draft.links = state.draft.links.filter(
            (l) => l.sourceInstanceCode !== code && l.targetInstanceCode !== code,
          );
          state.selected = null;
          renderGraph();
        };
    };

    /** Reads what serves each member and the content it has now. Read-only: the draft keeps its cells. */
    const refreshRuntime = async () => {
      const refresh = ++state.refresh;
      state.runtime = 'loading';
      renderGraph();
      const [viewResult, endpointsResult] = await Promise.allSettled([
        state.id ? CyberiaUniverseService.view({ code: state.draft.code }) : null,
        CyberiaServerRegistryService.endpoints(),
      ]);
      if (!state.active || refresh !== state.refresh) return;
      const view = viewResult.status === 'fulfilled' ? viewResult.value : null;
      const endpoints = endpointsResult.status === 'fulfilled' ? endpointsResult.value : null;
      state.runtime =
        endpoints?.status === 'success' && (!state.id || view?.status === 'success')
          ? 'ready'
          : state.members.size
            ? 'stale'
            : 'error';
      if (endpoints?.status === 'success') state.endpoints = endpoints.data;
      if (view?.status === 'success')
        state.members = new Map(view.data.instances.map((member) => [member.instanceCode, member]));
      // A member the stored universe does not hold yet shows its servers; its content shows once saved.
      for (const { instanceCode } of state.draft.instances)
        if (!state.members.has(instanceCode)) {
          const live = state.endpoints.filter((e) => e.instanceCode === instanceCode);
          const status = live.some((e) => e.status === 'available')
            ? 'available'
            : live.length
              ? 'draining'
              : 'offline';
          state.members.set(instanceCode, { instanceCode, name: instanceCode, served: null, status });
        }
      renderGraph();
    };

    const load = (universe) => {
      state.load++;
      state.id = universe?._id ?? null;
      state.revision = universe?.revision ?? 1;
      state.draft = universe
        ? {
            code: universe.code,
            name: universe.name ?? '',
            description: universe.description ?? '',
            instances: universe.instances.map(({ instanceCode, x, y }) => ({ instanceCode, x, y })),
            links: universe.links.map(({ sourceInstanceCode, targetInstanceCode, bidirectional }) => ({
              sourceInstanceCode,
              targetInstanceCode,
              bidirectional,
            })),
          }
        : blankDraft();
      state.saved = topologyKey(state.draft);
      state.members = new Map();
      state.selected = null;
      if (s(`.${idCode}`)) {
        s(`.${idCode}`).value = state.draft.code;
        s(`.${idCode}`).disabled = !!state.id;
      }
      if (s(`.${idName}`)) s(`.${idName}`).value = state.draft.name;
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = state.draft.description;
      setQueryParams({ universeCode: universe?.code ?? null }, { replace: true });
      state.crud?.refresh();
      renderGraph();
      state.graph?.fit();
      return refreshRuntime();
    };

    const loadByCode = async (code) => {
      if (!code || code === state.draft.code) return;
      const request = ++state.load;
      const { status, data } = await CyberiaUniverseService.get({ id: code });
      if (!state.active || request !== state.load) return;
      if (status !== 'success' || !data?._id) {
        NotificationManager.Push({ html: `No universe answers to the code "${escapeHtml(code)}"`, status: 'error' });
        return;
      }
      await load(data);
    };

    const save = async () => {
      const body = readForm();
      if (!CONTENT_CODE_PATTERN.test(body.code)) {
        NotificationManager.Push({
          html: 'The code takes letters, digits, dots, dashes and underscores.',
          status: 'error',
        });
        return;
      }
      if (state.id) body.revision = state.revision;
      const result = await EditorCrud.save(CyberiaUniverseService, { id: state.id, body });
      if (result.status === 'success') {
        await load(result.data);
        await ListPager.load(libraryId);
      } else if (/reload it before saving/.test(result.message ?? ''))
        NotificationManager.Push({
          html: 'Another editor saved this universe first. Your changes stay here: Reset loads the newer one.',
          status: 'warning',
        });
    };

    const addMember = () => {
      const code = s(`.${idAdd}`)?.value?.trim();
      if (!code) return;
      if (!CONTENT_CODE_PATTERN.test(code))
        return NotificationManager.Push({ html: `"${escapeHtml(code)}" is not an instance code.`, status: 'error' });
      if (state.draft.instances.some(({ instanceCode }) => instanceCode === code))
        return NotificationManager.Push({ html: `${escapeHtml(code)} is a member already.`, status: 'warning' });
      const codes = [...state.draft.instances.map(({ instanceCode }) => instanceCode), code];
      state.draft.instances = resolveGraphLayout(codes, state.draft.instances, 'instanceCode');
      s(`.${idAdd}`).value = '';
      state.selected = code;
      renderGraph();
      return refreshRuntime();
    };

    /** Places every member on the default cells: an explicit operation, saved only with Save. */
    const arrange = () => {
      const codes = state.draft.instances.map(({ instanceCode }) => instanceCode);
      state.draft.instances = resolveGraphLayout(codes, [], 'instanceCode');
      renderGraph();
      state.graph.fit();
    };

    const suggest = async () => {
      const q = s(`.${idAdd}`)?.value?.trim() ?? '';
      const result = await CyberiaInstanceService.get({
        limit: 20,
        filterModel: q ? { code: { filterType: 'text', type: 'contains', filter: q } } : undefined,
      });
      if (!state.active || !s(`.${idAdd}`) || q !== s(`.${idAdd}`).value.trim()) return;
      const codes = result?.status === 'success' ? result.data.data.map((instance) => instance.code) : [];
      htmls(
        '#universe-engine-instance-codes',
        codes.map((code) => html`<option value="${escapeHtml(code)}"></option>`).join(''),
      );
    };

    const onQuery = async (queryParams) => {
      if (!s('.universe-engine-container')) return;
      if (queryParams.universeCode) await loadByCode(queryParams.universeCode);
    };
    listenQueryParamsChange({ id: 'cyberia-universe-engine-query-listener', event: onQuery });

    setTimeout(async () => {
      if (!s('.universe-engine-container')) {
        state.active = false;
        unlistenQueryParamsChange('cyberia-universe-engine-query-listener', onQuery);
        ListPager.dispose(libraryId, state.pager);
        return;
      }
      state.unpin = EditorLayout.pin(s('.universe-engine-container'), 'universe-engine-stage');
      Tabs.bind(s('.universe-engine-tabs'));
      state.graph = GraphLayoutCyberia.bind(s('.universe-engine-graph-canvas'), {
        onDestroy: () => {
          state.active = false;
          state.refresh++;
          state.load++;
          state.crud?.destroy();
          state.unpin?.();
          ListPager.dispose(libraryId, state.pager);
          unlistenQueryParamsChange('cyberia-universe-engine-query-listener', onQuery);
        },
        editable: () => canMutate,
        onMove: (code, x, y) => {
          state.draft.instances = state.draft.instances.map((member) =>
            member.instanceCode === code ? { ...member, x, y } : member,
          );
          renderGraph();
        },
        onSelect: (code) => {
          state.selected = code;
          renderSide();
        },
      });
      state.crud = EditorCrud.bind(s('.universe-engine-crud'), () => ({
        subject: 'universe',
        id: state.id,
        name: state.draft.code,
        new: () => load(null),
        reset: async () => {
          const { status, data, message } = await CyberiaUniverseService.get({ id: state.draft.code });
          if (status === 'success' && data) await load(data);
          else NotificationManager.Push({ html: message, status: 'error' });
        },
        ...(canMutate && {
          save,
          delete: async () => {
            const result = await EditorCrud.remove(CyberiaUniverseService, {
              id: state.id,
              subject: 'universe',
              name: state.draft.code,
            });
            if (result?.status === 'success') {
              await load(null);
              await ListPager.load(libraryId);
            }
          },
        }),
      }));
      for (const id of [idName, idDescription]) if (s(`.${id}`)) s(`.${id}`).addEventListener('input', renderGraph);
      if (s('.universe-engine-add')) s('.universe-engine-add').onclick = addMember;
      if (s(`.${idAdd}`)) {
        s(`.${idAdd}`).addEventListener('input', suggest);
        s(`.${idAdd}`).addEventListener('keydown', (event) => event.key === 'Enter' && addMember());
      }
      if (s('.universe-engine-arrange')) s('.universe-engine-arrange').onclick = arrange;
      s('.universe-engine-refresh').onclick = refreshRuntime;
      await ListPager.load(libraryId);
      const code = getQueryParams().universeCode;
      if (code) await loadByCode(code);
      else await load(null);
    });

    const libraryHtml = await ListPager.instance({
      id: libraryId,
      limit: 10,
      unit: 'universes',
      fetch: async ({ page, limit }) => {
        const result = await CyberiaUniverseService.get({ page, limit, sort: 'code', order: 'asc' });
        return result?.status === 'success' ? result.data : null;
      },
      render: (rows) => {
        htmls(
          `.${libraryId}-rows`,
          rows.length === 0
            ? html`<div class="universe-engine-card">No universe yet.</div>`
            : rows
                .map(
                  (universe) =>
                    html`<div class="universe-engine-row universe-engine-card">
                      <span class="universe-engine-mono" style="flex: 1 1 8rem;">${escapeHtml(universe.code)}</span>
                      <span style="flex: 2 1 8rem;">${escapeHtml(universe.name || '')}</span>
                      <span class="universe-engine-chip">${universe.instances.length} worlds</span>
                      <button
                        type="button"
                        class="universe-engine-library-open"
                        data-code="${escapeHtml(universe.code)}"
                      >
                        <i class="fa-solid fa-upload" aria-hidden="true"></i> Open
                      </button>
                    </div>`,
                )
                .join(''),
        );
        for (const button of document.querySelectorAll('.universe-engine-library-open'))
          button.onclick = async () => {
            await loadByCode(button.dataset.code);
            Tabs.select(s('.universe-engine-tabs'), 'graph');
          };
      },
    });

    state.pager = ListPager.Tokens[libraryId];
    return html`<style>
        ${UniverseEngineCyberia.style}
      </style>
      <div class="in section-mp studio-editor universe-engine-container">
        ${EditorCrud.render({ id: 'universe-engine-crud', label: 'Universe' })}
        ${Tabs.render({
          id: 'universe-engine-tabs',
          label: 'Universe tools',
          selected: 'graph',
          tabs: [
            {
              id: 'graph',
              label: 'Graph',
              icon: 'fa-solid fa-circle-nodes',
              content: html`<div class="universe-engine-dirty-slot"></div>
                <div class="universe-engine-stage">
                  <div class="universe-engine-graph">
                    ${
                      canMutate
                        ? html`<div class="universe-engine-row" style="margin-bottom: 6px;">
                            <label for="${idAdd}">Add world</label>
                            <input
                              id="${idAdd}"
                              class="${idAdd}"
                              list="universe-engine-instance-codes"
                              placeholder="instance code"
                              autocomplete="off"
                            />
                            <datalist id="universe-engine-instance-codes"></datalist>
                            <button type="button" class="universe-engine-add">
                              <i class="fa-solid fa-plus" aria-hidden="true"></i> Add
                            </button>
                            <button
                              type="button"
                              class="universe-engine-arrange"
                              title="Place every world on the default cells"
                            >
                              <i class="fa-solid fa-table-cells" aria-hidden="true"></i> Arrange
                            </button>
                          </div>`
                        : ''
                    }
                    <div class="universe-engine-graph-canvas">
                      ${GraphLayoutCyberia.render({ id: 'universe-engine-graph-layout', label: 'Universe graph' })}
                    </div>
                  </div>
                  <div class="universe-engine-side">
                    <div class="universe-engine-row">
                      <button type="button" class="universe-engine-refresh">
                        <i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh server status
                      </button>
                    </div>
                    <div class="universe-engine-runtime" role="status"></div>
                    <div class="universe-engine-selection" aria-live="polite"></div>
                  </div>
                </div>`,
            },
            {
              id: 'universe',
              label: 'Universe',
              icon: 'fa-solid fa-circle-info',
              content: html`${await Input.instance({ id: idCode, label: html`Code`, containerClass: 'inl', type: 'text' })}
              ${await Input.instance({ id: idName, label: html`Name`, containerClass: 'inl', type: 'text' })}
              ${await Input.instance({
                id: idDescription,
                label: html`Description`,
                containerClass: 'inl',
                type: 'text',
              })}`,
            },
            {
              id: 'library',
              label: 'Library',
              icon: 'fa-solid fa-folder-open',
              content: html`<div class="${libraryId}-rows" style="display: grid; gap: 6px;"></div>
                ${libraryHtml}`,
            },
          ],
        })}
      </div>`;
  }
}

export { UniverseEngineCyberia };
