import { useEffect, useRef, useState } from 'react';
import { AdBannerItem, MetrikaEvent } from '../types';

interface AdBannerProps {
  ad: AdBannerItem | null;
  slot: 'sidebar' | 'in-article' | 'top-header';
  counterId?: number;
  onAdEvent?: (event: MetrikaEvent) => void;
  className?: string;
}

export function AdBanner({
  ad,
  slot,
  counterId = 99887766,
  onAdEvent,
  className = '',
}: AdBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [impressionLogged, setImpressionLogged] = useState(false);

  // Neutral CSS min-height to prevent Cumulative Layout Shift (CLS = 0)
  const slotDimensions = {
    sidebar: 'min-h-[340px]',
    'in-article': 'min-h-[140px]',
    'top-header': 'min-h-[90px]',
  }[slot];

  // Yandex Metrika Impression Tracking via IntersectionObserver
  // Triggered when banner remains in viewport > 1 second with >= 50% visibility
  useEffect(() => {
    if (!ad || impressionLogged || !containerRef.current) return;

    let timerId: number | null = null;
    const targetElement = containerRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          timerId = window.setTimeout(() => {
            setImpressionLogged(true);

            // Invoke real Yandex Metrika JS API
            if (typeof window !== 'undefined' && (window as any).ym) {
              (window as any).ym(counterId, 'reachGoal', 'AD_IMPRESSION', { ad_id: ad.id });
            }

            // Internal event propagation
            onAdEvent?.({
              id: `imp-${Date.now()}`,
              type: 'AD_IMPRESSION',
              adId: ad.id,
              slot: ad.slot,
              counterId,
              timestamp: new Date().toLocaleTimeString(),
            });
          }, 1000); // 1 second threshold
        } else {
          if (timerId) {
            clearTimeout(timerId);
            timerId = null;
          }
        }
      },
      {
        threshold: [0.5],
      }
    );

    observer.observe(targetElement);

    return () => {
      if (timerId) clearTimeout(timerId);
      observer.disconnect();
    };
  }, [ad, counterId, impressionLogged, onAdEvent]);

  // Click Tracking
  const handleClick = () => {
    if (!ad) return;

    if (typeof window !== 'undefined' && (window as any).ym) {
      (window as any).ym(counterId, 'reachGoal', 'AD_CLICK', { ad_id: ad.id });
    }

    onAdEvent?.({
      id: `clk-${Date.now()}`,
      type: 'AD_CLICK',
      adId: ad.id,
      slot: ad.slot,
      counterId,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  if (!ad) return null;

  return (
    <div
      ref={containerRef}
      className={`partner-slot promo-card relative my-4 w-full ${slotDimensions} border border-[#2a2a34] hover:border-[#8a00ff]/60 bg-[#0a0a0f] rounded-xs overflow-hidden transition-all shadow-sm group ${className}`}
    >
      <a
        href={ad.targetUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={handleClick}
        className="partner-link block h-full w-full focus:outline-none"
      >
        {slot === 'top-header' ? (
          // Compact Leaderboard — Clean non-overlapping layout
          <div className="flex flex-col sm:flex-row items-center justify-between p-3 gap-4">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <img
                src={ad.imageUrl}
                alt={ad.title}
                className="partner-image w-28 sm:w-36 h-14 object-cover border border-[#23232c] rounded-xs shrink-0"
                loading="lazy"
              />
              <div className="min-w-0">
                <span className="text-[9px] font-mono uppercase tracking-wider text-[#696974] block mb-0.5">
                  Реклама
                </span>
                <h4 className="partner-title font-sans text-xs sm:text-sm font-bold text-white group-hover:text-[#bd5aff] transition-colors leading-snug truncate">
                  {ad.title}
                </h4>
              </div>
            </div>

            <div className="shrink-0 hidden sm:flex items-center gap-2">
              <span className="text-[11px] font-mono text-[#8a00ff] group-hover:text-[#bd5aff] transition-colors whitespace-nowrap">
                Перейти ↗
              </span>
            </div>
          </div>
        ) : slot === 'in-article' ? (
          // In-Article Native Banner
          <div className="flex flex-col sm:flex-row items-center p-3.5 gap-4 bg-[#08080c]">
            <img
              src={ad.imageUrl}
              alt={ad.title}
              className="partner-image w-full sm:w-48 h-24 object-cover border border-[#22222a] rounded-xs shrink-0"
              loading="lazy"
            />
            <div className="flex-1 min-w-0">
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#6b6b76] block mb-1">
                Реклама
              </span>
              <h4 className="partner-title font-sans text-sm font-bold text-white group-hover:text-[#bd5aff] transition-colors leading-snug mb-1">
                {ad.title}
              </h4>
              <span className="text-[10px] font-mono text-[#8a00ff] group-hover:underline">
                Узнать больше ↗
              </span>
            </div>
          </div>
        ) : (
          // Sidebar Display Card
          <div className="p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-[9px] font-mono text-[#6c6c76]">
              <span>Реклама</span>
              <span className="text-[#888] group-hover:text-white transition-colors">↗</span>
            </div>

            <div className="partner-visual relative overflow-hidden rounded-xs border border-[#22222a] bg-[#000]">
              <img
                src={ad.imageUrl}
                alt={ad.title}
                className="partner-image w-full h-44 object-cover transition-transform duration-300 group-hover:scale-102"
                loading="lazy"
              />
            </div>

            <h4 className="partner-title font-sans text-xs font-bold text-white group-hover:text-[#bd5aff] transition-colors leading-snug">
              {ad.title}
            </h4>
          </div>
        )}
      </a>
    </div>
  );
}
