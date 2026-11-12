import { describe, expect, it } from 'vitest';
import { hasContentSources } from '../../../src/projects/cyberia/content/content-artifact.js';
import { checkSagaPackage, runGenerationStep } from '../../../src/projects/cyberia/saga/content-cli.js';

// Opt-in: CYBERIA_GEMINI_LIVE=1 runs one real generation through the content CLI, with the Gemini key
// of the cyberia-content env, the default model and thinking level, and one short premise. It costs
// one request per stage, so a routine test run never starts it.
const REQUEST = Object.freeze({
  prompt: 'A courier of the frontier outpost carries one sealed crate to a quiet relay, and a raider wants it.',
  saga: { code: 'gemini-check', name: 'Gemini Check', description: '' },
  spaceContext: 'physical',
  tone: 'adventure',
});
/** The most steps one generation takes: the theme, six stages and the package. */
const STEP_LIMIT = 8;

describe.skipIf(process.env.CYBERIA_GEMINI_LIVE !== '1' || !hasContentSources())('a real Gemini generation', () => {
  it('composes a package that passes the normalization and the content rules', async () => {
    let state = { request: REQUEST, done: [] };
    const log = [];
    for (let step = 0; step < STEP_LIMIT && !state.package; step++)
      state = await runGenerationStep(state, { onLine: (line) => log.push(line) });
    expect(state.package, log.join('\n')).toBeTruthy();
    expect(state.findings, JSON.stringify(state.findings)).toEqual([]);
    const check = await checkSagaPackage(state.package);
    expect(check.findings).toEqual([]);
    expect(check.compiled.saga).toMatchObject({ code: 'gemini-check', name: expect.any(String) });
    expect(check.compiled.families.quests.length).toBeGreaterThan(0);
  }, 3_600_000);
});
