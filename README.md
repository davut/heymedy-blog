# heymedy blog

Two-way sync between local markdown files and Ghost at blog.heymedy.com.

## Setup

```bash
npm install
export GHOST_ADMIN_API_KEY="your_key_here"
```

## Usage

**Pull posts from Ghost → local:**
```bash
npm run sync
```

**Push local changes → Ghost:**
```bash
npm run publish
```

## Workflow

1. Run `npm run sync` to pull existing posts into `posts/`
2. Edit existing posts or create new `.md` files in `posts/`
3. Run `npm run publish` to push changes — or just commit + push to main and GitHub Actions will do it

## New post format

Create a file like `posts/my-new-post.md`:

```markdown
---
title: "My New Post"
status: draft  # or "published"
tags: [Health, Wellness]
meta_title: "SEO title"
meta_description: "SEO description"
---

Post body in markdown here.
```

After publishing, the script writes back `id`, `slug`, `published_at`, etc. to the frontmatter so future edits update the existing post instead of creating duplicates.

## GitHub Actions

See `.github/workflows/ghost-publish.yml` — auto-publishes on push to `main` when files in `posts/` change.

Requires `GHOST_ADMIN_API_KEY` set as a repo secret.
