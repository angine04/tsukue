import { escapeHtml, safeUrl } from "./escape.js";

export const adminNotificationTemplate = (data: {
  commentAuthor: string;
  commentBody: string;
  postSlug: string;
  adminUrl: string;
}): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New comment on ${escapeHtml(data.postSlug)}</title>
</head>
<body>
  <h1>New comment awaiting moderation</h1>
  <p><strong>Author:</strong> ${escapeHtml(data.commentAuthor)}</p>
  <p><strong>Post:</strong> ${escapeHtml(data.postSlug)}</p>
  <blockquote>${escapeHtml(data.commentBody)}</blockquote>
  <p><a href="${safeUrl(data.adminUrl)}">Review in admin</a></p>
</body>
</html>`;
};

export const replyNotificationTemplate = (data: {
  replyAuthor: string;
  replyBody: string;
  postSlug: string;
  postUrl: string;
  unsubscribeUrl: string;
}): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New reply to your comment</title>
</head>
<body>
  <h1>New reply on ${escapeHtml(data.postSlug)}</h1>
  <p><strong>From:</strong> ${escapeHtml(data.replyAuthor)}</p>
  <blockquote>${escapeHtml(data.replyBody)}</blockquote>
  <p><a href="${safeUrl(data.postUrl)}">View on site</a></p>
  <p><a href="${safeUrl(data.unsubscribeUrl)}">Unsubscribe from this thread</a></p>
</body>
</html>`;
};

/**
 * `data.body` is interpolated raw: it is the newsletter's markup, written by
 * the admin who is sending it, not a value a reader supplied. The subject and
 * the unsubscribe link are escaped like everywhere else.
 */
export const newsletterTemplate = (data: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
}): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(data.subject)}</title>
</head>
<body>
  ${data.body}
  <hr>
  <p><a href="${safeUrl(data.unsubscribeUrl)}">Unsubscribe</a></p>
</body>
</html>`;
};
