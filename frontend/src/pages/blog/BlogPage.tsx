import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Clock, ChevronRight, BookOpen, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BLOG_POSTS, type BlogPost } from "@/data/blog-posts";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { contentApi } from "@/lib/api";

const POSTS_PER_PAGE = 4;


function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="group bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow flex flex-col">
      {/* Cover */}
      <div className={`h-44 bg-gradient-to-br ${post.coverColor} flex items-center justify-center relative overflow-hidden`}>
        <BookOpen className="w-14 h-14 text-white/30 absolute" />
        <span className="relative text-xs font-semibold text-white/80 bg-white/20 px-3 py-1 rounded-full">
          {post.category}
        </span>
      </div>

      <div className="p-5 flex flex-col flex-1">
        {/* Meta */}
        <div className="flex items-center gap-3 text-xs font-medium text-gray-400 dark:text-gray-500 mb-3">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </time>
          <span>·</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readTime} min read</span>
        </div>

        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-snug">
          {post.title}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 flex-1">{post.excerpt}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {post.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>

        <Link
          to={`/blog/${post.slug}`}
          className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:gap-2.5 transition-all"
        >
          Read article <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </article>
  );
}

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [page, setPage] = useState(1);

  // Fetch CMS blog posts; merge with static fallback, prefer CMS
  const { data: cmsPages = [] } = useQuery({
    queryKey: ["cms", "blog-posts"],
    queryFn: () => contentApi.infoPages().then(r => r.data).catch(() => []),
    staleTime: 3 * 60 * 1000,
  });

  const allPosts: BlogPost[] = useMemo(() => {
    const cmsPosts: BlogPost[] = (cmsPages as any[])
      .filter((p: any) => p.slug?.startsWith("blog-") && p.is_published && p.data)
      .map((p: any) => ({ ...p.data, title: p.title || p.data?.title }));
    if (cmsPosts.length > 0) return cmsPosts.sort((a, b) => b.date.localeCompare(a.date));
    return BLOG_POSTS;
  }, [cmsPages]);

  const CATEGORIES = ["All", ...Array.from(new Set(allPosts.map(p => p.category)))];

  const filtered = activeCategory === "All"
    ? allPosts
    : allPosts.filter(p => p.category === activeCategory);

  const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);
  const paginated  = filtered.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);

  const handleCategory = (cat: string) => { setActiveCategory(cat); setPage(1); };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "EduLearn Blog",
    "url": "https://edulearn.app/blog",
    "description": "Study tips, exam strategies, and EdTech insights for Class 1–12 students in India.",
    "publisher": {
      "@type": "Organization",
      "name": "EduLearn",
      "logo": { "@type": "ImageObject", "url": "https://edulearn.app/favicon.svg" }
    },
    "blogPost": BLOG_POSTS.map(p => ({
      "@type": "BlogPosting",
      "headline": p.title,
      "url": `https://edulearn.app/blog/${p.slug}`,
      "datePublished": p.date,
      "author": { "@type": "Person", "name": p.author }
    }))
  };

  return (
    <>
      <SEOHead
        title="Blog — Study Tips & Exam Strategies"
        description="Expert study tips, CBSE board exam strategies, NCERT guides, and EdTech insights for Class 1–12 students in India."
        canonical="/blog"
        ogType="website"
        jsonLd={jsonLd}
      />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Hero */}
        <div className="bg-primary-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
            <p className="text-primary-200 text-xs font-semibold uppercase tracking-wide mb-3">EduLearn Blog</p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
              Study Smarter.<br />Score Higher.
            </h1>
            <p className="text-primary-200 max-w-xl text-base sm:text-lg">
              Expert guides on CBSE board exams, NCERT strategies, AI-powered learning, and science-backed study techniques — written for Indian students.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Breadcrumb */}
          <Breadcrumb items={[{ label: "Blog", href: "/blog" }]} />

          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mt-6 mb-8">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  activeCategory === cat
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-300 hover:text-primary-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginated.map(post => <BlogCard key={post.slug} post={post} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-9 h-9 rounded-xl text-sm font-semibold transition-colors ${
                    page === n
                      ? "bg-primary-600 text-white"
                      : "border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Next
              </button>
            </div>
          )}

          {/* CTA */}
          <div className="mt-16 rounded-2xl bg-primary-600 p-8 text-white text-center">
            <h2 className="text-xl font-semibold mb-2">Start Learning with AI Today</h2>
            <p className="text-primary-200 mb-5 text-sm">Join 50,000+ students mastering NCERT with EduLearn's AI-powered platform.</p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-50 transition-colors"
            >
              Get started free <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
