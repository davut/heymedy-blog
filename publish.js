// Push local markdown files → Ghost (creates new posts, updates existing)
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { marked } = require('marked');
const { request } = require('./lib');

const POSTS_DIR = path.join(__dirname, 'posts');

function parseFile(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`Missing frontmatter in ${filepath}`);
  const frontmatter = yaml.load(match[1]) || {};
  const body = match[2].trim();
  return { frontmatter, body };
}

function writeFile(filepath, frontmatter, body) {
  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
  fs.writeFileSync(filepath, `---\n${yamlStr}---\n\n${body}\n`);
}

function buildPayload(frontmatter, body) {
  const html = marked.parse(body);
  const post = {
    title: frontmatter.title,
    html,
    status: frontmatter.status || 'draft',
    tags: (frontmatter.tags || []).map((name) => ({ name })),
    featured: frontmatter.featured || false,
  };
  if (frontmatter.slug) post.slug = frontmatter.slug;
  if (frontmatter.meta_title) post.meta_title = frontmatter.meta_title;
  if (frontmatter.meta_description) post.meta_description = frontmatter.meta_description;
  if (frontmatter.updated_at) post.updated_at = frontmatter.updated_at;
  return post;
}

async function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  console.log(`Found ${files.length} local post(s)`);

  for (const file of files) {
    const filepath = path.join(POSTS_DIR, file);
    const { frontmatter, body } = parseFile(filepath);
    const payload = buildPayload(frontmatter, body);

    try {
      if (frontmatter.id) {
        // Update existing - must include updated_at for collision check
        const { posts } = await request('PUT', `/ghost/api/admin/posts/${frontmatter.id}/?source=html`, {
          posts: [payload],
        });
        const updated = posts[0];
        frontmatter.updated_at = updated.updated_at;
        frontmatter.slug = updated.slug;
        frontmatter.status = updated.status;
        writeFile(filepath, frontmatter, body);
        console.log(`  ✓ updated: ${file} (${updated.status})`);
      } else {
        // Create new
        const { posts } = await request('POST', '/ghost/api/admin/posts/?source=html', {
          posts: [payload],
        });
        const created = posts[0];
        frontmatter.id = created.id;
        frontmatter.slug = created.slug;
        frontmatter.status = created.status;
        frontmatter.updated_at = created.updated_at;
        frontmatter.published_at = created.published_at;
        writeFile(filepath, frontmatter, body);
        console.log(`  + created: ${file} (${created.status}) → ${created.url}`);
      }
    } catch (e) {
      console.error(`  ✗ failed: ${file} — ${e.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Publish failed:', e.message);
  process.exit(1);
});
