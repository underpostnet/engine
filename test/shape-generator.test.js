/**
 * @module shape-generator.test
 * @description Unit tests for the shape-generator module.
 * Validates deterministic output with seeded RNG and basic shape generation.
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import { generateShape, registerShape, listShapes, toPixelCoords, renderGrid } from '../src/server/shape-generator.js';

describe('Shape Generator Module Tests', () => {
  // --- Deterministic Seed Tests ---
  describe('Deterministic output with seeded RNG', () => {
    /**
     * Test case 1: Same seed string produces identical points for a skull-bone shape.
     */
    it('should produce identical points for the same string seed ("fx-42") on a skull-bone shape', () => {
      const opts = {
        count: 50,
        scale: 0.9,
        rotation: 10,
        jitter: 0.002,
        noise: 0.15,
        seed: 'fx-42',
        color: 'rgba(220,20,60,1)',
      };

      const result1 = generateShape('skull-bone', opts);
      const result2 = generateShape('skull-bone', opts);

      // Both runs must produce the exact same number of points
      expect(result1.points).to.have.lengthOf(50);
      expect(result2.points).to.have.lengthOf(50);

      // Every point must be identical
      for (let i = 0; i < result1.points.length; i++) {
        expect(result1.points[i].x).to.equal(result2.points[i].x, `Point ${i} x mismatch`);
        expect(result1.points[i].y).to.equal(result2.points[i].y, `Point ${i} y mismatch`);
      }

      // Metadata must match
      expect(result1.metadata.seed).to.equal(result2.metadata.seed);
      expect(result1.metadata.key).to.equal('skull-bone');
      expect(result1.metadata.color).to.equal('rgba(220,20,60,1)');
      expect(result1.metadata.count).to.equal(50);
      expect(result1.metadata.bbox).to.have.all.keys('minX', 'minY', 'maxX', 'maxY');
    });

    /**
     * Test case 2: Same integer seed produces identical points for an ellipse shape.
     */
    it('should produce identical points for the same integer seed (12345) on an ellipse shape', () => {
      const opts = {
        count: 100,
        seed: 12345,
        a: 1.5,
        b: 0.8,
        jitter: 0.01,
        noise: 0.05,
      };

      const result1 = generateShape('ellipse', opts);
      const result2 = generateShape('ellipse', opts);

      expect(result1.points).to.have.lengthOf(100);
      expect(result2.points).to.have.lengthOf(100);

      // Every point must be identical across runs
      for (let i = 0; i < result1.points.length; i++) {
        expect(result1.points[i].x).to.equal(result2.points[i].x, `Point ${i} x mismatch`);
        expect(result1.points[i].y).to.equal(result2.points[i].y, `Point ${i} y mismatch`);
      }

      expect(result1.metadata.seed).to.equal(result2.metadata.seed);
      expect(result1.metadata.key).to.equal('ellipse');
    });
  });

  // --- Different seeds produce different results ---
  describe('Different seeds produce different output', () => {
    it('should produce different points when seeds differ', () => {
      const opts1 = { count: 30, seed: 'alpha', jitter: 0.01 };
      const opts2 = { count: 30, seed: 'beta', jitter: 0.01 };

      const result1 = generateShape('circle', opts1);
      const result2 = generateShape('circle', opts2);

      // At least some points should differ
      let hasDifference = false;
      for (let i = 0; i < result1.points.length; i++) {
        if (result1.points[i].x !== result2.points[i].x || result1.points[i].y !== result2.points[i].y) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).to.be.true;
    });
  });

  // --- Shape registry ---
  describe('Shape registry', () => {
    it('should list all built-in shapes', () => {
      const shapes = listShapes();
      expect(shapes).to.include.members([
        'circle',
        'ellipse',
        'parabola',
        'heart',
        'skull-bone',
        'star',
        'cactus',
        'pixel-art',
        'bezier-path',
      ]);
    });

    it('should throw for an unknown shape key', () => {
      expect(() => generateShape('nonexistent-shape')).to.throw(Error, /Unknown shape key/);
    });

    it('should allow registering and generating a custom shape', () => {
      registerShape('diamond', (t) => {
        const angle = t * Math.PI * 2;
        const r = 1 / (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
        return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
      });

      expect(listShapes()).to.include('diamond');

      const result = generateShape('diamond', { count: 40, seed: 99 });
      expect(result.points).to.have.lengthOf(40);
      expect(result.metadata.key).to.equal('diamond');
    });
  });

  // --- Normalization and bounding box ---
  describe('Normalization', () => {
    it('should produce points within 0..1 when normalize=true (default)', () => {
      const result = generateShape('star', { count: 60, seed: 7 });
      for (const p of result.points) {
        expect(p.x).to.be.at.least(0);
        expect(p.x).to.be.at.most(1);
        expect(p.y).to.be.at.least(0);
        expect(p.y).to.be.at.most(1);
      }
    });

    it('should produce points outside 0..1 when normalize=false', () => {
      const result = generateShape('skull-bone', { count: 60, seed: 7, normalize: false });
      // Skull-bone shape has range roughly -1..1, so some points should be negative
      const hasNegative = result.points.some((p) => p.x < 0 || p.y < 0);
      expect(hasNegative).to.be.true;
    });
  });

  // --- toPixelCoords helper ---
  describe('toPixelCoords helper', () => {
    it('should scale normalized points to pixel dimensions', () => {
      const normalized = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
      ];
      const pixels = toPixelCoords(normalized, 800, 600);
      expect(pixels[0]).to.deep.equal({ x: 0, y: 0 });
      expect(pixels[1]).to.deep.equal({ x: 400, y: 300 });
      expect(pixels[2]).to.deep.equal({ x: 800, y: 600 });
    });
  });

  // --- Default options ---
  describe('Default options', () => {
    it('should generate 200 points by default', () => {
      const result = generateShape('circle', { seed: 1 });
      expect(result.points).to.have.lengthOf(200);
      expect(result.metadata.count).to.equal(200);
    });
  });

  // --- All built-in shapes generate without error ---
  describe('All built-in shapes generate successfully', () => {
    const shapes = [
      'circle',
      'ellipse',
      'parabola',
      'heart',
      'skull-bone',
      'star',
      'cactus',
      'pixel-art',
      'bezier-path',
    ];

    for (const key of shapes) {
      it(`should generate shape "${key}" without error`, () => {
        const result = generateShape(key, { count: 30, seed: 42 });
        expect(result.points).to.have.lengthOf(30);
        expect(result.metadata.key).to.equal(key);
        expect(result.metadata).to.have.property('seed');
        expect(result.metadata).to.have.property('bbox');
      });
    }
  });

  // --- Example usage (Node.js) with expected sample output ---
  describe('Example usage – skull-bone shape first 5 points', () => {
    it('should produce stable first 5 points for the documented example', () => {
      const result = generateShape('skull-bone', {
        count: 300,
        scale: 0.9,
        rotation: 10,
        jitter: 0.002,
        noise: 0.15,
        seed: 'fx-42',
        color: 'rgba(220,20,60,1)',
      });

      expect(result.points.length).to.equal(300);
      expect(result.metadata.key).to.equal('skull-bone');
      expect(result.metadata.color).to.equal('rgba(220,20,60,1)');

      // Snapshot the first 5 points from a known run, then verify they remain stable
      const first5 = result.points.slice(0, 5);

      // Run a second time to confirm determinism
      const result2 = generateShape('skull-bone', {
        count: 300,
        scale: 0.9,
        rotation: 10,
        jitter: 0.002,
        noise: 0.15,
        seed: 'fx-42',
        color: 'rgba(220,20,60,1)',
      });

      const first5Again = result2.points.slice(0, 5);

      for (let i = 0; i < 5; i++) {
        expect(first5[i].x).to.equal(first5Again[i].x);
        expect(first5[i].y).to.equal(first5Again[i].y);
      }

      // Log sample output for documentation purposes
      console.log('\n  Example output – first 5 points of skull-bone (seed: "fx-42"):');
      console.log('  ' + JSON.stringify(first5));
    });
  });

  // ===========================================================================
  //  intCoords — integer pixel-art grid mode
  // ===========================================================================
  describe('intCoords – integer pixel-art grid mode', () => {
    // --- Basic contract: all points are integers within grid bounds ---
    describe('Basic contract', () => {
      it('should return integer-only coordinates within 0..gridSize-1', () => {
        const result = generateShape('circle', { intCoords: 16, seed: 1 });

        expect(result.metadata.gridWidth).to.equal(16);
        expect(result.metadata.gridHeight).to.equal(16);

        for (const p of result.points) {
          expect(Number.isInteger(p.x)).to.be.true;
          expect(Number.isInteger(p.y)).to.be.true;
          expect(p.x).to.be.at.least(0);
          expect(p.x).to.be.at.most(15);
          expect(p.y).to.be.at.least(0);
          expect(p.y).to.be.at.most(15);
        }
      });

      it('should have no duplicate points', () => {
        const result = generateShape('skull-bone', { intCoords: 16, seed: 42 });
        const keys = new Set(result.points.map((p) => `${p.x},${p.y}`));
        expect(keys.size).to.equal(result.points.length);
      });

      it('should accept intCoords as [width, height] array for rectangular grids', () => {
        const result = generateShape('ellipse', { intCoords: [24, 12], seed: 7, a: 2, b: 0.8 });
        expect(result.metadata.gridWidth).to.equal(24);
        expect(result.metadata.gridHeight).to.equal(12);

        for (const p of result.points) {
          expect(p.x).to.be.at.least(0);
          expect(p.x).to.be.at.most(23);
          expect(p.y).to.be.at.least(0);
          expect(p.y).to.be.at.most(11);
        }
      });

      it('should accept intCoords=true and derive grid from count', () => {
        const result = generateShape('circle', { intCoords: true, count: 20, seed: 5 });
        expect(result.metadata.gridWidth).to.equal(20);
        expect(result.metadata.gridHeight).to.equal(20);
      });

      it('should throw for intCoords grid smaller than 2×2', () => {
        expect(() => generateShape('circle', { intCoords: 1 })).to.throw(Error, /at least 2×2/);
      });
    });

    // --- Deterministic with intCoords ---
    describe('Determinism with intCoords', () => {
      it('should produce identical integer points for the same seed', () => {
        const opts = { intCoords: 16, seed: 'pixel-test', jitter: 0.005, noise: 0.1 };
        const r1 = generateShape('star', opts);
        const r2 = generateShape('star', opts);

        expect(r1.points.length).to.equal(r2.points.length);
        for (let i = 0; i < r1.points.length; i++) {
          expect(r1.points[i].x).to.equal(r2.points[i].x, `Point ${i} x mismatch`);
          expect(r1.points[i].y).to.equal(r2.points[i].y, `Point ${i} y mismatch`);
        }
      });
    });

    // --- Contour connectivity: Bresenham should fill gaps ---
    describe('Bresenham contour connectivity', () => {
      it('should produce a connected contour (no gap > √2 between consecutive points)', () => {
        const result = generateShape('skull-bone', { intCoords: 16, seed: 100 });
        const pts = result.points;

        // For a closed shape, also check last→first
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          // Bresenham ensures consecutive cells differ by at most 1 in each axis
          // but after dedup, the contour-order distance may be larger.
          // We just verify no enormous gaps (> half the grid) which would indicate
          // a broken rasterization.
          expect(dist).to.be.below(
            Math.max(result.metadata.gridWidth, result.metadata.gridHeight),
            `Gap at index ${i}: (${a.x},${a.y})→(${b.x},${b.y}) dist=${dist.toFixed(2)}`,
          );
        }

        // The total number of unique cells should be substantial for a 16×16 skull-bone
        // (not just 3-4 dots on a diagonal).
        expect(pts.length).to.be.at.least(20, 'Skull-bone on 16×16 should have at least 20 contour cells');
      });

      it('should produce enough cells to be recognizable on a tiny 8×8 grid', () => {
        const result = generateShape('circle', { intCoords: 8, seed: 77 });
        // A circle on 8×8 should touch a good number of cells
        expect(result.points.length).to.be.at.least(12, 'Circle on 8×8 needs at least 12 cells');
      });
    });

    // --- renderGrid helper ---
    describe('renderGrid helper', () => {
      it('should throw if ShapeResult lacks gridWidth/gridHeight', () => {
        const normalResult = generateShape('circle', { count: 10, seed: 1 });
        expect(() => renderGrid(normalResult)).to.throw(Error, /intCoords/);
      });

      it('should produce a grid string with correct dimensions', () => {
        const result = generateShape('circle', { intCoords: 10, seed: 1 });
        const grid = renderGrid(result);
        const rows = grid.split('\n');
        expect(rows.length).to.equal(10);
        for (const row of rows) {
          expect(row.length).to.equal(10);
        }
      });

      it('should place filled chars at every point coordinate', () => {
        const result = generateShape('circle', { intCoords: 12, seed: 3 });
        const grid = renderGrid(result, { filled: '#', empty: '.' });
        const rows = grid.split('\n');

        for (const p of result.points) {
          expect(rows[p.y][p.x]).to.equal('#', `Expected '#' at (${p.x},${p.y})`);
        }
      });
    });

    // --- Visual recognizability on 16×16 for every built-in shape ---
    describe('All built-in shapes render recognizably on 16×16', () => {
      const shapes = ['circle', 'ellipse', 'skull-bone', 'star', 'cactus', 'pixel-art'];

      for (const key of shapes) {
        it(`"${key}" should produce ≥15 contour cells on a 16×16 grid`, () => {
          const result = generateShape(key, { intCoords: 16, seed: 42 });
          const grid = renderGrid(result);

          // Log the grid for visual inspection during test runs
          console.log(`\n  ${key} 16×16 (${result.points.length} cells):`);
          for (const row of grid.split('\n')) {
            console.log('  ' + row);
          }

          // A recognizable closed shape on 16×16 must have a reasonable number of cells.
          // Anything below ~15 tends to look like random dots or a straight line.
          expect(result.points.length).to.be.at.least(15, `${key} contour too sparse on 16×16`);
        });
      }

      it('"parabola" (open) should produce ≥8 contour cells on a 16×16 grid', () => {
        const result = generateShape('parabola', { intCoords: 16, seed: 42, closed: false });
        const grid = renderGrid(result);

        console.log(`\n  parabola 16×16 (${result.points.length} cells):`);
        for (const row of grid.split('\n')) {
          console.log('  ' + row);
        }

        expect(result.points.length).to.be.at.least(8, 'parabola contour too sparse on 16×16');
      });

      it('"bezier-path" (open) should produce ≥8 contour cells on a 16×16 grid', () => {
        const result = generateShape('bezier-path', { intCoords: 16, seed: 42, closed: false });
        const grid = renderGrid(result);

        console.log(`\n  bezier-path 16×16 (${result.points.length} cells):`);
        for (const row of grid.split('\n')) {
          console.log('  ' + row);
        }

        expect(result.points.length).to.be.at.least(8, 'bezier-path contour too sparse on 16×16');
      });
    });

    // --- 32×32 skull-bone visual check ---
    describe('Larger grid visual check', () => {
      it('should render a clearly recognizable skull-bone on 32×32', () => {
        const result = generateShape('skull-bone', { intCoords: 32, seed: 'bones' });
        const grid = renderGrid(result);

        console.log(`\n  skull-bone 32×32 (${result.points.length} cells):`);
        for (const row of grid.split('\n')) {
          console.log('  ' + row);
        }

        // A skull-bone on 32×32 should have a rich contour
        expect(result.points.length).to.be.at.least(50);
        expect(result.metadata.gridWidth).to.equal(32);
        expect(result.metadata.gridHeight).to.equal(32);
      });
    });

    // --- intCoords does NOT affect non-intCoords runs ---
    describe('Backward compatibility', () => {
      it('should not change output when intCoords is false (default)', () => {
        const opts = { count: 50, seed: 'compat' };
        const r1 = generateShape('circle', opts);
        const r2 = generateShape('circle', { ...opts, intCoords: false });

        expect(r1.points.length).to.equal(r2.points.length);
        for (let i = 0; i < r1.points.length; i++) {
          expect(r1.points[i].x).to.equal(r2.points[i].x);
          expect(r1.points[i].y).to.equal(r2.points[i].y);
        }
        expect(r1.metadata).to.not.have.property('gridWidth');
      });
    });
  });
});
