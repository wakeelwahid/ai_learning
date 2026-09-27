import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, Calendar, ChevronRight, ArrowLeft, BookOpen, Tag } from "lucide-react";
import { getPostBySlug, BLOG_POSTS, type BlogPost } from "@/data/blog-posts";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { contentApi } from "@/lib/api";

const SITE_URL = "https://edulearn.app";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  // Try to load from CMS first, fall back to static data
  const { data: cmsPage, isLoading } = useQuery({
    queryKey: ["cms", "blog", slug],
    queryFn: () => contentApi.infoPage(`blog-${slug}`).then(r => r.data).catch(() => null),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const cmsPost: BlogPost | null = cmsPage?.is_published && cmsPage.data
    ? { ...cmsPage.data, title: cmsPage.title || cmsPage.data.title, content: cmsPage.data.sections ?? cmsPage.data.content ?? [] }
    : null;

  const staticPost = slug ? getPostBySlug(slug) : undefined;
  const post = cmsPost ?? staticPost;

  if (isLoading) return null;
  if (!post) return <Navigate to="/blog" replace />;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.description,
    "datePublished": post.date,
    "dateModified": post.date,
    "author": {
      "@type": "Person",
      "name": post.author,
      "jobTitle": post.authorRole
    },
    "publisher": {
      "@type": "Organization",
      "name": "EduLearn",
      "logo": { "@type": "ImageObject", "url": `${SITE_URL}/favicon.svg` }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`
    },
    "keywords": post.tags.join(", "),
    "articleSection": post.category,
    "wordCount": post.content.reduce((n, s) => n + (s.body?.split(" ").length ?? 0) + (s.list?.join(" ").split(" ").length ?? 0), 0)
  };

  const related = BLOG_POSTS.filter(p => p.slug !== post.slug && p.category === post.category).slice(0, 2);


  return (
    <>
      <SEOHead
        title={post.title}
        description={post.description}
        canonical={`/blog/${post.slug}`}
        ogType="article"
        article={{
          publishedTime: post.date,
          author: post.author,
          tags: post.tags,
        }}
        jsonLd={articleJsonLd}
      />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Article Header */}
        <div className={`bg-gradient-to-br ${post.coverColor}`}>
          <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16 text-white">
            <span className="text-xs font-semibold bg-white/20 px-3 py-1 rounded-full">
              {post.category}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-4 leading-tight">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-white/70 text-sm">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </time>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> {post.readTime} min read
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" /> {post.author}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <Breadcrumb items={[
            { label: "Blog", href: "/blog" },
            { label: post.title }
          ]} />

          {/* Article Body */}
          <article className="mt-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 sm:p-10">
            {/* Excerpt / Lead */}
            <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed font-medium border-l-4 border-primary-500 pl-4 mb-8 italic">
              {post.excerpt}
            </p>

            {/* Sections */}
            {post.content.map((section, i) => (
              <section key={i} className="mb-8">
                {section.heading && (
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                    {section.heading}
                  </h2>
                )}
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[15px]">
                  {section.body}
                </p>
                {section.list && (
                  <ul className="mt-3 space-y-2">
                    {section.list.map((item, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-[15px] text-gray-600 dark:text-gray-300">
                        <ChevronRight className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {/* Tags */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-6 mt-6">
              <div className="flex items-center flex-wrap gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                {post.tags.map(tag => (
                  <span key={tag} className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1 rounded-full font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>

          {/* CTA */}
          <div className="mt-8 rounded-2xl bg-primary-600 p-7 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-lg">Ready to put this into practice?</p>
              <p className="text-primary-200 text-sm mt-1">Start learning with EduLearn's AI tutor — free for Class 1–12 students.</p>
            </div>
            <Link
              to="/register"
              className="flex-shrink-0 bg-white text-primary-700 font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-50 transition-colors text-sm whitespace-nowrap"
            >
              Start for free
            </Link>
          </div>

          {/* Related Posts */}
          {related.length > 0 && (
            <div className="mt-12">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Related Articles</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {related.map(rp => (
                  <Link
                    key={rp.slug}
                    to={`/blog/${rp.slug}`}
                    className="group bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 hover:shadow-md transition-shadow flex flex-col gap-2"
                  >
                    <span className={`h-1.5 w-12 rounded-full bg-gradient-to-r ${rp.coverColor}`} />
                    <p className="text-sm font-semibold text-gray-800 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2 leading-snug">
                      {rp.title}
                    </p>
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {rp.readTime} min</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Back to blog */}
          <Link
            to="/blog"
            className="mt-8 flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to all articles
          </Link>
        </div>
      </div>
    </>
  );
}
