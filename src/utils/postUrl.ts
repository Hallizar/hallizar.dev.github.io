import { BlogPost } from '../types';

/**
 * Базовый префикс сайта для GitHub Pages или кастомного домена.
 * Например:
 *   - "https://hallizar.ru/blog" -> ""
 *   - "https://hallizar.github.io/blog" -> ""
 *   - "https://user.github.io/my-repo/blog" -> "/my-repo"
 * Всегда возвращает путь БЕЗ замыкающего слэша, гарантируя что итоговый адрес
 * всегда начинается с '/' и никогда не является относительным './blog'.
 */
export function getBasePrefix(): string {
  if (typeof window === 'undefined') {
    const envBase = import.meta.env.BASE_URL || '/';
    if (envBase === './' || envBase === '.' || envBase === '/') return '';
    return envBase.replace(/\/+$/, '');
  }

  const pathname = window.location.pathname;

  // Если в пути есть сегмент /blog, префиксом является всё, что идёт до него
  const blogIdx = pathname.indexOf('/blog');
  if (blogIdx > 0) {
    return pathname.slice(0, blogIdx).replace(/\/+$/, '');
  }

  // Для известных сервисных страниц
  for (const seg of ['/services', '/admin', '/about']) {
    const idx = pathname.indexOf(seg);
    if (idx > 0) {
      return pathname.slice(0, idx).replace(/\/+$/, '');
    }
  }

  const envBase = import.meta.env.BASE_URL || '/';
  if (envBase.startsWith('/') && envBase !== '/') {
    return envBase.replace(/\/+$/, '');
  }

  return '';
}

/**
 * Канонический путь к ленте блога: всегда начинается с '/', например "/blog".
 * Исключает накопление повторов вида "/blog/blog/blog".
 */
export function feedPath(): string {
  const prefix = getBasePrefix();
  return `${prefix}/blog`;
}

/**
 * Канонический путь к статье: всегда начинается с '/', например "/blog/<slug>".
 */
export function postPath(post: Pick<BlogPost, 'slug'>): string {
  const prefix = getBasePrefix();
  const cleanSlug = encodeURIComponent(decodeURIComponent(post.slug)).replace(/%2F/gi, '/');
  return `${prefix}/blog/${cleanSlug}`;
}

/**
 * Полный абсолютный URL статьи с протоколом и доменом (для буфера обмена / шеринга).
 */
export function absolutePostUrl(post: Pick<BlogPost, 'slug'>): string {
  const path = postPath(post);
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

/**
 * Надежный путь к статическим JSON-данным (ads-data.json, posts-data.json) на GitHub Pages.
 */
export function getDataUrl(filename: string): string {
  const prefix = getBasePrefix();
  const cleanFile = filename.replace(/^\/+/, '');
  return `${prefix}/${cleanFile}`;
}
