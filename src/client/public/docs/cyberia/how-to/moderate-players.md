# Moderate players

Change the stacks of a profile, wear or take off an Object Layer, lock or ban an account, and apply
one of these to several profiles at once. The model is in
[accounts and persistent players](../explanation/accounts-and-persistence.md#operator-changes-and-account-restrictions);
the routes and the refusals are in [the player service reference](../reference/player-service.md).

## Before you start

| Action                                   | Moderator | Admin |
| ---------------------------------------- | --------- | ----- |
| Read profiles, sessions, stacks and logs | Yes       | Yes   |
| Lock an account, lift a lock             | Yes       | Yes   |
| Ban an account, lift a ban               | No        | Yes   |
| Change stacks, wear or take off layers   | No        | Yes   |
| End a live session                       | No        | Yes   |

- The server checks the role of every request; the view only hides what the role cannot do.
- No operator restricts an admin or the account it signs in with. Only an admin restricts a
  moderator.
- Every request needs a reason of 3 to 200 characters. Each one, done or refused, is a record in
  the **Operator log** of the profile, with what it found and what it left.

## Change the stacks of a profile

1. Open **Cyberia Studio → Cyberia Player Manager** and select the profile.
2. In **Inventory**, check that no live session plays it. If one does, end it first
   ([recover a player session](recover-a-player-session.md)): a change needs an offline profile.
3. Write the reason. The view keeps it for each change to this profile.
4. Do the change:
   - **Add stack**: choose the container, the item id and the quantity. Leave the slot empty to take
     the first open slot.
   - **Set**: write a new quantity for a stack, then select **Set**.
   - **Remove**: confirm. The stack goes.
   - **Wear** or **Take off**: only for a bag stack of a worn type (skin, breastplate, weapon).
     Wearing an item takes off the other worn stack of its type.
5. Read the notification. A refusal names why, for example a locked slot or a coin item.

The change raises the epoch of the profile. The next session of the player loads it.

## Lock, ban or lift a restriction

1. Select the profile. **Account** shows the restriction while it holds.
2. Write the reason.
3. Choose:
   - **Lock**: set when it ends, within 90 days.
   - **Ban** (admin): set when it ends, or leave it empty for a ban with no end.
   - **Lift**: ends the restriction now. Only an admin lifts a ban.
4. Confirm.

A lock or a ban signs the account out of every portal session and ends its live game session at
once. Until it ends, the account cannot sign in, refresh a session or launch the game. The profile
and its progress stay.

## Apply an operation to several profiles

1. Check the profiles in the list. The selection stays when you page or search.
2. In **Batch**, choose the operation and its fields, and write the reason.
3. Select **Preview**. Each profile shows **Applies**, **Refused** with the reason, or **Failed**.
   Nothing is written.
4. Select **Apply to N** and confirm. Each profile is its own request.
5. If a profile shows **Failed**, select **Retry failed**. A profile already done answers its
   recorded outcome and does not change twice.

A batch takes 1 to 50 profiles. A change of quantity is not a batch operation: each stack has its own.
