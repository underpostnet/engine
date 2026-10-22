/**
 * The entry spawn of a world: where the server places a new player.
 *
 * The server reads the config of `playerSpawnConfig`. It uses the fixed cell when the config names a
 * map of the world, the cell is on that map and the cell is walkable; else it uses a random walkable
 * cell of a random map. A defeat never moves a player: it revives where it fell.
 * @module src/projects/cyberia/instance/entry-spawn.js
 */

/** The spawn config the server receives: no cell reads as 0. */
const playerSpawnConfig = (instance) => ({
  sourceMapCode: instance.playerSpawn?.sourceMapCode || '',
  sourceCellX: instance.playerSpawn?.sourceCellX || 0,
  sourceCellY: instance.playerSpawn?.sourceCellY || 0,
  random: !!instance.playerSpawn?.random,
});

/**
 * How the server resolves the entry spawn, for a map view: `fixed` on a cell of a map, `random`
 * when the config asks for it or names no map, else `unresolved`, and the server uses a random cell.
 * Only the server knows whether a fixed cell is walkable.
 * @param {Object} instance - Lean `CyberiaInstance` with `playerSpawn` and `cyberiaMapCodes`.
 * @param {Array<{code: string, name?: string, gridX?: number, gridY?: number}>} maps - Maps of the world.
 * @returns {{mode: 'fixed'|'random'|'unresolved', mapCode?: string, mapName?: string, cellX?: number, cellY?: number}}
 */
const entrySpawn = (instance, maps) => {
  const config = playerSpawnConfig(instance);
  if (config.random || !config.sourceMapCode) return { mode: 'random' };
  const cell = { cellX: config.sourceCellX, cellY: config.sourceCellY };
  const map = (instance.cyberiaMapCodes || []).includes(config.sourceMapCode)
    ? maps.find(({ code }) => code === config.sourceMapCode)
    : undefined;
  const onMap =
    map && cell.cellX >= 0 && cell.cellY >= 0 && cell.cellX < (map.gridX || 16) && cell.cellY < (map.gridY || 16);
  if (!onMap) return { mode: 'unresolved', mapCode: config.sourceMapCode, ...cell };
  return { mode: 'fixed', mapCode: map.code, mapName: map.name || map.code, ...cell };
};

export { entrySpawn, playerSpawnConfig };
