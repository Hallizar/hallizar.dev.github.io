import { useState, useEffect } from 'react';
import {
  BookOpen,
  Wrench,
  User,
  Sparkles,
  Crosshair,
  Archive,
} from 'lucide-react';
import { BLOG_POSTS } from './data/posts';
import { INITIAL_ADS, getActiveAdForSlot } from './data/ads';
import { BlogPost, AdBannerItem } from './types';
import { LocalGifStudio } from './components/LocalGifStudio';
import { ImageConverterTool } from './components/ImageConverterTool';
import { AreaAnalyzerTool } from './components/AreaAnalyzerTool';
import { BlogList } from './components/BlogList';
import { BlogPostView } from './components/BlogPostView';
import { AdBanner } from './components/AdBanner';
import { DecapAdminStandalone } from './components/DecapAdminStandalone';
import { updateSEOMetadata } from './utils/seo';
import { Logo } from './components/Logo';

export default function App() {
  const [route, setRoute] = useState<'blog' | 'services' | 'about' | 'admin'>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.includes('/admin')) {
      return 'admin';
    }
    return 'blog';
  });

  const [selectedService, setSelectedService] = useState<'gif-studio' | 'webp-converter' | 'area-analyzer'>('gif-studio');
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);

  // Active ads for slots (queried at build/runtime from src/content/ads)
  const [ads] = useState<AdBannerItem[]>(INITIAL_ADS);
  const topHeaderAd = getActiveAdForSlot(ads, 'top-header');
  const sidebarAd = getActiveAdForSlot(ads, 'sidebar');
  const inArticleAd = getActiveAdForSlot(ads, 'in-article');

  // Handle URL popstate or pathname changes
  useEffect(() => {
    const handleLocationChange = () => {
      if (window.location.pathname.includes('/admin')) {
        setRoute('admin');
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Dynamic SEO metadata updates (canonical, open graph, twitter, schema.org)
  useEffect(() => {
    if (route === 'admin') return;
    updateSEOMetadata({ route, post: selectedPost });
  }, [route, selectedPost]);

  // ISOLATED ADMIN ROUTE: If /admin/ is requested, render pure Decap CMS login without blog UI
  if (route === 'admin') {
    return <DecapAdminStandalone />;
  }

  return (
    <div className="app-shell min-h-screen flex flex-col font-sans bg-[#050507] text-[#f3f3f0]">
      <div className="noise" />

      {/* Main Clean Header */}
      <header className="topbar sticky top-0 z-40 bg-[#050507]/90 backdrop-blur-md border-b border-[#24242e]">
        <div className="flex items-center gap-6">
          <div
            onClick={() => {
              setRoute('blog');
              setSelectedPost(null);
            }}
            className="topbar-brand cursor-pointer flex items-center gap-3 group"
          >
            <div className="brand-mark">
              <Logo size={28} color="#ffffff" className="transition-transform duration-200 group-hover:scale-105" />
            </div>
            <div>
              <div className="brand-title">HALLIZAR.RU</div>
              <div className="brand-subtitle">ENGINEERING & TOOLS</div>
            </div>
          </div>

          {/* Clean Public Navigation */}
          <nav className="hidden md:flex items-center gap-1 font-mono text-xs">
            <button
              onClick={() => {
                setRoute('blog');
                setSelectedPost(null);
              }}
              className={`px-3 py-1.5 border transition-all flex items-center gap-1.5 ${
                route === 'blog'
                  ? 'border-[#8a00ff] bg-[#8a00ff]/15 text-white font-bold'
                  : 'border-transparent text-[#848490] hover:text-white'
              }`}
            >
              <BookOpen size={13} />
              БЛОГ
            </button>

            <button
              onClick={() => {
                setRoute('services');
                setSelectedPost(null);
              }}
              className={`px-3 py-1.5 border transition-all flex items-center gap-1.5 ${
                route === 'services'
                  ? 'border-[#8a00ff] bg-[#8a00ff]/15 text-white font-bold'
                  : 'border-transparent text-[#848490] hover:text-white'
              }`}
            >
              <Wrench size={13} />
              СЕРВИСЫ
            </button>

            <button
              onClick={() => {
                setRoute('about');
                setSelectedPost(null);
              }}
              className={`px-3 py-1.5 border transition-all flex items-center gap-1.5 ${
                route === 'about'
                  ? 'border-[#8a00ff] bg-[#8a00ff]/15 text-white font-bold'
                  : 'border-transparent text-[#848490] hover:text-white'
              }`}
            >
              <User size={13} />
              О ПРОЕКТЕ
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile nav bar */}
      <div className="flex md:hidden border-b border-[#24242e] bg-[#09090d] px-4 py-2 gap-3 text-xs font-mono">
        <button
          onClick={() => {
            setRoute('blog');
            setSelectedPost(null);
          }}
          className={`px-2 py-1 border ${
            route === 'blog' ? 'border-[#8a00ff] text-white' : 'border-transparent text-[#777]'
          }`}
        >
          Блог
        </button>
        <button
          onClick={() => {
            setRoute('services');
            setSelectedPost(null);
          }}
          className={`px-2 py-1 border ${
            route === 'services' ? 'border-[#8a00ff] text-white' : 'border-transparent text-[#777]'
          }`}
        >
          Сервисы
        </button>
        <button
          onClick={() => {
            setRoute('about');
            setSelectedPost(null);
          }}
          className={`px-2 py-1 border ${
            route === 'about' ? 'border-[#8a00ff] text-white' : 'border-transparent text-[#777]'
          }`}
        >
          О проекте
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8 py-6">
        {/* Top-Header Ad Slot (Rendered cleanly without debug labels) */}
        {topHeaderAd && (
          <AdBanner
            ad={topHeaderAd}
            slot="top-header"
          />
        )}

        {/* 1. BLOG VIEW */}
        {route === 'blog' && (
          <div>
            {selectedPost ? (
              <BlogPostView
                post={selectedPost}
                inArticleAd={inArticleAd}
                onBack={() => setSelectedPost(null)}
              />
            ) : (
              <BlogList
                posts={BLOG_POSTS}
                sidebarAd={sidebarAd}
                onSelectPost={(post) => setSelectedPost(post)}
              />
            )}
          </div>
        )}

        {/* 2. SERVICES VIEW */}
        {route === 'services' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-[#2a2a34] bg-[#0a0a0f]">
              <div>
                <span className="text-[10px] font-mono text-[#bd5aff] font-bold uppercase tracking-wider block">
                  Браузерные инструменты
                </span>
                <span className="text-white font-mono text-sm font-bold">
                  Выберите сервис для работы
                </span>
              </div>

              <div className="flex flex-wrap gap-2 font-mono text-xs">
                <button
                  onClick={() => setSelectedService('gif-studio')}
                  className={`px-4 py-2 border transition-all flex items-center gap-2 ${
                    selectedService === 'gif-studio'
                      ? 'border-[#8a00ff] bg-[#8a00ff] text-white font-bold'
                      : 'border-[#33333d] bg-[#0c0c12] text-[#888894] hover:text-white'
                  }`}
                >
                  <Sparkles size={14} />
                  LOCAL GIF STUDIO
                </button>

                <button
                  onClick={() => setSelectedService('webp-converter')}
                  className={`px-4 py-2 border transition-all flex items-center gap-2 ${
                    selectedService === 'webp-converter'
                      ? 'border-[#8a00ff] bg-[#8a00ff] text-white font-bold'
                      : 'border-[#33333d] bg-[#0c0c12] text-[#888894] hover:text-white'
                  }`}
                >
                  <Archive size={14} />
                  СЖАТИЕ & ZIP
                </button>

                <button
                  onClick={() => setSelectedService('area-analyzer')}
                  className={`px-4 py-2 border transition-all flex items-center gap-2 ${
                    selectedService === 'area-analyzer'
                      ? 'border-[#8a00ff] bg-[#8a00ff] text-white font-bold'
                      : 'border-[#33333d] bg-[#0c0c12] text-[#888894] hover:text-white'
                  }`}
                >
                  <Crosshair size={14} />
                  АНАЛИЗАТОР ПЛОЩАДИ
                </button>
              </div>
            </div>

            <div className="border border-[#30303a] bg-[#08080c] p-2 sm:p-4">
              {selectedService === 'gif-studio' && <LocalGifStudio />}
              {selectedService === 'webp-converter' && <ImageConverterTool />}
              {selectedService === 'area-analyzer' && <AreaAnalyzerTool />}
            </div>
          </div>
        )}

        {/* 3. ABOUT VIEW */}
        {route === 'about' && (
          <div className="max-w-3xl mx-auto border border-[#282834] bg-[#09090e] p-8 font-mono text-xs text-[#cfcfd6] space-y-6">
            <h1 className="text-2xl font-bold font-sans text-white">
              О платформе Hallizar
            </h1>

            <p className="text-sm leading-relaxed text-[#9898a4]">
              Этот проект — персональный автономный блог и коллекция легковесных веб-инструментов. Сайт спроектирован по принципу максимальной производительности (Zero-CMS, SSG, 100/100 в Lighthouse) и абсолютной конфиденциальности (все медиа-утилиты обрабатывают данные локально в браузере).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#202028]">
              <div className="p-4 border border-[#22222a] bg-[#060608]">
                <strong className="text-white block mb-1 font-sans text-sm">Стек технологий</strong>
                <p className="text-[11px] text-[#777] m-0 leading-relaxed">
                  Astro 5 (SSG), Tailwind CSS, React Islands, WebAssembly (gifski-wasm), Decap CMS, GitHub Pages.
                </p>
              </div>

              <div className="p-4 border border-[#22222a] bg-[#060608]">
                <strong className="text-white block mb-1 font-sans text-sm">Контакты &amp; Код</strong>
                <p className="text-[11px] text-[#777] m-0 leading-relaxed">
                  Открытый исходный код: https://github.com/hallizar/BLOG
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-[#24242e] bg-[#07070a] py-8 px-6 mt-12 text-center text-xs font-mono text-[#666]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center text-white shrink-0">
              <Logo size={16} color="#ffffff" />
            </div>
            <span className="text-[#ccc] font-bold">HALLIZAR.RU</span>
            <span>&middot; Автономный блог и веб-сервисы</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <button
              onClick={() => {
                setRoute('blog');
                setSelectedPost(null);
              }}
              className="hover:text-[#bd5aff] transition-colors"
            >
              Статьи
            </button>
            <button
              onClick={() => {
                setRoute('services');
                setSelectedPost(null);
              }}
              className="hover:text-[#bd5aff] transition-colors"
            >
              Сервисы
            </button>
            <button
              onClick={() => {
                setRoute('about');
                setSelectedPost(null);
              }}
              className="hover:text-[#bd5aff] transition-colors"
            >
              О проекте
            </button>
            <a
              href="/admin/"
              onClick={(e) => {
                e.preventDefault();
                setRoute('admin');
              }}
              className="hover:text-[#bd5aff] transition-colors opacity-60 hover:opacity-100"
            >
              Вход
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
