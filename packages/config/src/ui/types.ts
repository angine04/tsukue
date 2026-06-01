export interface UIDictionary {
  // Navigation
  "nav.home": string;
  "nav.about": string;
  "nav.admin": string;
  "nav.search": string;
  "nav.back": string;

  // Desk / Cards
  "desk.readArticle": string;
  "desk.minRead": string;
  "desk.scrollLeft": string;
  "desk.scrollRight": string;
  "desk.clickToRead": string;
  "desk.focusedCard": string;

  // Article
  "article.back": string;
  "article.share": string;
  "article.category": string;
  "article.tags": string;
  "article.published": string;
  "article.updated": string;

  // Comments
  "comment.name": string;
  "comment.email": string;
  "comment.body": string;
  "comment.submit": string;
  "comment.placeholder": string;
  "comment.noComments": string;
  "comment.pending": string;
  "comment.approved": string;
  "comment.hidden": string;
  "comment.reply": string;
  "comment.report": string;

  // Admin
  "admin.title": string;
  "admin.pendingComments": string;
  "admin.approvedComments": string;
  "admin.subscribers": string;
  "admin.approve": string;
  "admin.hide": string;
  "admin.delete": string;
  "admin.spam": string;
  "admin.reply": string;
  "admin.sendNewsletter": string;

  // Common
  "common.loading": string;
  "common.error": string;
  "common.close": string;
  "common.open": string;
  "common.cancel": string;
  "common.save": string;
  "common.yes": string;
  "common.no": string;
  "common.confirm": string;
  "common.success": string;
}

export type UIKey = keyof UIDictionary;
