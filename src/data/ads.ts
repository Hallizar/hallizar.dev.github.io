import { AdBannerItem } from '../types';

export const INITIAL_ADS: AdBannerItem[] = [
  {
    id: 'vps-ultra-promo-2026',
    title: 'Cloud NVMe VPS Servers for Developers - 50% Off',
    slot: 'sidebar',
    imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80',
    targetUrl: 'https://partner-cloud.example.com/deploy?utm_source=hallizar_blog&utm_medium=banner&utm_campaign=sidebar_spring2026&utm_content=vps_promo',
    active: true,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    priority: 10,
  },
  {
    id: 'fast-edge-cdn-promo',
    title: 'Global Edge CDN & Serverless Storage for Astro Sites',
    slot: 'in-article',
    imageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=700&auto=format&fit=crop&q=80',
    targetUrl: 'https://fastcdn.example.com/signup?utm_source=hallizar_blog&utm_medium=banner&utm_campaign=in_article_contextual&utm_content=cdn_storage',
    active: true,
    startDate: '2026-02-01',
    endDate: '2026-11-30',
    priority: 5,
  },
  {
    id: 'frontend-masterclass-deal',
    title: 'Modern Frontend & Rust WASM Masterclass - Early Bird Pass',
    slot: 'top-header',
    imageUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1000&auto=format&fit=crop&q=80',
    targetUrl: 'https://academy.example.com/masterclass?utm_source=hallizar_blog&utm_medium=banner&utm_campaign=top_header_banner&utm_content=wasm_course',
    active: true,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    priority: 8,
  },
];

export function getActiveAdForSlot(ads: AdBannerItem[], slot: 'sidebar' | 'in-article' | 'top-header'): AdBannerItem | null {
  const now = new Date();

  const filtered = ads
    .filter((ad) => {
      if (!ad.active) return false;
      if (ad.slot !== slot) return false;

      if (ad.startDate) {
        const start = new Date(ad.startDate);
        if (now < start) return false;
      }

      if (ad.endDate) {
        const end = new Date(ad.endDate);
        end.setHours(23, 59, 59, 999);
        if (now > end) return false;
      }

      return true;
    })
    .sort((a, b) => b.priority - a.priority);

  return filtered.length > 0 ? filtered[0] : null;
}
