/**
 * ArgonTV API Types
 * 
 * Type definitions for ArgonTV IPTV reseller API integration
 */

// ============================================================================
// Package IDs
// ============================================================================

/**
 * ArgonTV package IDs for subscription durations
 */
export const ARGONTV_PACKAGES = {
  '1_month': 113653,
  '3_months': 113654,
  '6_months': 113655,
  '12_months': 113656,
  '24_hour_test': 113657,
  '3_hour_test': 113658,
} as const;

export type ArgonTVPackageKey = keyof typeof ARGONTV_PACKAGES;
export type ArgonTVPackageId = typeof ARGONTV_PACKAGES[ArgonTVPackageKey];

/**
 * Package duration in days for each package
 */
export const PACKAGE_DURATION_DAYS: Record<ArgonTVPackageKey, number> = {
  '1_month': 30,
  '3_months': 90,
  '6_months': 180,
  '12_months': 365,
  '24_hour_test': 1,
  '3_hour_test': 0.125, // 3 hours
};

// ============================================================================
// API Configuration
// ============================================================================

export interface ArgonTVConfig {
  apiKey: string;
  baseUrl?: string;
}

// ============================================================================
// Create Line Types
// ============================================================================

export interface CreateLineRequest {
  package: ArgonTVPackageId;
  username?: string;
  password?: string;
  template?: number;
  allowed_live?: string[];
  allowed_vod?: string[];
  allowed_series?: string[];
  additional_cons?: number;
}

export interface CreateLineResponse {
  error: boolean;
  id: number;
  creation_time: number;
  expiration_time: number;
  username: string;
  password: string;
  xtream_codes_username: string;
  xtream_codes_password: string;
  m3u_download_link: string;
}

export interface CreateLineErrorResponse {
  error: true;
  message: string;
}

// ============================================================================
// Extend Line Types
// ============================================================================

export interface ExtendLineRequest {
  lines: number[];
  package: ArgonTVPackageId;
}

export interface ExtendLineResponse {
  error: boolean;
  failed: number;
  successful: number;
}

export interface ExtendLineErrorResponse {
  error: true;
  message: string;
}

// ============================================================================
// Get Line Types
// ============================================================================

export interface GetLineResponse {
  error: boolean;
  id: number;
  username: string;
  password: string;
  status: 'active' | 'expired' | 'disabled';
  creation_time: number;
  expiration_time: number;
  max_connections: number;
  m3u_download_link: string;
}

export interface GetLineErrorResponse {
  error: true;
  message: string;
}

// ============================================================================
// Template Types
// ============================================================================

export interface Template {
  id: number;
  name: string;
}

export interface GetTemplatesResponse {
  error: boolean;
  templates: Template[];
}

// ============================================================================
// IPTV Subscription Types (for our database)
// ============================================================================

export type IPTVSubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled';

export interface IPTVSubscription {
  id: string;
  userId: string;
  argontvLineId: number;
  username: string;
  password: string;
  m3uDownloadLink: string;
  packageKey: ArgonTVPackageKey;
  status: IPTVSubscriptionStatus;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

export interface CreateIPTVSubscriptionInput {
  userId: string;
  packageKey: ArgonTVPackageKey;
  argontvLineId: number;
  username: string;
  password: string;
  m3uDownloadLink: string;
  expiresAt: Date;
}

export interface ExtendIPTVSubscriptionInput {
  subscriptionId: string;
  packageKey: ArgonTVPackageKey;
  newExpiresAt: Date;
}

// ============================================================================
// Payment Integration Types
// ============================================================================

export type IPTVPaymentType = 'new_subscription' | 'extension';

export interface IPTVPaymentMetadata {
  type: IPTVPaymentType;
  packageKey: ArgonTVPackageKey;
  subscriptionId?: string; // For extensions
}

// ============================================================================
// Pricing
// ============================================================================

export const IPTV_PACKAGE_PRICES: Record<ArgonTVPackageKey, number> = {
  '1_month': 14.99,
  '3_months': 34.99,
  '6_months': 59.99,
  '12_months': 99.99,
  '24_hour_test': 1.99,
  '3_hour_test': 0.99,
};

export interface IPTVPackagePrice {
  packageKey: ArgonTVPackageKey;
  packageId: ArgonTVPackageId;
  durationDays: number;
  priceUsd: number;
  displayName: string;
}

/**
 * Get display name for a package
 */
export function getPackageDisplayName(packageKey: ArgonTVPackageKey): string {
  const displayNames: Record<ArgonTVPackageKey, string> = {
    '1_month': '1 Month',
    '3_months': '3 Months',
    '6_months': '6 Months',
    '12_months': '12 Months',
    '24_hour_test': '24 Hour Test',
    '3_hour_test': '3 Hour Test',
  };
  return displayNames[packageKey];
}

/**
 * Get package price info
 */
export function getPackagePrice(packageKey: ArgonTVPackageKey): IPTVPackagePrice {
  return {
    packageKey,
    packageId: ARGONTV_PACKAGES[packageKey],
    durationDays: PACKAGE_DURATION_DAYS[packageKey],
    priceUsd: IPTV_PACKAGE_PRICES[packageKey],
    displayName: getPackageDisplayName(packageKey),
  };
}

/**
 * Get all available packages with pricing
 */
export function getAllPackagePrices(): IPTVPackagePrice[] {
  return (Object.keys(ARGONTV_PACKAGES) as ArgonTVPackageKey[]).map(getPackagePrice);
}

/**
 * Validate package key
 */
export function isValidPackageKey(key: string): key is ArgonTVPackageKey {
  return key in ARGONTV_PACKAGES;
}
