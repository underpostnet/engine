/**
 * The migration of the generation specs that jobs stored before the global palettes. Such a spec
 * froze each Genesis Template with no palette role on its roles, and each palette under a
 * `<itemType>.<slug>` id with its colors by template role. The migration gives each frozen template
 * role the palette role its content template takes, gives each frozen palette its global id and its
 * colors by palette role, and renames the palette ids the spec and its items name. The colors, the
 * seeds, the fingerprint and the run stay, so an item of the job generates as it did.
 *
 * A job whose items still generate waits for a later run; a spec the content cannot map stays as it
 * is. Both are reported. The items change before the spec, and only the spec shows a job as moved,
 * so a run that stops halfway is safe to run again. Running it again changes nothing.
 *
 * @module src/projects/cyberia/procedural/jobs/migration.js
 * @namespace CyberiaProceduralJobMigration
 */
import { GENERATOR_ROLES } from '../templates.js';

/** The item statuses of a job that still generates. */
const GENERATING = Object.freeze(['queued', 'running', 'generated']);

/** The global id of a palette id: `<itemType>.<slug>` is `<slug>`. */
const globalId = (id) => (id ? id.slice(id.indexOf('.') + 1) : id);

/** Whether a spec froze its templates or its palettes before the global palettes. */
const outdated = ({ templates = [], palettes = [] }) =>
  templates.some(({ roles }) => Object.values(roles).some(({ palette }) => !palette)) ||
  palettes.some(({ id }) => id.includes('.'));

/**
 * A spec stored before the global palettes in the current form, and the palette ids it renames. Pure.
 * @param {Object} spec - A stored spec.
 * @param {Object[]} contentTemplates - The Genesis Templates of the content, as it holds them.
 * @returns {{spec:Object,palettes:Array<{from:string,to:string}>,problems:string[]}}
 * @memberof CyberiaProceduralJobMigration
 */
export function migratedSpec(spec, contentTemplates) {
  const problems = [];
  const templates = spec.templates.map((template) => {
    const current = contentTemplates.find(({ id }) => id === template.id);
    const roles = Object.fromEntries(
      Object.entries(template.roles).map(([role, body]) => {
        const palette = body.palette ?? current?.roles?.[role]?.palette;
        if (!palette) problems.push(`Genesis Template ${template.id}: the content gives role ${role} no palette role`);
        return [role, { ...body, palette }];
      }),
    );
    return { ...template, roles };
  });
  const takes = new Map();
  for (const { id, roles } of templates)
    for (const [role, { palette }] of Object.entries(roles)) {
      if (takes.has(role) && takes.get(role) !== palette)
        problems.push(`Genesis Template ${id}: role ${role} takes ${palette}, another template ${takes.get(role)}`);
      takes.set(role, palette);
    }
  const roleOf = (role) => (GENERATOR_ROLES.includes(role) ? role : takes.get(role));
  const renames = new Map();
  const palettes = spec.palettes.map(({ itemType, id, roles, constraints, ...rest }) => {
    renames.set(id, globalId(id));
    for (const role of Object.keys(roles))
      if (!roleOf(role)) problems.push(`Palette ${id}: no template of the job maps role ${role}`);
    return {
      ...rest,
      id: globalId(id),
      roles: Object.fromEntries(Object.entries(roles).map(([role, color]) => [roleOf(role), color])),
      constraints: { ...constraints, contrastRoles: constraints.contrastRoles.map(roleOf) },
    };
  });
  const choice = ({ paletteId, ...rest }) => ({
    ...rest,
    ...(paletteId !== undefined && { paletteId: globalId(paletteId) }),
  });
  const palette = spec.palette.items
    ? { ...spec.palette, items: spec.palette.items.map(choice) }
    : choice(spec.palette);
  return {
    spec: {
      ...spec,
      templates,
      palettes,
      palette,
      candidates: spec.candidates.map((candidate) => ({ ...candidate, paletteId: globalId(candidate.paletteId) })),
    },
    palettes: [...renames].map(([from, to]) => ({ from, to })),
    problems,
  };
}

/**
 * Moves every job spec stored before the global palettes to the current form, or reports what a move
 * would do with `apply` false.
 * @param {Object} models - The Procedural Engine models.
 * @param {Object} params
 * @param {boolean} params.apply - Whether to write.
 * @param {Object[]} params.templates - The Genesis Templates of the content, as it holds them.
 * @returns {Promise<{migrated:Object[],generating:Object[],unresolved:Object[]}>}
 * @memberof CyberiaProceduralJobMigration
 */
export async function migrateJobs(models, { apply, templates }) {
  const { CyberiaProceduralJob: Job, CyberiaProceduralJobItem: Item } = models;
  const result = { migrated: [], generating: [], unresolved: [] };
  for (const job of (await Job.find({}, { spec: 1 }).sort({ createdAt: 1 }).lean()).filter(({ spec }) =>
    outdated(spec),
  )) {
    const id = String(job._id);
    if (await Item.exists({ jobId: job._id, status: { $in: GENERATING } })) {
      result.generating.push({ id, recovery: 'Its items still generate: run the migration again once they settle' });
      continue;
    }
    const { spec, palettes, problems } = migratedSpec(job.spec, templates);
    if (problems.length > 0) {
      result.unresolved.push({ id, problems });
      continue;
    }
    if (apply) {
      for (const { from, to } of palettes)
        if (from !== to)
          await Item.collection.updateMany({ jobId: job._id, paletteId: from }, { $set: { paletteId: to } });
      await Job.collection.updateOne({ _id: job._id }, { $set: { spec } });
    }
    result.migrated.push({ id, palettes: palettes.filter(({ from, to }) => from !== to) });
  }
  return result;
}
