import DOMPurify from 'isomorphic-dompurify';

const MAX_CACHE_SIZE = 500;
const sanitizeCache = new Map<string, string>();

const BASE_ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'del',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];

const BASE_ALLOWED_ATTR = [
  'colspan',
  'href',
  'id',
  'name',
  'rel',
  'rowspan',
  'target',
  'title',
];

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '\u00A9',
  gt: '>',
  hellip: '\u2026',
  ldquo: '\u201C',
  lsquo: '\u2018',
  lt: '<',
  mdash: '\u2014',
  nbsp: ' ',
  ndash: '\u2013',
  quot: '"',
  rdquo: '\u201D',
  reg: '\u00AE',
  rsquo: '\u2019',
  trade: '\u2122',
};

function safeCodePoint(value: number, fallback: string): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10FFFF
    ? String.fromCodePoint(value)
    : fallback;
}

interface RichContentOptions {
  allowImages?: boolean;
}

function cacheKey(html: string, options: RichContentOptions): string {
  return `${options.allowImages ? 'img' : 'no-img'}:${html}`;
}

function setCache(key: string, value: string): void {
  if (sanitizeCache.size >= MAX_CACHE_SIZE) {
    const firstKey = sanitizeCache.keys().next().value;
    if (firstKey !== undefined) sanitizeCache.delete(firstKey);
  }
  sanitizeCache.set(key, value);
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z][\w-]*));/g, (match, dec, hex, named) => {
    if (dec) {
      const codePoint = Number.parseInt(dec, 10);
      return safeCodePoint(codePoint, match);
    }
    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      return safeCodePoint(codePoint, match);
    }
    return ENTITY_MAP[named] ?? match;
  });
}

function normalizeHtmlSource(html: string): string {
  let cleaned = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&lt;!\[CDATA\[([\s\S]*?)\]\]&gt;/gi, '$1');

  if (!/<\/?[a-z][\s\S]*>/i.test(cleaned) && /&lt;\/?[a-z][\s\S]*?&gt;/i.test(cleaned)) {
    cleaned = decodeHtmlEntities(cleaned);
  }

  return cleaned;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function applyInlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*?)_/g, '$1<em>$2</em>');
}

function linkify(value: string): string {
  return value.replace(
    /\b(https?:\/\/[^\s<]+|www\.[^\s<]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    (match) => {
      const trailing = match.match(/[),.!?;:]+$/)?.[0] ?? '';
      const token = trailing ? match.slice(0, -trailing.length) : match;
      const href = token.includes('@') && !/^https?:\/\//i.test(token)
        ? `mailto:${token}`
        : /^www\./i.test(token)
          ? `https://${token}`
          : token;

      return `<a href="${escapeAttribute(decodeHtmlEntities(href))}" target="_blank" rel="noopener noreferrer">${token}</a>${trailing}`;
    }
  );
}

function renderInlineText(value: string): string {
  return linkify(applyInlineMarkdown(escapeHtml(value)));
}

export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const rawLines = block.split('\n');
      const lines = rawLines.map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
      if (lines.length === 0) return '';

      const fenced = block.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
      if (fenced) {
        return `<pre><code>${escapeHtml(fenced[1])}</code></pre>`;
      }

      const heading = lines.length === 1 ? lines[0].match(/^(#{1,4})\s+(.+)$/) : null;
      if (heading) {
        const level = Math.min(heading[1].length + 1, 4);
        return `<h${level}>${renderInlineText(heading[2])}</h${level}>`;
      }

      if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
        return `<ul>${lines.map((line) => `<li>${renderInlineText(line.trim().replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      }

      if (lines.every((line) => /^\d+[.)]\s+/.test(line.trim()))) {
        return `<ol>${lines.map((line) => `<li>${renderInlineText(line.trim().replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
      }

      return `<p>${rawLines.map((line) => renderInlineText(line)).join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

export function sanitizeRichHtml(html: string, options: RichContentOptions = {}): string {
  const key = cacheKey(html, options);
  const cached = sanitizeCache.get(key);
  if (cached !== undefined) return cached;

  const allowedTags = options.allowImages ? [...BASE_ALLOWED_TAGS, 'img'] : BASE_ALLOWED_TAGS;
  const allowedAttr = options.allowImages ? [...BASE_ALLOWED_ATTR, 'alt', 'height', 'src', 'width'] : BASE_ALLOWED_ATTR;

  const result = DOMPurify.sanitize(normalizeHtmlSource(html), {
    ALLOWED_ATTR: allowedAttr,
    ALLOWED_TAGS: allowedTags,
    FORCE_BODY: true,
  });

  setCache(key, result);
  return result;
}

export function renderRichContentHtml(value: string | null | undefined, options: RichContentOptions = {}): string {
  const input = value?.trim();
  if (!input) return '';

  if (/<\/?[a-z][\s\S]*>/i.test(input) || /&lt;\/?[a-z][\s\S]*?&gt;/i.test(input)) {
    return sanitizeRichHtml(input, options);
  }

  return sanitizeRichHtml(plainTextToHtml(input), options);
}

export function htmlToPlainText(value: string | null | undefined): string {
  const input = value?.trim();
  if (!input) return '';

  return decodeHtmlEntities(
    normalizeHtmlSource(input)
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(?:blockquote|div|h[1-6]|li|ol|p|pre|table|tr|ul)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
