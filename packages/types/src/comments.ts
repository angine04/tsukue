export interface Comment {
  id: string;
  slug: string;
  lang?: string;
  parentId?: string;
  authorName: string;
  authorEmailHash?: string;
  authorEmailEncrypted?: string;
  body: string;
  status: "pending" | "approved" | "hidden" | "deleted" | "spam";
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
