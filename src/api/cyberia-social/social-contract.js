export const FRIENDS_MAX = 200;
export const FRIEND_REQUESTS_MAX = 20;
export const FRIEND_REQUEST_DAYS = 30;
export const STATUS_NOTE_MAX_RUNES = 80;
export const STATUS_NOTE_INTERVAL_MS = 10000;

// A unit is one Unicode scalar value, including each combining mark and joiner.
export const statusNoteLength = (text) => [...text].length;

export const cleanStatusNote = (text) =>
  text
    .replace(/[\p{Cc}\p{Cf}]/gu, (character) =>
      character === '\u200c' || character === '\u200d' ? character : /\s/u.test(character) ? ' ' : '',
    )
    .replace(/\s+/gu, ' ')
    .trim();

export const validStatusNote = (text) =>
  typeof text === 'string' && !/[\uD800-\uDFFF]/u.test(text) && statusNoteLength(text) <= STATUS_NOTE_MAX_RUNES;
