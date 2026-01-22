import type { SearchParams, SortField, SortOrder, TorrentCategory } from '../types';

const VALID_SORT_FIELDS: SortField[] = ['date', 'size', 'seeders', 'relevance'];
const VALID_SORT_ORDERS: SortOrder[] = ['asc', 'desc'];
const VALID_CATEGORIES: TorrentCategory[] = ['video', 'audio', 'software', 'ebook', 'other'];

export interface ValidationError {
  field: string;
  message: string;
}

export function validateSearchParams(params: Record<string, string | undefined>): {
  valid: boolean;
  errors: ValidationError[];
  parsed: SearchParams | null;
} {
  const errors: ValidationError[] = [];

  // Required: query
  const q = params.q?.trim();
  if (!q) {
    errors.push({ field: 'q', message: 'Search query is required' });
  } else if (q.length < 2) {
    errors.push({ field: 'q', message: 'Search query must be at least 2 characters' });
  } else if (q.length > 200) {
    errors.push({ field: 'q', message: 'Search query must not exceed 200 characters' });
  }

  // Optional: limit (1-100, default 50)
  let limit = 50;
  if (params.limit !== undefined) {
    const parsedLimit = parseInt(params.limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push({ field: 'limit', message: 'Limit must be between 1 and 100' });
    } else {
      limit = parsedLimit;
    }
  }

  // Optional: offset (>= 0, default 0)
  let offset = 0;
  if (params.offset !== undefined) {
    const parsedOffset = parseInt(params.offset, 10);
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      errors.push({ field: 'offset', message: 'Offset must be a non-negative integer' });
    } else {
      offset = parsedOffset;
    }
  }

  // Optional: sort
  let sort: SortField = 'date';
  if (params.sort !== undefined) {
    if (!VALID_SORT_FIELDS.includes(params.sort as SortField)) {
      errors.push({
        field: 'sort',
        message: `Sort must be one of: ${VALID_SORT_FIELDS.join(', ')}`,
      });
    } else {
      sort = params.sort as SortField;
    }
  }

  // Optional: order
  let order: SortOrder = 'desc';
  if (params.order !== undefined) {
    if (!VALID_SORT_ORDERS.includes(params.order as SortOrder)) {
      errors.push({
        field: 'order',
        message: `Order must be one of: ${VALID_SORT_ORDERS.join(', ')}`,
      });
    } else {
      order = params.order as SortOrder;
    }
  }

  // Optional: min_size
  let min_size: number | undefined;
  if (params.min_size !== undefined) {
    const parsed = parseInt(params.min_size, 10);
    if (isNaN(parsed) || parsed < 0) {
      errors.push({ field: 'min_size', message: 'min_size must be a non-negative integer' });
    } else {
      min_size = parsed;
    }
  }

  // Optional: max_size
  let max_size: number | undefined;
  if (params.max_size !== undefined) {
    const parsed = parseInt(params.max_size, 10);
    if (isNaN(parsed) || parsed < 0) {
      errors.push({ field: 'max_size', message: 'max_size must be a non-negative integer' });
    } else {
      max_size = parsed;
    }
  }

  // Validate size range
  if (min_size !== undefined && max_size !== undefined && min_size > max_size) {
    errors.push({ field: 'min_size', message: 'min_size cannot be greater than max_size' });
  }

  // Optional: category
  let category: TorrentCategory | undefined;
  if (params.category !== undefined) {
    if (!VALID_CATEGORIES.includes(params.category as TorrentCategory)) {
      errors.push({
        field: 'category',
        message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    } else {
      category = params.category as TorrentCategory;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, parsed: null };
  }

  return {
    valid: true,
    errors: [],
    parsed: {
      q: q!,
      limit,
      offset,
      sort,
      order,
      min_size,
      max_size,
      category,
    },
  };
}

export function validateInfohash(infohash: string): boolean {
  return /^[a-fA-F0-9]{40}$/.test(infohash);
}

export function validateLimit(limit: string | undefined, defaultValue = 50, max = 100): number {
  if (limit === undefined) return defaultValue;
  const parsed = parseInt(limit, 10);
  if (isNaN(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, max);
}
