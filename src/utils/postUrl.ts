import { BlogPost } from '../types';

/**
 * Канонический адрес статьи: /blog/<slug>/
 * Используется для кнопки «Поделиться» и pushState,
 * чтобы копировалась ссылка на статью, а не на сайт.
 */
export function postPath(post: Pick<BlogPost, 'slug'>): string {
  const base = import.meta.env.BASE_URL || '/';
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}/blog/${post.slug}/`;
}

/** Полный абсолютный URL статьи (для clipboard / og-метатегов). */
export function absolutePostUrl(post: Pick<BlogPost, 'slug'>): string {
  if (typeof window === 'undefined') return postPath(post);
  return new URL(postPath(post), window.location.origin).toString();
}
