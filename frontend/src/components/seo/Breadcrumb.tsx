import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { Helmet } from "react-helmet-async";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const SITE_URL = "https://edulearn.app";

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const all: BreadcrumbItem[] = [{ label: "Home", href: "/" }, ...items];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": all.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.label,
      ...(item.href ? { "item": `${SITE_URL}${item.href}` } : {}),
    })),
  };

  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
        {all.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            {item.href && i < all.length - 1 ? (
              i === 0
                ? <Link to={item.href} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center gap-1"><Home className="w-3.5 h-3.5" /><span className="sr-only">Home</span></Link>
                : <Link to={item.href} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{item.label}</Link>
            ) : (
              <span className={i === all.length - 1 ? "text-gray-800 dark:text-gray-200 font-medium" : ""}>
                {i === 0 ? <Home className="w-3.5 h-3.5 inline" /> : item.label}
              </span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
