# Permissions Justification

Ready-to-paste text for the Chrome Web Store (and AMO) submission forms. Each entry maps to
a declaration in `packages/extension/manifest.json` and explains why it is required.

---

## `storage`

> Stores user preferences (trusted domains, safe contacts, reported senders, detection
> sensitivity) and cached DOM selector configuration locally on the user's device. No data
> is synced to any server.

## `alarms`

> Schedules periodic refresh of DOM selector configuration to ensure the extension continues
> functioning correctly when Gmail updates its interface layout.

## Host permission — `https://mail.google.com/*`

> The extension analyzes emails for phishing indicators directly within the Gmail interface.
> All analysis is performed locally on the user's device — email content is never transmitted
> to any server.

*(Declared as the `content_scripts` match pattern, which is what grants access to the Gmail
page.)*

## `web_accessible_resources`

> The phishing warning page and extension icon assets must be accessible from the Gmail
> content script context to display inline warnings when suspicious emails are detected.
