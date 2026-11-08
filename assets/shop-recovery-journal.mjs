// Internal write-ahead recovery journal. No PII, account identifiers, payloads or
// payment tokens. Keys are still sensitive: same-origin scripts can read storage.
// A missing/corrupt journal NEVER proves there was no earlier checkout.
const STORAGE_KEY = 'cng.checkout.recovery.v1';
const LOCK_NAME = 'cng.checkout.recovery.v1';
const validKey = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,128}(?![\s\S])/.test(value);
const MAX_KEYS = 16;

function decode(raw) {
  if (raw === null) return [];
  if (typeof raw !== 'string' || raw.length > 2300) throw new Error();
  const data = JSON.parse(raw);
  if (!data || Array.isArray(data) || Object.keys(data).length !== 2
    || data.version !== 1 || !Array.isArray(data.keys) || data.keys.length < 1
    || data.keys.length > MAX_KEYS || !data.keys.every(validKey)
    || new Set(data.keys).size !== data.keys.length) throw new Error();
  return data.keys;
}

/** All cooperating tabs must use the same Web Lock and origin storage.
 * This is NOT a server intent ledger or a cross-device duplicate-order guard.
 * No clear/unlock API: found, expired, unresolved and logout do not remove keys.
 * Caller must await remember BEFORE sending checkout, and retain its original key.
 * Storage loss, malicious same-origin code and noncooperating clients require a
 * server-side intent protocol; never enable checkout based on this journal alone.
 */
export function createRecoveryJournal({ storage, locks } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'
    || !locks || typeof locks.request !== 'function') throw new Error('recovery_journal_unavailable');
  const exclusive = operation => locks.request(LOCK_NAME, {mode:'exclusive'}, operation);
  return {
    async read() {
      try {
        return await exclusive(() => {
          const keys = decode(storage.getItem(STORAGE_KEY));
          return {state:keys.length ? 'retained' : 'missing', keys:[...keys], canStartNewOrder:false};
        });
      } catch {
        return {state:'unavailable', keys:[], canStartNewOrder:false};
      }
    },
    async remember(key) {
      if (!validKey(key)) throw new Error('invalid_recovery_key');
      try {
        return await exclusive(() => {
          const keys = decode(storage.getItem(STORAGE_KEY));
          if (!keys.includes(key)) {
            if (keys.length >= MAX_KEYS) throw new Error();
            keys.push(key);
          }
          const encoded = JSON.stringify({version:1, keys});
          storage.setItem(STORAGE_KEY, encoded);
          if (storage.getItem(STORAGE_KEY) !== encoded) throw new Error();
          return {state:'retained', keys:[...keys], canStartNewOrder:false};
        });
      } catch { throw new Error('recovery_journal_unavailable'); }
    },
  };
}
