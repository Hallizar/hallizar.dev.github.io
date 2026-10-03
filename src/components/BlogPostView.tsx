import { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Clock, Share2, Tag, Check } from 'lucide-react';
import { BlogPost, AdBannerItem, MetrikaEvent } from '../types';
import { AdBanner } from './AdBanner';

interface BlogPostViewProps {
  post: BlogPost;
  inArticleAd: AdBannerItem | null;
  onBack: () => void;
  onAdEvent?: (event: MetrikaEvent) => void;
}

export function BlogPostView({
  post,
  inArticleAd,
  onBack,
  onAdEvent,
}: BlogPostViewProps) {
  const [copied, setCopied] = useState(false);

  // Dynamic SEO update for the current article
  useEffect(() => {
    const originalTitle = document.title;
    document.title = `${post.title} — Hallizar Blog`;

    // Schema.org BlogPosting injection
    const scriptId = 'article-json-ld';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }

    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      author: {
        '@type': 'Person',
        name: post.author.name,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Hallizar Studio',
      },
      datePublished: '2026-09-28',
      mainEntityOfPage: window.location.href,
    });

    return () => {
      document.title = originalTitle;
      const el = document.getElementById(scriptId);
      if (el) el.remove();
    };
  }, [post]);

  const shareLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <article className="max-w-3xl mx-auto font-mono text-[#dcdce2] py-4">
      {/* Top navigation */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-[#22222c]">
        <button
          onClick={onBack}
          className="ui-button ghost text-xs flex items-center gap-1.5 py-1.5 px-3"
        >
          <ArrowLeft size={14} />
          Назад к статьям
        </button>

        <button
          onClick={shareLink}
          className="ui-button ghost text-xs flex items-center gap-1.5 py-1.5 px-3"
          title="Поделиться статьей"
        >
          {copied ? <Check size={14} className="text-[#48ff89]" /> : <Share2 size={14} />}
          {copied ? 'Ссылка скопирована' : 'Поделиться'}
        </button>
      </div>

      {/* Article Header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#bd5aff] font-bold tracking-wider mb-2">
          <span>{post.category.toUpperCase()}</span>
          <span>·</span>
          <span className="flex items-center gap-1 text-[#787884]">
            <Calendar size={11} /> {post.date}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1 text-[#787884]">
            <Clock size={11} /> {post.readingTime}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold font-sans text-white leading-tight tracking-tight mb-4">
          {post.title}
        </h1>

        <p className="text-sm text-[#90909c] leading-relaxed border-l-2 border-[#8a00ff] pl-3 py-0.5">
          {post.excerpt}
        </p>
      </header>

      {/* Author bar */}
      <div className="flex items-center gap-3 p-3 bg-[#0a0a0f] border border-[#22222c] mb-6">
        <div className="w-8 h-8 rounded-full bg-[#8a00ff] text-white flex items-center justify-center font-bold text-xs">
          {post.author.avatar}
        </div>
        <div>
          <div className="text-xs text-white font-bold">{post.author.name}</div>
          <div className="text-[10px] text-[#6a6a74]">{post.author.role}</div>
        </div>
      </div>

      {/* Clean In-Article Native Banner */}
      {inArticleAd && (
        <div className="my-6">
          <AdBanner
            ad={inArticleAd}
            slot="in-article"
            onAdEvent={onAdEvent}
          />
        </div>
      )}

      {/* Article Content */}
      <div className="text-sm text-[#cfcfd6] leading-relaxed space-y-4">
        {post.content.split('\n\n').map((paragraph, index) => {
          if (paragraph.startsWith('## ')) {
            return (
              <h2 key={index} className="text-xl font-bold font-sans text-white mt-8 mb-3 pb-1 border-b border-[#22222c]">
                {paragraph.replace('## ', '')}
              </h2>
            );
          }
          if (paragraph.startsWith('### ')) {
            return (
              <h3 key={index} className="text-base font-bold font-sans text-white mt-6 mb-2">
                {paragraph.replace('### ', '')}
              </h3>
            );
          }
          if (paragraph.startsWith('#### ')) {
            return (
              <h4 key={index} className="text-sm font-bold font-sans text-white mt-4 mb-2">
                {paragraph.replace('#### ', '')}
              </h4>
            );
          }
          // Markdown Image syntax: ![alt text](url)
          const imgMatch = paragraph.match(/^!\[(.*?)\]\((.*?)\)$/);
          if (imgMatch) {
            const alt = imgMatch[1];
            const src = imgMatch[2];
            return (
              <figure key={index} className="my-6 border border-[#22222c] bg-[#07070b] overflow-hidden rounded-xs">
                <img
                  src={src}
                  alt={alt || post.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto object-cover max-h-[600px] border-b border-[#181822]"
                />
                {alt && (
                  <figcaption className="p-2.5 text-center text-xs text-[#80808c] font-mono bg-[#09090e]">
                    {alt}
                  </figcaption>
                )}
              </figure>
            );
          }
          if (paragraph.startsWith('> ')) {
            return (
              <blockquote key={index} className="border-l-2 border-[#bd5aff] bg-[#0f0a18]/40 px-4 py-2.5 my-3 text-xs text-[#d8d8e2] italic">
                {paragraph.replace(/^>\s*/, '')}
              </blockquote>
            );
          }
          if (paragraph.startsWith('```')) {
            const lines = paragraph.split('\n');
            const code = lines.slice(1, -1).join('\n');
            return (
              <pre key={index} className="bg-[#08080c] border border-[#242430] p-3 overflow-x-auto text-xs text-[#d1d1d8] my-3">
                <code>{code}</code>
              </pre>
            );
          }
          return (
            <p key={index} className="text-[13px] leading-relaxed text-[#c4c4cc]">
              {paragraph}
            </p>
          );
        })}
      </div>

      {/* Tags */}
      <div className="mt-8 pt-4 border-t border-[#22222c]">
        <div className="text-[10px] text-[#777] mb-2 uppercase tracking-wider">Теги статьи:</div>
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2.5 py-1 bg-[#0e0e14] border border-[#252530] text-[#90909c] flex items-center gap-1"
            >
              <Tag size={11} className="text-[#bd5aff]" />
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
