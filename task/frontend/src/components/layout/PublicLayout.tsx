import { useState } from "react";
import { Outlet, Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";

const NAV = [
  { to: "/courses",  label: "Courses"  },
  { to: "/features", label: "Features" },
  { to: "/pricing",  label: "Pricing"  },
  { to: "/blog",     label: "Blog"     },
  { to: "/about",    label: "About"    },
  { to: "/faq",      label: "FAQ"      },
];

const FOOTER_LINKS = {
  Learn:   [{ to: "/courses", label: "Courses" }, { to: "/features", label: "Features" }, { to: "/pricing", label: "Pricing" }, { to: "/blog", label: "Blog" }],
  Company: [{ to: "/about", label: "About Us" }, { to: "/contact", label: "Contact" }, { to: "/faq", label: "FAQ" }, { to: "/docs", label: "Docs" }],
  Legal:   [{ to: "/terms", label: "Terms" }, { to: "/privacy", label: "Privacy" }],
};

export default function PublicLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">

      {/* ── Sticky Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">

          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-primary-600 rounded-xl flex items-center justify-center text-white font-black text-sm">E</div>
            <span className="font-extrabold text-gray-900 dark:text-white text-lg">EduLearn</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-5 flex-1">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? "text-primary-600 dark:text-primary-400" : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`
              }>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            <Link to="/login" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
              Sign in
            </Link>
            <Link to="/register" className="text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl transition-colors">
              Get started free
            </Link>
          </div>

          <button onClick={() => setOpen(o => !o)} className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile nav */}
        {open && (
          <div className="md:hidden bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 px-4 py-4 space-y-1">
            {NAV.map(n => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-primary-600">
                {n.label}
              </Link>
            ))}
            <div className="pt-3 flex gap-2 border-t border-gray-100 dark:border-gray-800">
              <Link to="/login" className="flex-1 text-center text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-gray-700 dark:text-gray-300">Sign in</Link>
              <Link to="/register" className="flex-1 text-center text-sm font-semibold bg-primary-600 text-white rounded-xl py-2.5">Get started</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Page Content ───────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10 grid sm:grid-cols-2 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 text-white font-extrabold text-lg mb-3">
              <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center text-white font-black text-xs">E</div>
              EduLearn
            </div>
            <p className="text-sm leading-relaxed max-w-xs">
              India's #1 AI-powered learning platform. Master Class 1–12 NCERT with video lessons, AI tutoring, and adaptive quizzes.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <p className="text-white text-sm font-semibold mb-4">{section}</p>
              <ul className="space-y-2.5">
                {links.map(l => (
                  <li key={l.to}><Link to={l.to} className="text-sm hover:text-white transition-colors">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <span>© 2026 EduLearn. All rights reserved.</span>
            <span>Made with ♥ for students across India</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
