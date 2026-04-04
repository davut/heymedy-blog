// Pull all posts from Ghost → local markdown files
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const TurndownService = require('turndown');
const { request, slugify } = require('./lib');

const POSTS_DIR = path.join(__dirname, 'posts');
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

async function main() {
  console.log('Fetching posts from Ghost...');
  const { posts } = await request(
    'GET',
    '/ghost/api/admin/posts/?limit=all&formats=html&include=tags'
  );
  console.log(`Found ${posts.length} post(s)`);

  for (const post of posts) {
    const frontmatter = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      status: post.status,
      tags: (post.tags || []).map((t) => t.name),
      featured: post.featured,
      meta_title: post.meta_title || null,
      meta_description: post.meta_description || null,
      published_at: post.published_at,
      updated_at: post.updated_at,
    };

    const markdown = post.html ? turndown.turndown(post.html) : '';
    const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
    const content = `---\n${yamlStr}---\n\n${markdown}\n`;

    const filename = `${post.slug || slugify(post.title)}.md`;
    const filepath = path.join(POSTS_DIR, filename);
    fs.writeFileSync(filepath, content);
    console.log(`  → ${filename} (${post.status})`);
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Sync failed:', e.message);
  process.exit(1);
});
