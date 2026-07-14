export function parseIntegerParam(
  value: string | null,
  options: { min?: number; max?: number } = {}
): number | null {
  const raw = value?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  if (options.min != null && parsed < options.min) {
    return null;
  }

  if (options.max != null && parsed > options.max) {
    return null;
  }

  return parsed;
}
