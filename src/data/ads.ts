import { AdBannerItem } from '../types';

// Dynamically import all JSON ad configurations from src/content/ads
const rawAds = import.meta.glob('../content/ads/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, AdBannerItem>;

const loadedAds: AdBannerItem[] = Object.values(rawAds).filter(
  (ad): ad is AdBannerItem => Boolean(ad && ad.id && ad.slot && ad.imageUrl && ad.targetUrl)
);

export const INITIAL_ADS: AdBannerItem[] =
  loadedAds.length > 0
    ? loadedAds
    : [
        {
          id: 'vps-ultra-promo-2026',
          title: 'Cloud NVMe VPS Servers for Developers - 50% Off',
          slot: 'sidebar',
          imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80',
          targetUrl: 'https://partner-cloud.example.com/deploy',
          active: true,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          priority: 10,
        },
      ];

export function getActiveAdForSlot(
  ads: AdBannerItem[],
  slot: 'sidebar' | 'in-article' | 'top-header'
): AdBannerItem | null {
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
