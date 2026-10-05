import { BlogPost } from '../types';

export const BLOG_POSTS: BlogPost[] = [
  {
    id: 'post-1',
    slug: 'browser-wasm-gif-encoding',
    title: 'Как работает создание GIF прямо в браузере с помощью WebAssembly и LZW',
    excerpt: 'Разбор архитектуры клиентского конвертера изображений в GIF: квантование палитры, алгоритм сжатия LZW и компиляция gifski в WebAssembly без отправки байтов на сервер.',
    category: 'WASM & Графика',
    tags: ['WebAssembly', 'GIF', 'Canvas', 'Performance', 'TypeScript'],
    date: '28 сентября 2026',
    isoDate: '2026-09-28T10:00:00Z',
    image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80',
    readingTime: '6 мин чтения',
    author: {
      name: 'Hallizar',
      role: 'Frontend & Systems Engineer',
      avatar: 'H',
    },
    views: 1420,
    content: `
## Введение в клиентскую графику

Традиционный подход к конвертации медиафайлов предполагает отправку изображений на бэкенд, обработку в FFmpeg или ImageMagick и возврат готового результата. Однако в современных веб-приложениях такой подход имеет существенные недостатки:
- Нагрузка на серверную инфраструктуру и трафик;
- Проблемы с конфиденциальностью: пользовательские изображения покидают устройство;
- Задержка сети при передаче десятков мегабайт исходников.

### Архитектура Local GIF Studio

В нашем инструменте обработка разбита на три независимых этапа:

1. **Декодирование и нормализация холста (Canvas API)**:
Каждый файл формата PNG, JPG или WebP считывается через \`createImageBitmap()\` или Canvas 2D Context с флагом \`willReadFrequently: true\`. Это гарантирует мгновенный доступ к сырым байтам RGBA (Uint8ClampedArray).

\`\`\`typescript
const bitmap = await createImageBitmap(file);
canvas.width = bitmap.width;
canvas.height = bitmap.height;
context.drawImage(bitmap, 0, 0);
const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
\`\`\`

2. **Оптимизация палитры (NeuQuant / Color Quantization)**:
GIF ограничен максимум 256 цветами на кадр. Мы группируем 24-битные цвета в 15-битные корзины \`(r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)\` и определяем наиболее частотные кластеры.

3. **Сжатие LZW и WebAssembly**:
Для максимальной скорости и наивысшего качества градиентов мы используем движок **Gifski**, скомпилированный из Rust в WebAssembly. В случае недоступности WASM в изолированных iframe срабатывает резервный легковесный LZW-компрессор, встроенный прямо в клиентский код.

### Результат
Сборка 20–50 кадров занимает менее 1–2 секунд прямо в браузере на мобильных и десктопных устройствах с нулевым потреблением серверных ресурсов!
    `,
  },
  {
    id: 'post-2',
    slug: 'astro-blog-seo-architecture',
    title: 'Полноценный SEO-пакет для сайта на Astro: OpenGraph, Schema.org и sitemap',
    excerpt: 'Пошаговый рецепт идеального технического SEO для блога на Astro 5: генерация JSON-LD, динамические карточки для соцсетей, канонические URL и Content Collections.',
    category: 'Astro & SEO',
    tags: ['Astro', 'SEO', 'Schema.org', 'OpenGraph', 'Static Site'],
    date: '24 сентября 2026',
    isoDate: '2026-09-24T12:00:00Z',
    image: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=1200&auto=format&fit=crop&q=80',
    readingTime: '5 мин чтения',
    author: {
      name: 'Hallizar',
      role: 'Frontend & Systems Engineer',
      avatar: 'H',
    },
    views: 980,
    content: `
## Почему Astro — лучший выбор для контентных сайтов

Фреймворк Astro компилирует страницы в чистый HTML без передачи лишнего JavaScript-бандла браузеру (Zero JS by default). Поисковые краулеры Googlebot и Яндекс мгновенно получают готовое DOM-дерево.

### 1. Архитектура без админки (Content Collections)
Вместо громоздких CMS вроде WordPress или Strapi все статьи хранятся как Markdown или MDX файлы в репозитории:

\`\`\`typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    tags: z.array(z.string()),
    heroImage: z.string().optional(),
  }),
});

export const collections = { blog };
\`\`\`

### 2. Schema.org и семантическая разметка (JSON-LD)
Для того чтобы Google и Яндекс выводили расширенные сниппеты (Rich Snippets), в head страницы внедряется JSON-LD структурированных данных:

\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Заголовок статьи",
  "author": {
    "@type": "Person",
    "name": "Hallizar"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Hallizar Studio"
  }
}
\`\`\`

### 3. OpenGraph и Twitter Cards
Каждая страница формирует индивидуальный тег \`og:title\`, \`og:description\` и превью-картинку \`og:image\`.
    `,
  },
  {
    id: 'post-3',
    slug: 'website-monetization-ads-strategy',
    title: 'Монетизация через РСЯ: интеграция RTB-блоков без вреда для Core Web Vitals',
    excerpt: 'Как настроить баннеры Рекламной сети Яндекса (РСЯ), зафиксировать контейнеры (CLS = 0) и отслеживать показы и клики в Яндекс Метрике.',
    category: 'Монетизация & РСЯ',
    tags: ['РСЯ', 'Яндекс', 'Monetization', 'CLS', 'Web Vitals'],
    date: '18 сентября 2026',
    isoDate: '2026-09-18T09:00:00Z',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&auto=format&fit=crop&q=80',
    readingTime: '4 мин чтения',
    author: {
      name: 'Hallizar',
      role: 'Frontend & Systems Engineer',
      avatar: 'H',
    },
    views: 750,
    content: `
## Работа с Рекламной сетью Яндекса (РСЯ)

Для русскоязычной и международной аудитории Рекламная сеть Яндекса обеспечивает высокую доходность за счет таргетинга на основе машинного обучения и аукциона RTB (Real-Time Bidding).

### Рекомендуемые форматы РСЯ:
1. **Top-Header (Шапка)**: горизонтальный адаптивный блок (728×90 / 320×50).
2. **In-Article (Внутри текста)**: контекстный блок после 2-3 абзаца (336×280 или адаптивный).
3. **Sidebar (Боковая колонка)**: медийный блок 300×600 px.

### Защита от CLS (Cumulative Layout Shift = 0)
Согласно рекомендациям Core Web Vitals и стандартам поисковых систем, под каждый RTB-блок РСЯ заранее резервируется минимальная высота (\`min-height\`), предотвращающая сдвиг контента при инициализации скрипта загрузки.

### Интеграция с Яндекс Метрикой
Использование метода \`ym(COUNTER_ID, 'reachGoal', 'AD_IMPRESSION')\` через \`IntersectionObserver\` позволяет фиксировать реальные показы (не менее 50% площади в течение 1+ секунды).
    `,
  },
  {
    id: 'post-4',
    slug: 'static-blog-vs-wordpress',
    title: 'Почему блог без админки на Markdown и статике побеждает CMS в 2026 году',
    excerpt: 'Безопасность, мгновенная загрузка, нулевые расходы на хостинг и контроль версий через Git — ключевые преимущества статического блога.',
    category: 'Frontend & Архитектура',
    tags: ['Markdown', 'Git', 'Hosting', 'Architecture'],
    date: '10 сентября 2026',
    isoDate: '2026-09-10T14:00:00Z',
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
    readingTime: '4 мин чтения',
    author: {
      name: 'Hallizar',
      role: 'Frontend & Systems Engineer',
      avatar: 'H',
    },
    views: 610,
    content: `
## Прощай, база данных и уязвимости плагинов

Традиционные CMS требуют постоянных обновлений PHP, MySQL, борьбы со спамом и защиты админ-панели от брутфорса. 

### Ключевые плюсы подхода «Блог без админки»:
- **100% безопасность**: нет сервера баз данных, нет API для входа администратора — взламывать нечего.
- **Хранение в Git**: каждая правка статьи логируется через коммиты в Git. Вы всегда можете откатить изменения или писать черновики в отдельной ветке.
- **Бесплатный хостинг**: статический сайт на Astro легко хостится на Netlify с глобальным CDN.
- **Максимальный балл в Lighthouse**: 100/100 по производительности, доступности и SEO.
    `,
  },
];
