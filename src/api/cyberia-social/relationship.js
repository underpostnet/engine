/**
 * The rules of a `CyberiaSocial` relationship: the canonical order of its account pair and the
 * fields each state requires.
 *
 * @module src/api/cyberia-social/relationship.js
 */

/** The pair of two accounts in canonical order, whichever account comes first. */
const canonicalPair = (a, b) => (String(a) < String(b) ? { low: a, high: b } : { low: b, high: a });

/** Why a relationship breaks its rules, or '' when it keeps them. */
const relationshipError = ({ low, high, requester, status, expiresAt }) => {
  if (!low || !high || String(low) >= String(high)) return 'Pair must contain two accounts in canonical order';
  if (![String(low), String(high)].includes(String(requester))) return 'Requester must belong to the pair';
  if (!['pending', 'accepted'].includes(status)) return 'Invalid relationship status';
  if (status === 'pending' && (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())))
    return 'Pending requests require an expiry time';
  if (status === 'accepted' && expiresAt != null) return 'Accepted relationships cannot expire';
  return '';
};

export { canonicalPair, relationshipError };
