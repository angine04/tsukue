export interface Post {
  slug: string;
  lang: string;
  translationKey: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  draft?: boolean;
  tags?: string[];
  card?: {
    kind?: string;
    color?: string;
    variant?: string;
    rotation?: number;
    accent?: string;
  };
  translation?: {
    sourceLang?: string;
    status?: string;
  };
  body?: string;
}

export interface PostCollection {
  posts: Post[];
}
