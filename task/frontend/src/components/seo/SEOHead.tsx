import { Helmet } from "react-helmet-async";

const SITE_NAME = "EduLearn";
const SITE_URL  = "https://edulearn.app";
const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;
const DEFAULT_DESC  = "India's #1 AI-powered learning platform for Class 1–12 students. Master NCERT with video lessons, AI tutoring, and adaptive quizzes.";

interface ArticleMeta {
  publishedTime: string;
  modifiedTime?: string;
  author: string;
  tags: string[];
}

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;        // e.g. "/blog/my-post"
  ogImage?: string;
  ogType?: "website" | "article";
  article?: ArticleMeta;
  noIndex?: boolean;
  jsonLd?: object | object[];
}

export default function SEOHead({
  title,
  description = DEFAULT_DESC,
  canonical,
  ogImage = DEFAULT_IMAGE,
  ogType = "website",
  article,
  noIndex = false,
  jsonLd,
}: SEOHeadProps) {
  const pageTitle    = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — AI-Powered Learning for Class 1–12`;
  const canonicalUrl = canonical ? `${SITE_URL}${canonical}` : undefined;

  const schemas = jsonLd
    ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
    : [];

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title"       content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type"        content={ogType} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image"        content={ogImage} />
      <meta property="og:image:width"  content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale"       content="en_IN" />

      {/* Twitter Cards */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:title"       content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image"       content={ogImage} />

      {/* Article-specific OG tags */}
      {ogType === "article" && article && (
        <>
          <meta property="article:published_time" content={article.publishedTime} />
          {article.modifiedTime && <meta property="article:modified_time" content={article.modifiedTime} />}
          <meta property="article:author" content={article.author} />
          {article.tags.map(t => <meta key={t} property="article:tag" content={t} />)}
        </>
      )}

      {/* Hreflang */}
      {canonicalUrl && (
        <>
          <link rel="alternate" hrefLang="en-IN"    href={canonicalUrl} />
          <link rel="alternate" hrefLang="hi-IN"    href={canonicalUrl} />
          <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
        </>
      )}

      {/* JSON-LD Structured Data */}
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
