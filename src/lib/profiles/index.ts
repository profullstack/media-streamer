/**
 * Profiles Module
 *
 * Netflix-style profiles system for managing multiple profiles per account
 */

export { ProfilesService, getProfilesService } from './profiles-service';
export { getCurrentProfileId, getCurrentProfile, getActiveProfileId } from './profile-utils';
export type {
  Profile,
  CreateProfileInput,
  UpdateProfileInput,
  ProfileWithStats,
} from './types';