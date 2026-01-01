// A subset of
// https://github.com/neet/masto.js/blob/main/src/mastodon/entities/v1
// with property names in snake_case (as actually used in the mastodon API)

export interface CustomEmoji {
  /** The name of the custom emoji. */
  shortcode: string;
  /** A link to the custom emoji. */
  url: string;
  /** A link to a static copy of the custom emoji. */
  static_url: string;
  /** Whether this Emoji should be visible in the picker or unlisted. */
  visible_in_picker: boolean;

  /** Used for sorting custom emoji in the picker. */
  category?: string | null;
}

export interface Account {
  /** The account id */
  id: string;
  /** The username of the account, not including domain */
  username: string;
  /** The WebFinger account URI. Equal to `username` for local users, or `username@domain` for remote users. */
  acct: string;
  /** The location of the user's profile page. */
  url: string;
  /** The profile's display name. */
  display_name: string;
  /** The profile's bio / description. */
  note: string;
  /** An image icon that is shown next to statuses and in the profile. */
  avatar: string;
  /** A static version of the `avatar`. Equal to avatar if its value is a static image; different if `avatar` is an animated GIF. */
  avatar_static: string;
  /** An image banner that is shown above the profile and in profile cards. */
  header: string;
  /** A static version of the header. Equal to `header` if its value is a static image; different if `header` is an animated GIF. */
  header_static: string;
  /** Whether the account manually approves follow requests. */
  locked: boolean;
  /** Additional metadata attached to a profile as name-value pairs. */
  ///fields: AccountField[];
  /** Custom emoji entities to be used when rendering the profile. If none, an empty array will be returned. */
  emojis: CustomEmoji[];
  /** Boolean to indicate that the account performs automated actions */
  bot: boolean;
  /** Indicates that the account represents a Group actor. */
  group: boolean;
  /** Whether the account has opted into discovery features such as the profile directory. */
  discoverable?: boolean | null;
  /** Whether the local user has opted out of being indexed by search engines. */
  noindex?: boolean | null;
  /** Indicates that the profile is currently inactive and that its user has moved to a new account. */
  moved?: Account | null;
  /** An extra entity returned when an account is suspended. **/
  suspended?: boolean | null;
  /** An extra attribute returned only when an account is silenced. If true, indicates that the account should be hidden behind a warning screen. */
  limited?: boolean | null;
  /** When the account was created. */
  created_at: string;
  /** Time of the last status posted */
  last_status_at: string;
  /** How many statuses are attached to this account. */
  statuses_count: number;
  /** The reported followers of this profile. */
  followers_count: number;
  /** The reported follows of this profile. */
  following_count: number;
  /** Roles that have been granted to this account. */
  ///roles: Pick<Role, "id" | "name" | "color">[]; // TODO: Create an entity when documentation is updated
  /** https://github.com/mastodon/mastodon/pull/23591 */
  memorial?: boolean | null;
}

export type MediaAttachmentType =
  "image" | "video" | "gifv" | "audio" | "unknown";

export interface MediaAttachment {
  /** The ID of the MediaAttachment in the database. */
  id: string;
  /** The type of the MediaAttachment. */
  type: MediaAttachmentType;
  /** The location of the original full-size MediaAttachment. */
  url?: string | null;
  /** The location of a scaled-down preview of the MediaAttachment. */
  preview_url: string;
  /** The location of the full-size original MediaAttachment on the remote website. */
  remote_url?: string | null;
  /** Remote version of preview_url */
  preview_remote_url?: string | null;
  /** A shorter URL for the MediaAttachment. */
  text_url?: string | null;
  /** Metadata returned by Paperclip. */
  ///meta?: MediaAttachmentMeta | null;
  /**
   * Alternate text that describes what is in the media MediaAttachment,
   * to be used for the visually impaired or when media MediaAttachments do not load.
   */
  description?: string | null;
  /**
   * A hash computed by the BlurHash algorithm,
   * for generating colorful preview thumbnails when media has not been downloaded yet.
   */
  blurhash?: string | null;
}

export type QuoteState =
  "pending" | "accepted" | "rejected" | "revoked" | "deleted" |
  "unauthorized" | "blocked_account" | "blocked_domain" | "muted_account";

export interface Quote {
  /* The state of the quote */
  state: QuoteState;
  /* The status being quoted, if the quote has been accepted. This will be null, unless the state attribute is accepted. */
  quoted_status?: Status | null;
}

export interface ShallowQuote {
  /* The state of the quote. */
  state: QuoteState;
  /* The identifier of the status being quoted, if the quote has been accepted. This will be null, unless the state attribute is accepted. */
  quoted_status_id?: string | null;
}
export interface PollOption {
    /** The text value of the poll option. String. */
    title: string;
    /** The number of received votes for this option. Number, or null if results are not published yet. */
    votes_count?: number;
    /** Custom emoji to be used for rendering poll options. */
    emojis: CustomEmoji[];
}

export interface Poll {
    /** The ID of the poll in the database. */
    id: string;
    /** When the poll ends. */
    expires_at?: string | null;
    /** Is the poll currently expired? */
    expired: boolean;
    /** Does the poll allow multiple-choice answers? */
    multiple: boolean;
    /** How many votes have been received. */
    votes_count: number;
    /** How many unique accounts have voted on a multiple-choice poll. */
    voters_count?: number | null;
    /** When called with a user token, has the authorized user voted? */
    voted?: boolean;
    /**
     * When called with a user token, which options has the authorized user chosen?
     * Contains an array of index values for options.
     */
    own_votes?: number[] | null;
    /** Possible answers for the poll. */
    options: PollOption[];
}

export type PreviewCardType = "link" | "photo" | "video" | "rich";

export interface PreviewCardAuthor {
  /** The original resource author’s name. Replaces the deprecated author_name attribute of the preview card. */
  name: string;
  /** A link to the author of the original resource. Replaces the deprecated author_url attribute of the preview card. */
  url: string;
  /** The fediverse account of the author. */
  account: Account | null;
}

export interface PreviewCard {
  /** Location of linked resource. */
  url: string;
  /** Title of linked resource. */
  title: string;
  /** Description of preview. */
  description: string;
  /** The type of the preview card. */
  type: PreviewCardType;
  /** Blurhash */
  blurhash: string;
  /** Fediverse account of the authors of the original resource. */
  authors: PreviewCardAuthor[];
  /**
   * The author of the original resource.
   * @deprecated Use `authors` instead
   */
  author_name?: string | null;
  /**
   * A link to the author of the original resource.
   * @deprecated Use `authors` instead
   */
  author_url?: string | null;
  /** The provider of the original resource. */
  provider_name?: string | null;
  /** A link to the provider of the original resource. */
  provider_url?: string | null;
  /** HTML to be used for generating the preview card. */
  html?: string | null;
  /** Width of preview, in pixels. */
  width?: number | null;
  /** Height of preview, in pixels. */
  height?: number | null;
  /** Preview thumbnail. */
  image?: string | null;
  /** Used for photo embeds, instead of custom `html`. */

  image_description?: string;
  embed_url: string;
  /** @see https://github.com/mastodon/mastodon/pull/27503 */
  language?: string;
}

type StatusVisibility = "public" | "unlisted" | "private" | "direct";

export interface Status {
  /** ID of the status in the database. */
  id: string;
  /** URI of the status used for federation. */
  uri: string;
  /** The date when this status was created. */
  created_at: string;
  /** Timestamp of when the status was last edited. */
  edited_at: string | null;
  /** The account that authored this status. */
  account: Account;
  /** HTML-encoded status content. */
  content: string;
  /** Visibility of this status. */
  visibility: StatusVisibility;
  /** Is this status marked as sensitive content? */
  sensitive: boolean;
  /** Subject or summary line, below which status content is collapsed until expanded. */
  spoiler_text: string;
  /** Media that is attached to this status. */
  media_attachments: MediaAttachment[];
  /** The application used to post this status. */
  ///application: Application;

  /** Mentions of users within the status content. */
  ///mentions: StatusMention[];
  /** Hashtags used within the status content. */
  ///tags: Tag[];
  /** Custom emoji to be used when rendering status content. */
  emojis: CustomEmoji[];

  /** How many boosts this status has received. */
  reblogs_count: number;
  /** How many favourites this status has received. */
  favourites_count: number;
  /** If the current token has an authorized user: The filter and keywords that matched this status. */
  ///filtered?: FilterResult[];
  /** How many replies this status has received. */
  replies_count: number;
  /** Information about the status being quoted, if any */
  quote?: Quote | ShallowQuote | null;
  /** How many replies this status has received. */
  quotes_count: number;
  /**
   * Summary of the post quote’s approval policy and how it applies to the user making the request,
   * that is, whether the user can be expected to be allowed to quote that post.
   **/
  ///quote_approval: QuoteApproval;

  /** A link to the status's HTML representation. */
  url?: string | null;
  /** ID of the status being replied. */
  in_reply_to_id?: string | null;
  /** ID of the account being replied to. */
  in_reply_to_account_id?: string | null;
  /** The status being reblogged. */
  reblog?: Status | null;
  /** The poll attached to the status. */
  poll?: Poll | null;
  /** Preview card for links included within status content. */
  card?: PreviewCard | null;
  /** Primary language of this status. */
  language?: string | null;
  /**
   * Plain-text source of a status. Returned instead of `content` when status is deleted,
   * so the user may redraft from the source text without the client having
   * to reverse-engineer the original text from the HTML content.
   */
  text?: string | null;

  /** Have you favourited this status? */
  favourited?: boolean | null;
  /** Have you boosted this status? */
  reblogged?: boolean | null;
  /** Have you muted notifications for this status's conversation? */
  muted?: boolean | null;
  /** Have you bookmarked this status? */
  bookmarked?: boolean | null;
  /** Have you pinned this status? Only appears if the status is pin-able. */
  pinned?: boolean | null;
}

export interface Context {
  /** Parents in the thread. */
  ancestors: Status[];
  /** Children in the thread. */
  descendants: Status[];
}
