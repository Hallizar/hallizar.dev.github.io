import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const postsCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string().optional().default('Без названия'),
    description: z.string().optional().default(''),
    date: z.coerce.date().optional(),
    pubDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    category: z.string().optional().default('Блог'),
    tags: z.array(z.string()).optional().default([]),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
    content: z.string().optional(),
  }),
});

const adsCollection = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/ads' }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    slot: z.enum(['sidebar', 'in-article', 'top-header']),
    imageUrl: z.string(),
    targetUrl: z.string().url(),
    active: z.boolean().default(true),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    priority: z.number().default(1),
    rtbBlockId: z.string().optional(),
  }),
});

export const collections = {
  ads: adsCollection,
  posts: postsCollection,
  blog: postsCollection,
};
