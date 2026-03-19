'use client';

/**
 * TorrentFilterPanel
 *
 * Collapsible filter panel for torrent search/browse pages.
 * Supports: min seeders, min/max leechers, size range, date range.
 * Persists filters in URL params.
 */

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icons';

// =============================================================================
// Types
// =============================================================================

export interface TorrentFilters {
  minSeeders?: number;
  maxSeeders?: number;
  minLeechers?: number;
  maxLeechers?: number;
  minSize?: number;  // bytes
  maxSize?: number;  // bytes
  dateFrom?: string; // ISO string
  dateTo?: string;   // ISO string
}

interface TorrentFilterPanelProps {
  filters: TorrentFilters;
  onChange: (filters: TorrentFilters) => void;
  className?: string;
}

// =============================================================================
// Size presets
// =============================================================================

interface SizePreset {
  label: string;
  minSize?: number;
  maxSize?: number;
}

const SIZE_PRESETS: SizePreset[] = [
  { label: 'Any' },
  { label: '> 100 MB', minSize: 100 * 1024 * 1024 },
  { label: '> 1 GB', minSize: 1024 * 1024 * 1024 },
  { label: '> 5 GB', minSize: 5 * 1024 * 1024 * 1024 },
  { label: 'Custom' },
];

// =============================================================================
// Date presets
// =============================================================================

interface DatePreset {
  label: string;
  key: string;
  getDateFrom: () => string | undefined;
}

const DATE_PRESETS: DatePreset[] = [
  { label: 'All', key: 'all', getDateFrom: () => undefined },
  { label: '24h', key: '24h', getDateFrom: () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  { label: 'Week', key: 'week', getDateFrom: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
  { label: 'Month', key: 'month', getDateFrom: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
  { label: 'Year', key: 'year', getDateFrom: () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() },
];

// =============================================================================
// Size units for custom input
// =============================================================================

type SizeUnit = 'MB' | 'GB' | 'TB';

const SIZE_UNIT_MULTIPLIERS: Record<SizeUnit, number> = {
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

// =============================================================================
// Helper: figure out which size preset is active
// =============================================================================

function getActiveSizePreset(filters: TorrentFilters): string {
  if (!filters.minSize && !filters.maxSize) return 'Any';
  for (const preset of SIZE_PRESETS) {
    if (preset.label === 'Any' || preset.label === 'Custom') continue;
    if (preset.minSize === filters.minSize && !filters.maxSize) return preset.label;
  }
  return 'Custom';
}

function getActiveDatePreset(filters: TorrentFilters): string {
  if (!filters.dateFrom && !filters.dateTo) return 'all';
  if (filters.dateTo) return 'custom';
  if (!filters.dateFrom) return 'all';

  const fromMs = new Date(filters.dateFrom).getTime();
  const nowMs = Date.now();
  const diffMs = nowMs - fromMs;

  // Allow 5 minute tolerance for matching presets
  const tolerance = 5 * 60 * 1000;
  if (Math.abs(diffMs - 24 * 60 * 60 * 1000) < tolerance) return '24h';
  if (Math.abs(diffMs - 7 * 24 * 60 * 60 * 1000) < tolerance) return 'week';
  if (Math.abs(diffMs - 30 * 24 * 60 * 60 * 1000) < tolerance) return 'month';
  if (Math.abs(diffMs - 365 * 24 * 60 * 60 * 1000) < tolerance) return 'year';

  return 'custom';
}

function hasActiveFilters(filters: TorrentFilters): boolean {
  return !!(
    filters.minSeeders || filters.maxSeeders ||
    filters.minLeechers || filters.maxLeechers ||
    filters.minSize || filters.maxSize ||
    filters.dateFrom || filters.dateTo
  );
}

// =============================================================================
// Component
// =============================================================================

export function TorrentFilterPanel({ filters, onChange, className }: TorrentFilterPanelProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(hasActiveFilters(filters));
  const [customSizeMin, setCustomSizeMin] = useState('');
  const [customSizeMax, setCustomSizeMax] = useState('');
  const [customSizeUnit, setCustomSizeUnit] = useState<SizeUnit>('GB');

  const activeSizePreset = getActiveSizePreset(filters);
  const activeDatePreset = getActiveDatePreset(filters);
  const hasFilters = hasActiveFilters(filters);

  // Sync custom size inputs from filter values on mount
  useEffect(() => {
    if (activeSizePreset === 'Custom') {
      if (filters.minSize) {
        // Try to find the best unit
        const unit: SizeUnit = filters.minSize >= SIZE_UNIT_MULTIPLIERS.TB ? 'TB'
          : filters.minSize >= SIZE_UNIT_MULTIPLIERS.GB ? 'GB' : 'MB';
        setCustomSizeUnit(unit);
        setCustomSizeMin(String(Math.round(filters.minSize / SIZE_UNIT_MULTIPLIERS[unit] * 100) / 100));
      }
      if (filters.maxSize) {
        const unit: SizeUnit = filters.maxSize >= SIZE_UNIT_MULTIPLIERS.TB ? 'TB'
          : filters.maxSize >= SIZE_UNIT_MULTIPLIERS.GB ? 'GB' : 'MB';
        setCustomSizeUnit(unit);
        setCustomSizeMax(String(Math.round(filters.maxSize / SIZE_UNIT_MULTIPLIERS[unit] * 100) / 100));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSizePreset = useCallback((preset: SizePreset) => {
    if (preset.label === 'Custom') return; // Just opens custom inputs
    onChange({
      ...filters,
      minSize: preset.minSize,
      maxSize: preset.maxSize,
    });
  }, [filters, onChange]);

  const handleDatePreset = useCallback((preset: DatePreset) => {
    onChange({
      ...filters,
      dateFrom: preset.getDateFrom(),
      dateTo: undefined,
    });
  }, [filters, onChange]);

  const handleApplyCustomSize = useCallback(() => {
    const multiplier = SIZE_UNIT_MULTIPLIERS[customSizeUnit];
    const min = customSizeMin ? parseFloat(customSizeMin) * multiplier : undefined;
    const max = customSizeMax ? parseFloat(customSizeMax) * multiplier : undefined;
    onChange({ ...filters, minSize: min, maxSize: max });
  }, [filters, onChange, customSizeMin, customSizeMax, customSizeUnit]);

  const handleClear = useCallback(() => {
    setCustomSizeMin('');
    setCustomSizeMax('');
    onChange({});
  }, [onChange]);

  return (
    <div className={cn('rounded-lg border border-border-subtle', className)}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between px-3 py-2 text-sm',
          'text-text-secondary hover:text-text-primary transition-colors',
          isOpen && 'border-b border-border-subtle'
        )}
      >
        <span className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
          {hasFilters ? <span className="rounded-full bg-accent-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary">
              Active
            </span> : null}
        </span>
        {isOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
      </button>

      {/* Filter content */}
      {isOpen ? <div className="space-y-4 p-3">
          {/* Row 1: Seeders & Leechers */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Min Seeders */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Min Seeders</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 3"
                value={filters.minSeeders ?? ''}
                onChange={(e) => onChange({
                  ...filters,
                  minSeeders: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })}
                className={cn(
                  'w-full rounded border border-border-subtle bg-bg-hover px-2 py-1.5 text-sm',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none'
                )}
              />
            </div>

            {/* Max Seeders */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Max Seeders</label>
              <input
                type="number"
                min="0"
                placeholder="No limit"
                value={filters.maxSeeders ?? ''}
                onChange={(e) => onChange({
                  ...filters,
                  maxSeeders: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })}
                className={cn(
                  'w-full rounded border border-border-subtle bg-bg-hover px-2 py-1.5 text-sm',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none'
                )}
              />
            </div>

            {/* Min Leechers */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Min Leechers</label>
              <input
                type="number"
                min="0"
                placeholder="No min"
                value={filters.minLeechers ?? ''}
                onChange={(e) => onChange({
                  ...filters,
                  minLeechers: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })}
                className={cn(
                  'w-full rounded border border-border-subtle bg-bg-hover px-2 py-1.5 text-sm',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none'
                )}
              />
            </div>

            {/* Max Leechers */}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Max Leechers</label>
              <input
                type="number"
                min="0"
                placeholder="No limit"
                value={filters.maxLeechers ?? ''}
                onChange={(e) => onChange({
                  ...filters,
                  maxLeechers: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })}
                className={cn(
                  'w-full rounded border border-border-subtle bg-bg-hover px-2 py-1.5 text-sm',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none'
                )}
              />
            </div>
          </div>

          {/* Row 2: Size presets */}
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Size</label>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    if (preset.label === 'Custom') {
                      // Just toggle custom mode - don't apply yet
                      return;
                    }
                    handleSizePreset(preset);
                  }}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition-colors',
                    activeSizePreset === preset.label
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom size inputs */}
            {activeSizePreset === 'Custom' && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Min"
                  value={customSizeMin}
                  onChange={(e) => setCustomSizeMin(e.target.value)}
                  className={cn(
                    'w-20 rounded border border-border-subtle bg-bg-hover px-2 py-1.5 text-sm',
                    'text-text-primary placeholder:text-text-muted',
                    'focus:border-accent-primary focus:outline-none'
                  )}
                />
                <span className="text-xs text-text-muted">to</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Max"
                  value={customSizeMax}
                  onChange={(e) => setCustomSizeMax(e.target.value)}
                  className={cn(
                    'w-20 rounded border border-border-subtle bg-bg-hover px-2 py-1.5 text-sm',
                    'text-text-primary placeholder:text-text-muted',
                    'focus:border-accent-primary focus:outline-none'
                  )}
                />
                <select
                  value={customSizeUnit}
                  onChange={(e) => setCustomSizeUnit(e.target.value as SizeUnit)}
                  className={cn(
                    'rounded border border-border-subtle bg-bg-hover px-2 py-1.5 text-sm',
                    'text-text-primary focus:border-accent-primary focus:outline-none'
                  )}
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </select>
                <button
                  type="button"
                  onClick={handleApplyCustomSize}
                  className="rounded bg-accent-primary/20 px-2.5 py-1.5 text-xs text-accent-primary hover:bg-accent-primary/30 transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Row 3: Date range */}
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">Date Added</label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleDatePreset(preset)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition-colors',
                    activeDatePreset === preset.key
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear button */}
          {hasFilters ? <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClear}
                className="rounded px-3 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                Clear all filters
              </button>
            </div> : null}
        </div> : null}
    </div>
  );
}

// =============================================================================
// URL helpers - parse filters from/to URL search params
// =============================================================================

export function filtersFromSearchParams(searchParams: { get(key: string): string | null }): TorrentFilters {
  const filters: TorrentFilters = {};

  const minSeeders = searchParams.get('min_seeders');
  if (minSeeders) filters.minSeeders = parseInt(minSeeders, 10);

  const maxSeeders = searchParams.get('max_seeders');
  if (maxSeeders) filters.maxSeeders = parseInt(maxSeeders, 10);

  const minLeechers = searchParams.get('min_leechers');
  if (minLeechers) filters.minLeechers = parseInt(minLeechers, 10);

  const maxLeechers = searchParams.get('max_leechers');
  if (maxLeechers) filters.maxLeechers = parseInt(maxLeechers, 10);

  const minSize = searchParams.get('min_size');
  if (minSize) filters.minSize = parseInt(minSize, 10);

  const maxSize = searchParams.get('max_size');
  if (maxSize) filters.maxSize = parseInt(maxSize, 10);

  const dateFrom = searchParams.get('date_from');
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = searchParams.get('date_to');
  if (dateTo) filters.dateTo = dateTo;

  return filters;
}

export function filtersToSearchParams(filters: TorrentFilters, params: URLSearchParams): void {
  // Remove all filter params first
  params.delete('min_seeders');
  params.delete('max_seeders');
  params.delete('min_leechers');
  params.delete('max_leechers');
  params.delete('min_size');
  params.delete('max_size');
  params.delete('date_from');
  params.delete('date_to');

  // Set non-empty filter values
  if (filters.minSeeders) params.set('min_seeders', String(filters.minSeeders));
  if (filters.maxSeeders) params.set('max_seeders', String(filters.maxSeeders));
  if (filters.minLeechers) params.set('min_leechers', String(filters.minLeechers));
  if (filters.maxLeechers) params.set('max_leechers', String(filters.maxLeechers));
  if (filters.minSize) params.set('min_size', String(filters.minSize));
  if (filters.maxSize) params.set('max_size', String(filters.maxSize));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
}
