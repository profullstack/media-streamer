/**
 * GET /api/player — universal, embeddable media player.
 *
 * Returns a self-contained HTML page (iframe it into a modal anywhere — it sets
 * `frame-ancestors *`). Reusable by any app/site: give it a `type` + `src`.
 *
 *   /api/player?type=video&src=<url>            HLS (.m3u8) or progressive video
 *   /api/player?type=audio&src=<url>            audio (radio/podcast/music)
 *   /api/player?type=ebook&src=<url.epub>       EPUB reader (epub.js)
 *   /api/player?type=tv&channel=<raw-stream>    convenience: proxies via iptv-proxy
 *
 * Optional: &title=…  &poster=…  &autoplay=0
 */

import { NextRequest, NextResponse } from 'next/server';

function esc(s: string): string {
  return String(s ?? '').replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function html(body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      // Embeddable in any site's modal; allow the CDN libs + media the player needs.
      'content-security-policy':
        "default-src 'self' data: blob: https: http:; " +
        // blob: + worker-src for mpegts.js (raw IPTV .ts decodes in a blob worker).
        "script-src 'self' 'unsafe-inline' blob: https://cdn.jsdelivr.net; " +
        "worker-src blob:; " +
        "style-src 'self' 'unsafe-inline'; " +
        "media-src * data: blob:; img-src * data: blob:; connect-src *; " +
        // '*' only covers http/https/ws — list extension schemes explicitly so
        // TronBrowser's chrome-extension:// new tab can embed the player.
        "frame-ancestors * https: http: chrome-extension: moz-extension:",
    },
  });
}

// Themeable: the embedding site can pass &theme=light|dark and/or explicit
// &bg= &fg= &accent= (hex, URL-encoded). Falls back to the viewer's OS scheme.
function themeCss(q: URLSearchParams): string {
  const hex = (v: string | null) => (v && /^#?[0-9a-fA-F]{3,8}$/.test(v) ? (v[0] === '#' ? v : '#' + v) : '');
  const bg = hex(q.get('bg'));
  const fg = hex(q.get('fg'));
  const accent = hex(q.get('accent'));
  const theme = (q.get('theme') || '').toLowerCase();
  let base = ':root{--bg:#05070d;--fg:#cfe8ff;--accent:#34e7ff}' +
    '@media(prefers-color-scheme:light){:root{--bg:#ffffff;--fg:#0b1020;--accent:#0a84ff}}';
  if (theme === 'light') base += ':root{--bg:#ffffff;--fg:#0b1020;--accent:#0a84ff}';
  if (theme === 'dark') base += ':root{--bg:#05070d;--fg:#cfe8ff;--accent:#34e7ff}';
  const over = [bg && `--bg:${bg}`, fg && `--fg:${fg}`, accent && `--accent:${accent}`].filter(Boolean).join(';');
  if (over) base += `:root{${over}}`;
  return base;
}

const SHELL = (title: string, inner: string, theme: string) => `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title) || 'TronBrowser Player'}</title>
<style>${theme}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);
font:14px/1.5 ui-monospace,Menlo,monospace}#wrap{width:100%;height:100%;display:grid;place-items:center}
video,audio{width:100%;height:100%;background:#000}audio{height:auto}
.msg{padding:24px;text-align:center}.bar{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;gap:8px;
align-items:center;padding:8px 12px;background:linear-gradient(var(--bg),transparent)}.bar b{color:var(--accent)}
button{background:var(--accent);color:#04060c;border:0;border-radius:6px;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer}
.dock{position:fixed;bottom:0;left:0;right:0;display:flex;align-items:center;gap:12px;padding:10px 14px;box-sizing:border-box;background:var(--bg);border-top:1px solid rgba(127,140,170,.25)}
.dock audio{display:none}
.dock .art{width:56px;height:56px;border-radius:8px;object-fit:cover;flex:none;background:rgba(127,140,170,.18);display:grid;place-items:center;font-size:22px}
.dock .meta{min-width:0;flex:1 1 140px}
.dock .meta .t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dock .meta .s{font-size:12px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dock .ctrl{display:flex;align-items:center;gap:6px;flex:none}
.dock .ctrl button{width:38px;height:38px;border-radius:50%;padding:0;font-size:12px}
.dock .ctrl .pp{width:46px;height:46px;font-size:16px}
.dock .seek{display:flex;align-items:center;gap:8px;flex:2 1 160px;min-width:0;max-width:440px}
.dock .seek input{flex:1;min-width:0;accent-color:var(--accent)}
.dock .seek .tm{font-size:11px;opacity:.7;width:40px;text-align:center}
.live{background:#e7344e;color:#fff;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700}
#xclose{position:fixed;top:8px;right:8px;z-index:20;width:30px;height:30px;border-radius:50%;padding:0;
font-size:14px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.25)}
@media(max-width:560px){.dock .seek{display:none}}</style>
</head><body><div id="wrap">${inner}</div>
<button id="xclose" title="Close" onclick="try{window.parent.postMessage({type:'tron-player-close'},'*')}catch(e){}">✕</button>
</body></html>`;

// Docked audio player bar (podcast/music/radio) — mirrors bittorrented.com's
// NowPlayingBar: artwork + title/subtitle + skip-30 / play / seek + time.
const dockBar = (title: string, subtitle: string, poster: string, live: boolean) => `
  <div class="dock">
    ${poster ? `<img class="art" src="${esc(poster)}" alt="">` : `<div class="art">${live ? '📻' : '♪'}</div>`}
    <div class="meta"><div class="t">${esc(title) || 'Now playing'}</div>
      <div class="s">${live ? '<span class="live">LIVE</span> ' : ''}${esc(subtitle)}</div></div>
    <div class="ctrl">
      ${live ? '' : '<button id="bk" title="Back 30s">↺30</button>'}
      <button id="pp" class="pp" title="Play / pause">▶</button>
      ${live ? '' : '<button id="fw" title="Forward 30s">30↻</button>'}
    </div>
    ${live ? '' : '<div class="seek"><span class="tm" id="cur">0:00</span><input id="sk" type="range" min="0" max="100" value="0"><span class="tm" id="dur">--:--</span></div>'}
    <audio id="a"></audio>
  </div>`;

// Shared custom-control JS driving <audio id="a"> for the docked bar.
const DOCK_JS = `
  var a=document.getElementById('a'),pp=document.getElementById('pp'),sk=document.getElementById('sk'),
  cur=document.getElementById('cur'),dur=document.getElementById('dur'),bk=document.getElementById('bk'),fw=document.getElementById('fw');
  function fmt(s){if(!isFinite(s)||s<0)return '0:00';var m=Math.floor(s/60),x=Math.floor(s%60);return m+':'+(x<10?'0':'')+x;}
  function err(t){document.getElementById('wrap').innerHTML='<div class="msg">'+t+'</div>';}
  pp.onclick=function(){a.paused?a.play().catch(function(){}):a.pause();};
  a.addEventListener('play',function(){pp.textContent='❚❚';});
  a.addEventListener('pause',function(){pp.textContent='▶';});
  if(bk)bk.onclick=function(){a.currentTime=Math.max(0,a.currentTime-30);};
  if(fw)fw.onclick=function(){a.currentTime=Math.min(a.duration||1e9,a.currentTime+30);};
  if(sk){a.addEventListener('timeupdate',function(){if(cur)cur.textContent=fmt(a.currentTime);if(a.duration)sk.value=String(a.currentTime/a.duration*100);});
  a.addEventListener('loadedmetadata',function(){if(dur)dur.textContent=fmt(a.duration);});
  sk.oninput=function(){if(a.duration)a.currentTime=a.duration*(sk.value/100);};}`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams;
  const theme = themeCss(q);
  const type = (q.get('type') || 'video').toLowerCase();
  const title = q.get('title') || '';
  const subtitle = q.get('subtitle') || '';
  const poster = q.get('poster') || '';
  const autoplay = q.get('autoplay') !== '0';
  let src = q.get('src') || '';

  // Convenience resolver: a raw live-TV stream → the public iptv proxy.
  if (type === 'tv' && q.get('channel')) {
    src = `/api/iptv-proxy?url=${encodeURIComponent(q.get('channel') as string)}`;
  }

  // Radio: resolve the SiriusXM HLS stream server-side for the token user.
  if (type === 'radio' && q.get('station')) {
    let radioErr = 'Radio unavailable.';
    try {
      const { getApiUser } = await import('@/lib/api-tokens');
      const u = await getApiUser(request);
      if (!u) {
        radioErr = 'Connect your account to play radio.';
      } else {
        const { withSiriusXmUser } = await import('@/lib/radio/siriusxm-auth');
        const { getRadioService } = await import('@/lib/radio');
        src = await withSiriusXmUser(u.id, async () => {
          const { preferred } = await getRadioService().getStream(q.get('station') as string, '256' as never);
          return preferred?.url || '';
        });
        if (!src) radioErr = 'No stream — link your SiriusXM account on bittorrented.com.';
      }
    } catch {
      radioErr = 'Radio unavailable — link SiriusXM on bittorrented.com.';
    }
    if (!src) return html(SHELL(title, `<div class="msg">${esc(radioErr)}</div>`, theme));
  }

  if (!src) {
    return html(SHELL(title, `<div class="msg">No media source.</div>`, theme));
  }

  // Audio/ebook elements can't set Authorization headers, so put the connect
  // token in the gated stream URL. Video uses hls.js xhrSetup (header) instead.
  const tokenRaw = q.get('token') || '';
  if (tokenRaw && ['audio', 'radio', 'podcast', 'music', 'ebook', 'book', 'tv'].includes(type) && /\/api\/(stream|iptv-proxy)/.test(src)) {
    src += (src.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(tokenRaw);
  }

  const j = JSON.stringify(src);
  const tk = JSON.stringify(tokenRaw); // connect token for gated proxy streams (video → header)
  const ap = autoplay ? ' autoplay' : '';

  // Radio = HLS audio (via the auth'd proxy) — docked live bar, hls.js + token header.
  if (type === 'radio') {
    return html(SHELL(title, dockBar(title, subtitle || 'Live radio', poster, true) + `
      <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
      <script>
        ${DOCK_JS}
        var src=${j}, token=${tk}, autoplay=${autoplay ? 'true' : 'false'};
        if(window.Hls && Hls.isSupported()){
          var h=new Hls({xhrSetup:function(x){ if(token) x.setRequestHeader('Authorization','Bearer '+token); }});
          h.on(Hls.Events.MANIFEST_PARSED, function(){ if(autoplay) a.play().catch(function(){}); });
          h.on(Hls.Events.ERROR, function(e,d){ if(d&&d.fatal) err('Radio stream error — station offline or SiriusXM session expired.'); });
          h.loadSource(src); h.attachMedia(a);
        } else if(a.canPlayType('application/vnd.apple.mpegurl')){ a.src=src; if(autoplay) a.play().catch(function(){}); }
        else { err('This browser can\\'t play the radio stream.'); }
      </script>`, theme));
  }

  // Audio (podcast episodes / music) — docked bar with artwork + seek + skip-30.
  if (type === 'audio' || type === 'podcast' || type === 'music') {
    return html(SHELL(title, dockBar(title, subtitle, poster, false) + `
      <script>
        ${DOCK_JS}
        var src=${j}, autoplay=${autoplay ? 'true' : 'false'};
        a.addEventListener('error', function(){ err('Could not play this audio.'); });
        a.src=src; if(autoplay) a.play().catch(function(){});
      </script>`, theme));
  }

  if (type === 'ebook' || type === 'book') {
    // PDF (and other non-EPUB) → browser-native viewer; EPUB → epub.js.
    if ((q.get('fmt') || '').toLowerCase() === 'pdf' || /\\.pdf(\\?|$)/i.test(src)) {
      return html(SHELL(title, `
        ${title ? `<div class="bar"><b>📖</b> ${esc(title)}</div>` : ''}
        <iframe src=${j} style="width:100%;height:100%;border:0;background:#fff"></iframe>`, theme));
    }
    return html(SHELL(title, `
      <div class="bar"><b>${esc(title) || 'Reader'}</b>
        <button onclick="rendition&&rendition.prev()">‹ Prev</button>
        <button onclick="rendition&&rendition.next()">Next ›</button></div>
      <div id="reader" style="width:100%;height:100%;background:#fff"></div>
      <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"></script>
      <script>
        var rendition;
        try {
          var book = ePub(${j});
          rendition = book.renderTo('reader', { width:'100%', height:'100%', spread:'none' });
          rendition.display();
          document.addEventListener('keyup', function(e){
            if(e.key==='ArrowLeft') rendition.prev();
            if(e.key==='ArrowRight') rendition.next();
          });
        } catch(e){ document.getElementById('reader').innerHTML='<p style="color:#900;padding:24px">Could not open ebook: '+e.message+'</p>'; }
      </script>`, theme));
  }

  // default: video. Mirrors bittorrented's "transcode only when necessary":
  // play the direct stream natively first; if the browser can't decode it,
  // fall back to the HLS transcode (passed as &hls=). Live TV / .m3u8 go
  // straight to hls.js (already HLS).
  const hlsFallback = q.get('hls') || '';
  const hf = JSON.stringify(hlsFallback);
  return html(SHELL(title, `
    ${title ? `<div class="bar"><b>▶</b> ${esc(title)}</div>` : ''}
    <video id="v" controls${ap} playsinline ${poster ? `poster="${esc(poster)}"` : ''}></video>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.js"></script>
    <script>
      var v=document.getElementById('v'), src=${j}, hlsUrl=${hf}, token=${tk};
      function err(t){ document.getElementById('wrap').innerHTML='<div class="msg">'+t+'</div>'; }
      function playHls(u){
        if(window.Hls && Hls.isSupported()){
          var h=new Hls({enableWorker:true, xhrSetup:function(x){ if(token) x.setRequestHeader('Authorization','Bearer '+token); }});
          h.on(Hls.Events.MANIFEST_PARSED, function(){ v.play().catch(function(){}); });
          h.on(Hls.Events.ERROR, function(e,d){ if(d&&d.fatal) err('Stream error.'); });
          h.loadSource(u); h.attachMedia(v);
        } else if(v.canPlayType('application/vnd.apple.mpegurl')){ v.src=u; v.play().catch(function(){}); }
        else { err('This browser can\\'t play HLS.'); }
      }
      function playMpegts(u){
        // Raw MPEG-TS (IPTV .ts) — Chromium can't play it natively or via hls.js.
        // mpegts.js runs in a worker and needs an absolute URL; token rides in the URL.
        if(window.mpegts && mpegts.isSupported()){
          var abs = u.charAt(0)==='/' ? location.origin+u : u;
          var p = mpegts.createPlayer({ type:'mpegts', isLive:true, url:abs },
            { enableWorker:true, enableStashBuffer:true, stashInitialSize:384*1024,
              liveBufferLatencyChasing:false, autoCleanupSourceBuffer:true });
          p.on(mpegts.Events.ERROR, function(){ err('Stream error — channel may be offline.'); });
          p.attachMediaElement(v); p.load(); v.play().catch(function(){});
        } else { err('This browser can\\'t play this channel.'); }
      }
      var inner = src; try { inner = decodeURIComponent(src); } catch(e) {}
      var isProxy = /iptv-proxy/.test(src);
      var isHls = /\\.m3u8(\\?|$)/i.test(src) || /stream\\/hls/.test(src) || (isProxy && /\\.m3u8|\\.m3u(\\?|$|&)/i.test(inner));
      if(isProxy && !isHls){ playMpegts(src); }   // raw .ts IPTV channel
      else if(isHls){ playHls(src); }              // HLS (.m3u8 IPTV or torrent transcode)
      else {
        // Direct progressive torrent stream — native <video> can't set headers, so
        // token goes in the URL. On a decode error (unsupported codec), transcode
        // via the HLS fallback (matches the native site's "transcode only if needed").
        v.src = src + (token ? (src.indexOf('?')>=0?'&':'?')+'token='+encodeURIComponent(token) : '');
        v.addEventListener('error', function(){ if(hlsUrl) playHls(hlsUrl); else err('Could not play this file.'); });
        v.play().catch(function(){});
      }
    </script>`, theme));
}
