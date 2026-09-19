import { escapeHtml, safeUrl } from "./escape.js";

/**
 * The double opt-in email. Nothing is sent to a subscriber until the address
 * owner follows this link, which is what keeps one person from subscribing
 * another.
 *
 * It carries no unsubscribe link on purpose: nobody asked to be subscribed yet,
 * and offering a way out of something that has not started reads as a mistake.
 * Not following the link is the way out.
 */
export const subscriptionConfirmTemplate = (data: {
  siteName: string;
  confirmUrl: string;
}): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Confirm your subscription to ${escapeHtml(data.siteName)}</title>
</head>
<body>
  <h1>Confirm your subscription</h1>
  <p>Someone asked to subscribe this address to ${escapeHtml(data.siteName)}.</p>
  <p>If that was you, follow this link and you are done:</p>
  <p><a href="${safeUrl(data.confirmUrl)}">Confirm subscription</a></p>
  <p>If it was not you, nothing further will happen and no newsletter will be
  sent to this address. There is nothing to undo.</p>
</body>
</html>`;
};

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
  /** Stops notifications about this conversation only. */
  threadUnsubscribeUrl: string;
  /** Stops every comment notification for this address. */
  allUnsubscribeUrl: string;
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
  <hr>
  <p>
    <a href="${safeUrl(data.threadUnsubscribeUrl)}">Unsubscribe from this thread</a>
    &nbsp;·&nbsp;
    <a href="${safeUrl(data.allUnsubscribeUrl)}">Unsubscribe from all comment notifications</a>
  </p>
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
