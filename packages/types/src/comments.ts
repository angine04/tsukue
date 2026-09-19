/**
 * The lifecycle a comment moves through. Canonical here rather than only in the
 * schemas package, which mirrors it into Zod: the database column stores this
 * union as text, and a status added in one place has to exist in both.
 *
 * - `pending`  submitted, awaiting a human
 * - `approved` visible to everyone
 * - `hidden`   removed from the thread but kept, so a reply keeps its parent
 * - `deleted`  soft-deleted; never removed, because threads point at it
 * - `spam`     caught by a filter or marked by a moderator
 */
export type CommentStatus =
  | "pending"
  | "approved"
  | "hidden"
  | "deleted"
  | "spam";

export interface Comment {
  id: string;
  slug: string;
  lang?: string;
  parentId?: string;
  authorName: string;
  authorEmailHash?: string;
  authorEmailEncrypted?: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt?: string;
  ipHash?: string;
  userAgentHash?: string;
}

export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}

export interface CommentList {
  threads: CommentThread[];
  total: number;
}

/**
 * What the public API is allowed to reveal about a comment. A separate type
 * rather than `Comment` minus fields: `Comment` carries the address hashes and
 * the IP hash, and anything that serialises it to a response would leak them.
 * Nothing here identifies a person beyond the display name they chose.
 */
export interface PublicComment {
  id: string;
  parentId?: string;
  authorName: string;
  body: string;
  createdAt: string;
  /**
   * Written by the site's author. Present so a reply from the author can be
   * marked as one — `authorName` cannot carry that meaning, because a reader
   * is free to type any name they like.
   */
  isAuthor?: boolean;
}

export interface PublicCommentThread {
  comment: PublicComment;
  replies: PublicComment[];
}

export interface PublicCommentList {
  threads: PublicCommentThread[];
  total: number;
}
