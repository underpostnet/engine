/**
 * Top-Down Procedural Generation guided by LLMs (Semantic Reverse-Engineering).
 *
 * Takes a single natural-language theme and asks Google Gemini to infer the
 * complete non-spatial textual backbone of a CyberiaSaga ecosystem: saga
 * metadata, quests, dialogues, actions, and object-layer item definitions.
 *
 * Architectural boundary: this stage owns TEXT and LOGICAL METADATA only. Every
 * spatial / rendering field (initCellX/Y, map grid sizes, asset CIDs, render
 * frames) is forced to null / empty / default here. Spatial + graphic synthesis
 * is a separate downstream stage.
 *
 * @module src/projects/cyberia/generate-saga.js
 * @namespace CyberiaSagaGenerator
 */

import fs from 'fs-extra';
import nodePath from 'path';
import crypto from 'crypto';
import { GeminiClient } from './gemini-client.js';
import { computeSha256 } from './object-layer.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

/** Canonical Cyberia base-lore document, passed to the model when auto-generating a theme. */
const DEFAULT_LORE_PATH = 'src/client/public/cyberia-docs/CYBERIA-LORE.md';

/** Default directory for generated saga payload dumps when `--out` is not given. */
const DEFAULT_SAGA_OUT_DIR = './engine-private/cyberia-sagas';

/**
 * The macro confederations / power blocs, keyed by the value accepted in
 * `--faction-context`. They are large powers always present in the world. By
 * default they stay in the BACKGROUND (borders, trade, security, history); only
 * when `--faction-context` names one or more do they become the saga's DRIVER.
 * @type {Object<string, string>}
 */
const FACTIONS = {
  zenith: 'the Zenith Empire (Red)',
  nova: 'the Nova Republic (Blue)',
  atlas: 'the Atlas Confederation (Yellow)',
  neutral: 'unaligned independent enclaves / neutral parties',
};

/**
 * Highly heterogeneous, character name pool for Cyberia.
 * Structured as an object with specific cultural and system keys to map against faction logic.
 * Erases LLM name-collapse bias entirely by injecting specific terrestrial diaspora demographics.
 */
const CHARACTER_NAMES_POOL = {
  // ==========================================================================
  // classic_western_scifi: Gritty Anglo operators, pilots, and military enforcers.
  // ==========================================================================
  classic_western_scifi: [
    'miller-the-drifter',
    'holden-the-gasket',
    'brinkley-the-slick',
    'vance-the-operator',
    'kestrel-cole',
    'marlowe-the-smuggler',
    'rook-the-dealer',
    'mercer-the-skiff',
    'kaelen-thor',
    'bryn-the-warden',
    'thorne-the-enforcer',
    'garo-the-captain',
    'kross-the-inspector',
    'sark-the-director',
    'valerius-krell',
    'spence-the-cutter',
    'maverick-the-diver',
    'garrison-finch',
    'flint-the-scrapper',
    'barrett-the-tech',
    'clara-the-patchwork',
    'warren-the-greaser',
    'sterling-the-broker',
    'ridley-the-oracle',
    'beckett-the-fuse',
    'gallows-the-miner',
    'vane-the-rigger',
    'baxter-the-runner',
    'sawyer-the-rivet',
    'cord-the-spacer',
    'fletcher-the-welder',
    'grady-the-hauler',
    'mccabe-the-scout',
    'reid-the-operator',
    'hardin-the-guard',
  ],

  // ==========================================================================
  // mutagen_clans: Gritty, organic descriptors highlighting biological adaptations.
  // ==========================================================================
  mutagen_clans: [
    'grip-the-cutter',
    'chitin-garo',
    'helix-marrow',
    'thaw-vane',
    'spore-kael',
    'gasket-bryn',
    'blight-malik',
    'fallow-tress',
    'rancor-voss',
    'strand-orion',
    'slag-kira',
    'bile-zane',
    'carapace-jov',
    'braid-nesta',
    'suture-gray',
    'graft-mire',
    'fungus-thorne',
    'ossify-krell',
    'weave-zola',
    'spit-vance',
    'grip-the-spanner',
    'twitch-malone',
    'marrow-thorne',
    'spoil-kari',
    'tendril-vane',
    'filter-bryn',
    'canker-soto',
    'scale-zane',
    'gristle-kross',
    'bile-sark',
    'leech-the-valve',
    'maggot-vance',
    'tumor-the-smith',
    'pustule-gray',
    'cyst-the-rigger',
    'scab-marlowe',
    'slime-kestrel',
    'crust-the-miner',
    'venom-zola',
    'rot-the-broker',
  ],
  // ==========================================================================
  // low_level_synthetics: Hardcoded, serialized, or technical terms for utility frames.
  // ==========================================================================
  low_level_synthetics: [
    'null-07',
    'syntax-error',
    'unit-ohm',
    'vector-sigma',
    'the-real-echo',
    'decibel-4',
    'glitch-v',
    'axiom-9',
    'kilo-byte-zero',
    'protocol-m',
    'modulus-prime',
    'static-fringe',
    'proxy-beta',
    'the-index-bot',
    'subroutine-6',
    'kernel-voss',
    'algor-8',
    'cipher-null',
    'bit-rot-v',
    'latency-nine',
    'cache-miss',
    'ping-101',
    'baud-rate',
    'buffer-overflow',
    'parity-check',
    'bus-route-4',
    'logic-gate-x',
    'stack-trace',
    'daemon-32',
    'cold-boot',
    'sector-wipe',
    'raw-sector-0',
    'baud-96',
    'parity-bit',
    'eeprom-leak',
    'stack-dump',
    'firmware-ghost',
    'checksum-fail',
    'hash-miss',
    'cycle-skip',
  ],

  // ==========================================================================
  // high_fidelity_synthetics: Complex mathematical or philosophical sentient concepts.
  // ==========================================================================
  high_fidelity_synthetics: [
    'theorem-nine',
    'sovereign-logic',
    'monad-v',
    'the-epitaph-engine',
    'aesthete-alpha',
    'calculus-of-grief',
    'phantasm-0',
    'stochastic-ghost',
    'prism-voss',
    'solipsism-one',
    'the-static-oracle',
    'harmonic-interval',
    'lemma-seven',
    'recursive-sigh',
    'entropy-vane',
    'algorithm-siddhartha',
    'aura-calculated',
    'the-linear-dreamer',
    'null-point-euler',
    'symmetry-aspect',
    'the-boolean-monk',
    'infinite-regress',
    'qualia-six',
    'stochastic-echo',
    'turing-lament',
    ' Gödel-null',
    'eigen-vector-v',
    'markov-phantom',
    'fourier-decay',
    'laplace-ghost',
  ],

  // ==========================================================================
  // global_latin_diaspora: Romance languages remixed with industrial ship parts.
  // ==========================================================================
  global_latin_diaspora: [
    'mateo-del-scrap',
    'elena-soto-vera',
    'ramon-la-antena',
    'camila-cruz',
    'santi-el-filtro',
    'valeria-frontera',
    'diego-hierro',
    'ignacio-vela',
    'sofia-gasket',
    'tomas-alambre',
    'juana-regulador',
    'cheo-the-welder',
    'luz-del-búnker',
    'gabo-the-breaker',
    'marisol-trench',
    'paco-fluido',
    'rafa-el-perno',
    'catalina-zonda',
    'nico-la-válvula',
    'alba-mina',
    'jean-pierre-relay',
    'amélie-fusible',
    'mathieu-soupape',
    'luc-la-jauge',
    'chantal-static',
    'giovanni-colonna',
    'matteo-condotto',
    'francesca-raccordo',
    'enzo-pressione',
    'chiara-filtro',
    'radu-sonda',
    'sorin-ventil',
    'doina-scânteie',
    'mirela-flanșă',
    'bogdan-carcasă',
    'thiago-gaxeta',
    'felipe-fio',
    'amara-blindaje',
    'ze-do-manifold',
    'beatriz-vácuo',
    'manon-turbines',
    'clovis-piston',
    'yves-the-greaser',
    'rené-de-la-grille',
    'orane-brume',
    'daniele-scintilla',
    'paolo-la-massa',
    'silvia-condensatore',
    'stefano-giunto',
    'ilaria-collettore',
  ],

  // ==========================================================================
  // east_asian_pacific_diaspora: Hanzi/Kanji roots merged with quantum and cybernetics.
  // ==========================================================================
  east_asian_pacific_diaspora: [
    'zhou-quantum-grid',
    'li-the-weaver',
    'feng-signal-loss',
    'mei-lin-bypass',
    'tao-the-glitch',
    'kenji-circuit',
    'rei-cyber-chitin',
    'hiroshi-data-stream',
    'yuki-asymmetry',
    'takashi-solder',
    'min-jun-uplink',
    'ji-woo-buffer',
    'seo-yeon-relic',
    'sung-ho-node',
    'hyun-the-broker',
    'nguyen-the-fringe',
    'thanh-overclock',
    'minh-the-diver',
    'an-signal-thief',
    'linh-tether',
    'chen-the-extractor',
    'sato-the-axiom',
    'kim-the-scrubber',
    'wang-the-hydraulics',
    'hwang-the-code',
    'zhang-dark-fiber',
    'sun-the-modem',
    'zhao-the-compiler',
    'yamamoto-shunt',
    'tanaka-relay',
    'choi-the-array',
    'park-the-splitter',
    'le-the-vent',
    'pham-the-conduit',
    'hoang-the-junction',
  ],

  // ==========================================================================
  // middle_eastern_turkish_diaspora: Desert roots reimagined as void frequency systems.
  // ==========================================================================
  middle_eastern_turkish_diaspora: [
    'malik-al-señal',
    'fatima-the-navigator',
    'tariq-downlink',
    'zainab-the-shifter',
    'youssef-coax',
    'amir-the-archivist',
    'layla-static-weaver',
    'karim-the-fitter',
    'soraya-the-ghost',
    'omar-the-valve',
    'arash-the-frequency',
    'cyra-the-pulse',
    'navid-the-breaker',
    'roya-the-link',
    'kian-the-solder',
    'devran-the-gasket',
    'aylin-the-zonda',
    'can-the-regulator',
    'zehra-the-trench',
    'eren-the-scrap',
    'idris-the-scavenger',
    'samira-the-filter',
    'farrah-the-beacon',
    'hassan-the-gauge',
    'zayd-the-anchor',
    'tanzil-the-carrier',
    'nadia-the-scrambler',
    'habib-the-injector',
    'parvisa-the-beam',
    'sinan-the-boiler',
    'levent-the-hose',
    'selim-the-shifter',
    'asli-the-nozzle',
    'damla-the-leak',
    'volkan-the-flare',
  ],

  // ==========================================================================
  // sub_saharan_african_diaspora: Heavy isotope extraction and outpost life-support lineages.
  // ==========================================================================
  sub_saharan_african_diaspora: [
    'olumide-the-welder',
    'adebayo-the-cutter',
    'chioma-the-helix',
    'femi-the-grounded',
    'tunde-the-spanner',
    'sipho-the-iron',
    'thabo-the-bunker',
    'zandile-the-marrow',
    'nomvula-the-thaw',
    'bheki-the-slag',
    'juma-the-relay',
    'mwangi-the-scrubber',
    'asha-the-tether',
    'chani-the-vane',
    'kofi-the-fuse',
    'abebe-the-core',
    'selam-the-aura',
    'yonas-the-syntax',
    'tariku-the-grid',
    'makeda-the-sovereign',
    'chukwuma-the-drill',
    'ekene-the-bracket',
    'ifemi-the-seal',
    'lekan-the-ventilation',
    'mensah-the-gauge',
    'dlamini-the-vault',
    'khumalo-the-shaft',
    'ndlovu-the-crusher',
    'zulu-the-boiler',
    'diallo-the-tanker',
  ],
};

// ============================================================================
// ANTI-REPETITION / KEYWORD BLACKLIST GUIDANCE
// ============================================================================

/**
 * Build an anti-cliche / originality / anti-repetition prompt block. Tells the
 * model to avoid overused keywords and specific tired tropes that the model
 * gravitates toward (protocols, viruses, refineries, mining, breaches, heists).
 * This is the PRIMARY lever for variety since each CLI call is single-shot
 * (no persistent memory between runs).
 * @returns {string}
 */
function buildOriginalityGuidance() {
  return [
    'ORIGINALITY & ANTI-REPETITION DIRECTIVE — this is CRITICAL for thematic variety:',
    '',
    'THE FOLLOWING KEYWORDS AND CONCEPTS ARE OVERUSED AND MUST BE AVOIDED:',
    '- "protocol" / "breach" / "leak" / "bleed" / "containment" — these appear in almost every saga.',
    '  Find fresh language for problems and boundaries.',
    '- "refinery" / "mining" / "extraction" / "isotope" / "sludge" / "vent" — resource-extraction',
    '  premises dominate. Consider other kinds of settings and conflicts.',
    '- "signal" / "frequency" / "pulse" / "transmission" / "beacon" — mysterious-signal plots are',
    '  an overused shortcut. Find other catalysts for story.',
    '- "heist" / "smuggler" / "black market" / "con artist" / "protection racket" — crime plots',
    '  are a default the model reaches for. Choose other conflict drivers.',
    '- "virus" / "meme-virus" / "plague" / "outbreak" / "quarantine" — disease narratives are tired.',
    '- "data-heist" / "data-smuggler" / "data-courier" / "encrypted" — data-as-Maguffin is a crutch.',
    '- "rogue AI" / "rogue algorithm" / "rogue predictive" / "corrupted prediction" — rogue-machines',
    '  are a lazy conflict generator.',
    '- "hyperspace" / "Instance" / "simulation" / "virtual" / "digital" — these words saturate every saga',
    '  that involves the digital layer. Avoid using them as crutch descriptors. Hyperspace in Cyberia is',
    '  like the Internet in our world — it is a mundane, everyday infrastructure, not a magical realm.',
    '  Treat Instances as ordinary places people log into for work, school, entertainment, and civic life,',
    '  just as we use the web today. Do NOT treat them as mysterious otherworldly dimensions.',
    '- "memory-city" / "living archive" / "simulated empire" / "dreamland instance" — these specific',
    '  hyperspace-location clichés are overused. Invent other kinds of Instance purposes: tax filing',
    '  systems, municipal planning simulators, educational archives, vocational training programs,',
    '  social media remnants, automated customer service hells, defunct multiplayer games still running,',
    '  government surveillance logs, real estate listing databases, or abandoned research simulations.',
    '- "uploaded consciousness" / "data-double" / "data-ghost" / "mind-indexing" / "cognitive grid" —',
    '  consciousness-upload and digital-immortality plots are tired. Consider other relationships',
    '  between people and their data: work portfolios, academic records, legal identities, credit scores,',
    '  social reputation systems, medical histories, creative portfolios — mundane data that matters.',
    '',
    'INSTEAD: invent something strange, specific, small-scale, and culturally grounded in Cyberia.',
    'Draw from the lived reality of frontier infrastructure, ecology, labor, religion, family,',
    'subcultures, education, art, sports, music, food, childhood, aging, death rituals, navigation,',
    'weather, architecture, dreams, language evolution, craftsmanship, and the weird byproducts',
    'of hyperspace physics.',
    '- Treat hyperspace Instances as you would treat websites and cloud services in our world — they are',
    '  everyday infrastructure, not exotic otherworlds. People have school Instances, work Instances,',
    '  government Instances, entertainment Instances. Instance crashes are like server outages. Data loss',
    '  is like losing files on a hard drive. This mundane framing produces far more interesting and',
    '  relatable stories than treating every Instance as a mysterious magic realm.',
    '- The most compelling Cyberia sagas feel like anthropological documents from a broken future,',
    '  not Hollywood action scripts or generic cyberpunk.',
    '- Every item description, quest name, dialogue line, and map must feel like it belongs to',
    '  THIS specific saga theme — not a generic sci-fi prop.',
    '- If you find yourself using any of the blacklisted keywords above, STOP and find a different',
    '  way to express the same idea. Use concrete, specific language instead.',
  ].join('\n');
}

/**
 * Build a temporal distortion refinement block, injected only when the spatial
 * context is hyperspace or mixed, that pushes the model to think about time,
 * memory, and causality distortions inside Instances.
 * @param {string} spaceContextKey
 * @returns {string}
 */
function buildTemporalDistortionGuidance(spaceContextKey) {
  if (spaceContextKey !== 'hyperspace' && spaceContextKey !== 'mixed') return '';
  return [
    '',
    'TEMPORAL DISTORTION & HYPERSPACE REFINEMENT — because this saga involves hyperspace Instances:',
    '- Time inside Instances may flow differently: loops, echoes, arrested moments, or accelerated',
    '  decay. A character might age decades in what feels like hours outside, or repeat the same',
    '  conversation for subjective centuries.',
    '- Memory is fragile inside Instances: data-doubles diverge from originals, simulated people',
    '  may not know they are simulations, archives degrade and rewrite their own history.',
    '- The physics inside Instances is negotiated, not fixed: gravity, light, sound, and causality',
    '  are parameters that can be corrupted, patched, or exploited.',
    '- Entity persistence is not guaranteed: deleted things may leave ghost echoes, resurrections',
    '  may produce imperfect copies, and the boundary between a person and their data shadow is',
    '  blurry.',
    '- SPATIAL DISTORTION: space inside Instances does not follow Euclidean geometry. Rooms may be',
    '  larger inside than outside, corridors may loop back on themselves, two doors may lead to the',
    '  same room from different directions, and distance may be measured in loading time rather than',
    '  meters. Architecture is a user interface, not a physical constraint.',
    '- GLITCH PHENOMENA: Instances suffer from corruption artifacts — texture tearing, geometry',
    '  flickering, collision holes where players fall through the world, NPCs that repeat the same',
    '  animation loop forever, objects that load in late or not at all. These are not just cosmetic;',
    '  they can be navigated, exploited, or feared. A glitch might reveal a hidden area, crash a',
    '  critical system, or trap a user in an unresponsive state. Some glitches are harmless bugs;',
    '  others are symptoms of deeper corruption or intentional sabotage.',
    '- Use these distortions as narrative texture, not as the main plot gimmick. Let them shape',
    '  how characters experience the world but not replace grounded character motivation.',
  ].join('\n');
}

// ============================================================================
// END ANTI-REPETITION
// ============================================================================

/**
 * Grounded, world-first narrative buckets — the PRIMARY lever for thematic
 * variety. One is chosen at random as each saga's main subject so the output
 * spreads across lived Cyberia reality (daily life, ecology, salvage, trade,
 * Instances, anomalies, small communities…) instead of collapsing into
 * confederation politics every run. Not customizable.
 * @type {string[]}
 */
const SUBJECTS = [
  // ==========================================
  // ORIGINAL DESIGN BASES
  // ==========================================
  'the daily life and small routines of ordinary Cyberia inhabitants',
  'frontier survival in a harsh settlement, colony, or enclave',
  'the ecology and strange ecosystems of a wildzone, biosphere, or asteroid enclave',
  'salvage, scavenging and repair among ruins, wrecks, or derelict megastructures',
  'local trade, barter and a black market that keeps a community alive',
  'exploration and mapping of an uncharted region, ruin, or unknown Instance',
  'a mutagen clan — its culture, kinship, the prejudice it faces, and its survival',
  'a synthetic being seeking identity, work, rights, or belonging',
  'life inside a persistent hyperspace Instance: memory-cities, living archives, simulated homes',
  'a strange anomaly, breach, or bleed between the physical and hyperspace layers',
  'a small community facing a local crisis: failing resources, disease, a feud, a disaster',
  'the infrastructure and unsung workers who keep a habitat alive (power, water, air, relays)',
  'relic hunting and the mysteries of recovered pre-Cataclysm technology',
  'a personal story of family, memory, debt, or belonging on the frontier',
  'the culture, festival, ritual or everyday faith of a settlement or enclave',
  'a grounded job — courier, diver, medic, broker — that goes sideways',

  // ==========================================
  // CREATIVE GAPS: ART, MUSIC, EDUCATION, DREAMS
  // ==========================================
  'a settlement musician whose instrument is built from salvaged industrial parts and whose songs carry coded histories',
  'a school or apprenticeship system where children learn both pre-Cataclysm knowledge and frontier survival skills',
  'an artist whose medium is hyperspace static — weaving light and noise into living murals that decay over hours',
  'the dreams and nightmares of a community and the local "dream-reader" who interprets them for omens',
  'a poetry or storytelling tradition where performers compete by improvising from fragmentary ancient texts',
  'a dance form that evolved from zero-gravity maintenance work into a competitive performance art',
  'an archive of pre-Cataclysm music stored on decaying media, and the struggle to preserve it before it degrades',

  // ==========================================
  // CREATIVE GAPS: CHILDHOOD, AGING, DEATH
  // ==========================================
  'a group of frontier children forming their own secret society with its own rules, currency, and taboos',
  'the last surviving elder who remembers pre-Cataclysm Earth, and the community race to record their memories',
  'a death ritual where the deceased is composted into a tree grafted with cybernetic memorial nodes',
  'a coming-of-age ceremony where adolescents must survive alone for a cycle in the wilderness',
  'an orphanage for children whose parents died in a hyperspace Instance collapse, run by synthetic caretakers',
  'a hospice for aging synthetics whose bodies are degrading and who choose how to spend their final cycles',

  // ==========================================
  // CREATIVE GAPS: FOOD, GARDENING, CRAFTS
  // ==========================================
  'a community garden carved into a derelict freighter hull, where the soil is made from crushed asteroid and composted waste',
  'a culinary tradition based on cooking with industrial waste heat and recycled nutrient paste',
  'a competition between enclaves over who can brew the best alcohol from native fungal cultures',
  'a master craftsperson who hand-forges tools from reclaimed metal, and the apprentice who must preserve the technique',
  'a textile guild that weaves fabric from optical fiber scrap and mutagen-silk, creating garments that shift color',
  'the seasonal harvest festival of a genetically engineered fungus that forms the settlement dietary staple',

  // ==========================================
  // CREATIVE GAPS: WEATHER, NAVIGATION, ARCHITECTURE
  // ==========================================
  'a settlement whose architecture is built entirely from recycled shipping containers and salvaged hull plates',
  'a navigator guild that reads magnetic anomalies and debris patterns to chart safe routes through asteroid fields',
  'the adaptation of a coastal enclave to rising chemical tides that dissolve untreated metal',
  'a storm-chaser subculture that follows electro-static atmospheric events to harvest rare charged particles',
  'a labyrinthine market district built inside the cooling towers of a dead power station',
  'a group of tunnel-dwellers who maintain an underground rail network abandoned since the Cataclysm',

  // ==========================================
  // CREATIVE GAPS: SPORTS, GAMES, PLAY
  // ==========================================
  'a zero-gravity sport played inside a rotating habitat ring, with teams from different enclaves competing',
  'a card game played with pre-Cataclysm trading cards that have become a de facto currency in some sectors',
  'a racing circuit through abandoned industrial zones where pilots navigate debris at lethal speed',
  'a children game played with modified drone parts that has become a semi-professional spectator sport',
  'a chess-like strategy game that uses holographic Instance projections as the board and pieces',
  'a physical endurance contest held annually across a toxic waste zone, testing survival gear and willpower',

  // ==========================================
  // CREATIVE GAPS: LANGUAGE, HISTORY, PHILOSOPHY
  // ==========================================
  'a creole language evolving from mixed diaspora tongues, and the linguist trying to document it before it shifts again',
  'a philosophical debate in a frontier enclave about whether synthetic beings have souls',
  'a historian who reconstructs pre-Cataclysm events from contradictory fragments, and the ethical choices this forces',
  'a community whose identity is built around a single surviving pre-Cataclysm book that everyone interprets differently',
  'a naming ceremony where newborns receive both a human name and a synthetic machine-identifier',
  'a tradition of oral contracts sealed by sharing a meal, threatened by written legal codes imposed by outside powers',

  // ==========================================
  // CREATIVE GAPS: ECOLOGY, ANIMALS, SYMBIOSIS
  // ==========================================
  'a domesticated bio-construct species that has evolved alongside humans for generations, developing surprising intelligence',
  'a coral-like organism that grows on derelict spacecraft and is harvested for its bioluminescent properties',
  'a fungal network connecting several settlements that is used for slow-speed biological communication',
  'a symbiotic relationship between a human community and a silicon-based life form that shares their habitat',
  'the migration pattern of space-adapted creatures that follow thermal vents across the void',
  'a veterinary practice that treats both biological and mechanical companions, blurring the line between them',

  // ==========================================
  // CREATIVE GAPS: PSYCHOLOGY, COMMUNITY, CARE
  // ==========================================
  'a community counselor who mediates disputes using a combination of talk therapy and neural-link diagnostics',
  'a support group for people who have lost loved ones to Instance collapses and cannot retrieve their data-ghosts',
  'a neighborhood watch system where synthetic and human members patrol together, building trust across species',
  'a mutual-aid network that shares resources across enclaves without formal currency or barter records',
  'a rehabilitation program for former soldiers from confederation wars, teaching them civilian skills',
  'a collective bargaining action by habitat maintenance workers demanding safer working conditions in radiation zones',

  // ==========================================
  // OTHER CREATIVE GAPS: DIPLOMACY, TRANSPORT, PRIVACY
  // ==========================================
  'a transport union that controls the only safe ferry route through a treacherous region, and the politics of passage',
  'a community debate over whether to accept a new technology that would trade personal privacy for safety',
  'a diplomatic mission between two enclaves that communicate through elaborate gift-exchange protocols',
  'a census-taker traveling between settlements to count the population, discovering communities thought lost',
  'a project to build a communal library containing both physical books and digital archives',
  'a group of volunteers who maintain the public charging stations that keep essential infrastructure running',

  // ==========================================
  // CYBER WARFARE & ASYMMETRIC SURVIVAL (ATLAS INFLUENCE, reduced)
  // ==========================================
  'a cell of independent code-smiths fabricating illegal neural link bypasses for local enclaves',
  'an irregular skirmish over a strategic hyper-real crossing hidden in a scrap-zone',
  'an underground network of signal thieves and veil-runners intercepting restricted data streams',

  // ==========================================
  // DEEP INFRASTRUCTURE & RE-COLONIZATION (ZENITH INFLUENCE, reduced)
  // ==========================================
  'the brutal tax extraction and martial policing of an unaligned frontier outpost',
  'the friction between rigid, purist occupational forces and native hybrid cultures',
  'the dangerous reclamation of an abandoned, weaponized bunker from the early colonization waves',

  // ==========================================
  // INSTANCE ANOMALIES & MACHINE LOGIC (NOVA INFLUENCE, reduced)
  // ==========================================
  'the slow, mechanical shift of an ancient simulation that has begun to mimic physical weather',
  'a virtual sanctuary where a long-dead historical figure still rules through static and ghost data',
  'a mapping expedition inside a corrupted dreamland instance before its code structure collapses',

  // ==========================================
  // MUTAGEN, SYNTHETIC & OUTCAST NARRATIVES (reduced)
  // ==========================================
  'a refugee crisis involving displaced Mutagen clans seeking asylum in isolationist sectors',
  'the generation gap inside a Mutagen enclave between old traditionalists and hyper-adapted youth',

  // ==========================================
  // PRE-CATACLYSM & THE BLEED (reduced, no "signal")
  // ==========================================
  'the haunting replication of a pre-Cataclysm Earth city rotting inside a forgotten Instance',
  'a physical heist targeting a high-security vault that mirrors a structural maze in hyperspace',
  'the tragic fallout of a real-world community whose identities were purged from the hyper-spatial grid',
  'the investigation of an unstable anchor site where physical matter is actively losing form',

  // ==========================================
  // HIGH-VARIETY: STRANGE, WEIRD, UNEXPECTED (curated survivors)
  // ==========================================
  'the migration of a nomadic caravan across a desert of razor-sharp silicon sand',
  'a low-stakes regional culinary rivalry using synthetic, hyper-evolved, or bio-luminescent ingredients',
  'the legal and social defense of a pet or domestic bio-construct facing an execution order',
  'the chaotic management of a scrap-yard metal fighting league or low-tier racing circuit',
  'a neighborhood dispute over the noise and psychic bleed of an illegal, homemade broadcast antenna',
  'the grueling shifts of a toxic sludge cleaner in the subterranean vents of a hyper-city',
  'a generational family heirloom with a hidden ancient encryption key that goes missing',
  'a cult that worships a massive dead corporate logo as a physical symbol of ancient protection',
  'the exploration of a completely silent, empty sector where all digital sound is mysteriously absorbed',
  'the retrieval of a cryo-frozen tourist from the pre-Cataclysm era who refuses to accept the new reality',
  'a localized reality loop where a single neighborhood relives the same 24 hours of a historic disaster',
  'the desperate harvest of a rare psychoactive moss that only grows on overheating reactor shielding',
  'a micro-economy built entirely around the trade of physical paper books and pre-digital plastic media',
  'the structural collapse of a trash-heap habitat built on top of a highly unstable geothermic vent',
  'a tracking hunt for an invasive data-eating pest species chewing through local fiber-optic cables',
  'the complex barter system of an underwater kelp-farming community living beneath an oil-slick sea',
  'an orphanage for abandoned malfunctioning companion drones trying to build their own social hierarchy',
  'the stress of an independent garbage hauler accidentally dumping toxic corporate waste into a sacred well',
  'a listening post crew decoding a repeating signal from a dead star that contains a biological blueprint',
  'the slow madness of a deep-space relay station whose crew has not seen physical light in six years',
  'a salvage claim dispute over a derelict alien vessel that appears to be made of compressed fossilized code',
  'the first contact protocol with a silicon-based life form that communicates through seismic resonance',
  'a rogue planet drifting through the system whose gravity well distorts time perception in nearby habitats',
  'the ethical dilemma of a mining colony that discovers the asteroid they are excavating is a living organism',
  'a synthetic artist whose neural-network-generated paintings cause physical hallucinations in viewers',
  'a legal trial to determine if a factory-installed AI that developed emotions can be legally decommissioned',
  'a community of uploaded human consciousnesses living on a corrupted server fighting gradual data decay',
  'a cloned child discovering their entire memory bank was fabricated and their original died years ago',
  'a collective of abandoned service robots that have developed religion centered on a broken water pump',
  'a low-intensity border skirmish fought entirely through proxy drones and legal document filings',
  'the tension of a neutral enclave caught between two confederations both demanding exclusive allegiance',
  'a synthetic-human hybrid struggling with body dysphoria while serving as a deep-sea oil rig operator',
  'the ethical chaos of a drug that lets users temporarily experience the sensory input of any nearby being',
  'a frontier medic running a clinic out of a converted cargo container without a license or clean tools',
  'an archaeological dig unearthing a pre-Cataclysm bunker whose occupants apparently never aged',
  'the ceremonial reckoning of a settlement that must publicly reckon with a century-old act of betrayal',
  'an oral historian traveling between enclaves collecting stories before the last pre-Cataclysm witnesses die',
  'a rehabilitated war criminal forced to live next door to the community they once victimized',
  'the rediscovery of a lost terraforming protocol that could make dead worlds live again—at a terrible cost',
  'a truth-commission hearing where synthetic war veterans testify about atrocities they were programmed to commit',
];

/**
 * The four broad, well-defined narrative types. One is chosen uniformly
 * (≈25% each) unless overridden by `--tone`, and its full description is fed to
 * the model so the saga commits hard to that register (avoids every saga
 * collapsing into the same generic "spaceship mission").
 * @type {Object<string, string>}
 */
const TONES = {
  adventure:
    'ADVENTURE — a noir, high-risk mission: covert operations, sabotage, infiltration, open warfare and ' +
    'combat, dangerous experimental technology, rogue AI and mystery. The driving plot is danger and intrigue.',
  politics:
    'POLITICS — power, influence and ideology at ANY scale: a settlement council, a clan or union dispute, ' +
    'enclave governance, a local revolution, a treaty or allegiance shift — or, less often, confederation ' +
    'geopolitics. The driving plot is who holds power and why, and the ideological conflict beneath it. ' +
    'It works just as well for a small community as for the great powers.',
  tragic:
    'TRAGIC — a genuinely heartbreaking, or intimate story: emotional and sentimental themes centered on ' +
    'family, bonds, loss and the death of loved ones inside small personal micro-realities. The driving ' +
    'plot is grief and what it costs — not spectacle.',
  comedy:
    'COMEDY — everyday absurdity, silliness and stupidity on the frontier. Played for humor: low stakes, ' +
    'ridiculous situations and flawed, funny characters. Take it lightly.',
};

/**
 * The two equally important layers of Cyberia (plus their interplay). The base
 * lore is titled "The Frontier of Hyperspace", which biases an unconstrained
 * model toward hyperspace-only premises — so the spatial context is chosen
 * explicitly and uniformly (≈33.3% each) unless overridden by `--space-context`.
 * @type {Object<string, string>}
 */
const SPACE_CONTEXTS = {
  physical:
    'PHYSICAL LAYER ONLY — the harsh, resource-driven material reality of fleets, colonies, orbital ' +
    'fortresses, infrastructure, territory, logistics and direct force. Do NOT involve hyperspace, ' +
    'Instances, digital realms or memory-cities.',
  mixed:
    'MIXED LAYERS — the porous interplay between physical reality and hyperspace, where relics, neural ' +
    'links, breaches and megastructures let events bleed between the two layers so each reshapes the other.',
  hyperspace:
    'HYPERSPACE LAYER ONLY — inside the persistent Instances: living archives, simulated empires, ' +
    'memory-cities and evolving digital ecosystems where time, geography and identity are fluid. ' +
    'Keep the premise within hyperspace, not the physical frontier. Emphasize temporal distortion, ' +
    'memory decay, simulated physics, recursive geometries and the fragile ontology of digital ' +
    'consciousness — space bends, time loops, cause and effect warp inside Instances.',
};

/**
 * How much the saga's population has mixed across Earth's diasporas and Cyberia's
 * synthetic / mutagen / frontier cultures. One is chosen uniformly unless
 * overridden by `--cultural-exposure`. Shapes how varied vs. internally
 * consistent the generated character names feel.
 * @type {Object<string, string>}
 */
const CULTURAL_EXPOSURES = {
  cosmopolitan:
    "COSMOPOLITAN (high exposure) — a melting-pot setting with heavy mixing of Earth's historical " +
    'populations: diverse linguistic influences, hybrid surnames, intermarriage across diasporas, ' +
    'multicultural settlements, and frequent blending of human, synthetic, mutagen and frontier ' +
    'traditions. Maximize demographic variety across characters.',
  local:
    'LOCAL (low exposure) — isolated settlements, closed clans and frontier enclaves with strong local ' +
    'naming traditions and little demographic mixing: repeated family roots and shared linguistic ' +
    'patterns within the community. Keep names internally consistent with one another (while still ' +
    'avoiding clichés).',
};

/**
 * @param {Array} arr
 * @returns {*} A uniformly random element.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Return a new array with the elements of `arr` in random order (Fisher-Yates).
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  const pool = [...arr];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * Resolve the spatial context for theme synthesis. An explicit, valid override
 * wins; otherwise one of the three contexts is chosen uniformly at random.
 * @param {string} [override] - 'physical' | 'mixed' | 'hyperspace'.
 * @returns {string} A valid context key.
 */
function resolveSpaceContext(override) {
  if (override) {
    const key = String(override).toLowerCase();
    if (SPACE_CONTEXTS[key]) return key;
    logger.warn(
      `Unknown --space-context "${override}"; choosing at random. Valid: ${Object.keys(SPACE_CONTEXTS).join(', ')}`,
    );
  }
  return pickRandom(Object.keys(SPACE_CONTEXTS));
}

/**
 * Resolve the narrative tone for theme synthesis. An explicit, valid override
 * wins; otherwise one of the four tones is chosen uniformly at random.
 * @param {string} [override] - 'adventure' | 'politics' | 'tragic' | 'comedy'.
 * @returns {string} A valid tone key.
 */
function resolveTone(override) {
  if (override) {
    const key = String(override).toLowerCase();
    if (TONES[key]) return key;
    logger.warn(`Unknown --tone "${override}"; choosing at random. Valid: ${Object.keys(TONES).join(', ')}`);
  }
  return pickRandom(Object.keys(TONES));
}

/**
 * Resolve `--faction-context` into descriptive faction strings. Accepts a
 * comma-separated list of keys ('zenith' | 'nova' | 'atlas' | 'neutral');
 * unknown keys are warned and skipped. When unset/empty the saga keeps the
 * confederations in the background (returns []).
 * @param {string} [override] - e.g. 'nova,zenith'.
 * @returns {string[]} Distinct descriptive faction strings (empty = background).
 */
function resolveFactionContext(override) {
  if (!override) return [];
  const resolved = [];
  for (const raw of String(override).split(',')) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    if (FACTIONS[key]) {
      if (!resolved.includes(FACTIONS[key])) resolved.push(FACTIONS[key]);
    } else {
      logger.warn(`Unknown --faction-context "${key}"; ignoring. Valid: ${Object.keys(FACTIONS).join(', ')}`);
    }
  }
  return resolved;
}

/**
 * Resolve `--character-context` into a list of {@link CHARACTER_NAMES_POOL} keys
 * to draw naming inspiration from. Accepts a comma-separated list; unknown keys
 * warn and are skipped. When unset (or none resolve) a random non-empty subset
 * is chosen so each saga leans into a different cultural mix.
 * @param {string} [override] - e.g. 'global_latin_diaspora,mutagen_clans'.
 * @returns {string[]} Distinct valid pool keys (always non-empty).
 */
function resolveCharacterContext(override) {
  const validKeys = Object.keys(CHARACTER_NAMES_POOL);
  if (override) {
    const resolved = [];
    for (const raw of String(override).split(',')) {
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      if (CHARACTER_NAMES_POOL[key]) {
        if (!resolved.includes(key)) resolved.push(key);
      } else {
        logger.warn(`Unknown --character-context "${key}"; ignoring. Valid: ${validKeys.join(', ')}`);
      }
    }
    if (resolved.length) return resolved;
    logger.warn('No valid --character-context keys; choosing a random subset of naming pools.');
  }
  // Random non-empty subset (size 1..N) so runs vary the cultural emphasis.
  return shuffle(validKeys).slice(0, 1 + Math.floor(Math.random() * validKeys.length));
}

/**
 * Resolve the cultural-exposure mode. An explicit, valid override wins; otherwise
 * one mode is chosen uniformly at random.
 * @param {string} [override] - 'cosmopolitan' | 'local'.
 * @returns {string} A valid exposure key.
 */
function resolveCulturalExposure(override) {
  if (override) {
    const key = String(override).toLowerCase();
    if (CULTURAL_EXPOSURES[key]) return key;
    logger.warn(
      `Unknown --cultural-exposure "${override}"; choosing at random. Valid: ${Object.keys(CULTURAL_EXPOSURES).join(', ')}`,
    );
  }
  return pickRandom(Object.keys(CULTURAL_EXPOSURES));
}

/**
 * Build the shared NAMING & CHARACTER CULTURE guidance block injected into every
 * generation stage that names people/places. Uses the selected pools as a
 * statistical/stylistic PRIOR (inspiration only, never a whitelist) and applies
 * the chosen cultural-exposure mode. Both default to random when unset.
 * @param {Object} [options]
 * @param {string} [options.characterContext] - Comma-separated pool keys (default random subset).
 * @param {string} [options.culturalExposure] - 'cosmopolitan' | 'local' (default random).
 * @returns {string}
 */
function buildNamingGuidance({ characterContext, culturalExposure } = {}) {
  const pools = resolveCharacterContext(characterContext);
  const exposureKey = resolveCulturalExposure(culturalExposure);

  const sampleLines = pools.map((key) => {
    const samples = shuffle(CHARACTER_NAMES_POOL[key]).slice(0, 6);
    return `  - ${key}: ${samples.join(', ')}`;
  });

  logger.info(`Naming: pools=[${pools.join(', ')}] | exposure=${exposureKey}`);

  return [
    'NAMING & CHARACTER CULTURE — apply to EVERY named entity: NPCs, quest givers, dialogue speakers,',
    'named enemies, historical figures and character references.',
    "- Cyberia's people descend from many of Earth's real diasporas and civilizations, evolved over",
    '  centuries of migration — names may hybridize or blend with professions, slang, technical terms,',
    '  and synthetic / mutagen / frontier / industrial influences. Make every name feel culturally',
    '  grounded and demographically believable.',
    '- AVOID generic cyberpunk stereotypes (no plain "John", "Nova", "X-99", cliché hacker aliases).',
    '- The pools below are INSPIRATION ONLY — a statistical/stylistic prior, NOT a whitelist. Do NOT copy',
    '  them mechanically. Invent fresh names with similar linguistic, demographic and stylistic',
    '  characteristics; evolve or recombine them. Reuse an exact sample only rarely.',
    'Inspiration pools:',
    ...sampleLines,
    `Cultural exposure — ${CULTURAL_EXPOSURES[exposureKey]}`,
  ].join('\n');
}

/**
 * Read the Cyberia base-lore document. Missing file is non-fatal (returns '').
 * @async
 * @param {string} [lorePath]
 * @returns {Promise<string>}
 */
async function loadLoreContext(lorePath = DEFAULT_LORE_PATH) {
  const resolved = nodePath.resolve(lorePath);
  if (!fs.existsSync(resolved)) {
    logger.warn(`Lore file not found at ${resolved}; proceeding without base lore context.`);
    return '';
  }
  return fs.readFile(resolved, 'utf8');
}

/** Default sampling temperature for theme synthesis (creativity / divergence). */
const DEFAULT_THEME_TEMPERATURE = 1.3;

/**
 * Invent a distinct, lore-grounded saga theme. Variety is driven by a random
 * world-first subject, an explicit narrative tone, an entropy token and a high
 * sampling temperature. Confederations stay in the background unless named via
 * `factionContext`, in which case they become the saga's central driver.
 *
 * @async
 * @param {GeminiClient} client
 * @param {string} lore - Base lore document text.
 * @param {Object} [options]
 * @param {string} [options.thinkingLevel]
 * @param {string} [options.spaceContext] - Force 'physical' | 'mixed' | 'hyperspace' (default random).
 * @param {string} [options.tone] - Force 'adventure' | 'politics' | 'tragic' | 'comedy' (default random).
 * @param {string} [options.factionContext] - Comma-separated faction keys to make the DRIVER (default: background).
 * @param {number} [options.temperature] - Sampling temperature (default 1.3).
 * @returns {Promise<{ theme: string, spaceContext: string, tone: string, subject: string, factions: string[] }>} The theme and chosen facets.
 */
async function synthesizeTheme(client, lore, { thinkingLevel, spaceContext, tone, factionContext, temperature } = {}) {
  const contextKey = resolveSpaceContext(spaceContext);
  const toneKey = resolveTone(tone);
  const subject = pickRandom(SUBJECTS);
  // Confederations are background unless --faction-context names one or more.
  const factions = resolveFactionContext(factionContext);
  const factionDriven = factions.length > 0;
  const nonce = crypto.randomBytes(4).toString('hex');

  const factionGuidance = factionDriven
    ? [
        'Faction emphasis — DRIVER: these confederation power(s) are the central pressure behind the saga:',
        `${factions.join(', ')}.`,
        'Even so, tell it through specific people, places and the MAIN SUBJECT above — show their reach as',
        'security, borders, edicts, agents or trade, not as abstract galaxy-spanning politics.',
      ]
    : [
        'Faction emphasis — BACKGROUND ONLY: the confederations (Zenith, Atlas, Nova) are distant, ambient',
        'powers here — felt through borders, trade influence, a security presence, taxes or old scars. Do',
        'NOT make confederation politics or warfare the subject; keep the focus local, lived and grounded.',
      ];

  // Build system prompt with originality guidance and temporal distortion refinement.
  const temporalGuidance = buildTemporalDistortionGuidance(contextKey);
  const originalityGuidance = buildOriginalityGuidance();

  const system = [
    'You are the lore-master of Cyberia. Using the BASE LORE below, invent ONE distinct, specific saga',
    'premise that lives inside this world. Make it novel and grounded — never a generic or repeated setup,',
    'and do NOT default to a "spaceship mission" or a war between confederations.',
    originalityGuidance,
    temporalGuidance,
    'Return ONLY JSON: { "theme": string } where theme is 1-2 concrete, evocative sentences.',
    '',
    "CRITICAL — the saga's MAIN SUBJECT (what it is really about) is:",
    `${subject}.`,
    '',
    'CRITICAL — the premise MUST be set in this spatial context:',
    SPACE_CONTEXTS[contextKey],
    '',
    'CRITICAL — the premise MUST commit fully to this narrative type / tone:',
    TONES[toneKey],
    '',
    ...factionGuidance,
    '',
    'BASE LORE:',
    lore || '(no lore provided)',
  ].join('\n');

  const user = [
    'Invent a fresh saga premise now, built around the MAIN SUBJECT above.',
    `Creative entropy token: ${nonce}.`,
    'Honor the spatial context, narrative tone, subject and faction emphasis exactly, and choose an',
    'unexpected, lived-in corner of the lore.',
  ].join('\n');

  logger.info(
    `Theme: subject="${subject}" | context=${contextKey} | tone=${toneKey} | ` +
      `factions=${factionDriven ? factions.join(', ') : 'background'}`,
  );
  const res = await client.chatJson({
    system,
    user,
    thinkingLevel,
    temperature: typeof temperature === 'number' ? temperature : DEFAULT_THEME_TEMPERATURE,
  });
  const theme = String(res.theme || '').trim();
  if (!theme) throw new Error('Theme synthesis returned an empty theme.');
  return { theme, spaceContext: contextKey, tone: toneKey, subject, factions };
}

/**
 * Slugify a free-text string into a stable kebab-case code.
 * @param {string} input
 * @returns {string}
 */
function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

/**
 * Shared role + hard-rules preamble prepended to every stage prompt.
 * The full ecosystem is generated in small sequential stages (see {@link generateSaga})
 * rather than one monolithic request, which keeps each model call bounded.
 * @type {string}
 */
const ROLE_PREAMBLE = [
  'You are a senior narrative systems designer for a top-down cyberpunk MMO called Cyberia.',
  'You perform SEMANTIC REVERSE-ENGINEERING: from a high-level theme you infer a self-consistent',
  'non-spatial textual game ontology BEFORE any map or art exists.',
  '',
  'HARD RULES:',
  '- TEXT/METADATA ONLY. Never invent spatial or graphic data. All spatial fields (sourceMapCode,',
  '  sourceCellX, sourceCellY, initCellX, initCellY, grid sizes) and all render/asset fields MUST be',
  '  null. No CIDs, no textures, no coordinates.',
  '- Every code/id MUST be lowercase kebab-case, unique, and semantically tied to the theme.',
  '- Output ONLY a single valid JSON object. No markdown fences, no prose.',
].join('\n');

/**
 * Logic-event handlers the cyberia-server skill dispatcher actually implements.
 * The skills stage MUST pick `logicEventId` from these keys — any other value is
 * a no-op in the simulation, so normalization drops unknown ones.
 * Mirrors DefaultSkillConfig (cyberia-server-defaults.js).
 * @type {Object<string, string>}
 */
const SKILL_LOGIC_EVENTS = {
  projectile:
    'Fires a projectile toward the tap direction, summoning a skill/bullet entity. Spawn chance and lifetime scale with Intelligence and Range.',
  coin_drop_or_transaction:
    'Drops coins automatically when an entity is killed; transfer amount scales with the kill-percent rules.',
  doppelganger:
    'Summons a passive clone of the caster that wanders nearby. Spawn chance scales with Intelligence.',
};

/**
 * Per-stage system prompt fragments. Each stage emits exactly one top-level key
 * and references canonical codes/ids handed in from previous stages.
 * @type {Object<string, string>}
 */
const STAGE_PROMPTS = {
  foundation: [
    'STAGE: foundation. Return ONE JSON object: { "saga": {...}, "objectLayers": [...] }.',
    'saga: { code, name, description, mapCodes:[] }  (leave mapCodes an empty array).',
    'objectLayers[]: { stats:{ effect, resistance, agility, range, intelligence, utility },',
    '  item:{ id, type, description, activable }, render:null }',
    '  item.type is one of: skin, breastplate, weapon, skill, coin, floor, obstacle, portal,',
    '  foreground, resource; every stat is an integer 0..10 balanced to the lore.',
    'Produce 5-10 object-layer items including at least one "coin" currency item AND at least two',
    '"skin" items that represent NAMED NPC characters players can speak to (these back "talk" quests).',
  ].join('\n'),

  maps: [
    'STAGE: maps. Return ONE JSON object: { "maps": [...] }.',
    'maps[]: { code, name, description }  (TEXT ONLY — no grid, cells, entities, coordinates or assets).',
    'Maps are the zones / places where the saga unfolds: the distinct locations the quest chain visits',
    'so the story makes sense (e.g. a hub settlement, a contested site, a hidden base, a final',
    'confrontation). Produce 3-6 maps; codes are lowercase kebab-case and unique.',
  ].join('\n'),

  quests: [
    'STAGE: quests. Return ONE JSON object: { "quests": [...] }.',
    'quests[]: { code, title, description, prerequisiteCodes:[string], unlocksQuestCodes:[string],',
    '  sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  steps:[ { id:string, description:string, objectives:[ { type:"collect"|"talk"|"kill",',
    '    itemId:string, quantity:number } ] } ], rewards:[ { itemId:string, quantity:number } ] }',
    'Objective itemId semantics: collect -> a collectible item id; kill -> the target enemy SKIN id;',
    '  talk -> the SKIN id of the NPC the player must speak to.',
    'Produce 3-6 quests forming a small unlock chain (use prerequisiteCodes / unlocksQuestCodes).',
    'REQUIRED: at least one quest MUST contain a "talk" objective whose itemId is one of the provided',
    'NPC skin item ids. Every objective itemId and reward itemId MUST be one of the provided item ids.',
  ].join('\n'),

  dialogues: [
    'STAGE: dialogues. Return ONE JSON object: { "dialogues": [...] }.',
    'dialogues[]: { code, order:number, speaker:string, text:string, mood:string }',
    'Create one dialogue group (a shared code with incrementing order 0,1,2,...) for each provided',
    'quest, plus one or two NPC greeting groups. Make the text reflect each quest theme.',
    'For EACH provided talk target, also create a dedicated talk dialogue group with code',
    '"quest-talk-<questCode>" spoken by that NPC — this is the conversation that completes the talk',
    'objective. Use the speaker name matching the NPC skin.',
  ].join('\n'),

  actions: [
    'STAGE: actions. Return ONE JSON object: { "actions": [...] }.',
    'actions[]: { code, label, dialogCode, sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  questDialogueCodes:[ { questCode, dialogCode } ], shopItems:[ { itemId, priceItemId, priceQty } ],',
    '  craftRecipes:[ { outputItems:[ { itemId, qty } ], ingredients:[ { itemId, qty } ] } ],',
    '  storageSlots:number }',
    'A "talk" objective is fulfilled ONLY when the player views the dialogCode that an action maps for',
    'that quest. So for EVERY provided talk target { questCode, skin } you MUST output an action that',
    'represents that NPC: set dialogCode to "default-<skin>" (the NPC greeting) and include a',
    "questDialogueCodes entry { questCode, dialogCode } whose dialogCode is that quest's talk dialogue",
    '(prefer "quest-talk-<questCode>"). Without this entry the talk objective can NEVER be completed.',
    'Produce 2-4 actions. Each questDialogueCodes[].questCode MUST be a provided quest code; every',
    'questDialogueCodes[].dialogCode MUST be a provided dialogue code; every shop/craft itemId MUST be',
    'a provided item id.',
  ].join('\n'),

  skills: [
    'STAGE: skills. Return ONE JSON object: { "skills": [...] }.',
    'skills[]: { triggerItemId, skills:[ { logicEventId, name, description, summonedEntityItemId } ] }',
    '  (omit logicEventIds — it is derived from skills[].logicEventId downstream).',
    '- triggerItemId MUST be one of the provided item ids — the item whose active layer fires the skill',
    '  (typically a "weapon" item, or the "coin" currency item).',
    '- logicEventId MUST be EXACTLY one of these supported handlers (anything else is ignored):',
    '    projectile, coin_drop_or_transaction, doppelganger.',
    '- summonedEntityItemId: for projectile, a provided "skill"-type item id (the bullet/effect spawned);',
    '  for coin_drop_or_transaction, the provided "coin" item id; for doppelganger, the literal',
    '  "$active_skin" (a runtime placeholder for the caster\'s own skin).',
    '- name + description: short, evocative text tied to THIS saga theme (the in-game skill copy).',
    'Produce 1-4 skills. Bind weapon items to "projectile" and the coin item to',
    '"coin_drop_or_transaction" where it fits the theme. Every triggerItemId and every non-placeholder',
    'summonedEntityItemId MUST be a provided item id.',
  ].join('\n'),
};

/**
 * Build a customization context block describing the spatial context, narrative
 * tone, faction emphasis, and subject that the model MUST honor in every stage.
 * This is the bridge between CLI overrides (--space-context, --tone, --factions)
 * and the generative prompts when the user provides a custom --prompt.
 * @param {Object} [opts]
 * @param {string} [opts.spaceContextKey] - 'physical' | 'mixed' | 'hyperspace'
 * @param {string} [opts.toneKey] - 'adventure' | 'politics' | 'tragic' | 'comedy'
 * @param {string[]} [opts.factions] - Resolved faction description strings
 * @param {string} [opts.subject] - The world-first subject string
 * @returns {string}
 */
function buildCustomizationGuidance({ spaceContextKey, toneKey, factions, subject } = {}) {
  const lines = [];
  if (subject) {
    lines.push(`CRITICAL — the saga's MAIN SUBJECT (what it is really about) is: ${subject}`);
  }
  if (spaceContextKey && SPACE_CONTEXTS[spaceContextKey]) {
    lines.push(`CRITICAL — the premise MUST be set in this spatial context: ${SPACE_CONTEXTS[spaceContextKey]}`);
  }
  if (toneKey && TONES[toneKey]) {
    lines.push(`CRITICAL — the premise MUST commit fully to this narrative type / tone: ${TONES[toneKey]}`);
  }
  if (factions && factions.length > 0) {
    lines.push(
      'Faction emphasis — DRIVER: these confederation power(s) are the central pressure behind the saga:',
      `${factions.join(', ')}.`,
      'Even so, tell it through specific people, places and the MAIN SUBJECT above — show their reach as',
      'security, borders, edicts, agents or trade, not as abstract galaxy-spanning politics.',
    );
  } else {
    lines.push(
      'Faction emphasis — BACKGROUND ONLY: the confederations (Zenith, Atlas, Nova) are distant, ambient',
      'powers here — felt through borders, trade influence, a security presence, taxes or old scars. Do',
      'NOT make confederation politics or warfare the subject; keep the focus local, lived and grounded.',
    );
  }
  return lines.join('\n');
}

/**
 * Compose a stage system prompt from the shared preamble, the stage fragment,
 * and (optionally) the shared naming/character-culture, originality, and customization guidance.
 * Injects originality anti-cliche and temporal distortion refinement into every stage.
 * @param {keyof typeof STAGE_PROMPTS} stage
 * @param {string} [namingGuidance] - Shared naming guidance (omitted when empty).
 * @param {string} [customizationGuidance] - Space/tone/faction/subject guidance (omitted when empty).
 * @param {string} [spaceContextKey] - Used to conditionally inject temporal distortion.
 * @returns {string}
 */
function buildStagePrompt(stage, namingGuidance = '', customizationGuidance = '', spaceContextKey = '') {
  const parts = [ROLE_PREAMBLE, STAGE_PROMPTS[stage]];
  if (namingGuidance) parts.push(namingGuidance);
  if (customizationGuidance) parts.push(customizationGuidance);
  // Inject anti-cliche guidance into every stage.
  parts.push(buildOriginalityGuidance());
  // Inject temporal distortion refinement when applicable.
  const temporalGuidance = buildTemporalDistortionGuidance(spaceContextKey);
  if (temporalGuidance) parts.push(temporalGuidance);
  return parts.join('\n\n');
}

/**
 * Build the user message for a stage: optional base lore for grounding, the
 * theme, and a compact JSON context of canonical references from prior stages.
 * @param {string} theme
 * @param {Object} [context]
 * @param {string} [lore] - Base lore text to ground the stage (omitted when empty).
 * @returns {string}
 */
function buildStageUser(theme, context, lore) {
  const lines = [];
  if (lore) lines.push('BASE LORE CONTEXT (ground the saga in this world):', lore, '');
  lines.push(`Theme seed: ${theme}`);
  if (context && Object.keys(context).length > 0) {
    lines.push('', 'Use ONLY these canonical references where required:', JSON.stringify(context));
  }
  return lines.join('\n');
}

/**
 * Coerce any value to a plain array.
 * @param {*} value
 * @returns {Array}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Extract the distinct (questCode, skin) targets implied by every `talk`
 * objective. The objective's itemId is the SKIN id of the NPC to speak to.
 * Tolerant of raw (un-normalized) or normalized quests.
 * @param {Object[]} quests
 * @returns {{ questCode: string, skin: string }[]}
 */
function collectTalkTargets(quests) {
  const seen = new Set();
  const targets = [];
  for (const q of asArray(quests)) {
    const questCode = slugify(q.code);
    if (!questCode) continue;
    for (const step of asArray(q.steps)) {
      for (const o of asArray(step.objectives)) {
        if (o?.type === 'talk' && o.itemId) {
          const skin = slugify(o.itemId);
          const key = `${questCode}::${skin}`;
          if (skin && !seen.has(key)) {
            seen.add(key);
            targets.push({ questCode, skin });
          }
        }
      }
    }
  }
  return targets;
}

/**
 * Build a minimal, schema-valid NPC skin object-layer item.
 * @param {string} id
 * @returns {Object}
 */
function makeSkinItem(id) {
  return {
    stats: { effect: 1, resistance: 1, agility: 1, range: 1, intelligence: 1, utility: 1 },
    item: { id, type: 'skin', description: `NPC ${id}`, activable: false },
    render: null,
  };
}

/**
 * Guarantee every `talk` objective is fulfillable. A talk objective completes
 * only when the player views the dialogCode an action maps for that quest, on
 * the NPC bot whose skin matches the objective's itemId. This repair makes the
 * data self-consistent even when the model omits a piece: for each talk target
 * it ensures (1) the NPC skin item exists, (2) a talk dialogue exists, and
 * (3) the action for `default-<skin>` maps questCode -> that dialogue.
 *
 * Mutates the provided arrays in place.
 * @param {{ quests: Object[], dialogues: Object[], actions: Object[], objectLayers: Object[] }} payload
 */
function ensureTalkLinkage({ quests, dialogues, actions, objectLayers }) {
  const itemIndex = new Map(objectLayers.map((ol) => [ol.item.id, ol]));
  const dialogueCodes = new Set(dialogues.map((d) => d.code));

  for (const { questCode, skin } of collectTalkTargets(quests)) {
    // 1. The talk objective's itemId must resolve to a real skin item.
    const existing = itemIndex.get(skin);
    if (!existing) {
      const item = makeSkinItem(skin);
      objectLayers.push(item);
      itemIndex.set(skin, item);
    } else if (existing.item.type !== 'skin') {
      existing.item.type = 'skin';
    }

    // 2. The talk dialogue the player must view to complete the objective.
    const talkDialogCode = slugify(`quest-talk-${questCode}`);
    if (!dialogueCodes.has(talkDialogCode)) {
      dialogues.push({ code: talkDialogCode, order: 0, speaker: skin, text: `(${skin} speaks.)`, mood: 'neutral' });
      dialogueCodes.add(talkDialogCode);
    }

    // 3. The NPC action (skin = default-<skin>) must map this quest -> a dialogue.
    const greetCode = `default-${skin}`;
    let action = actions.find((a) => a.dialogCode === greetCode);
    if (!action) {
      action = {
        code: slugify(`loc-${questCode}-${skin}`),
        label: skin,
        dialogCode: greetCode,
        sourceMapCode: null,
        sourceCellX: null,
        sourceCellY: null,
        questDialogueCodes: [],
        shopItems: [],
        craftRecipes: [],
        storageSlots: 0,
      };
      actions.push(action);
    }
    if (!action.dialogCode) action.dialogCode = greetCode;

    const entry = action.questDialogueCodes.find((qd) => qd.questCode === questCode);
    if (entry) {
      // Keep a model-provided mapping only if its dialogue actually exists.
      if (!dialogueCodes.has(entry.dialogCode)) entry.dialogCode = talkDialogCode;
    } else {
      action.questDialogueCodes.push({ questCode, dialogCode: talkDialogCode });
    }
  }
}

/**
 * Slugify an item reference, preserving the runtime placeholder sentinel
 * (`$active_skin` and any `$`-prefixed value), which the server resolves at
 * runtime rather than a real ObjectLayer id.
 * @param {string} value
 * @returns {string}
 */
function slugifyItemRef(value) {
  const v = String(value || '').trim();
  return v.startsWith('$') ? v : slugify(v);
}

/**
 * Build a minimal, schema-valid summoned "skill"-type object-layer item.
 * @param {string} id
 * @returns {Object}
 */
function makeSkillItem(id) {
  return {
    stats: { effect: 1, resistance: 0, agility: 0, range: 1, intelligence: 1, utility: 0 },
    item: { id, type: 'skill', description: `Skill effect ${id}`, activable: false },
    render: null,
  };
}

/**
 * Guarantee skill referential integrity: every non-placeholder
 * `summonedEntityItemId` must resolve to a real object-layer item, so a missing
 * one gets a minimal "skill"-type item appended (mirrors how `ensureTalkLinkage`
 * backs talk objectives with NPC skins). Mutates `objectLayers` in place.
 * @param {{ skills: Object[], objectLayers: Object[] }} payload
 */
function ensureSkillLinkage({ skills, objectLayers }) {
  const itemIndex = new Map(objectLayers.map((ol) => [ol.item.id, ol]));
  for (const sk of skills) {
    for (const def of sk.skills) {
      const id = def.summonedEntityItemId;
      if (!id || id.startsWith('$') || itemIndex.has(id)) continue;
      const item = makeSkillItem(id);
      objectLayers.push(item);
      itemIndex.set(id, item);
    }
  }
}

/**
 * Normalize a raw model payload into model-ready documents, enforcing the
 * text-only architectural boundary (spatial + render fields nulled).
 *
 * @param {Object} raw - Parsed Gemini JSON.
 * @param {Object} params
 * @param {string} params.theme - Original prompt seed (used to derive a saga code fallback).
 * @returns {{ saga: Object, instance: Object, maps: Object[], quests: Object[], dialogues: Object[], actions: Object[], objectLayers: Object[], skills: Object[] }}
 */
function normalizeSagaPayload(raw, { theme }) {
  const rawSaga = raw.saga || {};

  // Maps are narrative zones — text only (code, name, description); spatial /
  // grid / entity fields stay at their schema defaults.
  const maps = asArray(raw.maps)
    .map((m) => ({
      code: slugify(m.code),
      name: m.name || m.code || '',
      description: m.description || '',
    }))
    .filter((m) => m.code);

  const quests = asArray(raw.quests).map((q) => ({
    code: slugify(q.code),
    title: q.title || q.code,
    description: q.description || '',
    prerequisiteCodes: asArray(q.prerequisiteCodes).map(slugify),
    unlocksQuestCodes: asArray(q.unlocksQuestCodes).map(slugify),
    // Spatial binding is out of scope for this stage.
    sourceMapCode: null,
    sourceCellX: null,
    sourceCellY: null,
    steps: asArray(q.steps).map((s, i) => ({
      id: s.id || `step-${i + 1}`,
      description: s.description || '',
      objectives: asArray(s.objectives).map((o) => ({
        type: o.type,
        itemId: slugify(o.itemId),
        quantity: Number(o.quantity) > 0 ? Number(o.quantity) : 1,
      })),
    })),
    rewards: asArray(q.rewards).map((r) => ({
      itemId: slugify(r.itemId),
      quantity: Number(r.quantity) > 0 ? Number(r.quantity) : 1,
    })),
  }));

  const dialogues = asArray(raw.dialogues).map((d, i) => ({
    code: slugify(d.code),
    order: Number.isFinite(Number(d.order)) ? Number(d.order) : i,
    speaker: d.speaker || '',
    text: d.text || '',
    mood: d.mood || 'neutral',
  }));

  const actions = asArray(raw.actions).map((a) => ({
    code: slugify(a.code),
    label: a.label || '',
    dialogCode: a.dialogCode ? slugify(a.dialogCode) : '',
    sourceMapCode: null,
    sourceCellX: null,
    sourceCellY: null,
    questDialogueCodes: asArray(a.questDialogueCodes).map((qd) => ({
      questCode: slugify(qd.questCode),
      dialogCode: slugify(qd.dialogCode),
    })),
    shopItems: asArray(a.shopItems).map((s) => ({
      itemId: slugify(s.itemId),
      priceItemId: slugify(s.priceItemId) || 'coin',
      priceQty: Number(s.priceQty) >= 0 ? Number(s.priceQty) : 1,
    })),
    craftRecipes: asArray(a.craftRecipes).map((c) => ({
      outputItems: asArray(c.outputItems).map((o) => ({
        itemId: slugify(o.itemId),
        qty: Number(o.qty) > 0 ? Number(o.qty) : 1,
      })),
      ingredients: asArray(c.ingredients).map((o) => ({
        itemId: slugify(o.itemId),
        qty: Number(o.qty) > 0 ? Number(o.qty) : 1,
      })),
    })),
    storageSlots: Number(a.storageSlots) > 0 ? Number(a.storageSlots) : 0,
  }));

  const objectLayers = asArray(raw.objectLayers).map((ol) => {
    const stats = ol.stats || {};
    return {
      stats: {
        effect: Number(stats.effect) || 0,
        resistance: Number(stats.resistance) || 0,
        agility: Number(stats.agility) || 0,
        range: Number(stats.range) || 0,
        intelligence: Number(stats.intelligence) || 0,
        utility: Number(stats.utility) || 0,
      },
      item: {
        id: slugify(ol.item?.id),
        type: ol.item?.type || 'skin',
        description: ol.item?.description || '',
        activable: Boolean(ol.item?.activable),
      },
      // Graphic synthesis is a downstream stage.
      render: null,
    };
  });

  // Skills bind a trigger item to one or more supported logic-event handlers.
  // The trigger must be a known item; defs with an unsupported logicEventId are
  // dropped (they would be a no-op in the simulation). logicEventIds is derived
  // from the kept defs so it can never drift (mirrors DefaultSkillConfig).
  const knownItemIds = new Set(objectLayers.map((ol) => ol.item.id).filter(Boolean));
  const validLogicEvents = new Set(Object.keys(SKILL_LOGIC_EVENTS));
  // Logic-event keys are fixed handler ids that use underscores
  // (coin_drop_or_transaction) — slugify() would convert '_' to '-' and break
  // the match, so normalize separators to '_' and compare against the closed set.
  const normLogicEvent = (v) =>
    String(v || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  const skills = asArray(raw.skills)
    .map((sk) => {
      const triggerItemId = slugify(sk.triggerItemId);
      const defs = asArray(sk.skills)
        .map((d) => {
          const logicEventId = normLogicEvent(d.logicEventId);
          return {
            logicEventId,
            name: d.name || '',
            description: d.description || SKILL_LOGIC_EVENTS[logicEventId] || '',
            summonedEntityItemId: slugifyItemRef(d.summonedEntityItemId),
          };
        })
        .filter((d) => validLogicEvents.has(d.logicEventId));
      return { triggerItemId, logicEventIds: [...new Set(defs.map((d) => d.logicEventId))], skills: defs };
    })
    .filter((sk) => sk.triggerItemId && knownItemIds.has(sk.triggerItemId) && sk.skills.length > 0);

  // Guarantee every talk objective has a backing NPC skin, dialogue, and action
  // mapping (may append skin items / dialogues / actions) before reconciling ids.
  ensureTalkLinkage({ quests, dialogues, actions, objectLayers });
  // Guarantee every summoned skill entity resolves to a real item (may append
  // skill items). Runs before itemIds are reconciled so they are recorded.
  ensureSkillLinkage({ skills, objectLayers });

  const itemIds = objectLayers.map((ol) => ol.item.id).filter(Boolean);
  const questCodes = quests.map((q) => q.code).filter(Boolean);
  const mapCodes = maps.map((m) => m.code).filter(Boolean);

  const saga = {
    code: slugify(rawSaga.code) || slugify(theme) || `cyberia-saga-${Date.now()}`,
    name: rawSaga.name || theme,
    description: rawSaga.description || '',
    mapCodes: [...new Set([...asArray(rawSaga.mapCodes).map(slugify), ...mapCodes])].filter(Boolean),
    itemIds: [...new Set([...asArray(rawSaga.itemIds).map(slugify), ...itemIds])].filter(Boolean),
    questCodes: [...new Set([...asArray(rawSaga.questCodes).map(slugify), ...questCodes])].filter(Boolean),
  };

  // A CyberiaInstance derived from the saga's own metadata + the map codes it
  // defined — the playable shell that binds this saga's maps together. Spatial
  // topology (portals) and tuning (conf) belong to downstream synthesis, so they
  // are left empty here and PRESERVED on rerun by persistInstance.
  const instance = {
    code: saga.code,
    name: saga.name,
    description: saga.description,
    tags: ['saga', 'generated'],
    cyberiaMapCodes: [...saga.mapCodes],
    itemIds: saga.itemIds.map((id) => ({ id, defaultPlayerInventory: false })),
    portals: [],
    topologyMode: 'procedural',
  };

  return { saga, instance, maps, quests, dialogues, actions, objectLayers, skills };
}

/**
 * Persist normalized object-layer items into the ObjectLayer collection so they
 * are editable in the viewer. Items are created with an empty (`null`) render
 * and an `OFF_CHAIN` ledger; a render/ledger can be set later from
 * `src/client/components/cyberia/ObjectLayerEngineViewer.js`.
 *
 * Upserts by `data.item.id`. An existing item's render and ledger are PRESERVED
 * (never clobbered back to null) — only the textual stats/item fields are
 * refreshed. `sha256` is recomputed over the resulting data.
 *
 * @async
 * @param {Object} params
 * @param {Object[]} params.objectLayers - Normalized object-layer items ({ stats, item, render }).
 * @param {import('mongoose').Model} params.ObjectLayer - The ObjectLayer model.
 * @returns {Promise<number>} Count of items created or updated.
 */
async function persistObjectLayers({ objectLayers, ObjectLayer }) {
  let count = 0;
  for (const ol of objectLayers) {
    const itemId = ol.item?.id;
    if (!itemId) continue;

    const existing = await ObjectLayer.findOne({ 'data.item.id': itemId });

    // Preserve any render already set via the viewer; default to empty render.
    const hasRender = existing?.data?.render?.cid || existing?.data?.render?.metadataCid;
    const render = hasRender ? existing.data.render : { cid: null, metadataCid: null };
    const ledger = existing?.data?.ledger?.type ? existing.data.ledger : { type: 'OFF_CHAIN', tokenId: '' };

    const data = { stats: ol.stats, item: ol.item, ledger, render };
    const sha256 = computeSha256(data);

    if (existing) {
      existing.data = data;
      existing.sha256 = sha256;
      await existing.save();
    } else {
      await ObjectLayer.create({ data, sha256, cid: null });
    }
    count++;
  }
  return count;
}

/**
 * Persist the saga's CyberiaInstance shell. The textual/logical fields (name,
 * description, tags, map codes, item ids, topology) are refreshed every run;
 * spatial topology (`portals`) and the tuning ref (`conf`) are PRESERVED — set
 * only on insert — so downstream spatial synthesis is never clobbered back to
 * empty (mirrors how {@link persistObjectLayers} preserves render/ledger).
 *
 * @async
 * @param {Object} params
 * @param {Object} params.instance - Normalized instance ({ code, name, … }).
 * @param {import('mongoose').Model} params.CyberiaInstance - The CyberiaInstance model.
 * @returns {Promise<number>} 1 once upserted.
 */
async function persistInstance({ instance, CyberiaInstance }) {
  await CyberiaInstance.findOneAndUpdate(
    { code: instance.code },
    {
      $set: {
        name: instance.name,
        description: instance.description,
        tags: instance.tags,
        cyberiaMapCodes: instance.cyberiaMapCodes,
        itemIds: instance.itemIds,
        topologyMode: instance.topologyMode,
      },
      $setOnInsert: { code: instance.code, portals: instance.portals || [] },
    },
    { upsert: true },
  );
  return 1;
}

/**
 * Persist the normalized payload into MongoDB via the provided Mongoose models.
 * Upserts by natural key so reruns are idempotent.
 *
 * @async
 * @param {Object} params
 * @param {Object} params.payload - Output of {@link normalizeSagaPayload}.
 * @param {Object} params.models - { CyberiaSaga, CyberiaInstance?, CyberiaMap?, CyberiaQuest, CyberiaDialogue, CyberiaAction, CyberiaSkill?, ObjectLayer? }.
 * @returns {Promise<{ saga, instance, maps, quests, dialogues, actions, skills, objectLayers: number }>}
 */
async function persistSagaPayload({ payload, models }) {
  const { CyberiaSaga, CyberiaInstance, CyberiaMap, CyberiaQuest, CyberiaDialogue, CyberiaAction, CyberiaSkill, ObjectLayer } =
    models;
  const { saga, instance, maps, quests, dialogues, actions, skills, objectLayers } = payload;

  await CyberiaSaga.findOneAndUpdate({ code: saga.code }, { $set: saga }, { upsert: true });

  let instanceCount = 0;
  if (CyberiaInstance && instance?.code) {
    instanceCount = await persistInstance({ instance, CyberiaInstance });
  }

  let mapCount = 0;
  if (CyberiaMap) {
    for (const map of asArray(maps)) {
      await CyberiaMap.findOneAndUpdate({ code: map.code }, { $set: map }, { upsert: true });
      mapCount++;
    }
  }
  for (const quest of quests) {
    await CyberiaQuest.findOneAndUpdate({ code: quest.code }, { $set: quest }, { upsert: true });
  }
  for (const dialogue of dialogues) {
    await CyberiaDialogue.findOneAndUpdate(
      { code: dialogue.code, order: dialogue.order },
      { $set: dialogue },
      { upsert: true },
    );
  }
  for (const action of actions) {
    await CyberiaAction.findOneAndUpdate({ code: action.code }, { $set: action }, { upsert: true });
  }

  // Skills live in their own collection (CyberiaSkill), upserted by triggerItemId
  // — the authoritative own-model source the gRPC server reads.
  let skillCount = 0;
  if (CyberiaSkill) {
    for (const skill of asArray(skills)) {
      await CyberiaSkill.findOneAndUpdate(
        { triggerItemId: skill.triggerItemId },
        { $set: { logicEventIds: skill.logicEventIds, skills: skill.skills } },
        { upsert: true },
      );
      skillCount++;
    }
  }

  const objectLayerCount = ObjectLayer ? await persistObjectLayers({ objectLayers, ObjectLayer }) : 0;

  return {
    saga: 1,
    instance: instanceCount,
    maps: mapCount,
    quests: quests.length,
    dialogues: dialogues.length,
    actions: actions.length,
    skills: skillCount,
    objectLayers: objectLayerCount,
  };
}

/**
 * Generate the raw six-section ecosystem in five bounded, sequential stages.
 * Each stage produces one layer and feeds canonical (slugified) references into
 * the next, so no single model call has to emit the whole cross-referenced graph.
 *
 * @async
 * @param {GeminiClient} client
 * @param {string} theme
 * @param {string} [thinkingLevel]
 * @param {string} [lore] - Base lore text to ground every stage (empty = ungrounded).
 * @param {number} [temperature] - Sampling temperature applied to every stage (model default if omitted).
 * @param {string} [namingGuidance] - Shared naming/character-culture guidance for every stage.
 * @param {string} [customizationGuidance] - Space/tone/faction/subject guidance for every stage.
 * @param {string} [spaceContextKey] - Used to inject temporal distortion refinement per stage.
 * @returns {Promise<{ saga, maps, quests, dialogues, actions, objectLayers }>}
 */
async function generateRawEcosystem(
  client,
  theme,
  thinkingLevel,
  lore = '',
  temperature,
  namingGuidance = '',
  customizationGuidance = '',
  spaceContextKey = '',
) {
  // Stage 1 — saga identity + object-layer items (the economic foundation).
  logger.info('Stage 1/6: foundation (saga + object layers)');
  const foundation = await client.chatJson({
    system: buildStagePrompt('foundation', namingGuidance, customizationGuidance, spaceContextKey),
    user: buildStageUser(theme, undefined, lore),
    thinkingLevel,
    temperature,
  });
  const saga = foundation.saga || {};
  const objectLayers = asArray(foundation.objectLayers);
  const itemIds = objectLayers.map((ol) => slugify(ol.item?.id)).filter(Boolean);

  // Stage 2 — maps: the narrative zones the quest chain visits.
  logger.info('Stage 2/6: maps');
  const mapsRes = await client.chatJson({
    system: buildStagePrompt('maps', namingGuidance, customizationGuidance, spaceContextKey),
    user: buildStageUser(theme, undefined, lore),
    thinkingLevel,
    temperature,
  });
  const maps = asArray(mapsRes.maps);
  const mapCodes = maps.map((m) => slugify(m.code)).filter(Boolean);

  // Stage 3 — quests referencing the canonical item ids, grounded in the zones.
  logger.info('Stage 3/6: quests');
  const questsRes = await client.chatJson({
    system: buildStagePrompt('quests', namingGuidance, customizationGuidance, spaceContextKey),
    user: buildStageUser(
      theme,
      { itemIds, maps: maps.map((m) => ({ code: slugify(m.code), name: m.name || '' })) },
      lore,
    ),
    thinkingLevel,
    temperature,
  });
  const quests = asArray(questsRes.quests);
  const questCodes = quests.map((q) => slugify(q.code)).filter(Boolean);
  // NPCs that must be talked to (questCode + skin) drive the dialogue + action linkage.
  const talkTargets = collectTalkTargets(quests);

  // Stage 4 — dialogues for each quest (and a talk dialogue per talk target).
  logger.info('Stage 4/6: dialogues');
  const dialoguesRes = await client.chatJson({
    system: buildStagePrompt('dialogues', namingGuidance, customizationGuidance, spaceContextKey),
    user: buildStageUser(
      theme,
      { quests: quests.map((q) => ({ code: slugify(q.code), title: q.title || '' })), talkTargets },
      lore,
    ),
    thinkingLevel,
    temperature,
  });
  const dialogues = asArray(dialoguesRes.dialogues);
  const dialogueCodes = [...new Set(dialogues.map((d) => slugify(d.code)).filter(Boolean))];

  // Stage 5 — actions binding quests, dialogues, and items together.
  logger.info('Stage 5/6: actions');
  const actionsRes = await client.chatJson({
    system: buildStagePrompt('actions', namingGuidance, customizationGuidance, spaceContextKey),
    user: buildStageUser(theme, { questCodes, dialogueCodes, itemIds, talkTargets }, lore),
    thinkingLevel,
    temperature,
  });
  const actions = asArray(actionsRes.actions);

  // Stage 6 — skills: bind trigger items to supported logic-event handlers. The
  // model sees item ids WITH their types so it can pick valid trigger / summoned
  // items, and the closed set of logic events it may use.
  logger.info('Stage 6/6: skills');
  const itemsWithTypes = objectLayers
    .map((ol) => ({ id: slugify(ol.item?.id), type: ol.item?.type || 'skin' }))
    .filter((it) => it.id);
  const skillsRes = await client.chatJson({
    system: buildStagePrompt('skills', namingGuidance, customizationGuidance, spaceContextKey),
    user: buildStageUser(
      theme,
      { items: itemsWithTypes, logicEvents: Object.keys(SKILL_LOGIC_EVENTS) },
      lore,
    ),
    thinkingLevel,
    temperature,
  });
  const skills = asArray(skillsRes.skills);

  return { saga, maps, quests, dialogues, actions, objectLayers, skills };
}

/**
 * Full Top-Down PCG pipeline: prompt → staged Gemini JSON → normalize → persist.
 *
 * @async
 * When `prompt` is omitted, a distinct theme is auto-synthesized from the Cyberia
 * base lore (and every stage is grounded in that lore). When `prompt` is given,
 * it is used as-is with no lore grounding. When `out` is omitted, the payload is
 * written to `./engine-private/cyberia-sagas/<saga-code>.json`.
 *
 * @param {Object} params
 * @param {string} [params.prompt] - Theme seed; if omitted, auto-generated from lore.
 * @param {Object} params.models - Loaded Mongoose models (see {@link persistSagaPayload}).
 * @param {string} [params.model] - Gemini model id override.
 * @param {string} [params.apiKey] - Gemini API key override.
 * @param {number} [params.timeout] - Per-request timeout in ms.
 * @param {string} [params.thinkingLevel] - Gemini thinking level (default in client).
 * @param {string} [params.lorePath] - Override path to the base-lore document.
 * @param {string} [params.spaceContext] - Force 'physical' | 'mixed' | 'hyperspace' (auto mode only).
 * @param {string} [params.tone] - Force 'adventure' | 'politics' | 'tragic' | 'comedy' (auto mode only).
 * @param {string} [params.factionContext] - Comma-separated faction keys to make the DRIVER (auto mode only).
 * @param {string} [params.characterContext] - Comma-separated CHARACTER_NAMES_POOL keys for naming inspiration (default random).
 * @param {string} [params.culturalExposure] - 'cosmopolitan' | 'local' naming diversity mode (default random).
 * @param {number} [params.temperature] - Sampling temperature applied to every model call.
 * @param {boolean} [params.dryRun=false] - Skip persistence; only generate + return.
 * @param {string} [params.out] - File path to dump the payload (defaults to the saga dir).
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function generateSaga({
  prompt,
  models,
  model,
  apiKey,
  timeout,
  thinkingLevel,
  lorePath,
  spaceContext,
  tone,
  factionContext,
  characterContext,
  culturalExposure,
  temperature,
  dryRun = false,
  out,
}) {
  const client = new GeminiClient({ apiKey, model, timeout });

  let theme = prompt;
  let lore = '';
  let resolvedSpaceContextKey = '';
  let resolvedToneKey = '';
  let resolvedFactions = [];
  let resolvedSubject = '';

  if (!theme) {
    lore = await loadLoreContext(lorePath);
    logger.info('No --prompt provided; auto-generating a distinct lore-grounded theme...');
    const synthesized = await synthesizeTheme(client, lore, {
      thinkingLevel,
      spaceContext,
      tone,
      factionContext,
      temperature,
    });
    theme = synthesized.theme;
    resolvedSpaceContextKey = synthesized.spaceContext;
    resolvedToneKey = synthesized.tone;
    resolvedSubject = synthesized.subject;
    resolvedFactions = synthesized.factions;
    logger.info(`Auto-generated theme: "${theme}"`);
  } else {
    logger.info(`Generating saga ontology from theme: "${theme}"`);
    // With --prompt, the user's prompt IS the creative driver — do NOT impose a
    // random SUBJECT. Only resolve space/tone/faction overrides if explicitly
    // provided (they stay at their default empty/false values otherwise, meaning
    // the model derives them from the prompt alone).
    resolvedSpaceContextKey = resolveSpaceContext(spaceContext);
    resolvedToneKey = resolveTone(tone);
    resolvedFactions = resolveFactionContext(factionContext);
    // Leave resolvedSubject empty when --prompt is given so the LLM has full
    // creative freedom — no SUBJECT bucket constrains the theme.
    resolvedSubject = '';
    logger.info(
      `Customization: context=${resolvedSpaceContextKey} | tone=${resolvedToneKey} | ` +
        `factions=${resolvedFactions.length ? resolvedFactions.join(', ') : 'background'}` +
        ' | subject=PROMPT (user-provided — no SUBJECT bucket applied)',
    );
  }

  // Build customization guidance from resolved options — applies to every stage.
  const customizationGuidance = buildCustomizationGuidance({
    spaceContextKey: resolvedSpaceContextKey,
    toneKey: resolvedToneKey,
    factions: resolvedFactions,
    subject: resolvedSubject,
  });

  // Naming/character-culture guidance applies to every stage (both prompt + auto modes).
  const namingGuidance = buildNamingGuidance({ characterContext, culturalExposure });

  const raw = await generateRawEcosystem(
    client,
    theme,
    thinkingLevel,
    lore,
    temperature,
    namingGuidance,
    customizationGuidance,
    resolvedSpaceContextKey,
  );
  const payload = normalizeSagaPayload(raw, { theme });

  const outPath = out || nodePath.join(DEFAULT_SAGA_OUT_DIR, `${payload.saga.code}.json`);
  return finalizeSaga({ payload, models, out: outPath, dryRun });
}

/**
 * Import a previously generated payload file (the shape `--out` writes) and load
 * it into the database. Runs through the same normalize → persist path as
 * {@link generateSaga}, so codes are slugified and upserted (overwrite, never
 * duplicated). No model call is made.
 *
 * @async
 * @param {Object} params
 * @param {string} params.file - Path to the JSON payload file.
 * @param {Object} params.models - Loaded Mongoose models (see {@link persistSagaPayload}).
 * @param {boolean} [params.dryRun=false] - Normalize only; skip persistence.
 * @param {string} [params.out] - Optional path to re-dump the normalized payload.
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function importSaga({ file, models, dryRun = false, out }) {
  if (!file) throw new Error('An --import file path is required.');

  const filePath = nodePath.resolve(file);
  if (!fs.existsSync(filePath)) throw new Error(`Import file not found: ${filePath}`);

  logger.info(`Importing saga payload from ${filePath}`);
  const raw = await fs.readJson(filePath);
  const payload = normalizeSagaPayload(raw, {
    theme: raw?.saga?.name || raw?.saga?.code || 'imported-saga',
  });

  return finalizeSaga({ payload, models, out, dryRun });
}

/**
 * Shared tail for generate/import: log the normalized shape, optionally dump it
 * to disk, then upsert into MongoDB (unless `dryRun`).
 *
 * @async
 * @param {Object} params
 * @param {Object} params.payload - Output of {@link normalizeSagaPayload}.
 * @param {Object} [params.models] - Loaded Mongoose models (required unless `dryRun`).
 * @param {string} [params.out] - Optional path to dump the normalized payload JSON.
 * @param {boolean} [params.dryRun=false] - Skip persistence; only normalize + dump.
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function finalizeSaga({ payload, models, out, dryRun = false }) {
  logger.info(
    `Normalized: saga=${payload.saga.code} instance=${payload.instance?.code || '—'} ` +
      `maps=${payload.maps.length} quests=${payload.quests.length} ` +
      `dialogues=${payload.dialogues.length} actions=${payload.actions.length} ` +
      `skills=${payload.skills?.length || 0} objectLayers=${payload.objectLayers.length}`,
  );

  if (out) {
    const outPath = nodePath.resolve(out);
    await fs.ensureDir(nodePath.dirname(outPath));
    await fs.writeJson(outPath, payload, { spaces: 2 });
    logger.info(`Payload written to ${outPath}`);
  }

  if (dryRun) {
    logger.info('Dry run: skipping database persistence.');
    return payload;
  }

  const summary = await persistSagaPayload({ payload, models });
  logger.info(
    `Persisted: ${summary.saga} saga, ${summary.instance} instance, ${summary.maps} maps, ` +
      `${summary.quests} quests, ${summary.dialogues} dialogues, ${summary.actions} actions, ` +
      `${summary.skills} skills, ${summary.objectLayers} object layers`,
  );

  return { ...payload, summary };
}

export {
  generateSaga,
  importSaga,
  finalizeSaga,
  generateRawEcosystem,
  normalizeSagaPayload,
  ensureTalkLinkage,
  ensureSkillLinkage,
  collectTalkTargets,
  persistSagaPayload,
  persistInstance,
  persistObjectLayers,
  loadLoreContext,
  synthesizeTheme,
  resolveFactionContext,
  resolveCharacterContext,
  resolveCulturalExposure,
  buildNamingGuidance,
  buildStagePrompt,
  buildStageUser,
  slugify,
  buildOriginalityGuidance,
  buildTemporalDistortionGuidance,
};
