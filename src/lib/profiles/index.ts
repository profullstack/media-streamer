/**
 * Profiles Module
 *
 * Netflix-style profiles system for managing multiple profiles per account
 */

export { ProfilesService, getProfilesService } from './profiles-service';
export { getCurrentProfileId, getCurrentProfile, getCurrentProfileIdWithFallback } from './profile-utils';
export type {
  Profile,
  CreateProfileInput,
  UpdateProfileInput,
  ProfileWithStats,
} from './types';