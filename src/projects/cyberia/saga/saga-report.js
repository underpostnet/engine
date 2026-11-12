/**
 * The completeness report of a saga: one deterministic row per dependency, each with its status, what
 * resolves it and the editor that owns it, and seven gates over the rows.
 *
 * The semantic input is a saga package as cyberia-content checks and compiles it: a workflow
 * candidate, or a saga of the served artifact. The runtime input is what the host stores: the catalog
 * bindings and renders, the maps and their placements, the quests, actions and dialogues, the skills,
 * the economies and markets, the map populations and item generations of the Procedural Engine, and
 * the saga memberships. Nothing here writes, and nothing guesses: a row names the stored document,
 * field, item, map or provider it read.
 *
 * Gates: `semantic` (the content rules), `narrative` (quest graph and dialogues), `gameplay` (items,
 * objectives, providers, skills), `visual` (bindings, renders, placements), `spatial` (providers and
 * maps), `economy` (terminals and policies) and `release` (source, artifact and import).
 *
 * @module src/projects/cyberia/saga/saga-report.js
 * @namespace CyberiaSagaReport
 */
import fs from 'node:fs';
import path from 'node:path';
import { DataBaseProviderService } from '../../../db/database-provider.js';
import {
  DIALOGUE_MOODS,
  ITEM_DIALOGUE_PREFIX,
  QUEST_STEPS_TYPES,
  SKILL_LOGIC_ID_VALUES,
  questTalkDialogueCode,
} from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { bindingProblems } from '../catalog/catalog-consistency.js';
import { contentSourceChanged, optionalContentArtifact, planContent } from '../content/content-artifact.js';
import { RELEASE_CONTENT } from '../content/release-content.js';
import { terminalDiagnostics } from '../economy/terminal-diagnostics.js';
import { loadSagaAssociations } from './saga-associations.js';
import { linksOf, planSync, syncModels } from './saga-sync.js';

/**
 * The gates of a report, in the order a moderator clears them.
 * @memberof CyberiaSagaReport
 */
export const REPORT_GATES = Object.freeze([
  { id: 'semantic', label: 'Semantic' },
  { id: 'narrative', label: 'Narrative' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'visual', label: 'Visual and physical' },
  { id: 'spatial', label: 'Spatial' },
  { id: 'economy', label: 'Economy' },
  { id: 'release', label: 'Release' },
]);

/**
 * The status of a row: what the report found for one dependency.
 * @memberof CyberiaSagaReport
 */
export const REPORT_STATUS = Object.freeze({
  foundation: 'Available in foundation',
  defined: 'Defined in this saga',
  shared: 'Reused from another saga',
  'missing-definition': 'Missing semantic definition',
  'missing-binding': 'Missing runtime item binding',
  'missing-object-layer': 'Missing Object Layer definition',
  'missing-render': 'Missing render or atlas',
  'missing-map': 'Missing map',
  'missing-placement': 'Missing entity placement',
  'missing-provider': 'Missing provider',
  'missing-dialogue': 'Missing dialogue',
  'missing-relationship': 'Missing quest/action relationship',
  'invalid-capability': 'Invalid runtime capability',
  invalid: 'Invalid content',
  pending: 'Not released yet',
  ready: 'Ready',
  published: 'Published',
});

/**
 * What resolves a row: `generate` (a generation or a population makes it), `decide` (a moderator
 * chooses), `broken` (a reference names nothing), `import` (build and import the content), `apply`
 * (apply the candidate), `sync` (synchronize the saga), `shared` (it exists in another source),
 * `excluded` (left out on purpose), or `none`.
 * @memberof CyberiaSagaReport
 */
export const REPORT_REMEDIES = Object.freeze([
  'generate',
  'decide',
  'broken',
  'import',
  'apply',
  'sync',
  'shared',
  'excluded',
  'none',
]);

const REPORT_MODELS = Object.freeze([
  'CyberiaMap',
  'CyberiaInstance',
  'CyberiaQuest',
  'CyberiaAction',
  'CyberiaDialogue',
  'CyberiaSkill',
  'CyberiaSaga',
  'CyberiaMarket',
  'CyberiaEntityTypeDefault',
  'CyberiaEconomy',
  'CyberiaEconomicItemPolicy',
  'CyberiaItemCatalog',
  'ObjectLayer',
  'AtlasSpriteSheet',
  'CyberiaProceduralJob',
  'CyberiaProceduralJobItem',
  'CyberiaProceduralPopulation',
]);

/**
 * The models a report reads.
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @returns {Object<string,import('mongoose').Model>}
 * @memberof CyberiaSagaReport
 */
export const reportModels = (options) => ({
  ...syncModels(options),
  ...Object.fromEntries(REPORT_MODELS.map((name) => [name, DataBaseProviderService.getModel(name, options)])),
});

const slugOf = (id) => id.slice(id.indexOf('.') + 1);
const kindOf = (id) => id.slice(0, id.indexOf('.'));
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The semantic input of a saga the served artifact holds: its record, its documents and its context.
 * @param {string} code
 * @returns {{code:string, source:{kind:'artifact'}, findings:[], compiled:Object, context:Object, package:Object}}
 * @throws {Error} 404 when the artifact holds no such saga.
 * @memberof CyberiaSagaReport
 */
export function artifactSemantic(code) {
  const artifact = optionalContentArtifact();
  if (!artifact?.manifest.sagas.includes(code))
    throw Object.assign(new Error(`The served content artifact holds no saga ${code}`), {
      status: 404,
      expected: true,
    });
  const { saga, instance, families } = artifact.saga(code);
  return {
    code,
    source: { kind: 'artifact', contentDigest: artifact.manifest.contentDigest },
    findings: [],
    compiled: { saga, instance, families },
    context: artifact.context,
    package: {
      saga: { code: saga.code, name: saga.name, description: saga.description },
      references: saga.references,
      definitions: saga.definitions,
    },
  };
}

/** The rows of a report, as each section adds them. */
function rowBook(exclusions) {
  const excluded = new Map(exclusions.map((exclusion) => [exclusion.key, exclusion]));
  const rows = [];
  const keys = new Set();
  const add = ({ key, level = 'ok', remedy = 'none', ...row }) => {
    let unique = key;
    for (let n = 2; keys.has(unique); n++) unique = `${key}#${n}`;
    keys.add(unique);
    const exclusion = level !== 'ok' && excluded.get(unique);
    rows.push({
      key: unique,
      ...row,
      level: exclusion ? 'excluded' : level,
      remedy: exclusion ? 'excluded' : remedy,
      ...(exclusion && { exclusion: { reason: exclusion.reason, actor: exclusion.actor, at: exclusion.at } }),
    });
  };
  return { rows, add };
}

/** The source of a definition: `foundation`, this saga (`defined`) or another saga (`shared`). */
const sourceStatus = (source, code) =>
  source === 'foundation' ? 'foundation' : source === code ? 'defined' : 'shared';

/**
 * The semantic gate: the findings of the content rules, and the source of each definition the saga
 * defines or names.
 */
function semanticRows({ add }, { code, findings, pkg, context }) {
  for (const finding of findings)
    add({
      key: `semantic:${finding.id}`,
      category: 'semantic',
      gate: 'semantic',
      subject: finding.id,
      status: /unknown definition/.test(finding.message) ? 'missing-definition' : 'invalid',
      level: 'error',
      remedy: /unknown definition/.test(finding.message) ? 'broken' : 'decide',
      message: finding.message,
      link: { view: 'package', path: finding.path ?? [] },
    });
  if (findings.length === 0)
    add({
      key: 'semantic:package',
      category: 'semantic',
      gate: 'semantic',
      subject: code,
      status: 'ready',
      message: 'The package passes the content rules',
      link: { view: 'package', path: [] },
    });
  for (const id of [...(pkg.definitions ?? []).map((definition) => definition.id), ...(pkg.references ?? [])]) {
    const source = context.sources?.[id] ?? (pkg.references?.includes(id) ? 'foundation' : code);
    add({
      key: `definition:${id}`,
      category: 'definitions',
      gate: 'semantic',
      subject: id,
      source,
      status: sourceStatus(source, code),
      message: source === code ? 'This saga defines it' : `Defined by ${source}`,
      link: { view: 'package', definition: id },
    });
  }
}

/** The procedural work that may give an item its render: its open populations and its generation jobs. */
async function proceduralWork(models, itemIds) {
  if (itemIds.length === 0) return { populations: new Map(), jobs: new Map() };
  const [populations, items] = await Promise.all([
    models.CyberiaProceduralPopulation.find(
      { 'targets.itemId': { $in: itemIds }, status: { $in: ['open', 'publishing'] } },
      { mapCode: 1, status: 1, 'targets.itemId': 1, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .lean(),
    models.CyberiaProceduralJobItem.find({ targetItemId: { $in: itemIds } }, { jobId: 1, targetItemId: 1, status: 1 })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const byItem = (entries, itemsOf) => {
    const out = new Map();
    for (const entry of entries) for (const itemId of itemsOf(entry)) if (!out.has(itemId)) out.set(itemId, entry);
    return out;
  };
  return {
    populations: byItem(populations, ({ targets }) =>
      targets.map(({ itemId }) => itemId).filter((id) => itemIds.includes(id)),
    ),
    jobs: byItem(items, ({ targetItemId }) => [targetItemId]),
  };
}

/** The visual gate of the items: every item the saga names runs on a bound, published, rendered definition. */
async function itemRows({ add }, { models, code, compiled, context, associations }) {
  const itemIds = compiled.saga.itemIds ?? [];
  const problems = await bindingProblems(models, itemIds);
  const unrendered = itemIds.filter((itemId) => ['unrendered', 'no-atlas'].includes(problems.get(itemId)?.problem));
  const work = await proceduralWork(models, unrendered);
  for (const itemId of itemIds) {
    const id = context.labels?.[itemId] ?? '';
    const source = context.sources?.[id] ?? 'foundation';
    const problem = problems.get(itemId)?.problem ?? '';
    const own = source === code;
    const population = work.populations.get(itemId);
    const job = work.jobs.get(itemId);
    const generation = population
      ? { view: 'procedural', populationId: String(population._id), itemId }
      : job
        ? { view: 'procedural', jobId: String(job.jobId) }
        : { view: 'procedural', action: 'generate-item', itemId };
    const base = {
      key: `item:${itemId}`,
      category: 'items',
      gate: 'visual',
      subject: itemId,
      source,
      sagas: associations.items[itemId] ?? [],
    };
    if (problem === 'unbound')
      add({
        ...base,
        status: 'missing-binding',
        level: 'error',
        remedy: 'import',
        message: `No definition is bound to ${itemId}: build and import the ${own ? 'saga' : `${source} content`}`,
        link: { view: 'release' },
      });
    else if (['missing', 'draft', 'archived'].includes(problem))
      add({
        ...base,
        status: 'missing-object-layer',
        level: 'error',
        remedy: 'decide',
        message: `${itemId} is bound to a ${problem === 'missing' ? 'definition this host does not store' : `${problem} definition`}`,
        link: { view: 'item-catalog', itemId },
      });
    else if (problem)
      add({
        ...base,
        status: 'missing-render',
        level: 'error',
        remedy: 'generate',
        message: population
          ? `Map population of ${population.mapCode} (${population.status}) works on its render`
          : job
            ? `Item generation job ${job.jobId} (${job.status}) works on its render`
            : problem === 'no-atlas'
              ? 'Its render has no atlas on this host: rebuild it'
              : 'It runs without a render: generate one or author it',
        link: generation,
      });
    else
      add({
        ...base,
        status: sourceStatus(source, code) === 'shared' ? 'shared' : 'ready',
        message: 'Bound, rendered and in its atlas',
      });
  }
}

/** The entities a map composes that its placements lack, by entity id. */
const placementGaps = (definition, map, entities) =>
  (definition?.composition ?? []).flatMap(({ entity, count }) => {
    const [primary] = entities[entity]?.objectLayerItemIds ?? [];
    const placed = (map?.entities ?? []).filter(
      ({ objectLayerItemIds = [] }) => primary && objectLayerItemIds.includes(primary),
    ).length;
    return placed >= count ? [] : [{ entity, primary, placed, count }];
  });

/** The visual and spatial gates of the maps: each is stored, composed as its definition says, and shared openly. */
async function mapRows({ add }, { models, code, compiled, context, artifact, associations, plan }) {
  const places = new Set(compiled.saga.placeCodes ?? []);
  const mapCodes = [
    ...new Set([
      ...(compiled.saga.mapCodes ?? []),
      ...places,
      ...plan.entries.filter(({ chosen }) => chosen).map(({ chosen }) => chosen.mapCode),
    ]),
  ];
  if (mapCodes.length === 0) return;
  const [maps, instances, populations] = await Promise.all([
    models.CyberiaMap.find(
      { code: { $in: mapCodes } },
      { code: 1, revision: 1, 'entities.objectLayerItemIds': 1, 'entities.entityType': 1 },
    ).lean(),
    models.CyberiaInstance.find({ cyberiaMapCodes: { $in: mapCodes } }, { code: 1, cyberiaMapCodes: 1 }).lean(),
    models.CyberiaProceduralPopulation.find(
      { mapCode: { $in: mapCodes } },
      { mapCode: 1, status: 1, 'publication.status': 1, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .lean(),
  ]);
  for (const mapCode of mapCodes) {
    const id = `map.${mapCode}`;
    const source = context.sources?.[id] ?? artifact?.context.sources[id] ?? '';
    const definition = context.definitions?.[id] ?? artifact?.context.definitions[id];
    const map = maps.find((stored) => stored.code === mapCode);
    const population = populations.find((entry) => entry.mapCode === mapCode);
    const worlds = instances
      .filter(({ cyberiaMapCodes }) => cyberiaMapCodes.includes(mapCode))
      .map((instance) => instance.code);
    const sagas = associations.maps[mapCode] ?? [];
    const place = places.has(mapCode);
    const base = {
      category: 'maps',
      subject: mapCode,
      source: source || 'placement',
      sagas,
      instances: worlds,
      ...(place && { place: true }),
    };
    const populate = population
      ? { view: 'procedural', populationId: String(population._id) }
      : { view: 'procedural', action: 'start-population', mapCode };
    if (!map) {
      add({
        ...base,
        key: `map:${mapCode}`,
        gate: 'spatial',
        status: 'missing-map',
        level: 'error',
        remedy: source === code || place ? 'import' : 'broken',
        message:
          source === code
            ? 'The map is not stored: build and import the saga'
            : place
              ? `A place of this saga that is not stored: import ${source === 'foundation' ? 'the foundation' : `saga ${source}`}`
              : 'The map is not stored on this host',
        link: { view: 'release' },
      });
      continue;
    }
    // The source that defines a place owns its composition: its gaps are rows of that source.
    const gaps = place ? [] : placementGaps(definition, map, { ...artifact?.context.entities, ...context.entities });
    for (const gap of gaps)
      add({
        ...base,
        key: `placement:${mapCode}:${gap.entity}`,
        gate: 'visual',
        status: 'missing-placement',
        level: gap.placed === 0 ? 'error' : 'warning',
        remedy: 'generate',
        field: 'composition',
        message: `${gap.entity} stands ${gap.placed} of ${gap.count} times`,
        link: populate,
      });
    const shared = sagas.some((saga) => saga !== code);
    add({
      ...base,
      key: `map:${mapCode}`,
      gate: 'spatial',
      status:
        population?.status === 'published' && gaps.length === 0 ? 'published' : shared || place ? 'shared' : 'ready',
      level: worlds.length === 0 ? 'warning' : 'ok',
      remedy: worlds.length === 0 ? 'decide' : 'none',
      message: [
        place ? `A place of this saga; ${source === 'foundation' ? 'the foundation' : source} owns it` : '',
        `Revision ${map.revision ?? 1}, ${plural(map.entities?.length ?? 0, 'entity')}`,
        worlds.length > 0 ? `in ${worlds.join(', ')}` : 'in no world: connect it in the Instance Studio',
        shared
          ? `shared with ${sagas.filter((saga) => saga !== code).join(', ')}: a change there reaches them too`
          : '',
        population
          ? `population ${population.status}${population.publication?.status ? ` (${population.publication.status})` : ''}`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      link: worlds.length === 0 ? { view: 'instance-engine', mapCode } : populate,
    });
  }
}

/** The spatial gate of the providers: one row per quest and action link, from the synchronization plan. */
function providerRows({ add }, { plan, code }) {
  const RESULT = {
    kept: { status: 'ready', level: 'ok', remedy: 'none' },
    assigned: { status: 'missing-provider', level: 'warning', remedy: 'sync' },
    choose: { status: 'missing-provider', level: 'error', remedy: 'decide' },
    conflict: { status: 'invalid', level: 'error', remedy: 'decide' },
    omitted: { status: 'missing-placement', level: 'error', remedy: 'generate' },
    failed: { status: 'missing-definition', level: 'error', remedy: 'import' },
  };
  for (const entry of plan.entries.filter(({ kind }) => kind === 'quest' || kind === 'action'))
    add({
      key: `provider:${entry.kind}:${entry.code}`,
      category: 'providers',
      gate: 'spatial',
      subject: `${entry.kind} ${entry.code}`,
      ...RESULT[entry.outcome],
      ...(entry.outcome === 'failed' &&
        /cannot run/.test(entry.detail) && { status: 'missing-binding', remedy: 'generate' }),
      message: entry.outcome === 'assigned' ? `Synchronize to place it: ${entry.detail}` : entry.detail,
      candidates: entry.candidates,
      conflicts: entry.conflicts,
      link: { view: 'integration', kind: entry.kind, code: entry.code, saga: code },
    });
}

/** The import status of the saga documents of one family, by natural code. */
const importStatus = (documents, family) =>
  new Map((documents[family] ?? []).map(({ doc, status }) => [Array.isArray(doc) ? doc[0].code : doc.code, status]));

/** The narrative and gameplay gates of the quests: imported, gated, completable and acquirable. */
async function questRows({ add }, { models, compiled, documents, plan }) {
  const quests = compiled.families.quests ?? [];
  if (quests.length === 0) return;
  const imported = importStatus(documents, 'quests');
  const stored = new Map(
    (await models.CyberiaQuest.find({ code: { $in: quests.map((quest) => quest.code) } }).lean()).map((quest) => [
      quest.code,
      quest,
    ]),
  );
  const objectives = (quest) =>
    quest.steps.flatMap((step, index) => step.objectives.map((objective) => ({ ...objective, step: index })));
  const of = (type) => [
    ...new Set(
      quests
        .flatMap((quest) => objectives(stored.get(quest.code) ?? quest))
        .filter((o) => o.type === type)
        .map((o) => o.itemId),
    ),
  ];
  const gateCodes = [
    ...new Set(
      quests.flatMap(({ prerequisiteCodes = [], unlocksQuestCodes = [] }) => [
        ...prerequisiteCodes,
        ...unlocksQuestCodes,
      ]),
    ),
  ];
  const [bots, placedBots, drops, shops, crafts, rewards, gates, actions] = await Promise.all([
    models.CyberiaEntityTypeDefault.distinct('liveItemIds', { entityType: 'bot', liveItemIds: { $in: of('kill') } }),
    models.CyberiaMap.distinct('entities.objectLayerItemIds', {
      entities: { $elemMatch: { entityType: 'bot', objectLayerItemIds: { $in: of('kill') } } },
    }),
    models.CyberiaEntityTypeDefault.distinct('dropItemIds', { dropItemIds: { $in: of('collect') } }),
    models.CyberiaAction.distinct('shopItems.itemId', { 'shopItems.itemId': { $in: of('collect') } }),
    models.CyberiaAction.distinct('craftRecipes.outputItems.itemId', {
      'craftRecipes.outputItems.itemId': { $in: of('collect') },
    }),
    models.CyberiaQuest.distinct('rewards.itemId', { 'rewards.itemId': { $in: of('collect') } }),
    models.CyberiaQuest.distinct('code', { code: { $in: gateCodes } }),
    models.CyberiaAction.find(
      { code: { $in: plan.links.filter(({ kind }) => kind === 'action').map((link) => link.code) } },
      { code: 1, questDialogueCodes: 1 },
    ).lean(),
  ]);
  const acquirable = new Set([
    ...drops,
    ...shops,
    ...crafts,
    ...rewards,
    ...(compiled.families.entityTypeDefaults ?? []).flatMap(({ dropItemIds = [] }) => dropItemIds),
    ...(compiled.families.actions ?? []).flatMap(({ shopItems = [], craftRecipes = [] }) => [
      ...shopItems.map(({ itemId }) => itemId),
      ...craftRecipes.flatMap(({ outputItems }) => outputItems.map(({ itemId }) => itemId)),
    ]),
  ]);
  const actionsBySkin = new Map();
  for (const link of plan.links.filter(({ kind }) => kind === 'action'))
    actionsBySkin.set(link.skin, [
      ...(actionsBySkin.get(link.skin) ?? []),
      actions.find((action) => action.code === link.code) ?? { code: link.code, missing: true },
    ]);
  for (const compiledQuest of quests) {
    const quest = stored.get(compiledQuest.code) ?? compiledQuest;
    const link = { view: 'action-engine', questCode: quest.code };
    const base = { category: 'quests', subject: quest.code, link };
    const status = imported.get(quest.code);
    if (status === 'absent')
      add({
        ...base,
        key: `quest:${quest.code}`,
        gate: 'gameplay',
        status: 'missing-definition',
        level: 'error',
        remedy: 'import',
        message: 'The quest is not stored: build and import the saga',
        link: { view: 'release' },
      });
    else if (status === 'differs')
      add({
        ...base,
        key: `quest:${quest.code}`,
        gate: 'gameplay',
        status: 'invalid',
        level: 'warning',
        remedy: 'decide',
        message: 'The stored quest differs from the package: an import keeps the stored one',
      });
    else
      add({
        ...base,
        key: `quest:${quest.code}`,
        gate: 'gameplay',
        status: 'ready',
        message: `${plural(quest.steps.length, 'step')}, ${plural(quest.rewards?.length ?? 0, 'reward')}`,
      });
    for (const code of [...(quest.prerequisiteCodes ?? []), ...(quest.unlocksQuestCodes ?? [])].filter(
      (gate) => !gates.includes(gate),
    ))
      add({
        ...base,
        key: `quest-gate:${quest.code}:${code}`,
        gate: 'narrative',
        status: 'missing-definition',
        level: 'error',
        remedy: 'import',
        field: 'prerequisiteCodes',
        message: `It names quest ${code}, which is not stored`,
      });
    for (const objective of objectives(quest)) {
      const field = `steps[${objective.step}].objectives`;
      const key = `objective:${quest.code}:${objective.type}:${objective.itemId}`;
      if (!QUEST_STEPS_TYPES.includes(objective.type))
        add({
          ...base,
          key,
          gate: 'gameplay',
          field,
          status: 'invalid-capability',
          level: 'error',
          remedy: 'decide',
          message: `The runtime has no ${objective.type} objective`,
        });
      else if (objective.type === 'kill' && !bots.includes(objective.itemId))
        add({
          ...base,
          key,
          gate: 'gameplay',
          field,
          status: 'missing-relationship',
          level: 'error',
          remedy: 'decide',
          message: `No bot default wears ${objective.itemId}: nothing to kill`,
          link: { view: 'entity-engine', itemId: objective.itemId },
        });
      else if (objective.type === 'kill' && !placedBots.includes(objective.itemId))
        add({
          ...base,
          key,
          gate: 'gameplay',
          field,
          status: 'missing-placement',
          level: 'warning',
          remedy: 'generate',
          message: `No map places a bot that wears ${objective.itemId}`,
        });
      else if (objective.type === 'collect' && !acquirable.has(objective.itemId))
        add({
          ...base,
          key,
          gate: 'gameplay',
          field,
          status: 'missing-relationship',
          level: 'warning',
          remedy: 'decide',
          message: `No drop, shop, recipe or quest reward gives ${objective.itemId}`,
        });
      else if (objective.type === 'talk') {
        const talkers = actionsBySkin.get(objective.itemId) ?? [];
        const mapped = talkers.find((action) =>
          (action.questDialogueCodes ?? []).some((entry) => entry.questCode === quest.code),
        );
        if (talkers.length === 0)
          add({
            ...base,
            key,
            gate: 'narrative',
            field,
            status: 'missing-relationship',
            level: 'error',
            remedy: 'decide',
            message: `No action of this saga stands behind ${objective.itemId}: no one answers the talk`,
          });
        else if (!mapped)
          add({
            ...base,
            key,
            gate: 'narrative',
            field,
            status: 'missing-dialogue',
            level: 'error',
            remedy: 'sync',
            message: `Action ${talkers.map(({ code }) => code).join(', ')} maps no talk dialogue to this quest: any finished dialogue with ${objective.itemId} completes it`,
            link: { view: 'action-engine', actionCode: talkers[0].code },
          });
        else
          add({
            ...base,
            key,
            gate: 'narrative',
            field,
            status: 'ready',
            message: `${objective.itemId} answers it on action ${mapped.code}`,
          });
      } else
        add({
          ...base,
          key,
          gate: 'gameplay',
          field,
          status: 'ready',
          message: `${objective.type} ${objective.itemId} × ${objective.quantity}`,
        });
    }
  }
}

/** The economy gate of the terminals: every buyback, burn and market item works in each world of the terminal. */
async function actionRows({ add }, { models, compiled, documents, options }) {
  const actions = compiled.families.actions ?? [];
  if (actions.length === 0) return;
  const imported = importStatus(documents, 'actions');
  const stored = new Map(
    (await models.CyberiaAction.find({ code: { $in: actions.map((action) => action.code) } }).lean()).map((action) => [
      action.code,
      action,
    ]),
  );
  for (const compiledAction of actions) {
    const action = stored.get(compiledAction.code) ?? compiledAction;
    const link = { view: 'action-engine', actionCode: action.code };
    const base = { category: 'actions', subject: action.code, link };
    const status = imported.get(action.code);
    const capabilities = [
      action.shopItems?.length && 'shop',
      action.craftRecipes?.length && 'craft',
      action.storageSlots && 'storage',
      action.buybackItems?.length && 'buyback',
      action.burnItems?.length && 'burn',
      action.market?.marketCode && 'market',
    ].filter(Boolean);
    if (status === 'absent')
      add({
        ...base,
        key: `action:${action.code}`,
        gate: 'gameplay',
        status: 'missing-definition',
        level: 'error',
        remedy: 'import',
        message: 'The action is not stored: build and import the saga',
        link: { view: 'release' },
      });
    else if (status === 'differs')
      add({
        ...base,
        key: `action:${action.code}`,
        gate: 'gameplay',
        status: 'invalid',
        level: 'warning',
        remedy: 'decide',
        message: 'The stored action differs from the package: an import keeps the stored one',
      });
    else
      add({
        ...base,
        key: `action:${action.code}`,
        gate: 'gameplay',
        status: 'ready',
        message: capabilities.length > 0 ? `Offers ${capabilities.join(', ')}` : 'Offers its quests only',
      });
    if (
      !['buyback', 'burn', 'market'].some((capability) => capabilities.includes(capability)) ||
      !stored.has(action.code)
    )
      continue;
    if (action.market?.marketCode && !(await models.CyberiaMarket.exists({ code: action.market.marketCode })))
      add({
        ...base,
        key: `market:${action.code}`,
        gate: 'economy',
        status: 'invalid-capability',
        level: 'error',
        remedy: 'decide',
        field: 'market.marketCode',
        message: `Market profile ${action.market.marketCode} is not stored`,
        link: { view: 'market-engine', marketCode: action.market.marketCode },
      });
    if (!action.sourceMapCode) {
      add({
        ...base,
        key: `terminal:${action.code}`,
        gate: 'economy',
        status: 'missing-provider',
        level: 'warning',
        remedy: 'sync',
        message: 'The terminal stands on no map: its economy runs nowhere yet',
      });
      continue;
    }
    const diagnostics = await terminalDiagnostics(action, options);
    for (const defect of diagnostics.defects)
      add({
        ...base,
        key: `terminal:${action.code}`,
        gate: 'economy',
        status: 'invalid-capability',
        level: 'warning',
        remedy: 'decide',
        message: defect,
        link: { view: 'instance-engine', mapCode: action.sourceMapCode },
      });
    for (const world of diagnostics.worlds) {
      if (world.economy.defect)
        add({
          ...base,
          key: `economy:${action.code}:${world.instanceCode}`,
          gate: 'economy',
          status: 'invalid-capability',
          level: 'error',
          remedy: 'decide',
          message: `World ${world.instanceCode}: ${world.economy.defect}`,
          link: { view: 'economy-engine', economyCode: world.economy.code },
        });
      for (const [capability, { items = [], warning }] of Object.entries(world.capabilities ?? {})) {
        for (const item of items.filter(({ usable }) => !usable))
          add({
            ...base,
            key: `economy:${action.code}:${world.instanceCode}:${capability}:${item.itemId}`,
            gate: 'economy',
            status: 'invalid-capability',
            level: 'error',
            remedy: 'decide',
            field: `${capability}Items`,
            message: `World ${world.instanceCode}, ${capability} of ${item.itemId}: ${item.reason}`,
            link: { view: 'economy-engine', economyCode: world.economy.code },
          });
        if (warning)
          add({
            ...base,
            key: `economy:${action.code}:${world.instanceCode}:${capability}`,
            gate: 'economy',
            status: 'invalid-capability',
            level: 'warning',
            remedy: 'decide',
            message: `World ${world.instanceCode}: ${warning}`,
            link: { view: 'economy-engine', economyCode: world.economy.code },
          });
      }
    }
  }
}

/** The narrative gate of the dialogues: every group an action shows, or the saga compiles, has ordered lines. */
async function dialogueRows({ add }, { models, code, compiled, plan, associations }) {
  const expected = new Map();
  const expect = (dialogueCode, actionCode = '') =>
    expected.set(dialogueCode, expected.get(dialogueCode) || actionCode);
  for (const { code: dialogueCode } of compiled.families.dialogues ?? []) expect(dialogueCode);
  for (const entry of plan.entries.filter(({ kind }) => kind === 'dialogue')) expect(entry.code, entry.actionCode);
  if (expected.size === 0) return;
  const lines = Map.groupBy(
    await models.CyberiaDialogue.find(
      { code: { $in: [...expected.keys()] } },
      { code: 1, order: 1, speaker: 1, text: 1, mood: 1 },
    ).lean(),
    ({ code: dialogueCode }) => dialogueCode,
  );
  const compiledCodes = new Set((compiled.families.dialogues ?? []).map(({ code: dialogueCode }) => dialogueCode));
  for (const [dialogueCode, actionCode] of expected) {
    const group = (lines.get(dialogueCode) ?? []).sort((a, b) => a.order - b.order);
    const sagas = associations.dialogues[dialogueCode] ?? [];
    const base = {
      key: `dialogue:${dialogueCode}`,
      category: 'dialogues',
      gate: 'narrative',
      subject: dialogueCode,
      sagas,
      link: { view: 'action-engine', dialogueCode, ...(actionCode && { actionCode }) },
    };
    if (group.length === 0) {
      add({
        ...base,
        status: 'missing-dialogue',
        level: 'error',
        remedy: compiledCodes.has(dialogueCode) ? 'import' : 'decide',
        message: compiledCodes.has(dialogueCode)
          ? 'The saga compiles it, but it is not stored: import the saga'
          : `Action ${actionCode} shows it, but it has no line`,
      });
      continue;
    }
    const problems = [
      group.some((line, index) => line.order !== index) && 'its orders repeat or skip',
      group.some((line) => !String(line.text ?? '').trim()) && 'a line has no text',
      group.some((line) => !String(line.speaker ?? '').trim()) && 'a line has no speaker',
      group.some((line) => !DIALOGUE_MOODS.includes(line.mood)) && `a mood is not one of ${DIALOGUE_MOODS.join(', ')}`,
    ].filter(Boolean);
    const shared = sagas.some((saga) => saga !== code);
    add({
      ...base,
      status: problems.length > 0 ? 'invalid' : shared ? 'shared' : 'ready',
      level: problems.some((problem) => problem === 'a line has no text')
        ? 'error'
        : problems.length > 0
          ? 'warning'
          : 'ok',
      remedy: problems.length > 0 ? 'decide' : 'none',
      message:
        problems.length > 0
          ? `${plural(group.length, 'line')}: ${problems.join(', ')}`
          : `${plural(group.length, 'line')}${dialogueCode.startsWith(ITEM_DIALOGUE_PREFIX) ? ', the greeting of its skin' : ''}${shared ? `, shared with ${sagas.filter((saga) => saga !== code).join(', ')}` : ''}`,
    });
  }
}

/** The gameplay gate of the skills: each runs a runtime handler on runnable items. */
async function skillRows({ add }, { models, compiled, documents, plan }) {
  const triggers = (compiled.families.skills ?? []).map(({ triggerItemId }) => triggerItemId);
  const stored = await models.CyberiaSkill.find(
    { triggerItemId: { $in: triggers } },
    { triggerItemId: 1, logicEventIds: 1 },
  ).lean();
  const imported = new Map((documents.skills ?? []).map(({ doc, status }) => [doc.triggerItemId, status]));
  for (const entry of plan.entries.filter(({ kind }) => kind === 'skill')) {
    const skill = stored.find(({ triggerItemId }) => triggerItemId === entry.code);
    const unknown = (skill?.logicEventIds ?? []).filter((id) => !SKILL_LOGIC_ID_VALUES.includes(id));
    add({
      key: `skill:${entry.code}`,
      category: 'skills',
      gate: 'gameplay',
      subject: entry.code,
      status: unknown.length > 0 ? 'invalid-capability' : entry.outcome === 'failed' ? 'missing-binding' : 'ready',
      level: unknown.length > 0 || entry.outcome === 'failed' ? 'error' : 'ok',
      remedy: unknown.length > 0 ? 'decide' : entry.outcome === 'failed' ? 'generate' : 'none',
      message: unknown.length > 0 ? `The runtime has no handler ${unknown.join(', ')}` : entry.detail,
      link: { view: 'action-engine', skill: entry.code },
    });
  }
  for (const trigger of triggers.filter((id) => imported.get(id) === 'absent'))
    add({
      key: `skill:${trigger}`,
      category: 'skills',
      gate: 'gameplay',
      subject: trigger,
      status: 'missing-definition',
      level: 'error',
      remedy: 'import',
      message: 'The skill is not stored: build and import the saga',
      link: { view: 'release' },
    });
}

/** The CID the release carries for an item: the snapshot of a release instance, or global content. */
function releaseCid(artifact, itemId) {
  for (const { instanceCode } of RELEASE_CONTENT.instances) {
    const file = `instances/${instanceCode}/object-layers/${itemId}.json`;
    if (!artifact.manifest.files[file]) continue;
    try {
      return JSON.parse(
        fs.readFileSync(path.join(artifact.instanceDir(instanceCode), 'object-layers', `${itemId}.json`), 'utf8'),
      ).cid;
    } catch {
      return '';
    }
  }
  return '';
}

/** The release gate: the candidate is applied, committed, built, imported, and its dependencies travel with the release. */
async function releaseRows({ add }, { models, code, semantic, compiled, context, documents, artifact, applied }) {
  const base = { category: 'release', gate: 'release', subject: code };
  const command = (text) => ({ view: 'release', command: text });
  if (semantic.source.kind === 'candidate') {
    const isApplied = applied?.digest === semantic.source.digest;
    add({
      ...base,
      key: 'release:applied',
      status: isApplied ? 'ready' : 'pending',
      level: isApplied ? 'ok' : 'error',
      remedy: isApplied ? 'none' : 'apply',
      message: isApplied
        ? `Revision ${applied.revision} is in ${applied.file}`
        : 'The candidate is a workflow draft: apply it to the content source',
      link: { view: 'package' },
    });
    if (isApplied && contentSourceChanged(applied.file))
      add({
        ...base,
        key: 'release:committed',
        status: 'pending',
        level: 'error',
        remedy: 'import',
        message: `${applied.file} holds changes no commit has: commit them in cyberia-content`,
        link: command(`git -C cyberia-content add ${applied.file} && git -C cyberia-content commit`),
      });
  }
  const built = artifact?.manifest.sagas.includes(code) ? artifact.saga(code).saga : null;
  const sameDefinitions =
    built &&
    JSON.stringify(built.definitions) === JSON.stringify(compiled.saga.definitions) &&
    JSON.stringify(built.references) === JSON.stringify(compiled.saga.references);
  add({
    ...base,
    key: 'release:built',
    status: sameDefinitions ? 'ready' : 'pending',
    level: sameDefinitions ? 'ok' : 'error',
    remedy: sameDefinitions ? 'none' : 'import',
    message: sameDefinitions
      ? `The served artifact ${artifact.manifest.contentVersion} holds this package`
      : built
        ? 'The served artifact holds another version of the saga: build cyberia-content'
        : 'The served artifact holds no such saga: build cyberia-content',
    link: command('node bin/cyberia-content.js build'),
  });
  const pending = {};
  for (const [family, entries] of Object.entries(documents))
    for (const { status } of entries.filter((entry) => entry.status !== 'in-sync'))
      pending[`${family} ${status}`] = (pending[`${family} ${status}`] ?? 0) + 1;
  const synced = Object.keys(pending).length === 0;
  const record = await models.CyberiaSaga.findOne({ code }, { definitions: 1, references: 1 }).lean();
  const recordSynced = record && JSON.stringify(record.definitions) === JSON.stringify(compiled.saga.definitions);
  add({
    ...base,
    key: 'release:imported',
    status: synced && recordSynced ? 'ready' : 'pending',
    level: synced && recordSynced ? 'ok' : 'error',
    remedy: synced && recordSynced ? 'none' : 'import',
    message:
      synced && recordSynced
        ? 'Every document of the saga is stored as the package compiles it'
        : `Not imported as the package compiles it: ${[...(!recordSynced ? ['saga record'] : []), ...Object.entries(pending).map(([entry, count]) => `${count} ${entry}`)].join(', ')}`,
    link: command(`node bin/cyberia content import --saga ${code}`),
  });
  const released = RELEASE_CONTENT.sagas.includes(code);
  add({
    ...base,
    key: 'release:set',
    status: released ? 'ready' : 'pending',
    level: released ? 'ok' : 'warning',
    remedy: released ? 'none' : 'decide',
    message: released ? 'The release content carries this saga' : 'The release content does not name this saga yet',
  });
  const referenced = new Set(
    (compiled.saga.references ?? [])
      .map((id) => context.sources?.[id])
      .filter((source) => source && source !== 'foundation' && source !== code),
  );
  for (const source of [...referenced].filter((saga) => !RELEASE_CONTENT.sagas.includes(saga)))
    add({
      ...base,
      key: `release:depends:${source}`,
      status: 'pending',
      level: 'error',
      remedy: 'decide',
      message: `It names definitions of saga ${source}, which the release does not carry`,
    });
  if (!artifact) return;
  const catalog = await models.CyberiaItemCatalog.resolve(compiled.saga.itemIds ?? []);
  for (const itemId of compiled.saga.itemIds ?? []) {
    const cid = catalog.get(itemId);
    if (!cid || artifact.manifest.global.includes(cid) || releaseCid(artifact, itemId) === cid) continue;
    add({
      ...base,
      key: `release:item:${itemId}`,
      subject: itemId,
      status: 'pending',
      level: 'warning',
      remedy: 'import',
      message: `The release carries no copy of ${cid}: export the world or the global content that keeps it`,
      link: { view: 'item-catalog', itemId },
    });
  }
}

/** The status of each gate over its rows: `blocked` by an error, `warning`, or `pass`. */
const gatesOf = (rows) =>
  REPORT_GATES.map(({ id, label }) => {
    const own = rows.filter((row) => row.gate === id);
    const count = (level) => own.filter((row) => row.level === level).length;
    const errors = count('error');
    const warnings = count('warning');
    return {
      id,
      label,
      status: errors > 0 ? 'blocked' : warnings > 0 ? 'warning' : 'pass',
      errors,
      warnings,
      excluded: count('excluded'),
      rows: own.length,
    };
  });

/** A graph under construction: each node once, each edge once, a node for each id an edge names. */
function graphBook({ context, code, compiled }) {
  const nodes = new Map();
  const edges = new Map();
  const ownMaps = new Set(compiled?.saga.mapCodes ?? []);
  const definitionNode = (id) => {
    const kind = kindOf(id);
    const definition = context.definitions?.[id];
    const source = context.sources?.[id] ?? 'foundation';
    const link =
      kind === 'quest'
        ? { view: 'action-engine', questCode: slugOf(id) }
        : kind === 'action'
          ? { view: 'action-engine', actionCode: slugOf(id) }
          : kind === 'map'
            ? { view: 'instance-engine', mapCode: slugOf(id) }
            : source === code
              ? { view: 'package', definition: id }
              : null;
    return { id, kind, label: definition?.name || slugOf(id), status: sourceStatus(source, code), source, link };
  };
  const node = (id, fields = {}) => {
    if (!nodes.has(id)) nodes.set(id, id.includes(':') ? { id, ...fields } : definitionNode(id));
    return id;
  };
  return {
    node,
    edge(from, to, type, fields = {}) {
      if (!from || !to) return;
      edges.set(`${from}|${to}|${type}`, { from: node(from), to: node(to), type, ...fields });
    },
    sagaNode: () => node(`saga:${code}`, { kind: 'saga', label: compiled?.saga.name || code, status: 'defined' }),
    isOwnMap: (mapCode) => ownMaps.has(mapCode),
    graph: () => ({ nodes: [...nodes.values()], edges: [...edges.values()] }),
  };
}

/**
 * The narrative graph of a saga: the quests it starts with, who offers each quest and action, the
 * quests each one unlocks, what each objective asks for, what each quest gives, and who speaks.
 */
function narrativeGraph(input) {
  const { pkg, context } = input;
  const book = graphBook(input);
  const saga = book.sagaNode();
  const dialogueNode = (dialogueCode, label) =>
    book.node(`dialogue:${dialogueCode}`, {
      kind: 'dialogue',
      label,
      status: 'defined',
      link: { view: 'action-engine', dialogueCode },
    });
  for (const definition of pkg.definitions ?? []) {
    const { id } = definition;
    const kind = kindOf(id);
    if (kind === 'quest') {
      if ((definition.prerequisites ?? []).length === 0) book.edge(saga, id, 'starts');
      book.edge(definition.provider, id, 'offers');
      for (const prerequisite of definition.prerequisites ?? []) book.edge(prerequisite, id, 'unlocks');
      for (const next of definition.unlocks ?? []) book.edge(id, next, 'unlocks');
      for (const { objectives = [] } of definition.steps ?? [])
        for (const objective of objectives) book.edge(id, objective.target, objective.type);
      for (const reward of definition.rewards ?? []) book.edge(id, reward.item, 'reward');
      if ((definition.talk ?? []).length > 0)
        book.edge(
          id,
          dialogueNode(questTalkDialogueCode(slugOf(id)), `Talk of ${definition.name || slugOf(id)}`),
          'talk',
        );
    }
    if (kind === 'action') book.edge(definition.provider, id, 'provides');
    if (kind === 'character' && (definition.greeting ?? []).length > 0) {
      const skin = (definition.loadout ?? []).find((ref) => kindOf(ref) === 'skin');
      if (skin)
        book.edge(
          id,
          dialogueNode(`${ITEM_DIALOGUE_PREFIX}${slugOf(skin)}`, `Greeting of ${definition.name}`),
          'greets',
        );
    }
  }
  return book.graph();
}

/**
 * The content and world graph of a saga: the maps it owns and the places it plays on, what each map
 * composes, the items each entity carries, the other sagas that share a map, and the worlds that
 * hold each map. The portal graph of a world stays in the Instance Studio.
 */
function compositionGraph(input, { associations, instances }) {
  const { compiled, context, code } = input;
  const book = graphBook(input);
  const saga = book.sagaNode();
  const items = new Set(Object.values(context.labels ?? {}));
  for (const mapCode of [...(compiled?.saga.mapCodes ?? []), ...(compiled?.saga.placeCodes ?? [])]) {
    const map = `map.${mapCode}`;
    book.edge(saga, map, book.isOwnMap(mapCode) ? 'owns' : 'place');
    for (const { entity, count } of context.definitions?.[map]?.composition ?? []) {
      book.edge(map, entity, 'composes', { count });
      for (const { field, id } of context.references?.[entity] ?? []) if (items.has(id)) book.edge(entity, id, field);
    }
    for (const other of associations.maps[mapCode] ?? [])
      if (other !== code)
        book.edge(
          book.node(`saga:${other}`, { kind: 'saga', label: other, status: 'shared', link: null }),
          map,
          'shares',
        );
    for (const instance of instances.filter(({ cyberiaMapCodes }) => cyberiaMapCodes.includes(mapCode)))
      book.edge(
        map,
        book.node(`instance:${instance.code}`, {
          kind: 'instance',
          label: instance.code,
          status: 'world',
          link: { view: 'instance-engine', mapCode },
        }),
        'in world',
      );
  }
  return book.graph();
}

/**
 * The completeness report of a saga.
 * @param {Object} params
 * @param {import('../../../api/types.js').ApiRouterContext} params.options
 * @param {{code:string, source:Object, findings:Object[], compiled:Object, context:Object, package:Object}} params.semantic -
 *   The checked package: a workflow candidate, or {@link artifactSemantic}.
 * @param {Object[]} [params.exclusions] - The rows a moderator leaves out, by key, with the reason.
 * @param {Object|null} [params.applied] - The application of the workflow that owns the candidate.
 * @param {Object[]} [params.selections] - Provider choices the synchronization plan takes.
 * @returns {Promise<Object>} `{ saga, source, statuses, generatedAt, gates, counts, rows, graphs, sync }`:
 *   `statuses` names each row status; `graphs` holds the `narrative` and the `composition` graph, each
 *   `{ nodes, edges }`.
 * @memberof CyberiaSagaReport
 */
export async function buildReport({ options, semantic, exclusions = [], applied = null, selections = [] }) {
  const models = reportModels(options);
  const { code, compiled, context, package: pkg } = semantic;
  const book = rowBook(exclusions);
  semanticRows(book, { code, findings: semantic.findings, pkg, context });
  const countsOf = (rows) =>
    Object.fromEntries(
      ['error', 'warning', 'ok', 'excluded'].map((level) => [level, rows.filter((row) => row.level === level).length]),
    );
  if (!compiled)
    return {
      saga: pkg.saga,
      source: semantic.source,
      statuses: REPORT_STATUS,
      generatedAt: new Date(),
      gates: gatesOf(book.rows),
      counts: countsOf(book.rows),
      rows: book.rows,
      graphs: {
        narrative: narrativeGraph({ pkg, context, code, compiled: null }),
        composition: compositionGraph(
          { pkg, context, code, compiled: null },
          { associations: { maps: {} }, instances: [] },
        ),
      },
      sync: null,
    };
  const artifact = optionalContentArtifact();
  const [associations, plan, documents] = await Promise.all([
    loadSagaAssociations(options, artifact?.context ?? { definitions: {}, sources: {}, labels: {} }),
    planSync({ models, saga: compiled.saga, selections }),
    planContent({ families: compiled.families, models }).then(({ documents: planned }) => planned),
  ]);
  plan.links = linksOf(compiled.saga);
  const input = {
    models,
    code,
    semantic,
    compiled,
    context,
    artifact,
    associations,
    plan,
    documents,
    options,
    applied,
  };
  await itemRows(book, input);
  await mapRows(book, input);
  providerRows(book, input);
  await questRows(book, input);
  await actionRows(book, input);
  await dialogueRows(book, input);
  await skillRows(book, input);
  await releaseRows(book, input);
  const counts = countsOf(book.rows);
  const graphInput = { pkg, context: { ...artifact?.context, ...context }, code, compiled };
  return {
    saga: { code, name: compiled.saga.name, description: compiled.saga.description },
    source: semantic.source,
    statuses: REPORT_STATUS,
    generatedAt: new Date(),
    gates: gatesOf(book.rows),
    counts,
    rows: book.rows,
    graphs: {
      narrative: narrativeGraph(graphInput),
      composition: compositionGraph(graphInput, {
        associations,
        instances: await models.CyberiaInstance.find(
          { cyberiaMapCodes: { $in: [...compiled.saga.mapCodes, ...(compiled.saga.placeCodes ?? [])] } },
          { code: 1, cyberiaMapCodes: 1 },
        ).lean(),
      }),
    },
    sync: { entries: plan.entries, reviewed: plan.reviewed },
  };
}
