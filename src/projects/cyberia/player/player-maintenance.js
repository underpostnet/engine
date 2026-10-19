const heldReport = async (Player, { universeCode } = {}) =>
  await Player.aggregate([
    { $match: universeCode ? { universeCode } : {} },
    {
      $project: {
        universeCode: 1,
        entries: {
          $concatArrays: [
            { $map: { input: '$held', as: 'held', in: { instanceCode: '', held: '$$held' } } },
            {
              $reduce: {
                input: '$worlds',
                initialValue: [],
                in: {
                  $concatArrays: [
                    '$$value',
                    {
                      $map: {
                        input: '$$this.held',
                        as: 'held',
                        in: { instanceCode: '$$this.instanceCode', held: '$$held' },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
    { $unwind: '$entries' },
    {
      $group: {
        _id: {
          universeCode: '$universeCode',
          instanceCode: '$entries.instanceCode',
          itemId: '$entries.held.stack.itemId',
          olCid: '$entries.held.stack.olCid',
          reason: '$entries.held.reason',
        },
        stacks: { $sum: 1 },
        units: { $sum: '$entries.held.stack.quantity' },
        players: { $addToSet: '$_id' },
      },
    },
    {
      $project: {
        _id: 0,
        universeCode: '$_id.universeCode',
        instanceCode: '$_id.instanceCode',
        itemId: '$_id.itemId',
        olCid: '$_id.olCid',
        reason: '$_id.reason',
        stacks: 1,
        units: 1,
        profiles: { $size: '$players' },
      },
    },
    { $sort: { universeCode: 1, instanceCode: 1, itemId: 1, olCid: 1 } },
  ]);

const rebindHeld = async ({ Player, GameSession }, { itemId, olCid, universeCode, apply = false }) => {
  const owners = await Player.find(
    {
      $or: [{ 'held.stack.itemId': itemId }, { 'worlds.held.stack.itemId': itemId }],
      ...(universeCode ? { universeCode } : {}),
    },
    { user: 1, epoch: 1, held: 1, worlds: 1 },
  ).lean();
  const live = new Set(
    (
      await GameSession.find(
        { user: { $in: owners.map((p) => p.user) }, expiresAt: { $gt: new Date() } },
        { player: 1 },
      ).lean()
    ).map((lease) => String(lease.player)),
  );
  const stale = (list) => list.filter((h) => h.stack.itemId === itemId && h.stack.olCid !== olCid).length;
  const rebind = (list) => list.map((h) => (h.stack.itemId === itemId ? { ...h, stack: { ...h.stack, olCid } } : h));
  const report = { profiles: 0, stacks: 0, live: 0, applied: apply };
  for (const owner of owners) {
    if (live.has(String(owner._id))) {
      report.live++;
      continue;
    }
    const stacks = stale(owner.held) + owner.worlds.reduce((sum, world) => sum + stale(world.held), 0);
    if (stacks === 0) continue;
    report.profiles++;
    report.stacks += stacks;
    if (!apply) continue;
    const update = {
      held: rebind(owner.held),
      worlds: owner.worlds.map((world) => ({ ...world, held: rebind(world.held) })),
    };
    // A new session changes the epoch and blocks this update.
    const { matchedCount } = await Player.updateOne({ _id: owner._id, epoch: owner.epoch }, { $set: update });
    if (matchedCount === 0) {
      report.profiles--;
      report.stacks -= stacks;
      report.live++;
    }
  }
  return report;
};

export { heldReport, rebindHeld };
