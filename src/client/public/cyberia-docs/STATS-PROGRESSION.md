# Cyberia stats and entity progression

The Go server owns effective stats, XP, and level changes.
The engine owns authored content, configuration, validation, and persistence.
The client displays server state. The CLI validates content and generates shared contracts.

## Canonical contract

`src/client/components/cyberia/SharedDefaultsCyberia.js` defines the stat order, descriptions, modifier bounds, defaults, effective floors, and what one point is worth. The generated contract carries the scales to the server, so the simulation and the documentation read one table.

| Index | Stat | One point | Effective floor |
| --- | --- | --- | ---: |
| 0 | `effect` | Removes one life point per hit | 1 |
| 1 | `resistance` | Adds one point of maximum life and a tenth of a point to each regeneration | 0 |
| 2 | `agility` | Adds one percent of base movement speed | -90 |
| 3 | `range` | Adds fifty milliseconds of summon lifetime | 0 |
| 4 | `intelligence` | Adds five percentage points of summon chance | 0 |
| 5 | `utility` | Removes one percent of base cooldown and adds one percentage point of regeneration chance | 0 |

Chances are fractions of one. A tap regenerates with `lifeRegenChance` (default 0.15) plus utility; a skill summons with its `skillRules` chance (projectile 0.75, doppelganger 0.6) plus intelligence. No chance the stats raise passes `maxChance` (default 0.95), so nothing becomes a certainty. Regeneration heals the entity's own base amount plus a tenth of a point per resistance point, never past its maximum.

Each OL modifier is an integer from `-100` through `+100`. Zero is neutral.
Missing stat keys resolve to zero. Unknown keys, fractions, numeric strings, null values, and values outside the bounds fail validation.
An OL cannot store XP or level in `data.stats`.

The editor marks negative values as penalties and positive values as bonuses.
The randomizer validates its bounds and uses the full signed range by default.

## Semantic bounds and balancing

`STAT_TYPE_BOUNDS` in the same module declares the inclusive range each stat may take per item type. A weapon deals its effect and can cost resistance; a skin and a breastplate defend; a skill reaches; world content carries nothing. A type or stat absent there keeps the contract range.

| Type | effect | resistance | agility | range | intelligence | utility |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `weapon` | 5..20 | -10..2 | -5..5 | 0..10 | 0..5 | 0..10 |
| `skin` | 1 | 0..20 | -5..10 | 0 | 0..2 | 0..5 |
| `breastplate` | 0 | 5..30 | -15..0 | 0 | 0..3 | 0..5 |
| `skill` | 0..15 | 0..5 | 0..5 | 5..30 | 0..10 | 0..10 |
| `resource` | 0 | 0..10 | 0 | 0 | 0 | 0 |
| world content | 0 | 0 | 0 | 0 | 0 | 0 |

`src/projects/cyberia/stat-balance.js` applies one policy to every object layer the `ol` command writes: import, batch import, generation, atlas rebuilds, and the minify refresh. `--normalize-stats` clamps the stats the content carries into its type's range. `--random-stats` draws every stat inside the range instead. `--min-stat` and `--max-stat` narrow the range; a request that leaves no overlap pins the stat to the semantic edge nearest it. The policy is a pure function of the content and the flags, so a run is deterministic and normalizing is idempotent.

## Aggregation and levels

```text
BaseStat(level) = baseStats[stat] + (level - 1) * perLevelStats[stat]
EffectiveStat = max(floor, BaseStat(level) + ActiveOLStat + TemporaryStat)
TotalXPForLevel(level) = xpPerLevel * (level - 1)^2
```

Each active OL with positive quantity contributes once. Stack quantity does not multiply its modifier.
The server applies floors after the full sum. Effective values can exceed the OL bounds.
Equipment rules still control item types, active slots, and required skins.

Players, bots, NPCs, and resources share `EntityProgression`, the base curve, and stat aggregation.
Bots, NPCs, and resources have frozen progression. Their content `level` selects the base stats.
An absent content level uses `defaultBotLevel`. New players start at level 1 with zero XP.
Terrain and other passive objects carry no progression state.

Summoned entities inherit the caster's base and signed contributions, then add their own contributions.
The server applies floors after inheritance. A caster cycle stops traversal.
Temporary modifiers have an ID and expiry time. Setting the same ID replaces that modifier.
The lifecycle phase removes expired modifiers and updates maximum life.

The agility floor retains at least 10% of configured movement speed.
The existing minimum action cooldown still applies. Resistance keeps maximum life and regeneration nonnegative.
Increasing maximum life does not grant an instant heal.

## Server configuration

`src/api/cyberia-server-defaults/cyberia-server-defaults.js` owns progression defaults and configuration limits.
Instance content can override `progressionRules`. Partial curves inherit missing defaults.
The engine resolves and validates the complete configuration before transport.

| Setting | Default |
| --- | ---: |
| `maxLevel` | 100 |
| `xpPerLevel` | 100 |
| `defaultBotLevel` | 1 |
| `killXp` | 25 |
| `objectiveXp` | 10 |
| `questXp` | 100 |
| `minAwardIntervalMs` | 500 |
| `repeatWindowMs` | 60000 |
| `maxRepeatAwards` | 4 |
| `maxAwardsPerWindow` | 30 |

The default base array is `[5, 10, 0, 0, 0, 0]`.
The default growth array is `[2, 5, 1, 10, 1, 1]`.
The first total XP thresholds are `0`, `100`, `400`, and `900`.
One reward can advance several levels. XP stops at the maximum level threshold.

Authored levels must be integers from 1 through 65535 and cannot exceed the instance maximum.
Base and growth fields must be integers from 0 through 100.
The CLI prints the current defaults with `node bin/cyberia.js stats progression`.

Configuration participates in the instance version hash.
The server validates stat bounds, curves, and authored levels before a full reload mutates state.
An invalid reload retains its pending version so a corrected payload can retry.
On a curve change, player XP selects the level under the new curve. The new maximum clamps XP.

## XP rules

Only resolved simulation events can award XP:

- A player or bot defeat can award kill XP.
- A resource defeat can award objective XP.
- A completed quest can award quest XP once per quest code and session.

A combat contributor must supply at least 10% of recorded positive damage.
Self kills, summoned targets, item drops, providers, ghosts, and frozen players cannot produce eligible defeat rewards.
Bots and NPCs cannot gain XP.

Low-value outcomes share an award interval and a window limit.
Repeated rewards for the same event kind and target divide by `1`, `2`, `3`, then `4`.
Further repeats in that window award zero. Lower-level targets reduce the reward again.
Integer division rounds down. Zero rewards do not consume an award slot.

Unique quest completion bypasses the low-value interval and window limit.
This permits a final kill and its quest completion to award XP in the same tick.
Quest completion still rejects repeats.

Raw taps, idle duration, inventory changes, and currency transfers award no XP.
Player skills and tap regeneration share the server action cooldown. Movement input remains independent.

## API and Object Layer specification

An Object Layer record stores its contract marker outside hashed metadata. The model stamps it on every write:

```json
{
  "statContractVersion": 2,
  "data": {
    "stats": {
      "effect": -100,
      "resistance": 100,
      "agility": 0,
      "range": 0,
      "intelligence": 0,
      "utility": 0
    }
  }
}
```

This fragment omits the existing required item, ledger, and asset fields.
The OL API, import path, generator, and boot assembler use the shared validator.
Mongo schema validation also enforces integer bounds. API updates run validators.

Entity content stores optional `level` beside `entityType` and `objectLayerItemIds`.
The map editor preserves this field and accepts an optional level. An empty input uses the instance default.
`InstanceConfig.progressionRules` carries the resolved server rules over gRPC and REST. Protobuf field 24 is reserved.

The game link uses JSON envelopes over WebSocket. AOI stat arrays use canonical order.

| Snapshot scope | Fields |
| --- | --- |
| Living entities | `level`, `effectiveStats[6]`, `statsSum` |
| Viewing player only | `xp`, `levelXp`, `nextLevelXp`, `baseStats[6]`, `layerStats[6]`, `temporaryStats[6]` |

`xp` is total XP. `levelXp` and `nextLevelXp` are the thresholds that bound the current level, so the client draws in-level progress without the curve. At maximum level, all three equal the final threshold.
`statsSum` is an uncapped display summary, not an equipment budget.
Passive objects omit `level` and `effectiveStats`. Other players do not receive private XP or base-stat breakdowns.
The instance-map REST API serves authored topology and capabilities. It does not calculate simulation stats.

An XP award sends a `combat_text` message of kind `xp` to the earner only. Damage and regen kinds stay broadcast to the area of interest.

The overhead HUD of every living entity shows its level, its stats sum, and an XP bar under the HP bar. The bar fills with the viewing player's in-level progress and stays empty for other entities.
The Stats tab draws one shared stat panel per block. Every entity gets its effective stats; the viewing player also gets OL, base, and temporary values.
The level-up effect observes authoritative level increments for an entity already in view.
First exposure, repeated snapshots, and level decreases produce no effect. Reconnect resets effects.
The server broadcasts the `level-up` audio event to every viewer in reach when a player's level rises, and the `death` audio event on every defeat.

## Progression lifetime

The guest runtime assigns a new UUID for each WebSocket session.
Progression survives death, respawn, portal travel, and world reload within that session.
A disconnect or server restart ends that progression state.

Persistent account progression requires an authenticated, stable account binding and an engine-owned persistence contract.
The simulation server exposes no XP mutation API and stores no progression.

## Generation and verification

Generate contracts after a shared stat or progression-default change:

```sh
node bin/cyberia.js stat-contract
node bin/cyberia.js stat-contract --check
```

The generator writes the Go contract, C header, and REST test fixtures. Do not edit these outputs by hand.
Regenerate protobuf output with the existing protobuf toolchain when `gen/proto/cyberia.proto` changes.

Inspect and validate content with:

```sh
node bin/cyberia.js stats progression
node bin/cyberia.js stats validate /tmp/object-layers.json
node bin/cyberia.js stats random --min=-100 --max=100
```

Focused engine tests:

```sh
node node_modules/vitest/vitest.mjs run test/integration/app/cyberia/cyberia-stats.test.js
```

Run `go test ./...` from `cyberia-server`. The REST and WebSocket tests need local loopback socket access.
The tests cover signed bounds, floors, inheritance, expiry, thresholds, static levels, repeat limits, tap spam, and reload rejection.
Generated REST fixtures and protobuf round trips check the engine/server contract.

Run the native client tests, including the level-up effect, with `cyberia-client/tests/run.sh`.

Build the client with its existing `Web.mk` target and Emscripten SDK.
The SDK needs Python 3.10 or later and a writable cache.
