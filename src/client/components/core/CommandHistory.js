/**
 * The edit history of an editor: completed commands, each named and holding the state before and
 * after it. An editor records one command per finished operation, never per pointer move.
 *
 * @module src/client/components/core/CommandHistory.js
 */

class CommandHistory {
  /**
   * @param {Object} [options]
   * @param {number} [options.limit=200] - Commands kept for undo.
   * @param {(history: CommandHistory) => void} [options.onChange] - Called after each change.
   */
  constructor({ limit = 200, onChange = () => {} } = {}) {
    this.limit = limit;
    this.onChange = onChange;
    this.done = [];
    this.undone = [];
  }

  /**
   * Records a completed command. A new command drops what was undone.
   * @param {string} name - What the command did, such as `DrawStroke` or `PlaceEntity`.
   * @param {*} before - State before the command.
   * @param {*} after - State after the command.
   */
  record(name, before, after) {
    this.done.push({ name, before, after });
    if (this.done.length > this.limit) this.done.shift();
    this.undone.length = 0;
    this.onChange(this);
  }

  /** The command to reverse, moved to the redo side; null when none. */
  undo() {
    const command = this.done.pop() ?? null;
    if (command) this.undone.push(command);
    this.onChange(this);
    return command;
  }

  /** The command to apply again, moved back to the undo side; null when none. */
  redo() {
    const command = this.undone.pop() ?? null;
    if (command) this.done.push(command);
    this.onChange(this);
    return command;
  }

  get canUndo() {
    return this.done.length > 0;
  }

  get canRedo() {
    return this.undone.length > 0;
  }

  clear() {
    this.done.length = 0;
    this.undone.length = 0;
    this.onChange(this);
  }
}

export { CommandHistory };
