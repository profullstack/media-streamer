import { datatypeFont } from '@/lib/datatype-font';

/**
 * Inline price sparkline rendered via the Datatype variable font (ported from
 * b1dz.com). Syntax: `{l:v1,v2,…}` where each v is 0–100; the font's ligatures
 * substitute that text with a chart glyph. Color reflects last-vs-first
 * direction (green up / red down).
 */
export function Sparkline({
  samples,
  width = 60,
}: {
  samples?: number[];
  width?: number;
}): React.ReactElement {
  if (!samples || samples.length < 2) {
    return <span className="text-text-muted">—</span>;
  }

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min;
  const normalized =
    range === 0 ? samples.map(() => 50) : samples.map((v) => Math.round(((v - min) / range) * 100));

  const isUp = samples[samples.length - 1] >= samples[0];
  const colorClass = isUp ? 'text-green-400' : 'text-red-400';

  return (
    <span
      className={`${datatypeFont.className} ${colorClass} inline-block`}
      style={{
        minWidth: width,
        fontSize: '1.4em',
        lineHeight: 1,
        fontVariationSettings: "'wdth' 75, 'wght' 500",
        fontFeatureSettings: "'calt' 1, 'liga' 1, 'dlig' 1",
        WebkitFontFeatureSettings: "'calt' 1, 'liga' 1, 'dlig' 1",
      }}
    >
      {`{l:${normalized.join(',')}}`}
    </span>
  );
}
