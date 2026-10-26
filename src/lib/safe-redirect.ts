/**
 * A post-login redirect that stays on this site, or the fallback. Accepts only
 * a path ("/account?tab=x"). Rejects absolute and javascript: URLs,
 * protocol-relative "//host", backslash forms ("/\\host", which the URL parser
 * reads as "//host") and control characters (tabs and newlines are stripped by
 * the parser, so "/\t/host" also becomes "//host").
 */
export function sameOriginPath(target: string | null | undefined, fallback = '/'): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(target)) return fallback;
  try {
    const base = 'https://same-origin.invalid';
    if (new URL(target, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return target;
}
