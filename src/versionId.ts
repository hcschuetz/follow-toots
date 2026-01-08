import type { Status } from './mastodon-entities';

/**
 * An id for the current "toot version"
 *
 * ...consisting of the toot id and (if present) the edit date.
 *
 * Used to re-open a closed toot after an edit.
 * @param toot
 * @returns
 */
export default (toot: Status): string => toot.edited_at ? `${toot.id}@${toot.edited_at}` : toot.id;
