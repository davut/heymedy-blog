# heymedy Ghost theme

Custom Ghost theme matching heymedy.com design — warm cream/brown/terracotta palette, Instrument Serif + DM Sans typography.

## Upload to Ghost

1. Zip the theme folder:
   ```bash
   cd theme
   zip -r ../heymedy-theme.zip . -x ".*" -x "README.md"
   ```

2. In Ghost admin (`blog.heymedy.com/ghost`):
   - Settings → Design → Change theme → Upload theme
   - Select `heymedy-theme.zip`
   - Activate

## Local development

Ghost themes can be tested with the official [gscan](https://github.com/TryGhost/gscan) validator:

```bash
npx gscan theme/
```

## Structure

- `default.hbs` — base layout (header, footer, fonts)
- `index.hbs` — homepage (hero + post grid)
- `post.hbs` — single post page
- `page.hbs` — static pages
- `tag.hbs` — posts by tag
- `author.hbs` — posts by author
- `error.hbs` — 404/500 pages
- `partials/` — reusable components (header, footer, post-card)
- `assets/css/main.css` — all styles

## Customization

All colors and fonts are CSS variables in `assets/css/main.css`:

```css
--color-cream: #F9F6F1;
--color-brown: #3B3228;
--color-accent: #C2785C;
--font-serif: 'Instrument Serif';
--font-sans: 'DM Sans';
```
