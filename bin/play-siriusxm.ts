#!/usr/bin/env -S node --import tsx

import http from "node:http";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  emailOtpLogin,
  getProxyAgent,
  loadDotenv,
  refreshAuthSession,
  resolveDeviceGrant,
  type SessionResult,
} from "./sxm-auth";

type Cat = "sports" | "news";
type Player = "mpv" | "vlc" | "ffplay" | "print";

type Args = {
  bearer: string;
  email?: string;
  cat: Cat;
  search?: string;
  player: Player;
  yes: boolean;
  debug: boolean;
  quality: "256" | "128" | "64" | "32";
};

type Channel = {
  id: string;
  type: string;
  number?: number;
  title: string;
  description?: string;
};

const PAGE_ID = "403ab6a5-d3c9-4c2a-a722-a94a6a5fd056";
const CONTAINER_ID = "3JoBfOCIwo6FmTpzM1S2H7";
const SET_ID = "5mqCLZ21qAwnufKT8puUiM";

const BROWSE_URL = `https://api.edge-gateway.siriusxm.com/browse/v1/pages/curated-grouping/${PAGE_ID}`;
const SEARCH_URL = "https://api.edge-gateway.siriusxm.com/search/v1/search";
const TUNE_SOURCE_URL = "https://api.edge-gateway.siriusxm.com/playback/play/v1/tuneSource";

function usage(exitCode = 0): never {
  console.log(`Usage:
  ./play-siriusxm.ts (--bearer TOKEN | --email you@example.com) [--cat sports|news] [--search "CNN"] [--player mpv|vlc|ffplay|print] [--yes] [--debug] [--quality 256|128|64|32]

Auth (one of):
  --bearer TOKEN     Use an already-captured AUTH_TOKEN.session.accessToken.
                     Falls back to SIRIUSXM_TOKEN from .env if unset.
  --email ADDRESS    Walk the email-OTP login chain (requires SIRIUSXM_DEVICE_GRANT in .env).

Examples:
  ./play-siriusxm.ts --email you@example.com --cat sports
  ./play-siriusxm.ts --bearer "$TOKEN" --search "CNN" --yes
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    bearer: "",
    cat: "sports",
    player: "mpv",
    yes: false,
    debug: false,
    quality: "256",
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") usage(0);

    if (arg === "--bearer") {
      args.bearer = argv[++i] || "";
      continue;
    }

    if (arg === "--email") {
      args.email = argv[++i] || "";
      continue;
    }

    if (arg === "--cat") {
      const cat = argv[++i] as Cat;
      if (cat !== "sports" && cat !== "news") {
        throw new Error("--cat must be sports or news");
      }
      args.cat = cat;
      continue;
    }

    if (arg === "--search") {
      args.search = argv[++i] || "";
      continue;
    }

    if (arg === "--player") {
      const player = argv[++i] as Player;
      if (!["mpv", "vlc", "ffplay", "print"].includes(player)) {
        throw new Error("--player must be mpv, vlc, ffplay, or print");
      }
      args.player = player;
      continue;
    }

    if (arg === "--quality") {
      const q = argv[++i] as Args["quality"];
      if (!["256", "128", "64", "32"].includes(q)) {
        throw new Error("--quality must be 256, 128, 64, or 32");
      }
      args.quality = q;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      args.yes = true;
      continue;
    }

    if (arg === "--debug") {
      args.debug = true;
      continue;
    }

    throw new Error(`Unknown arg: ${arg}`);
  }

  return args;
}

async function resolveSession(args: Args): Promise<SessionResult> {
  if (args.email) {
    const deviceGrant = await resolveDeviceGrant({ debug: args.debug });
    return emailOtpLogin(args.email, deviceGrant, { debug: args.debug });
  }

  if (args.bearer) {
    const env = loadDotenv();
    return {
      accessToken: args.bearer,
      cookies: env.SIRIUSXM_SESSION_COOKIES?.trim() ?? "",
    };
  }

  const env = loadDotenv();
  if (env.SIRIUSXM_TOKEN) {
    return {
      accessToken: env.SIRIUSXM_TOKEN,
      cookies: env.SIRIUSXM_SESSION_COOKIES?.trim() ?? "",
    };
  }

  console.error("No auth: pass --bearer or --email, or set SIRIUSXM_TOKEN in .env.");
  usage(1);
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

type SessionRef = {
  bearer(): string;
  refresh(): Promise<void>;
};

function commonHeaders(ref: SessionRef): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0",
    Accept: "application/json; charset=utf-8",
    "Accept-Language": "en-US,en;q=0.9",
    Authorization: `Bearer ${ref.bearer()}`,
    "x-sxm-clock": "[0,1]",
    Origin: "https://www.siriusxm.com",
    Referer: "https://www.siriusxm.com/",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
  };
}

async function sxmFetch(
  url: string,
  ref: SessionRef,
  opts: RequestInit = {},
  debug = false
): Promise<any> {
  if (debug) console.error(`[sxm] ${opts.method || "GET"} ${url}`);

  const proxyAgent = getProxyAgent();
  const send = () =>
    fetch(url, {
      ...opts,
      headers: {
        ...commonHeaders(ref),
        ...(opts.headers || {}),
      },
      ...(proxyAgent ? { dispatcher: proxyAgent } : {}),
    } as RequestInit);

  let res = await send();

  if (res.status === 401 || res.status === 403) {
    if (debug) console.error(`[sxm] ${res.status} -> refreshing session and retrying`);
    await ref.refresh();
    res = await send();
  }

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON, got:\n${text}`);
  }
}

function categoryQuery(cat: Cat): string {
  let filter: any;

  if (cat === "news") {
    filter = {
      and: [
        { filterId: "talk" },
        { filterId: "talk--news-and-politics" },
      ],
    };
  } else {
    filter = {
      one: { filterId: "sports" },
    };
  }

  const q = {
    containerConfiguration: {
      [CONTAINER_ID]: {
        filter,
        sets: {
          [SET_ID]: {
            sort: {
              sortId: "CHANNEL_NUMBER_ASC",
            },
          },
        },
      },
    },
    pagination: {
      offset: {
        containerLimit: 6,
        containerOffset: 0,
        setItemsLimit: 500,
      },
    },
    deviceCapabilities: {
      supportsDownloads: false,
    },
    constraints: {
      supportedEntityTypes: [
        "artist-station",
        "brand",
        "channel-linear",
        "channel-xtra",
        "container",
        "curated-grouping",
        "episode-audio",
        "episode-linear",
        "episode-podcast",
        "episode-video",
        "event",
        "experience",
        "genre",
        "league",
        "show",
        "show-podcast",
        "station",
        "tag-topic",
        "talent",
        "team",
        "user-signal",
      ],
    },
  };

  return `1.${b64urlJson(q)}`;
}

function itemToChannel(item: any): Channel | null {
  const entity = item?.entity;
  if (!entity?.id) return null;

  const type = entity.type || "channel-linear";
  if (type !== "channel-linear" && type !== "channel-xtra") return null;

  const title =
    entity?.texts?.title?.default ||
    entity?.texts?.title?.short ||
    entity?.texts?.title?.medium ||
    entity?.texts?.title?.long;

  if (!title) return null;

  const description =
    entity?.texts?.description?.default ||
    entity?.texts?.description?.short ||
    entity?.texts?.description?.medium ||
    entity?.texts?.description?.long ||
    "";

  const number =
    item?.decorations?.channelNumberCanonical ??
    item?.decorations?.channelNumber;

  return {
    id: entity.id,
    type,
    number: typeof number === "number" ? number : undefined,
    title,
    description,
  };
}

function dedupeChannels(channels: Channel[]): Channel[] {
  const seen = new Set<string>();
  const out: Channel[] = [];

  for (const ch of channels) {
    const key = `${ch.type}:${ch.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ch);
  }

  return out.sort((a, b) => {
    const an = a.number ?? 999999;
    const bn = b.number ?? 999999;
    if (an !== bn) return an - bn;
    return a.title.localeCompare(b.title);
  });
}

async function fetchCategoryChannels(ref: SessionRef, args: Args): Promise<Channel[]> {
  const url = `${BROWSE_URL}?q=${encodeURIComponent(categoryQuery(args.cat))}`;
  const json = await sxmFetch(url, ref, {}, args.debug);

  const channels: Channel[] = [];

  for (const container of json?.page?.containers || []) {
    for (const set of container?.sets || []) {
      for (const item of set?.items || []) {
        const ch = itemToChannel(item);
        if (ch) channels.push(ch);
      }
    }
  }

  return dedupeChannels(channels);
}

async function searchChannels(ref: SessionRef, args: Args): Promise<Channel[]> {
  const json = await sxmFetch(
    SEARCH_URL,
    ref,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        searchString: args.search,
        filterTypes: ["channel-xtra", "channel-linear"],
        preferredImageVariant: "default",
      }),
    },
    args.debug
  );

  const channels: Channel[] = [];

  for (const set of json?.container?.sets || []) {
    for (const item of set?.items || []) {
      const ch = itemToChannel(item);
      if (ch) channels.push(ch);
    }
  }

  return dedupeChannels(channels);
}

function printChannels(channels: Channel[]): void {
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    const left = ch.number ?? i + 1;
    const desc = ch.description ? ` - ${ch.description}` : "";
    console.log(`${left} ${ch.title}${desc}`);
  }
}

async function pickChannel(channels: Channel[], args: Args): Promise<Channel> {
  if (!channels.length) {
    throw new Error("No channels found");
  }

  printChannels(channels);
  console.log("");

  if (args.yes || channels.length === 1) {
    return channels[0];
  }

  const rl = readline.createInterface({ input, output });

  try {
    const answer = (await rl.question("Pick a channel number or list index: ")).trim();
    const n = Number(answer);

    if (!Number.isFinite(n)) {
      throw new Error(`Invalid selection: ${answer}`);
    }

    const byChannelNumber = channels.find((ch) => ch.number === n);
    if (byChannelNumber) return byChannelNumber;

    const byIndex = channels[n - 1];
    if (byIndex) return byIndex;

    throw new Error(`No channel for selection: ${answer}`);
  } finally {
    rl.close();
  }
}

async function getPlaybackUrl(ref: SessionRef, channel: Channel, args: Args): Promise<{ url: string; validUntil?: string }> {
  const json = await sxmFetch(
    TUNE_SOURCE_URL,
    ref,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        id: channel.id,
        type: channel.type,
        manifestVariant: "WEB",
        trackResumeSupported: false,
        hlsVersion: "V3",
        mtcVersion: "V2",
      }),
    },
    args.debug
  );

  const stream = json?.streams?.[0];
  const urls = stream?.urls || [];

  const primary = urls.find((u: any) => u?.isPrimary) || urls[0];

  if (!primary?.url) {
    throw new Error(`No playback URL in response:\n${JSON.stringify(json, null, 2)}`);
  }

  return {
    url: primary.url,
    validUntil: primary.validUntil,
  };
}

function isProbablyPlaylistUrl(url: string): boolean {
  return url.includes(".m3u8") || url.includes("m3u8?");
}

function looksLikePlaylist(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    isProbablyPlaylistUrl(url) ||
    ct.includes("mpegurl") ||
    ct.includes("m3u") ||
    ct.includes("vnd.apple")
  );
}

function absolutize(uri: string, playlistUrl: string): string {
  return new URL(uri, playlistUrl).toString();
}

function proxify(url: string, baseUrl: string): string {
  return `${baseUrl}/proxy?u=${encodeURIComponent(url)}`;
}

function chooseSingleVariantPlaylist(text: string, playlistUrl: string, quality: Args["quality"]): string | null {
  const lines = text.split(/\r?\n/);

  type Variant = {
    info: string;
    uri: string;
    absoluteUri: string;
    bandwidth: number;
    qualityScore: number;
  };

  const variants: Variant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

    const uri = lines[i + 1];
    if (!uri || uri.startsWith("#")) continue;

    const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
    const bandwidth = bwMatch ? Number(bwMatch[1]) : 0;

    const absoluteUri = absolutize(uri, playlistUrl);

    let qualityScore = 0;
    if (absoluteUri.includes(`_${quality}k_`) || absoluteUri.includes(`${quality}k`)) {
      qualityScore = 10_000_000;
    }

    variants.push({
      info: line,
      uri,
      absoluteUri,
      bandwidth,
      qualityScore,
    });
  }

  if (!variants.length) return null;

  variants.sort((a, b) => {
    const aq = a.qualityScore + a.bandwidth;
    const bq = b.qualityScore + b.bandwidth;
    return bq - aq;
  });

  const picked = variants[0];

  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    picked.info,
    picked.absoluteUri,
    "",
  ].join("\n");
}

function rewritePlaylist(text: string, playlistUrl: string, baseUrl: string, quality: Args["quality"]): string {
  const singleVariant = chooseSingleVariantPlaylist(text, playlistUrl, quality);
  const source = singleVariant || text;

  const lines = source.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#EXT-X-KEY")) {
      const rewritten = line.replace(/URI="([^"]+)"/, (_m, uri) => {
        const absolute = absolutize(uri, playlistUrl);
        return `URI="${proxify(absolute, baseUrl)}"`;
      });
      out.push(rewritten);
      continue;
    }

    if (trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }

    const absolute = absolutize(trimmed, playlistUrl);
    out.push(proxify(absolute, baseUrl));
  }

  return out.join("\n");
}

function decodeSxmKeyJson(json: any): Buffer {
  const raw =
    json?.key ||
    json?.value ||
    json?.keyValue ||
    json?.encryptionKey ||
    json?.encryptionKeyValue ||
    json?.data ||
    json?.payload ||
    json?.result?.key ||
    json?.result?.value;

  if (!raw || typeof raw !== "string") {
    throw new Error(`Could not find key in JSON: ${JSON.stringify(json)}`);
  }

  if (/^[A-Za-z0-9+/=_-]+$/.test(raw)) {
    return Buffer.from(raw.replaceAll("-", "+").replaceAll("_", "/"), "base64");
  }

  if (/^[a-fA-F0-9]+$/.test(raw) && raw.length % 2 === 0) {
    return Buffer.from(raw, "hex");
  }

  return Buffer.from(raw, "utf8");
}

async function startHlsProxy(
  ref: SessionRef,
  quality: Args["quality"],
  debug = false
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let baseUrl = "";

  const upstreamFetch = async (target: string): Promise<Response> => {
    // Stream resources (m3u8 playlists + segments) skip the proxy — they
    // come from SXM's CDN, not the auth gateway, and routing audio through
    // residential proxies is expensive.
    const send = () =>
      fetch(target, {
        headers: {
          ...commonHeaders(ref),
          Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        },
      });
    let response = await send();
    if (response.status === 401 || response.status === 403) {
      if (debug) console.error(`[proxy] ${response.status} -> refreshing session and retrying`);
      try {
        await ref.refresh();
        response = await send();
      } catch (err) {
        if (debug) console.error(`[proxy] refresh failed: ${(err as Error).message}`);
      }
    }
    return response;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || "127.0.0.1";
      const reqUrl = new URL(req.url || "/", `http://${host}`);

      if (reqUrl.pathname !== "/proxy") {
        res.writeHead(404);
        res.end("not found");
        return;
      }

      const target = reqUrl.searchParams.get("u");

      if (!target) {
        res.writeHead(400);
        res.end("missing u");
        return;
      }

      if (debug) console.error(`[proxy] GET ${target}`);

      const upstream = await upstreamFetch(target);

      const contentType = upstream.headers.get("content-type") || "";
      const contentLength = upstream.headers.get("content-length") || "";

      if (debug) {
        console.error(`[proxy] ${upstream.status} ${contentType} ${contentLength}`);
      }

      if (!upstream.ok) {
        const body = await upstream.text().catch(() => "");
        res.writeHead(upstream.status, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        res.end(`proxy upstream failed: ${upstream.status}\n${body}`);
        return;
      }

      // IMPORTANT:
      // SiriusXM key endpoint returns JSON.
      // HLS players expect raw AES key bytes.
      // Returning the JSON directly makes ffmpeg decode encrypted AAC garbage.
      if (target.includes("/playback/key/v1/")) {
        const json = await upstream.json();
        const keyBytes = decodeSxmKeyJson(json);

        if (debug) {
          console.error(`[proxy] key json=${JSON.stringify(json)}`);
          console.error(`[proxy] key bytes=${keyBytes.length}`);
        }

        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(keyBytes.length),
          "Cache-Control": "no-cache",
        });
        res.end(keyBytes);
        return;
      }

      if (looksLikePlaylist(target, contentType)) {
        const text = await upstream.text();
        const rewritten = rewritePlaylist(text, target, baseUrl, quality);

        if (debug) {
          const entries = rewritten
            .split("\n")
            .filter((line) => line.includes("/proxy?u=")).length;
          console.error(`[proxy] playlist rewritten entries=${entries}`);
        }

        res.writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        });
        res.end(rewritten);
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());

      if (debug) console.error(`[proxy] body bytes=${buf.length}`);

      res.writeHead(200, {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "no-cache",
      });
      res.end(buf);
    } catch (err: any) {
      res.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(err?.stack || String(err));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start local proxy");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;

  if (debug) console.error(`[proxy] listening ${baseUrl}`);

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function playerCommand(player: Player, url: string): { cmd: string; args: string[] } {
  if (player === "mpv") {
    return {
      cmd: "mpv",
      args: [
        "--no-video",
        "--audio-display=no",
        "--mute=no",
        "--volume=100",
        "--cache=yes",
        "--demuxer-lavf-o=allowed_extensions=ALL",
        url,
      ],
    };
  }

  if (player === "vlc") {
    return {
      cmd: "vlc",
      args: ["--intf", "dummy", "--play-and-exit", url],
    };
  }

  if (player === "ffplay") {
    return {
      cmd: "ffplay",
      args: [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "warning",
        "-allowed_extensions",
        "ALL",
        url,
      ],
    };
  }

  return {
    cmd: "print",
    args: [url],
  };
}

async function playUrl(url: string, args: Args): Promise<void> {
  if (args.player === "print") {
    console.log(url);
    return;
  }

  const { cmd, args: playerArgs } = playerCommand(args.player, url);

  if (args.debug) {
    console.error(`[player] ${cmd} ${playerArgs.join(" ")}`);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, playerArgs, {
      stdio: "inherit",
    });

    child.on("error", reject);

    child.on("exit", (code, signal) => {
      if (signal) return resolve();
      if (code === 0 || code === null) return resolve();
      reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  let session = await resolveSession(args);
  args.bearer = session.accessToken;
  const ref: SessionRef = {
    bearer: () => session.accessToken,
    refresh: async () => {
      if (!session.cookies) {
        throw new Error(
          "session expired and no cookies cached — re-run with --email to log in again"
        );
      }
      console.error("[auth] refreshing session via cookie jar");
      session = await refreshAuthSession(session.cookies, args.debug);
      args.bearer = session.accessToken;
    },
  };

  const channels = args.search
    ? await searchChannels(ref, args)
    : await fetchCategoryChannels(ref, args);

  const selected = await pickChannel(channels, args);

  console.log(`Selected: ${selected.number ?? ""} ${selected.title}`.trim());
  console.log(`ID: ${selected.id}`);
  if (selected.description) console.log(`Description: ${selected.description}`);

  const playback = await getPlaybackUrl(ref, selected, args);

  if (playback.validUntil) {
    console.log(`Stream valid until: ${playback.validUntil}`);
  }

  const proxy = await startHlsProxy(ref, args.quality, args.debug);

  try {
    const proxiedUrl = `${proxy.baseUrl}/proxy?u=${encodeURIComponent(playback.url)}`;
    console.log("");
    console.log("Playing...");
    await playUrl(proxiedUrl, args);
  } finally {
    await proxy.close();
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});