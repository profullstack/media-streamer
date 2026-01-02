/**
 * Comments Module
 *
 * Exports for the comments and voting functionality.
 */

export {
  createCommentsService,
  getCommentsService,
  resetCommentsService,
  type CommentsService,
  type Comment,
  type CommentWithUser,
  type CommentWithUserVote,
  type CommentVote,
  type TorrentVote,
  type VoteValue,
} from './comments';

export {
  createCommentsRepository,
  getCommentsRepository,
  resetCommentsRepository,
  type CommentsRepository,
  type CommentRow,
  type CommentWithUserRow,
  type CommentVoteRow,
  type TorrentVoteRow,
  type CommentInsert,
  type VoteCounts,
} from './repository';
