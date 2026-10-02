---
title: "Тестовая запись: проверка сборки Astro, Decap CMS и РСЯ"
date: 2026-09-30T09:00:00Z
pubDate: 2026-09-30T09:00:00Z
description: "Служебная запись для сквозной проверки сборки: sitemap, SEO-теги Open Graph и Twitter, JSON-LD Schema.org и рекламные блоки РСЯ."
category: "Тестирование"
tags:
  - "Astro"
  - "CI"
  - "SEO"
heroImage: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop&q=80"
draft: false
---

## Зачем нужна эта запись

Этот пост используется скриптом `scripts/verify-build.js`. Он гарантирует, что в коллекции
`posts` всегда есть хотя бы одна запись с полным набором полей frontmatter, и что сборка
генерирует для неё статическую HTML-страницу, запись в sitemap и SEO-разметку.

### Что проверяется

- `dist/sitemap-index.xml` и ссылки на посты блога;
- `dist/admin/config.yml` для Decap CMS;
- Open Graph, Twitter Cards и Schema.org JSON-LD в HTML;
- ленивые рекламные блоки РСЯ через IntersectionObserver без дублирования `context.js`.
