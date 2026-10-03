import { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  Clock,
  ArrowRight,
  TrendingUp,
  BookOpen,
} from 'lucide-react';
import { BlogPost, AdBannerItem, MetrikaEvent } from '../types';
import { AdBanner } from './AdBanner';

interface BlogListProps {
  posts: BlogPost[];
  sidebarAd: AdBannerItem | null;
  onSelectPost: (post: BlogPost) => void;
  onAdEvent?: (event: MetrikaEvent) => void;
}

export function BlogList({
  posts,
  sidebarAd,
  onSelectPost,
  onAdEvent,
}: BlogListProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const list = Array.from(new Set(posts.map((p) => p.category)));
    return ['all', ...list];
  }, [posts]);

  const trendingPosts = useMemo(() => {
    return [...posts].slice(0, 3);
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesSearch =
        post.title.toLowerCase().includes(search.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(search.toLowerCase()) ||
        post.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

      const matchesCat = selectedCategory === 'all' || post.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [posts, search, selectedCategory]);

  return (
    <div className="font-mono text-xs text-[#d0d0d6] space-y-6">
      {/* Search and Category Filter Bar */}
      <div className="border border-[#282832] bg-[#09090e] p-4 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <input
            type="text"
            placeholder="Поиск по статьям и тегам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-[#060608] border border-[#2b2b34] text-white focus:outline-none focus:border-[#8a00ff]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 border transition-all text-[11px] ${
                selectedCategory === cat
                  ? 'border-[#8a00ff] bg-[#8a00ff]/20 text-white font-bold'
                  : 'border-[#262630] bg-[#060609] text-[#787884] hover:text-white'
              }`}
            >
              {cat === 'all' ? 'ВСЕ СТАТЬИ' : cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Main Feed + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-6 items-start">
        {/* Main Content Feed */}
        <main className="space-y-4">
          {filteredPosts.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-[#24242e] text-[#666] bg-[#07070a]">
              Статей по запросу &quot;{search}&quot; не найдено.
            </div>
          ) : (
            filteredPosts.map((post) => (
              <article
                key={post.id}
                onClick={() => onSelectPost(post)}
                className="group border border-[#262632] hover:border-[#8B03FD]/70 bg-[#09090e] rounded-xs overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 shadow-sm isolate"
              >
                {/* Article Preview Image Header */}
                <div className="relative w-full h-44 sm:h-52 overflow-hidden bg-[#09090e] isolate">
                  <img
                    src={
                      post.image ||
                      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80'
                    }
                    alt={post.title}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80';
                    }}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-105"
                  />
                  {/* Stable dark gradient overlay: solid at bottom, extends 3px below to prevent any subpixel seam */}
                  <div className="absolute inset-x-0 -bottom-[3px] top-0 bg-gradient-to-t from-[#09090e] from-20% via-[#09090e]/40 to-transparent pointer-events-none z-10" />

                  {/* Floating Category Badge */}
                  <div className="absolute top-3 left-3 pointer-events-none z-20">
                    <span className="px-2.5 py-1 bg-[#09090e]/90 backdrop-blur-md border border-[#2b2b38] text-[9px] font-mono font-bold uppercase tracking-wider text-[#bd5aff] shadow-sm">
                      {post.category}
                    </span>
                  </div>
                </div>

                {/* Card Body: relative z-20 with background matching gradient base to lock seam */}
                <div className="relative z-20 -mt-[2px] p-5 bg-[#09090e] border-t border-[#1f1f28]">
                  <div className="flex items-center gap-2 text-[9px] font-mono text-[#666672] mb-2">
                    <span className="flex items-center gap-1">
                      <Calendar size={10} /> {post.date}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {post.readingTime}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold font-sans text-white group-hover:text-[#bd5aff] transition-colors mb-2 leading-snug">
                    {post.title}
                  </h2>

                  <p className="text-[12px] text-[#848490] leading-relaxed mb-4 line-clamp-2">
                    {post.excerpt}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#181820] text-[10px]">
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-[#0f0f15] border border-[#202028] text-[#767682]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <span className="text-[#bd5aff] font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Читать <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </article>
            ))
          )}
        </main>

        {/* Clean Sidebar */}
        <aside className="space-y-6">
          {/* Clean Sidebar Ad Banner */}
          {sidebarAd && (
            <AdBanner
              ad={sidebarAd}
              slot="sidebar"
              onAdEvent={onAdEvent}
            />
          )}

          {/* Popular Posts */}
          <div className="border border-[#262632] bg-[#09090e] p-4">
            <h3 className="text-xs font-bold text-white font-sans flex items-center gap-1.5 mb-3 pb-2 border-b border-[#1c1c24]">
              <TrendingUp size={13} className="text-[#bd5aff]" />
              ПОПУЛЯРНОЕ В БЛОГЕ
            </h3>

            <div className="space-y-3">
              {trendingPosts.map((post, idx) => (
                <div
                  key={post.id}
                  onClick={() => onSelectPost(post)}
                  className="cursor-pointer group flex items-start gap-2.5 pb-2.5 border-b border-[#181820] last:border-b-0"
                >
                  <span className="text-[12px] font-bold text-[#444] group-hover:text-[#bd5aff] transition-colors font-mono">
                    0{idx + 1}
                  </span>
                  <div>
                    <h4 className="text-[11px] font-sans text-[#bbb] group-hover:text-white transition-colors leading-snug line-clamp-2">
                      {post.title}
                    </h4>
                    <span className="text-[9px] text-[#555] flex items-center gap-1 mt-0.5">
                      <Clock size={9} /> {post.readingTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
