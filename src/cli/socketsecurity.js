/**
 * Socket security domain: the security audit of a checkout — the packages it installs and its own
 * source code — and the patches it carries.
 *
 * {@link module:src/server/security/socketsecurity.js} owns the Socket CLI integration and the
 * report; this domain is the operator surface over it: the audit a person or a workflow runs,
 * the remediation pass, and the `prepare` hook that replays the patch manifest.
 * @module src/cli/socketsecurity.js
 * @namespace UnderpostSocketSecurity
 */

import fs from 'fs-extra';
import nodePath from 'node:path';
import { auditRuntimeDependencies } from '../server/build/package.js';
import { loggerFactory } from '../server/ops/logger.js';
import SocketSecurityService, {
  fix,
  npmAudit,
  packageAlerts,
  npmAuditFix,
  patchApply,
  patchGet,
  patchManifestFactory,
  patchScan,
  patchSelectionFactory,
  patchSetup,
  publishedPackagesFactory,
  reportViolates,
  scan,
  securityReportFactory,
  socketEnvFactory,
  socketVersion,
  writeSecurityReports,
} from '../server/security/socketsecurity.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostSocketSecurity
 * @description Audits a checkout's dependencies and source code through Socket, and remediates and patches its dependencies.
 * @memberof UnderpostSocketSecurity
 */
class UnderpostSocketSecurity {
  static API = {
    /**
     * @method audit
     * @description Runs the audit and writes its reports. Dependency security: segregation,
     * `npm audit`, the Socket patch scan and, with an API token, the Socket full scan with the
     * local reachability analysis when asked. Source code risk: with an API token, the alerts
     * Socket's registry analysis raises on this project's own published package, as refactoring
     * tasks at their locations.
     * @param {object} [params]
     * @param {string} [params.root] - Checkout to audit.
     * @param {string} [params.out] - Report directory.
     * @param {boolean} [params.reach] - Run the reachability analysis with the scan.
     * @param {object} [params.remediation] - Actions a remediation pass took before this audit.
     * @returns {Promise<object>} The report, with the files written.
     * @memberof UnderpostSocketSecurity
     */
    async audit({
      root = process.cwd(),
      out = nodePath.join(root, SocketSecurityService.REPORT_DIRECTORY),
      reach = false,
      remediation = {},
    } = {}) {
      const env = socketEnvFactory();
      const dependencies = await auditRuntimeDependencies({ root });
      const audit = npmAudit({ root });
      const patches = patchScan({ root, env });
      if (reach && !env.token)
        logger.warn('Reachability analysis needs a Socket API token', { variable: SocketSecurityService.ENV.token });
      const scanResult = env.token ? scan({ root, env, reach }) : null;
      const packageJson = fs.readJsonSync(nodePath.join(root, 'package.json'));
      const ownPackages = SocketSecurityService.ownPackageNamesFactory({ packageJson });
      const ownAlerts = env.token
        ? packageAlerts({ root, env, packages: publishedPackagesFactory({ root, packageJson, ownPackages }) })
        : null;
      const report = securityReportFactory({
        root,
        packageJson,
        ownPackages,
        dependencies,
        npmAudit: audit.summary,
        scan: scanResult,
        packageAlerts: ownAlerts,
        patchScan: patches,
        manifest: patchManifestFactory(root),
        remediation,
        env,
        cliVersion: socketVersion({ root }),
      });
      const files = writeSecurityReports({
        report,
        directory: out,
        artifacts: {
          npmAudit: audit.raw,
          scan: scanResult?.report ?? null,
          scanArtifacts: scanResult?.artifacts ?? null,
          packageAlerts: ownAlerts?.artifacts ?? null,
          reach: scanResult?.facts ?? null,
          patchScan: patches.data,
        },
      });
      const { dependencySecurity: dependency, sourceCodeRisk: source } = report;
      logger.info('Security audit complete', {
        scan: report.scan.skipped ?? { healthy: report.scan.healthy, url: report.scan.url },
        dependencySecurity: {
          findings: dependency.counts,
          misplacedDependencies: dependency.segregation.misplaced.map(({ name }) => name),
          patchesAvailable: dependency.patches.scan.available.length,
          patchesInManifest: dependency.patches.manifest.patches.length,
          deferred: dependency.deferred.length,
        },
        sourceCodeRisk: {
          status: source.status,
          analyzed: source.analyzed.map(({ name, version }) => `${name}@${version}`),
          findings: source.counts,
          tasks: source.tasks.map(({ label, locations }) => `${label}: ${locations.length}`),
        },
        files,
      });
      return { ...report, files };
    },

    /**
     * @method remediate
     * @description The non-breaking remediation pass: `npm audit fix`, every available Socket
     * patch, `socket fix` without major upgrades unless allowed, and a final manifest apply.
     * @param {object} [params]
     * @param {string} [params.root] - Checkout to remediate.
     * @param {string} [params.out] - Directory `socket fix` writes its upgrade list into.
     * @param {boolean} [params.majorUpdates] - Let `socket fix` apply major upgrades.
     * @returns {Promise<object>} Results by action name.
     * @memberof UnderpostSocketSecurity
     */
    async remediate({
      root = process.cwd(),
      out = nodePath.join(root, SocketSecurityService.REPORT_DIRECTORY),
      majorUpdates = false,
    } = {}) {
      const env = socketEnvFactory();
      fs.ensureDirSync(out);
      const actions = { 'npm audit fix': npmAuditFix({ root }) };
      const { selected, skipped } = patchSelectionFactory(patchScan({ root, env }).summary.available);
      actions['socket patch get'] = [
        ...selected.map(({ uuid, purl }) => {
          const { ok, message } = patchGet({ root, env, identifier: uuid });
          return { uuid, purl, ok, message };
        }),
        ...skipped.map(({ uuid, purl, reason }) => ({ uuid, purl, skipped: reason })),
      ];
      actions['socket fix'] = env.token
        ? fix({
            root,
            env,
            majorUpdates,
            outputFile: nodePath.join(out, SocketSecurityService.REPORT_FILES.fixUpgrades),
          })
        : { skipped: `${SocketSecurityService.ENV.token} is not set` };
      actions['socket patch apply'] = patchApply({ root, env });
      logger.info('Remediation pass complete', actions);
      return actions;
    },

    /**
     * @method applyPatches
     * @description Applies the patch manifest; the `prepare` hook. A host without the
     * Socket CLI and a checkout without a manifest are both no-ops, a patch that fails to apply
     * fails the install.
     * @param {object} [params]
     * @param {string} [params.root] - Checkout to patch.
     * @param {boolean} [params.dryRun] - Verify without writing.
     * @returns {object} The apply result.
     * @throws {Error} When a recorded patch does not apply.
     * @memberof UnderpostSocketSecurity
     */
    applyPatches({ root = process.cwd(), dryRun = false } = {}) {
      const result = patchApply({ root, dryRun });
      if (result.unavailable) {
        logger.info('Socket CLI not installed; patch manifest not applied', {
          install: `npm install -g ${SocketSecurityService.CLI_PACKAGE}`,
        });
        return result;
      }
      if (!result.ok || result.failed > 0)
        throw new Error(
          `[socketsecurity] patch apply failed: ${result.message || `${result.failed} patch(es) failed`}`,
        );
      logger.info(result.status === 'no_manifest' ? 'No patch manifest to apply' : 'Patch manifest applied', {
        manifest: SocketSecurityService.MANIFEST_PATH,
        patchesApplied: result.patchesApplied,
        alreadyPatched: result.alreadyPatched,
        dryRun,
      });
      return result;
    },

    /**
     * @method callback
     * @description `underpost socketsecurity` entrypoint. Without an operation flag it runs the
     * audit.
     * @param {object} [options]
     * @param {boolean} [options.audit] - Run the audit and write the reports.
     * @param {boolean} [options.reach] - Include the reachability analysis in the scan.
     * @param {boolean} [options.ci] - Audit, then fail on a policy violation or a finding at `--fail-on`.
     * @param {string} [options.failOn] - Severity `--ci` fails at.
     * @param {boolean} [options.fix] - Run the remediation pass before the audit.
     * @param {boolean} [options.major] - Let the remediation pass apply major upgrades.
     * @param {boolean} [options.patchScan] - Scan the installed packages for available patches.
     * @param {string} [options.patchGet] - Download and apply one patch.
     * @param {boolean} [options.patchApply] - Apply the patch manifest.
     * @param {boolean} [options.patchSetup] - Install the `prepare` hook.
     * @param {string} [options.out] - Report directory.
     * @param {boolean} [options.dryRun] - Preview `--patch-setup`; verify only for `--patch-apply`.
     * @returns {Promise<object>} The operation result.
     * @memberof UnderpostSocketSecurity
     */
    async callback(options = {}) {
      const root = process.cwd();
      const out = nodePath.resolve(root, options.out || SocketSecurityService.REPORT_DIRECTORY);
      const dryRun = options.dryRun === true;

      if (options.patchSetup) {
        const result = patchSetup({ root, dryRun });
        logger.info(
          result.changed ? `prepare hook ${dryRun ? 'to install' : 'installed'}` : 'prepare hook present',
          result,
        );
        return result;
      }
      if (options.patchApply) return Underpost.socketSecurity.applyPatches({ root, dryRun });
      if (options.patchGet) {
        const result = patchGet({ root, identifier: options.patchGet });
        if (!result.ok) throw new Error(`[socketsecurity] patch get failed: ${result.message}`);
        logger.info('Socket patch recorded and applied', result.data);
        return result;
      }
      if (options.patchScan) {
        const result = patchScan({ root });
        if (!result.ok) throw new Error(`[socketsecurity] patch scan failed: ${result.message}`);
        logger.info('Socket patches available', result.summary);
        return result;
      }

      const remediation = options.fix
        ? await Underpost.socketSecurity.remediate({ root, out, majorUpdates: options.major === true })
        : {};
      const report = await Underpost.socketSecurity.audit({ root, out, reach: options.reach === true, remediation });
      if (options.ci && reportViolates(report, options.failOn))
        throw new Error(
          `[socketsecurity] policy gate failed (fail-on ${options.failOn || 'high'}); ` +
            `see ${nodePath.join(out, SocketSecurityService.REPORT_FILES.markdown)}`,
        );
      return report;
    },
  };
}

export default UnderpostSocketSecurity;
