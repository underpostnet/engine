import { describe, it, expect } from 'vitest';

const { CyberiaObjectLayerTemplates } =
  await import('../../../src/client/components/cyberia/ObjectLayerTemplatesCyberia.js');
const { renderTemplate, templateSuits } =
  await import('../../../src/client/components/objectlayer-studio/PixelTemplate.js');

const PALETTE = { base: ['#44aa44'], shadow: ['#226622'], highlight: ['#88dd88'], outline: ['#112211'] };

describe('the Object Layer templates of the Cyberia Studio', () => {
  it('offers a template for each kind of item, painted in the biome palette', () => {
    for (const [itemType, kind] of [
      ['floor', ''],
      ['resource', 'tree'],
      ['resource', 'rock'],
      ['obstacle', 'structure'],
      ['portal', ''],
      ['weapon', ''],
      ['skill', ''],
    ])
      expect(
        CyberiaObjectLayerTemplates.some((template) => templateSuits(template, itemType, kind)),
        `${itemType} ${kind}`,
      ).toBe(true);
    const floor = CyberiaObjectLayerTemplates.find(({ id }) => id === 'floor-tile');
    const frame = renderTemplate(floor, PALETTE);
    const colors = new Set(frame.flat().map((cell) => cell.join()));
    expect(colors).toEqual(new Set(['68,170,68,255', '34,102,34,255', '136,221,136,255']));
    for (const template of CyberiaObjectLayerTemplates) {
      const cells = template.roles;
      expect(
        cells.every((row) => row.length === cells[0].length),
        template.id,
      ).toBe(true);
    }
  });
});
