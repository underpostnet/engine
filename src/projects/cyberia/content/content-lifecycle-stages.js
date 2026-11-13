/**
 * The verifiers of the content lifecycle stages. Each reads the records its domain owns, never the
 * exit code of a command, and returns the evidence of its stage with the record ids to keep on the
 * cycle, or refuses with what is missing. A verifier changes no record.
 *
 * The preflight, the baseline restore, the workspace reset and the source export have no verifier:
 * the command that runs them records the evidence it produced.
 *
 * @module src/projects/cyberia/content/content-lifecycle-stages.js
 * @namespace CyberiaContentLifecycleStages
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DR_BACKUP_PROFILE } from '../../../cli/db.js';
import { listBackups, readBackupManifest, readVerifications } from '../../../server/storage/backup.js';
import { SOURCE_LOCK_FILE, readSourceLockFile } from '../../../server/release/source-lock.js';
import { remoteHead } from '../../../server/git/git.js';
import {
  checkoutGit,
  contentCheckoutRevision,
  contentRoot,
  contentSourceChanged,
  deploymentRoot,
  exportSourceDir,
  hasContentSources,
  openContentArtifact,
  sourceBindingConflicts,
  treeDigest,
} from './content-artifact.js';
import { readContentBaseline } from './content-baseline.js';
import { failure, stageStates } from './content-lifecycle.js';

const blocked = (message) => failure('blocked', message);

/** The newest verification of a backup that passes `accept`, or undefined. */
const newestVerification = async (store, manifest, accept) =>
  (await readVerifications({ store, manifest }))
    .filter(accept)
    .sort((a, b) => String(a.checkedAt).localeCompare(String(b.checkedAt)))
    .at(-1);

/**
 * The baseline of a cycle: the one it keeps, or the one named for a cycle that keeps none.
 * @param {Object} cycle - A stored cycle.
 * @param {string} [named] - The baseline a command names.
 * @returns {string}
 * @throws {Error} `blocked` when the name differs from the kept one, or nothing names one.
 * @memberof CyberiaContentLifecycleStages
 */
export const cycleBaseline = (cycle, named = '') => {
  const kept = cycle.references?.baselineId ?? '';
  if (kept && named && named !== kept)
    throw blocked(`${named} is not the baseline of cycle ${cycle.cycleId}: it keeps ${kept}. Name ${kept} or no id`);
  if (!kept && !named) throw blocked('Name the baseline: --baseline <id>');
  return kept || named;
};

/**
 * Refuses a workspace reset in a cycle unless the content artifact is the build of the committed live
 * export of the cycle, so the workspace starts from the baseline the cycle exported.
 * @param {Object} cycle - A stored cycle whose `source-export` is complete for this host.
 * @param {{targets:Object}} host - This host, with the targets it observes.
 * @throws {Error} `blocked` with what to do first.
 * @memberof CyberiaContentLifecycleStages
 */
export const assertExportArtifact = (cycle, host) => {
  const { evidence } = stageStates(cycle, host.targets).find(({ id }) => id === 'source-export').record;
  const dirs = evidence.exported.map(({ name }) => exportSourceDir(name));
  if (dirs.some(contentSourceChanged) || treeDigest(dirs) !== evidence.sourceDigest)
    throw blocked(
      'cyberia-content does not hold the live export of this cycle as a commit: commit the export, build the artifact, then reset',
    );
  if (openContentArtifact(contentRoot()).manifest.sourceRevision !== contentCheckoutRevision())
    throw blocked(
      'The content artifact is not the build of the cyberia-content commit: run (cd cyberia-content && node bin/cyberia-content.js build), then reset',
    );
};

/**
 * The verifier of each stage that has one, by stage id. A verifier takes `{ cycle, store, models,
 * input }`: the cycle, the object store, the runtime models (`CyberiaContentRelease`,
 * `CyberiaServerRegistry`) and the ids the command names (`backup`, `baseline`).
 * @type {Object<string, (params:Object) => Promise<{evidence:Object, references:Object}>>}
 * @memberof CyberiaContentLifecycleStages
 */
export const STAGE_VERIFIERS = Object.freeze({
  /** A disaster-recovery backup of the deployment taken since the cycle started, with a passing restore drill. */
  async 'infrastructure-backup'({ cycle, store, input = {} }) {
    const { deployId } = cycle;
    const available = (await listBackups({ store, deployId, profile: DR_BACKUP_PROFILE })).filter(
      ({ status }) => status === 'available',
    );
    const backup = input.backup
      ? available.find(({ backupId }) => backupId === input.backup)
      : available.find(({ createdAt }) => new Date(createdAt) >= new Date(cycle.createdAt));
    if (!backup)
      throw blocked(
        input.backup
          ? `No available backup ${input.backup} of ${deployId}`
          : `No backup of ${deployId} since the cycle started: run node bin db ${deployId} --kubeadm --export`,
      );
    const manifest = await readBackupManifest({
      store,
      deployId,
      profile: DR_BACKUP_PROFILE,
      backupId: backup.backupId,
    });
    const drill = await newestVerification(store, manifest, (report) => report.ok && report.restoreTest?.ok);
    if (!drill)
      throw blocked(
        `Backup ${backup.backupId} has no verification with a passing restore drill: run ` +
          `node bin db ${deployId} --kubeadm --verify --restore-test --backup ${backup.backupId}`,
      );
    const { environment, context, namespaces } = manifest.source ?? {};
    return {
      evidence: {
        backupId: backup.backupId,
        createdAt: backup.createdAt,
        verifiedAt: drill.checkedAt,
        placement: { environment, context, namespaces },
        restoreDrill: { namespaces: drill.restoreTest.namespaces, restoreMs: drill.restoreTest.restoreMs },
      },
      references: { backupId: backup.backupId },
    };
  },

  /** An available content baseline: the release it captured, its source and its scope. */
  async 'baseline-capture'({ cycle, store, input = {} }) {
    const baselineId = cycleBaseline(cycle, input.baseline);
    const { meta } = await readContentBaseline({ store, deployId: cycle.deployId, backupId: baselineId });
    return {
      evidence: {
        baselineId,
        capturedAt: meta.capturedAt,
        releaseId: meta.release.releaseId,
        sourceRevision: meta.release.source?.sourceRevision ?? '',
        contentDigest: meta.release.content?.digest ?? '',
        files: meta.scope.files,
        owned: meta.scope.owned,
      },
      references: { baselineId, baselineReleaseId: meta.release.releaseId },
    };
  },

  /** A passing deep verification of the baseline of the cycle. */
  async 'baseline-verify'({ cycle, store }) {
    const baselineId = cycleBaseline(cycle);
    const manifest = await readContentBaseline({ store, deployId: cycle.deployId, backupId: baselineId });
    const verified = await newestVerification(store, manifest, (report) => report.ok);
    if (!verified)
      throw blocked(
        `Baseline ${baselineId} has no passing verification: run cyberia content baseline verify ${baselineId}`,
      );
    return { evidence: { baselineId, verifiedAt: verified.checkedAt }, references: {} };
  },

  /**
   * The reviewed revision of the content source: committed, with nothing left to commit, and its release
   * instances bind each item to one definition.
   */
  async 'source-review'() {
    if (!hasContentSources()) throw blocked('This host has no cyberia-content checkout');
    if (contentSourceChanged('src'))
      throw blocked('cyberia-content has changes that are not committed: commit what you reviewed, then verify again');
    const conflicts = sourceBindingConflicts();
    if (conflicts.length > 0)
      throw blocked(
        'The release instances bind one item to different definitions: export each of them again with ' +
          `cyberia instance snapshot <code> --export --dev, then commit:\n${conflicts.join('\n')}`,
      );
    const contentRevision = contentCheckoutRevision();
    return { evidence: { contentRevision }, references: { contentRevision } };
  },

  /** The deployment lock pins the reviewed content revision, and it is committed and pushed. */
  async 'source-release'({ cycle }) {
    const root = deploymentRoot();
    const file = path.join(root, SOURCE_LOCK_FILE);
    const lock = readSourceLockFile(file);
    const content = lock.sources['cyberia-content'];
    if (!content) throw blocked(`${SOURCE_LOCK_FILE} pins no cyberia-content`);
    if (content.revision !== cycle.references?.contentRevision)
      throw blocked(
        `${SOURCE_LOCK_FILE} pins cyberia-content ${content.revision}, not the reviewed ${cycle.references?.contentRevision}: ` +
          'lock the reviewed revision, or review the locked one',
      );
    if (checkoutGit(root, 'status', '--porcelain', '--', SOURCE_LOCK_FILE))
      throw blocked(`${SOURCE_LOCK_FILE} has changes that are not committed: run cyberia release lock --commit`);
    const head = checkoutGit(root, 'rev-parse', 'HEAD');
    const branch = checkoutGit(root, 'rev-parse', '--abbrev-ref', 'HEAD');
    const published = remoteHead({ path: root, branch });
    if (published !== head)
      throw blocked(
        published
          ? `The origin of cyberia-deployment holds ${published} on ${branch}, not the lock commit ${head}: run cyberia release publish`
          : `The origin of cyberia-deployment answers no ${branch} branch: run cyberia release publish, and check the network and GITHUB_TOKEN`,
      );
    const lockDigest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
    return {
      evidence: {
        lockDigest,
        deploymentRevision: head,
        sources: Object.fromEntries(Object.entries(lock.sources).map(([name, entry]) => [name, entry.revision])),
        contentVersion: content.artifact?.version ?? '',
        contentDigest: content.artifact?.digest ?? '',
      },
      references: { lockDigest, contentDigest: content.artifact?.digest ?? '' },
    };
  },

  /** The active release serves the locked content and passed its validation; its discarded live changes come along. */
  async 'production-deploy'({ cycle, models }) {
    const active = await models.CyberiaContentRelease.active();
    if (!active) throw blocked('No content release is active');
    const { contentDigest } = cycle.references ?? {};
    if (active.content?.digest !== contentDigest)
      throw blocked(
        `The active release ${active.releaseId} serves ${active.content?.digest || 'no artifact'}, not the locked ${contentDigest}`,
      );
    if (!active.validation?.ok) throw blocked(`The active release ${active.releaseId} has no passing validation`);
    return {
      evidence: {
        releaseId: active.releaseId,
        database: active.database,
        contentDigest,
        promotedAt: active.promotedAt,
        engineCommit: active.provenance?.engineCommit ?? '',
        discarded: (active.audit ?? [])
          .filter(({ action }) => action === 'discard-live-changes')
          .map(({ at, by, detail }) => ({
            at,
            by,
            release: detail.discarded,
            changes: detail.changes,
            reason: detail.reason,
          })),
      },
      references: { releaseId: active.releaseId },
    };
  },

  /** Every live game server reports the release the cycle deployed, and it is still the active one. */
  async 'runtime-verify'({ cycle, models }) {
    const { releaseId } = cycle.references ?? {};
    const active = await models.CyberiaContentRelease.active();
    if (active?.releaseId !== releaseId)
      throw blocked(
        `The active release is ${active?.releaseId || 'none'}, not ${releaseId}: the cycle deployed another one`,
      );
    const servers = await models.CyberiaServerRegistry.find(
      { state: 'ready' },
      { serverId: 1, instanceCode: 1, releaseId: 1 },
    ).lean();
    if (!servers.length) throw blocked('No live game server reports: verify again once the servers run');
    const behind = servers.filter((server) => server.releaseId !== releaseId);
    if (behind.length)
      throw blocked(
        `${behind.length} of ${servers.length} game server(s) serve another release: ` +
          behind.map(({ serverId, releaseId: served }) => `${serverId} ${served || 'none'}`).join(', '),
      );
    return {
      evidence: {
        releaseId,
        servers: servers.length,
        instances: [...new Set(servers.map(({ instanceCode }) => instanceCode))].sort(),
      },
      references: {},
    };
  },
});
