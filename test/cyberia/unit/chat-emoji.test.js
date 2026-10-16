import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAT_EMOJI } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

describe('chat emoji', () => {
  it('has a ui-icon sprite for every token the client draws', () => {
    for (const name of CHAT_EMOJI)
      expect(fs.existsSync(`src/client/public/cyberia/assets/ui-icons/emoji-${name}.png`), name).toBe(true);
  });

  it('names each token with words a chat line keeps as typed', () => {
    for (const name of CHAT_EMOJI) expect(name).toMatch(/^[a-z]+$/);
  });
});
