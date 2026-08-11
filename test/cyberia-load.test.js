'use strict';

/**
 * @module cyberia-load.test
 * @description Controlled WebSocket load against a running `cyberia-server`, so a real
 * `cyberia-client` connected to the same instance can be observed for prediction and
 * reconciliation while the authoritative runtime is busy.
 */

import { expect } from 'chai';
import { setTimeout as sleep } from 'node:timers/promises';

const WS_URL = process.env.CYBERIA_LOAD_WS_URL ?? 'wss://server.cyberiaonline.com/TEST/ws';
const CONNECTIONS = Number(process.env.CYBERIA_LOAD_CONNECTIONS ?? 5);
const TAP_FREQUENCY = Number(process.env.CYBERIA_LOAD_TAP_FREQUENCY ?? 5);
const DURATION_MS = Number(process.env.CYBERIA_LOAD_DURATION_MS ?? 3000);

const CONNECT_TIMEOUT_MS = 30000;
// Time to keep reading after the last tap, so the final acks arrive before the
// run is judged. Two snapshot periods at the slowest sane rate.
const SETTLE_MS = 1500;
const CLOSE_TIMEOUT_MS = 10000;
// Cells per tap. Far enough that the server re-plans a path, short enough that
// the walk stays inside the AOI the real client is watching.
const TAP_STEP_CELLS = 4;
// Fraction of the nominal tap count a client must reach for the run to count as
// sustained load rather than a stalled connection.
const TAP_YIELD_FLOOR = 0.8;
// Taps that may still be in flight when the run ends. The ack in a snapshot is
// the highest sequence the server queued at the moment that snapshot was built.
const ACK_LAG_TOLERANCE = 3;

const TAP_PERIOD_MS = 1000 / TAP_FREQUENCY;

// Joins are spread over a ramp instead of arriving together. The instance has a
// single fixed spawn cell, so a fleet that lands together stacks on one cell —
// and because every tap fires a skill, the stack kills itself. A dead player
// cannot walk out and respawns on the same cell, so the pile never clears.
// The gap gives each joiner time to walk clear before the next one lands.
const SPAWN_DRAIN_MS = 600;
const RAMP_WINDOW_MS = Math.min(CONNECTIONS * SPAWN_DRAIN_MS, Math.max(DURATION_MS / 2, 500), 120000);
const JOIN_GAP_MS = CONNECTIONS > 1 ? RAMP_WINDOW_MS / (CONNECTIONS - 1) : 0;

// A fresh player waits before its first tap: it has just spawned and is still
// loading. The random part spreads first taps across one tap period so the
// fleet never taps in lockstep.
const TAP_WARMUP_MS = Math.min(1000, DURATION_MS / 10);

// How near its assigned region a client must be before it stops walking toward
// it and wanders inside it instead.
const ARRIVE_RADIUS_CELLS = 6;
// Keep dispersal targets off the map edge, where paths often fail.
const DISPERSAL_MARGIN_CELLS = 3;
// No client may settle within this distance of the spawn cell. Anything that
// lingers there sits in the crossfire of every joining player.
const SPAWN_CLEARANCE_CELLS = 14;

// Unit vectors for the supported directions, in the order of the Direction enum
// in cyberia-server/game/types.go. NONE is excluded: a tap carries movement intent.
const DIRECTIONS = [
  [0, -1], // UP
  [1, -1], // UP_RIGHT
  [1, 0], // RIGHT
  [1, 1], // DOWN_RIGHT
  [0, 1], // DOWN
  [-1, 1], // DOWN_LEFT
  [-1, 0], // LEFT
  [-1, -1], // UP_LEFT
];

const pack = (type, payload) => Buffer.from(JSON.stringify({ type, payload }));

const unpack = (data) => {
  try {
    return JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
  } catch {
    return null;
  }
};

const clamp = (value, max) => (value < 0 ? 0 : value > max ? max : value);

const randomDirection = () => DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];

/**
 * Picks the supported direction closest to a vector. Same mapping the server
 * uses in `updateBotDirection` (cyberia-server/game/ai.go): the enum starts at
 * UP, so the angle index shifts by two quadrants.
 */
function directionToward(dx, dy) {
  const index = (((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 2) % 8) + 8) % 8;
  return DIRECTIONS[index];
}

/**
 * Gives every client its own destination on a lattice over the map, so the
 * fleet fans out instead of piling on the spawn cell. Players spawn top-left,
 * so the walk runs right, down, and bottom-right — which is what spreads the
 * taps, and the AOI load with them, across the whole map.
 *
 * A lattice point that lands on the spawn is pushed out onto a quarter-turn fan
 * from right to down. Leaving one client parked on the spawn would keep it in
 * the crossfire of every later joiner, dying and respawning for the whole run.
 */
function dispersalTarget(index, total, gridW, gridH, spawn) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / columns));
  const column = index % columns;
  const row = Math.floor(index / columns) % rows;

  const spread = (slot, slots, extent) => {
    const usable = Math.max(1, extent - 1 - 2 * DISPERSAL_MARGIN_CELLS);
    if (slots <= 1) return DISPERSAL_MARGIN_CELLS + Math.round(usable / 2);
    return DISPERSAL_MARGIN_CELLS + Math.round((usable * slot) / (slots - 1));
  };

  let x = spread(column, columns, gridW);
  let y = spread(row, rows, gridH);

  if (Math.hypot(x - spawn.x, y - spawn.y) < SPAWN_CLEARANCE_CELLS) {
    const angle = (index / Math.max(1, total)) * (Math.PI / 2); // right → down-right → down
    x = spawn.x + Math.cos(angle) * SPAWN_CLEARANCE_CELLS;
    y = spawn.y + Math.sin(angle) * SPAWN_CLEARANCE_CELLS;
  }

  return {
    x: clamp(Math.round(x), gridW - 1),
    y: clamp(Math.round(y), gridH - 1),
  };
}

/**
 * Probes the endpoint with a plain GET before the run. A WebSocket error event
 * carries no status code, so this is the only way to tell a server that refused
 * the connection from a server that is not there.
 *
 * A healthy /ws answers 400 to a non-upgrade request; the admission guard
 * answers 503.
 */
async function preflight(url) {
  const httpURL = url.replace(/^ws/, 'http');
  try {
    const res = await fetch(httpURL, { method: 'GET' });
    if (res.status === 503) return { state: 'refused', detail: (await res.text()).trim() };
    return { state: 'reachable', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { state: 'unreachable', detail: err?.cause?.code ?? err?.message ?? 'connect failed' };
  }
}

/**
 * Opens one simulated client. `index` of `total` picks its region of the map.
 *
 * `ready` settles once the client has joined, or once the connection failed.
 * `tapping` settles on its first tap. `closed` settles when the socket is fully
 * closed. None of them ever hangs, so the caller can await the whole fleet.
 */
function startSimulatedClient(url, index, total) {
  const stats = {
    joined: false,
    tapping: false,
    taps: 0,
    snapshots: 0,
    sequence: 0, // highest sequence sent
    lastAck: 0, // highest sequence the server reported back
    serverTick: 0, // tick of the newest snapshot
    tickRate: 60,
    tickAt: 0, // wall clock when that snapshot arrived
    gridW: 0,
    gridH: 0,
    posX: 0,
    posY: 0,
    selfSamples: 0, // snapshots carrying a self block
    deadSamples: 0, // ... of which the player was a ghost awaiting respawn
    closeCode: null,
    failure: null,
    handshakeFailed: false,
  };

  let tapTimer = null;
  let warmupTimer = null;
  let spawn = null; // learned from the first snapshot
  let target = null; // this client's region of the map
  let settleReady;
  let settleTapping;
  let settleClosed;
  const ready = new Promise((resolve) => (settleReady = resolve));
  const tapping = new Promise((resolve) => (settleTapping = resolve));
  const closed = new Promise((resolve) => (settleClosed = resolve));
  const settleAll = () => {
    settleReady();
    settleTapping();
  };
  const connectTimer = setTimeout(() => {
    stats.failure ??= 'init_data timeout';
    settleAll();
  }, CONNECT_TIMEOUT_MS);

  const label = `client ${index + 1}/${total}`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  console.log(`[cyberia-load] ${label} dialing`);

  const send = (type, payload) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(pack(type, payload));
  };

  // Mirrors session_server_tick_estimate: extrapolate from the newest snapshot
  // so the tick stamped on a tap is the client's best guess at the server tick.
  const clientTick = () => {
    if (stats.serverTick === 0) return 0;
    const elapsedMs = Date.now() - stats.tickAt;
    return stats.serverTick + Math.max(0, Math.floor((elapsedMs * stats.tickRate) / 1000));
  };

  // Walk toward this client's region until it arrives, then wander inside it.
  // Heading for a spread-out region is what disperses the fleet; wandering once
  // there keeps its own patch of the map busy for the rest of the run.
  //
  // Near the spawn it never wanders. Death returns a player to the spawn cell,
  // so this is also what makes it walk back out after every respawn.
  const tapDirection = () => {
    if (!target) return randomDirection();
    const dx = target.x - stats.posX;
    const dy = target.y - stats.posY;
    const onSpawn = spawn && Math.hypot(stats.posX - spawn.x, stats.posY - spawn.y) < SPAWN_CLEARANCE_CELLS;
    if (!onSpawn && Math.hypot(dx, dy) <= ARRIVE_RADIUS_CELLS) return randomDirection();
    return directionToward(dx, dy);
  };

  const tap = () => {
    const [dx, dy] = tapDirection();
    send('player_action', {
      x: clamp(Math.round(stats.posX) + dx * TAP_STEP_CELLS, stats.gridW - 1),
      y: clamp(Math.round(stats.posY) + dy * TAP_STEP_CELLS, stats.gridH - 1),
      tick: clientTick(),
      seq: ++stats.sequence,
    });
    stats.taps++;
    stats.tapping = true;
    settleTapping();
  };

  const stopTapping = () => {
    if (warmupTimer) clearTimeout(warmupTimer);
    warmupTimer = null;
    if (tapTimer) clearInterval(tapTimer);
    tapTimer = null;
    stats.tapping = false;
  };

  const onInitData = (payload) => {
    console.log(`[cyberia-load] ${label} joined`);
    stats.gridW = payload.gridW;
    stats.gridH = payload.gridH;
    if (payload.tickRate > 0) stats.tickRate = payload.tickRate;
    // Every join spawns frozen under the server's "loading" protection; taps are
    // dropped by phaseInput until the matching freeze_end releases it.
    send('freeze_end', { reason: 'loading' });
    stats.joined = true;
    clearTimeout(connectTimer);
    settleReady();

    // Hold before the first tap, then start on a random phase of the tap period.
    warmupTimer = setTimeout(
      () => {
        warmupTimer = null;
        tap();
        tapTimer = setInterval(tap, TAP_PERIOD_MS);
      },
      TAP_WARMUP_MS + Math.random() * TAP_PERIOD_MS,
    );
  };

  const onSnapshot = (payload) => {
    stats.snapshots++;
    if (payload.tick !== undefined) {
      stats.serverTick = payload.tick;
      stats.tickAt = Date.now();
    }
    if (payload.ack !== undefined && payload.ack > stats.lastAck) stats.lastAck = payload.ack;
    if (payload.self) {
      stats.posX = payload.self.posX;
      stats.posY = payload.self.posY;
      // The spawn cell is only knowable from the server. Learn it once, then
      // pick the region this client walks to.
      if (!spawn) {
        spawn = { x: stats.posX, y: stats.posY };
        target = dispersalTarget(index, total, stats.gridW, stats.gridH, spawn);
      }
      if (payload.self.respawnIn > 0) stats.deadSamples++;
      stats.selfSamples++;
    }
  };

  ws.addEventListener('open', () => send('handshake', { name: 'cyberia-load', version: '1.0.0' }));

  ws.addEventListener('message', (event) => {
    const msg = unpack(event.data);
    if (!msg) return;
    if (msg.type === 'init_data') onInitData(msg.payload);
    else if (msg.type === 'snapshot') onSnapshot(msg.payload);
  });

  ws.addEventListener('error', () => {
    // The event carries no status code. Whether this was an admission refusal
    // or an unreachable server is settled by the preflight probe.
    if (!stats.joined && stats.snapshots === 0) {
      stats.handshakeFailed = true;
      console.log(`[cyberia-load] ${label} REFUSED by the server`);
    }
    stats.failure ??= 'socket error';
  });

  ws.addEventListener('close', (event) => {
    stopTapping();
    stats.closeCode = event.code;
    if (event.code !== 1000) stats.failure ??= `closed with code ${event.code}`;
    clearTimeout(connectTimer);
    settleAll();
    settleClosed();
  });

  // Ask for a normal closure and resolve once the socket is really closed.
  const disconnect = () => {
    stopTapping();
    clearTimeout(connectTimer);
    settleAll();
    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) ws.close(1000);
    else settleClosed();
    return closed;
  };

  const isClosed = () => ws.readyState === WebSocket.CLOSED;

  return { stats, ready, tapping, closed, disconnect, stopTapping, isClosed };
}

const sum = (clients, field) => clients.reduce((total, client) => total + client.stats[field], 0);

describe('Cyberia load — simulated tap clients against cyberia-server', function () {
  this.timeout(
    RAMP_WINDOW_MS +
      TAP_WARMUP_MS +
      TAP_PERIOD_MS +
      DURATION_MS +
      CONNECT_TIMEOUT_MS +
      SETTLE_MS +
      CLOSE_TIMEOUT_MS +
      60000,
  );

  const clients = [];

  before(function () {
    if (!WS_URL) this.skip();
    if (typeof WebSocket === 'undefined') throw new Error('global WebSocket requires Node >= 22');
  });

  // Nothing this test opened may outlive it, on any exit path.
  after(async () => {
    await Promise.all(clients.map((client) => Promise.race([client.disconnect(), sleep(CLOSE_TIMEOUT_MS)])));
  });

  it(`sustains ${CONNECTIONS} clients tapping at ${TAP_FREQUENCY} Hz for ${DURATION_MS} ms`, async () => {
    // Ramp the joins. Arriving together puts the whole fleet on the spawn cell
    // at once, and since every tap fires a skill, the pile kills itself before
    // the run reaches steady state.
    for (let i = 0; i < CONNECTIONS; i++) {
      clients.push(startSimulatedClient(WS_URL, i, CONNECTIONS));
      if (JOIN_GAP_MS > 0 && i < CONNECTIONS - 1) await sleep(JOIN_GAP_MS);
      // Stop as soon as the server refuses one. The concurrent per-address cap
      // cannot clear while the run holds its connections, so every later join
      // would be refused too — dialing them out just delays the diagnosis.
      if (clients.some((client) => client.stats.handshakeFailed)) break;
    }
    await Promise.all(clients.map((client) => client.ready));

    const joinedCount = clients.filter((client) => client.stats.joined).length;
    const refusedCount = clients.filter((client) => client.stats.handshakeFailed).length;
    if (refusedCount > 0) {
      // A partial success is decisive on its own: the server accepted some and
      // turned the rest away, which only an admission limit does. Probing again
      // would be misleading, because the connect-rate bucket refills within a
      // second and then answers as if nothing was ever refused.
      let cause;
      if (joinedCount > 0) {
        cause =
          `the server admitted ${joinedCount} and refused the next one, so an admission limit is ` +
          `capping the run — ${joinedCount} is almost certainly the effective ` +
          'CYBERIA_MAX_CONNECTIONS_PER_IP, because every simulated client shares one address. ' +
          'Start cyberia-server with CYBERIA_DISABLE_CONNECTION_LIMITS=1 for a load run (note: ' +
          '0 leaves the limits ON), or raise CYBERIA_MAX_CONNECTIONS_PER_IP, ' +
          'CYBERIA_CONNECT_BURST_PER_IP and CYBERIA_CONNECT_RATE_PER_IP';
      } else {
        const probe = await preflight(WS_URL);
        cause =
          probe.state === 'unreachable'
            ? `the endpoint is unreachable (${probe.detail}) — is cyberia-server running?`
            : probe.state === 'refused'
              ? `the endpoint refuses connections (503 "${probe.detail}"). Start cyberia-server ` +
                'with CYBERIA_DISABLE_CONNECTION_LIMITS=1 for a load run (0 leaves them ON)'
              : `the endpoint answers (${probe.detail}) but every upgrade failed`;
      }
      expect.fail(`only ${joinedCount} of ${CONNECTIONS} clients joined: ${cause}`);
    }

    const joinFailed = clients.filter((client) => !client.stats.joined);
    expect(joinFailed.length, `clients that never joined: ${joinFailed[0]?.stats.failure ?? ''}`).to.equal(0);

    // Every client is through its warm-up and tapping. Only now does the run
    // window open, so durationMs measures steady-state load and the expected
    // tap count is not diluted by the ramp.
    await Promise.all(clients.map((client) => client.tapping));
    const tapsAtSteadyState = sum(clients, 'taps');

    await sleep(DURATION_MS);

    // Stop the load, then keep reading so the final acks land before judging.
    for (const client of clients) client.stopTapping();
    const droppedMidRun = clients.filter((client) => client.stats.failure);
    await sleep(SETTLE_MS);

    const nominalTaps = CONNECTIONS * TAP_FREQUENCY * (DURATION_MS / 1000);
    const steadyStateTaps = sum(clients, 'taps') - tapsAtSteadyState;
    expect(steadyStateTaps, 'player_action commands sent during the run window').to.be.at.least(
      nominalTaps * TAP_YIELD_FLOOR,
    );

    const starved = clients.filter((client) => client.stats.snapshots === 0);
    expect(starved.length, 'clients that received no AOI snapshot').to.equal(0);

    // The ack is the highest input sequence the server took for this player —
    // the same header field the real cyberia-client reconciles against. It must
    // have caught up with what each client sent, not merely be non-zero.
    const behind = clients.filter((client) => client.stats.lastAck < client.stats.sequence - ACK_LAG_TOLERANCE);
    expect(
      behind.length,
      `clients whose input the server did not process: e.g. acked ${behind[0]?.stats.lastAck} of ` +
        `${behind[0]?.stats.sequence} sent`,
    ).to.equal(0);

    expect(droppedMidRun.length, `clients that failed mid-run: ${droppedMidRun[0]?.stats.failure ?? ''}`).to.equal(0);

    // Every client closes normally, and the run does not finish until they have.
    await Promise.all(clients.map((client) => Promise.race([client.disconnect(), sleep(CLOSE_TIMEOUT_MS)])));

    const stillOpen = clients.filter((client) => !client.isClosed());
    expect(stillOpen.length, 'connections still open after the run').to.equal(0);

    const unclean = clients.filter((client) => client.stats.closeCode !== 1000);
    expect(unclean.length, `clients that did not close cleanly: first code ${unclean[0]?.stats.closeCode}`).to.equal(0);
  });
});
