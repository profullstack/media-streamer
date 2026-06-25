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
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline'; " +
        "media-src * data: blob:; img-src * data: blob:; connect-src *; " +
        "frame-ancestors *",
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
button{background:var(--accent);color:#04060c;border:0;border-radius:6px;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer}</style>
</head><body><div id="wrap">${inner}</div></body></html>`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams;
  const theme = themeCss(q);
  const type = (q.get('type') || 'video').toLowerCase();
  const title = q.get('title') || '';
  const poster = q.get('poster') || '';
  const autoplay = q.get('autoplay') !== '0';
  let src = q.get('src') || '';

  // Convenience resolver: a raw live-TV stream → the public iptv proxy.
  if (type === 'tv' && q.get('channel')) {
    src = `/api/iptv-proxy?url=${encodeURIComponent(q.get('channel') as string)}`;
  }
  if (!src) {
    return html(SHELL(title, `<div class="msg">No media source.</div>`, theme));
  }

  const j = JSON.stringify(src);
  const ap = autoplay ? ' autoplay' : '';

  if (type === 'audio' || type === 'radio' || type === 'podcast' || type === 'music') {
    return html(SHELL(title, `
      ${title ? `<div class="bar"><b>♪</b> ${esc(title)}</div>` : ''}
      <audio controls${ap} src=${j}></audio>`, theme));
  }

  if (type === 'ebook' || type === 'book') {
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

  // default: video (HLS or progressive)
  return html(SHELL(title, `
    ${title ? `<div class="bar"><b>▶</b> ${esc(title)}</div>` : ''}
    <video id="v" controls${ap} playsinline ${poster ? `poster="${esc(poster)}"` : ''}></video>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
    <script>
      var v=document.getElementById('v'), src=${j};
      var isHls=/\\.m3u8(\\?|$)/i.test(src) || /m3u8/i.test(src);
      if(isHls && window.Hls && Hls.isSupported()){
        var h=new Hls({enableWorker:true}); h.loadSource(src); h.attachMedia(v);
      } else { v.src=src; } // native HLS (Safari) or progressive mp4/webm/ts
    </script>`, theme));
}
