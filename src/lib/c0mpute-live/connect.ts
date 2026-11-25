/**
 * The connect step: one credential, one stream per member.
 *
 * The credential (the OAuth access token) is checked with /live/me, used to make
 * the member's stream (or, when their account already has one by that name, to
 * fetch a fresh key for it), and is unreachable once this returns. The stream
 * key goes to the store sealed, and nowhere else.
 */

import { liveApi, type LiveAccount, type LiveApi, type LiveStream } from './api';
import { C0mputeError, type C0mputeConfig, type FetchLike, type Visibility } from './oauth';

export interface StoredStream {
  user_id: string;
  stream_id: string;
  watch_url: string | null;
  playback_url: string | null;
  account_label: string | null;
  visibility: Visibility;
  /** Sealed (crypto.ts). Never leaves the server. */
  stream_key_enc: string;
}

export interface LiveStreamStore {
  get(userId: string): Promise<StoredStream | null>;
  save(row: StoredStream): Promise<void>;
  remove(userId: string): Promise<void>;
}

/** The c0mpute stream name for a member: `bt-` and the first 12 hex of their id. */
export function streamNameFor(userId: string): string {
  const hex = userId.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 12);
  if (hex.length < 12) throw new Error('user id is not a uuid');
  return `bt-${hex}`;
}

export interface ConnectResult {
  account: LiveAccount;
  stream: LiveStream;
}

export async function provisionStream(
  input: { userId: string; visibility: Visibility; accountLabel: string | null },
  api: Pick<LiveApi, 'createStream' | 'listStreams' | 'rekey'>,
  store: LiveStreamStore,
  seal: (streamKey: string) => string
): Promise<LiveStream> {
  const name = streamNameFor(input.userId);
  const created = await api.createStream({ name, title: 'BitTorrented live', visibility: input.visibility });
  let stream: LiveStream;
  let streamKey: string;
  if (created.conflict) {
    const found = (await api.listStreams()).find((s) => s.name === name);
    if (!found) throw new C0mputeError('conflict', 'c0mpute stream name is taken');
    stream = found;
    streamKey = await api.rekey(found.id);
  } else {
    stream = created.stream;
    streamKey = created.streamKey;
  }
  await store.save({
    user_id: input.userId,
    stream_id: stream.id,
    watch_url: stream.watchUrl,
    playback_url: stream.playbackUrl,
    account_label: input.accountLabel,
    visibility: input.visibility,
    stream_key_enc: seal(streamKey),
  });
  return stream;
}

export async function connectWithCredential(
  cfg: Pick<C0mputeConfig, 'origin'>,
  credential: string,
  input: { userId: string; visibility: Visibility },
  store: LiveStreamStore,
  seal: (streamKey: string) => string,
  fetchImpl: FetchLike = fetch
): Promise<ConnectResult> {
  const api = liveApi(cfg, credential, fetchImpl);
  const account = await api.me();
  const stream = await provisionStream({ ...input, accountLabel: account.accountLabel }, api, store, seal);
  return { account, stream };
}
