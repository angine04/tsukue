import { describe, expect, it } from "vitest";
import { findContentIssues, type ValidatablePost } from "./content-validation";

function post(
  overrides: Partial<ValidatablePost["data"]> & {
    id?: string;
    filePath?: string;
  } = {},
): ValidatablePost {
  const { id, filePath, ...data } = overrides;
  const slug = data.slug ?? "on-slowness";
  const lang = data.lang ?? "en";
  return {
    id: id ?? `${lang}/${slug}`,
    filePath: filePath ?? `src/content/posts/${lang}/${slug}.mdx`,
    data: {
      slug,
      lang,
      translationKey: "on-slowness-in-a-fast-world",
      draft: false,
      ...data,
    },
  };
}

const messages = (
  posts: ValidatablePost[],
  options?: { includeDrafts?: boolean },
) => findContentIssues(posts, options).map((issue) => issue.message);

describe("findContentIssues", () => {
  it("accepts a clean translated pair", () => {
    expect(
      messages([post(), post({ slug: "slow-in-fast-world", lang: "zh-Hans" })]),
    ).toEqual([]);
  });

  it("rejects a reserved slug, which would collide with a real route", () => {
    expect(messages([post({ slug: "about" })])).toHaveLength(1);
    expect(messages([post({ slug: "about" })])[0]).toMatch(/reserved/);
  });

  it("rejects an unsupported language tag", () => {
    expect(messages([post({ lang: "cjk" })])[0]).toMatch(/Unsupported lang/);
  });

  it("rejects two posts that resolve to the same route", () => {
    const issues = messages([
      post({ slug: "same", translationKey: "a" }),
      post({ slug: "same", translationKey: "b" }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/already produced by/);
  });

  it("allows the same slug in different languages, since the routes differ", () => {
    expect(
      messages([
        post({ slug: "same", translationKey: "a" }),
        post({ slug: "same", lang: "ja", translationKey: "b" }),
      ]),
    ).toEqual([]);
  });

  it("rejects a duplicated translationKey for the same language", () => {
    const issues = messages([post({ slug: "one" }), post({ slug: "two" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/already used for lang "en"/);
  });

  it("rejects a post filed under the wrong language folder", () => {
    // File says lang "ja" via its path, frontmatter says "en".
    const issues = messages([
      post({
        id: "ja/on-slowness",
        filePath: "src/content/posts/ja/on-slowness.mdx",
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Rename the file/);
  });

  it("rejects a filename that disagrees with the frontmatter slug", () => {
    const issues = messages([post({ id: "en/other-name" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Rename the file/);
  });

  it("rejects a draft in a production build but allows it in dev", () => {
    expect(messages([post({ draft: true })])).toHaveLength(1);
    expect(messages([post({ draft: true })], { includeDrafts: true })).toEqual(
      [],
    );
  });

  it("rejects a translation that claims to be its own source", () => {
    const issues = messages([post({ translation: { sourceLang: "en" } })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/cannot equal/);
  });
});
