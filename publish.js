// Push local markdown files → Ghost (creates new posts, updates existing)
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { marked } = require('marked');
const https = require('https');
const { request, GHOST_URL } = require('./lib');

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

// Upload a local image file to Ghost and return the hosted URL
function uploadImage(localPath, token) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

    const CRLF = '\r\n';
    const filename = path.basename(localPath);
    const header =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
      `Content-Type: ${mimeType}${CRLF}${CRLF}`;
    const purposePart =
      `${CRLF}--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="purpose"${CRLF}${CRLF}` +
      `image${CRLF}` +
      `--${boundary}--${CRLF}`;

    const body = Buffer.concat([
      Buffer.from(header, 'utf8'),
      fileBuffer,
      Buffer.from(purposePart, 'utf8'),
    ]);

    const url = new URL(GHOST_URL + '/ghost/api/admin/images/upload/');
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        Authorization: 'Ghost ' + token,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', (chunk) => (buf += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (res.statusCode >= 400) reject(new Error(`Image upload ${res.statusCode}: ${JSON.stringify(json.errors || json)}`));
          else resolve(json.images[0].url);
        } catch (e) {
          reject(new Error(`Image upload parse error: ${buf.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Lazily generate a JWT token once per run
let _token = null;
function getToken() {
  if (_token) return _token;
  const crypto = require('crypto');
  const API_KEY = process.env.GHOST_ADMIN_API_KEY;
  const [id, secret] = API_KEY.split(':');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'hex'));
  hmac.update(header + '.' + payload);
  _token = header + '.' + payload + '.' + hmac.digest('base64url');
  return _token;
}

async function resolveFeatureImage(featureImage, postFilePath) {
  if (!featureImage) return null;
  // Already a full URL — use as-is
  if (featureImage.startsWith('http://') || featureImage.startsWith('https://')) return featureImage;
  // Relative path — resolve from the posts directory and upload
  const localPath = path.resolve(POSTS_DIR, featureImage);
  if (!fs.existsSync(localPath)) {
    console.warn(`  ⚠ feature_image file not found: ${localPath} — skipping`);
    return null;
  }
  console.log(`  ↑ uploading feature image: ${path.basename(localPath)}`);
  const url = await uploadImage(localPath, getToken());
  console.log(`  ✓ feature image uploaded → ${url}`);
  return url;
}

function buildPayload(frontmatter, body, featureImageUrl) {
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
  if (featureImageUrl) post.feature_image = featureImageUrl;
  return post;
}

async function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  console.log(`Found ${files.length} local post(s)`);

  for (const file of files) {
    const filepath = path.join(POSTS_DIR, file);
    const { frontmatter, body } = parseFile(filepath);

    // Resolve feature image (upload if local path)
    const featureImageUrl = await resolveFeatureImage(frontmatter.feature_image, filepath);
    const payload = buildPayload(frontmatter, body, featureImageUrl);

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
        // Store the resolved Ghost URL back to frontmatter so we don't re-upload next time
        if (featureImageUrl) frontmatter.feature_image = featureImageUrl;
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
        // Store the resolved Ghost URL back to frontmatter so we don't re-upload next time
        if (featureImageUrl) frontmatter.feature_image = featureImageUrl;
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
