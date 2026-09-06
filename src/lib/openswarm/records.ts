/**
 * OpenSwarm records: canonical form, ids and signatures.
 *
 * Every object in the family is a signed JSON record (core §3). The rules are
 * short and none of them are ours to reinterpret:
 *
 *   canonical bytes = RFC 8785 JCS of the record with `sigs` removed
 *   id              = "sha256:" + lowercase hex of SHA-256 over those bytes
 *   signed message  = "openswarm:sig:v1:" + type + "\n" + canonical bytes
 *
 * The domain prefix is what stops a signature over an attestation being
 * replayed as a signature over a receipt with the same body.
 *
 * Money is a decimal string with exactly six fractional digits, never a float,
 * so JCS never has to serialise one and rounding is always ours to decide.
 */
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

export const OPENSWARM_VERSION = '0.1';

/** `<alg>:<hex>`; ed25519 public keys are 32 bytes, so 64 hex characters. */
const KEY_PATTERN = /^ed25519:[0-9a-f]{64}$/;
/** SPKI DER prefix for an Ed25519 public key, so node can import raw bytes. */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface Signature {
  alg: string;
  key: string;
  sig: string;
}

export interface SignedRecord {
  openswarm: string;
  type: string;
  createdAt: string;
  sigs: Signature[];
  [field: string]: unknown;
}

export function isKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

/**
 * RFC 8785 canonical JSON: object keys sorted by their UTF-16 code units, no
 * insignificant whitespace. Numbers are rejected outright rather than
 * serialised — this family puts every amount in a string precisely so the
 * float-formatting half of JCS never runs.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new OpenSwarmRecordError('a record may not carry a fractional number; amounts are strings');
    }
    if (!Number.isSafeInteger(value)) {
      throw new OpenSwarmRecordError('a record may not carry an integer beyond 2^53');
    }
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  throw new OpenSwarmRecordError(`a record may not carry a ${typeof value}`);
}

export class OpenSwarmRecordError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'OpenSwarmRecordError';
  }
}

/** The bytes a record's id and signatures are computed over: everything but `sigs`. */
export function canonicalBytes(record: Record<string, unknown>): string {
  const { sigs: _sigs, ...rest } = record;
  return canonicalize(rest);
}

export function recordId(record: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(canonicalBytes(record), 'utf8').digest('hex')}`;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function publicKeyFrom(key: string) {
  if (!isKey(key)) throw new OpenSwarmRecordError(`not an ed25519 key: ${key}`);
  const raw = Buffer.from(key.slice('ed25519:'.length), 'hex');
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}

/** The exact bytes a signer signs for this record type. */
export function signingMessage(type: string, record: Record<string, unknown>): Buffer {
  return Buffer.from(`openswarm:sig:v1:${type}\n${canonicalBytes(record)}`, 'utf8');
}

/**
 * Is this record signed by `key`?
 *
 * A verifier that does not implement an algorithm MUST ignore those entries
 * rather than fail, so an mldsa65 signature alongside ed25519 is not an error
 * here; it simply is not what satisfies the check.
 */
export function verifiedBy(record: SignedRecord, key: string): boolean {
  if (!Array.isArray(record.sigs)) return false;
  const message = signingMessage(record.type, record);
  return record.sigs.some((entry) => {
    if (!entry || entry.alg !== 'ed25519' || entry.key !== key) return false;
    try {
      return verifySignature(null, message, publicKeyFrom(entry.key), Buffer.from(entry.sig, 'base64'));
    } catch {
      return false;
    }
  });
}

/** Every key that has a good ed25519 signature over this record. */
export function signers(record: SignedRecord): string[] {
  if (!Array.isArray(record.sigs)) return [];
  const seen = new Set<string>();
  for (const entry of record.sigs) {
    if (entry?.alg === 'ed25519' && isKey(entry.key) && !seen.has(entry.key) && verifiedBy(record, entry.key)) {
      seen.add(entry.key);
    }
  }
  return [...seen];
}

/** Shape and envelope checks every record must pass before anything else looks at it. */
export function assertEnvelope(value: unknown, type: string): SignedRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OpenSwarmRecordError('a record must be a JSON object');
  }
  const record = value as SignedRecord;
  if (record.openswarm !== OPENSWARM_VERSION) {
    throw new OpenSwarmRecordError(`this hub speaks openswarm ${OPENSWARM_VERSION}`);
  }
  if (record.type !== type) {
    throw new OpenSwarmRecordError(`expected a ${type} record, got ${String(record.type)}`);
  }
  if (typeof record.createdAt !== 'string' || Number.isNaN(Date.parse(record.createdAt))) {
    throw new OpenSwarmRecordError('createdAt must be an RFC 3339 timestamp');
  }
  if (!Array.isArray(record.sigs) || record.sigs.length === 0) {
    throw new OpenSwarmRecordError('a record must carry at least one signature');
  }
  return record;
}

/* -------------------------------------------------------------- money ---- */

const SCALE = 1_000_000n;

/** Parse a six-decimal money string into integer micro-USD. */
export function toMicros(amount: string): bigint {
  if (!/^\d{1,12}\.\d{6}$/.test(amount)) {
    throw new OpenSwarmRecordError(`an amount is a decimal string with six fractional digits, not "${amount}"`);
  }
  const [whole, fraction] = amount.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction);
}

/** Format integer micro-USD back into the wire's six-decimal string. */
export function fromMicros(micros: bigint): string {
  const negative = micros < 0n;
  const value = negative ? -micros : micros;
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(6, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** A number of USD (a DB numeric, say) as the wire's money string. */
export function usd(amount: number | string): string {
  if (typeof amount === 'string') return toMicros(amount) === 0n ? '0.000000' : amount;
  if (!Number.isFinite(amount)) throw new OpenSwarmRecordError('an amount must be finite');
  return (Math.round(amount * 1e6) / 1e6).toFixed(6);
}
