const CyberiaDependencies = {
  'maxrects-packer': '^2.7.3',
  pngjs: '^7.0.0',
  jimp: '^1.6.0',
  sharp: '^0.34.5',
  ethers: '~6.16.0',
};

const DefaultCyberiaItems = [
  'coin',
  // 'red-power',
  // 'heal',
  // 'hatchet-skill',
  // 'green-power',
  // 'blood',
  'atlas_pistol_mk2',
  'atlas_pistol_mk2_bullet',
  // 'tim-knife',
  // 'hatchet',
  // 'wason',
  // 'scp-2040',
  'purple',
  // 'punk',
  // 'marciano',
  // 'lain',
  // 'kaneki',
  // 'junko',
  'ghost',
  // 'eiri',
  'anon',
  // 'alex',
  // 'agent',
  'grass',
];

const DefaultSkillConfig = [
  // { triggerItemId: 'anon', spawnedItemIds: [], logicEventId: 'doppelganger' },
  {
    triggerItemId: 'atlas_pistol_mk2',
    spawnedItemIds: ['atlas_pistol_mk2_bullet'],
    logicEventId: 'atlas_pistol_mk2_logic',
  },
  { triggerItemId: 'coin', spawnedItemIds: [], logicEventId: 'coin_drop_or_transaction' },
  // { triggerItemId: 'purple', spawnedItemIds: [], logicEventId: 'doppelganger' },
  // { triggerItemId: 'atlas_pistol_mk2_bullet', spawnedItemIds: [], logicEventId: 'doppelganger' },
];

export { CyberiaDependencies, DefaultCyberiaItems, DefaultSkillConfig };
