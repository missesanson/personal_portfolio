# Anson Han — Writer & Researcher

A premium editorial portfolio for GitHub Pages, with a browser-based Pages CMS publishing workflow.

The repository includes both:

1. a ready-generated static copy at the repository root, so the design appears even before the custom deployment runs; and
2. source content plus a GitHub Actions workflow, so Pages CMS changes rebuild the site automatically.

## Content editing

Pages CMS edits:

- website identity, biography, colours and contact details;
- services and working process;
- writing samples and journal pieces;
- categories, images, featured status and draft status.

## Build

The generator uses Node.js built-in features only. It has no package dependencies.

```bash
BASE_PATH=/personal_portfolio SITE_URL=https://missesanson.github.io npm run build
BASE_PATH=/personal_portfolio npm run check
```
