/**
 * The migration of the skill documents stored before skill ids. Each skill without an id takes the
 * id of a free compiled skill of the same trigger item and handler, else the id its trigger item and
 * its name give, so no two items share an id by chance. The compact `logicEventIds` list goes. A
 * skill that holds an id keeps it, so a run that stops halfway is safe to run again, and running it
 * again changes nothing. One skill id that names two definitions is a conflict the report names.
 *
 * @module src/projects/cyberia/content/skill-migration.js
 * @namespace CyberiaSkillMigration
 */
import { skillIdOf } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { skillConflicts } from '../../../api/cyberia-instance/cyberia-instance-items.js';

/**
 * A stored skill document in the current form, or null when it is current. Pure.
 * @param {{triggerItemId:string, logicEventIds?:string[], skills?:Object[]}} doc - A stored document.
 * @param {Array<{triggerItemId:string, skills:Array<{skillId:string, logicEventId:string}>}>} compiled - The
 *   skill documents the content compiles.
 * @returns {Object|null}
 * @memberof CyberiaSkillMigration
 */
export function migratedSkill(doc, compiled) {
  const known = compiled.find(({ triggerItemId }) => triggerItemId === doc.triggerItemId)?.skills ?? [];
  const entries = doc.skills ?? [];
  const taken = new Set(entries.map(({ skillId }) => skillId).filter(Boolean));
  const skills = entries.map((skill) => {
    if (skill.skillId) return skill;
    const base =
      known.find(({ skillId, logicEventId }) => logicEventId === skill.logicEventId && !taken.has(skillId))?.skillId ??
      skillIdOf(`${doc.triggerItemId} ${skill.name || skill.logicEventId}`, skill.logicEventId);
    let skillId = base;
    for (let n = 2; taken.has(skillId); n++) skillId = `${base}-${n}`;
    taken.add(skillId);
    return { skillId, ...skill };
  });
  if (!('logicEventIds' in doc) && skills.every((skill, index) => skill === entries[index])) return null;
  const { logicEventIds, ...current } = doc;
  return { ...current, skills };
}

/**
 * Moves every stored skill document to the current form. It writes nothing while one skill id would
 * name two definitions: the report names each conflict.
 * @param {Object} params
 * @param {import('mongoose').Model} params.CyberiaSkill - The skill model.
 * @param {Object[]} params.compiled - The skill documents the content compiles.
 * @param {boolean} [params.apply=false] - Write the migration.
 * @returns {Promise<{migrated:Array<{triggerItemId:string, skillIds:string[]}>, current:number, conflicts:string[]}>}
 * @memberof CyberiaSkillMigration
 */
export async function migrateSkills({ CyberiaSkill, compiled, apply = false }) {
  const stored = await CyberiaSkill.find({}).lean();
  const migrated = stored.map((doc) => migratedSkill(doc, compiled));
  const conflicts = skillConflicts(migrated.map((next, index) => next ?? stored[index]));
  const report = { migrated: [], current: 0, conflicts };
  for (const [index, doc] of stored.entries()) {
    const next = migrated[index];
    if (!next) {
      report.current++;
      continue;
    }
    report.migrated.push({ triggerItemId: doc.triggerItemId, skillIds: next.skills.map(({ skillId }) => skillId) });
    if (apply && conflicts.length === 0)
      await CyberiaSkill.updateOne(
        { _id: doc._id },
        { $set: { skills: next.skills }, $unset: { logicEventIds: 1 } },
        { strict: false },
      );
  }
  return report;
}
