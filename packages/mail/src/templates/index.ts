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
  <title>New comment on ${data.postSlug}</title>
</head>
<body>
  <h1>New comment awaiting moderation</h1>
  <p><strong>Author:</strong> ${data.commentAuthor}</p>
  <p><strong>Post:</strong> ${data.postSlug}</p>
  <blockquote>${data.commentBody}</blockquote>
  <p><a href="${data.adminUrl}">Review in admin</a></p>
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
  <h1>New reply on ${data.postSlug}</h1>
  <p><strong>From:</strong> ${data.replyAuthor}</p>
  <blockquote>${data.replyBody}</blockquote>
  <p><a href="${data.postUrl}">View on site</a></p>
  <p><a href="${data.unsubscribeUrl}">Unsubscribe from this thread</a></p>
</body>
</html>`;
};

export const newsletterTemplate = (data: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
}): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${data.subject}</title>
</head>
<body>
  ${data.body}
  <hr>
  <p><a href="${data.unsubscribeUrl}">Unsubscribe</a></p>
</body>
</html>`;
};
