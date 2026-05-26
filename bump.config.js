/**
 * bumpp configuration for the Underpost engine.
 *
 * Owns the *canonical* version-bearing files (anything that exposes a literal `version` field
 * bumpp can detect natively). Non-canonical files — image tags in workflows, README badges,
 * doc strings, deployment.yaml image refs — are handled by the custom regex walker in
 * src/cli/release.js (VERSION_BUMP_TARGETS), because bumpp only rewrites `version`-shaped lines.
 *
 * release.js drives bumpp programmatically (versionBump from 'bumpp') with commit/tag/push
 * disabled, since the engine release flow stages and commits separately via `node bin cmt`.
 *
 * @see https://github.com/antfu/bumpp
 */
export default {
  files: [
    'package.json',
    'package-lock.json',
    // engine-private confs are git-ignored and visited only if present at bump time.
    'engine-private/conf/**/package.json',
  ],
  commit: false,
  tag: false,
  push: false,
  confirm: false,
  recursive: false,
};
