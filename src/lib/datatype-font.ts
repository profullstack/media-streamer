import localFont from 'next/font/local';

/**
 * Datatype variable font — OpenType ligatures render the literal text
 * `{l:v1,v2,…}` (each v 0–100) as an inline sparkline glyph at draw time.
 * Loaded once at module scope so it's preloaded and shares one hash.
 * (Ported from b1dz.com.)
 */
export const datatypeFont = localFont({
  src: '../app/fonts/Datatype.woff2',
  display: 'swap',
  weight: '100 900',
  preload: true,
  variable: '--font-datatype',
});
