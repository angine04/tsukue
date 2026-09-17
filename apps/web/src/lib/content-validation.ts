import { isValidLang, postPath, validateSlug } from "@tsukue/config";

/**
 * The subset of a content entry these checks need. Kept structural so the
 * rules can be exercised without an Astro content layer.
 */
export interface ValidatablePost {
  id: string;
  filePath?: string;
  data: {
    slug: string;
    lang: string;
    translationKey: string;
    draft: boolean;
    translation?: { sourceLang?: string };
  };
}

export interface ContentIssue {
  id: string;
  message: string;
}

/**
 * Cross-entry checks that a per-file schema cannot express: uniqueness of
 * routes and translation pairs, supported language tags, reserved slugs, the
 * `{lang}/{slug}.mdx` folder convention, and drafts leaking into a build.
 */
export function findContentIssues(
  posts: readonly ValidatablePost[],
  options: { includeDrafts?: boolean } = {},
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const routeOwners = new Map<string, string>();
  const translationOwners = new Map<string, string>();

  for (const entry of posts) {
    const { data } = entry;
    const report = (message: string) => issues.push({ id: entry.id, message });

    if (!options.includeDrafts && data.draft) {
      report(
        'Draft post would be published. Set "draft: false" to publish it.',
      );
    }

    if (!isValidLang(data.lang)) {
      report(
        `Unsupported lang "${data.lang}". Add it to SUPPORTED_LANGS before using it.`,
      );
    }

    const slugProblem = validateSlug(data.slug);
    if (slugProblem) {
      report(slugProblem);
    }

    const expectedId = `${data.lang}/${data.slug}`;
    if (entry.id !== expectedId) {
      report(
        `Post is stored at "${entry.filePath ?? entry.id}" but its frontmatter says lang "${data.lang}" and slug "${data.slug}". Rename the file to "src/content/posts/${expectedId}.mdx".`,
      );
    }

    const route = postPath(data);
    const routeOwner = routeOwners.get(route);
    if (routeOwner) {
      report(`Route "${route}" is already produced by "${routeOwner}".`);
    } else {
      routeOwners.set(route, entry.id);
    }

    const translationPair = `${data.translationKey}\u0000${data.lang}`;
    const translationOwner = translationOwners.get(translationPair);
    if (translationOwner) {
      report(
        `translationKey "${data.translationKey}" is already used for lang "${data.lang}" by "${translationOwner}".`,
      );
    } else {
      translationOwners.set(translationPair, entry.id);
    }

    const sourceLang = data.translation?.sourceLang;
    if (sourceLang !== undefined) {
      if (!isValidLang(sourceLang)) {
        report(`Unsupported translation.sourceLang "${sourceLang}".`);
      }
      if (sourceLang === data.lang) {
        report(
          `translation.sourceLang cannot equal the post's own lang "${data.lang}".`,
        );
      }
    }
  }

  return issues;
}
