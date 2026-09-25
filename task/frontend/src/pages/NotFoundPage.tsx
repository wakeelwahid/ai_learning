import { Link } from "react-router-dom";
import { Home, Search } from "lucide-react";
import SEOHead from "@/components/seo/SEOHead";

export default function NotFoundPage() {
  return (
    <>
    <SEOHead title="404 — Page Not Found" description="The page you are looking for doesn't exist." noIndex={true} />
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-32 h-32 bg-primary-50 dark:bg-primary-900/30 rounded-3xl flex items-center justify-center mb-6">
        <span className="text-6xl font-bold text-primary-300 dark:text-primary-700">404</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Page not found</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link to="/dashboard" className="btn-primary flex items-center gap-2">
          <Home className="w-4 h-4" /> Back to Dashboard
        </Link>
        <Link to="/search" className="btn-secondary flex items-center gap-2">
          <Search className="w-4 h-4" /> Search
        </Link>
      </div>
    </div>
    </>
  );
}
