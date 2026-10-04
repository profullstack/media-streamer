/**
 * Whether the Academic Torrents datasets are offered at all.
 *
 * Withdrawn 2026-10-04 (Anthony: "pull all the data"), after a review of what
 * the 203 licence-cleared entries actually are found that a licence check is
 * not enough: some are personal data (YASP / OpenDota match dumps: millions of
 * players' Steam ids and activity, licensed only by an uploader's claim) and
 * some are patient-derived medical imaging. Until each is reviewed for that,
 * nothing is listed.
 *
 * While withdrawn, /.well-known/openfile.json and /api/public/datasets answer
 * with empty lists (still valid documents, so readers such as nichedb.dev see
 * "nothing" rather than an error), and `academic:mirror apply|finish` refuse to
 * queue or record anything. The catalog, the licence gate and the scripts stay,
 * so turning this back on is a one-line change.
 */
export const ACADEMIC_LISTING = {
  listed: false,
  since: '2026-10-04',
  reason: 'withdrawn pending a personal-data and medical-data review of every dataset',
} as const;
