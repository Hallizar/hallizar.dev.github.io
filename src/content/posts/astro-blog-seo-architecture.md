---
title: "Полноценный SEO-пакет для сайта на Astro: OpenGraph, Schema.org и sitemap"
description: "Пошаговый рецепт идеального технического SEO для блога на Astro 5: генерация JSON-LD, динамические карточки для соцсетей, канонические URL и Content Collections."
date: 2026-09-24T12:00:00Z
pubDate: 2026-09-24T12:00:00Z
category: "Astro & SEO"
tags:
  - "Astro"
  - "SEO"
  - "Schema.org"
  - "OpenGraph"
heroImage: "https://images.unsplash.com/photo-1542744094-3a31f272c490?w=1200&auto=format&fit=crop&q=80"
draft: false
---

## Почему Astro — лучший выбор для контентных сайтов

Фреймворк Astro компилирует страницы в чистый HTML без передачи лишнего JavaScript-бандла браузеру (Zero JS by default). Поисковые краулеры Googlebot и Яндекс мгновенно получают готовое DOM-дерево.

### 1. Архитектура без админки (Content Collections)
Все статьи хранятся как Markdown или MDX файлы в репозитории:

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    tags: z.array(z.string()),
    heroImage: z.string().optional(),
  }),
});

export const collections = { posts };
```

### 2. Schema.org и семантическая разметка (JSON-LD)
Для того чтобы Google и Яндекс выводили расширенные сниппеты (Rich Snippets), в head страницы внедряется JSON-LD структурированных данных.
