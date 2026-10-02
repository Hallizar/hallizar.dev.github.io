import { BlogPost } from '../types';
import { parse as parseYaml } from 'yaml';

// Dynamically import all markdown files from src/content/posts at build time
const rawPosts = import.meta.glob('../content/posts/*.{md,mdx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function formatDate(dateInput?: string | Date): string {
  if (!dateInput) return 'Недавно';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function parseMarkdownPost(filepath: string, rawText: string): BlogPost | null {
  const filename = filepath.split('/').pop()?.replace(/\.(md|mdx)$/, '') || 'post';
  let frontmatter: Record<string, any> = {};
  let content = rawText || '';

  const match = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (match) {
    try {
      frontmatter = (parseYaml(match[1]) as Record<string, any>) || {};
    } catch {
      frontmatter = {};
    }
    content = match[2].trim();
  }

  // Skip draft posts
  if (frontmatter.draft === true) {
    return null;
  }

  const title = String(
    frontmatter.title || filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ')
  );
  const excerpt = String(
    frontmatter.description ||
      frontmatter.excerpt ||
      content.slice(0, 160).replace(/[#*`_]/g, '') + '...'
  );
  const category = String(frontmatter.category || 'Блог');
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map(String)
    : typeof frontmatter.tags === 'string'
      ? [frontmatter.tags]
      : ['Блог'];

  const rawDate = frontmatter.date || frontmatter.pubDate;
  const isoDate = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
  const dateFormatted = formatDate(rawDate);
  const image =
    frontmatter.heroImage ||
    frontmatter.image ||
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80';

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const readingTime = `${Math.max(1, Math.ceil(wordCount / 120))} мин чтения`;

  return {
    id: filename,
    slug: filename,
    title,
    excerpt,
    category,
    tags,
    date: dateFormatted,
    isoDate,
    image,
    readingTime,
    author: {
      name: frontmatter.author?.name || 'Hallizar',
      role: frontmatter.author?.role || 'Автор',
      avatar: frontmatter.author?.avatar || 'H',
    },
    content,
    views: typeof frontmatter.views === 'number' ? frontmatter.views : 100,
  };
}

const loadedPosts: BlogPost[] = Object.entries(rawPosts)
  .map(([path, raw]) => parseMarkdownPost(path, raw))
  .filter((p): p is BlogPost => p !== null)
  .sort((a, b) => {
    const timeA = a.isoDate ? new Date(a.isoDate).getTime() : 0;
    const timeB = b.isoDate ? new Date(b.isoDate).getTime() : 0;
    return timeB - timeA; // Newest first
  });

export const BLOG_POSTS: BlogPost[] = loadedPosts;
