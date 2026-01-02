/**
 * Podcasts Module
 *
 * Server-side podcast management including subscriptions, episodes, and notifications.
 */

export {
  createPodcastRepository,
  getPodcastRepository,
  resetPodcastRepository,
  type PodcastRepository,
  type UserPodcastSubscription,
  type UserToNotify,
  type ListenProgressUpdate,
} from './repository';

export {
  createPodcastService,
  getPodcastService,
  resetPodcastService,
  type PodcastService,
  type PodcastSearchResult,
  type ParsedPodcastFeed,
  type ParsedEpisode,
  type ListenProgressInput,
} from './service';
