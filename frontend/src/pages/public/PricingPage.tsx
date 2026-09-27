import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle, X } from "lucide-react";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { paymentApi } from "@/lib/api";
import { Card, Badge, Button } from "@/components/ui";

interface LivePlan {
  plan_key: string;
  price: number;
  duration_days: number;
}

// Feature bullets are marketing copy, not admin-managed data (Plan.features
// in the DB is a flat string list meant for the in-app SubscriptionPage's
// compact card, not this page's Free-vs-Premium comparison table) — kept
// as static copy. Only the PRICE below is live, since that's the part an
// admin can actually change via /admin/plans and that going stale would
// mislead a visitor about what they'll actually be charged.
const FREE_FEATURES = [
  { label: "Access to selected videos (100+)",   ok: true  },
  { label: "10 AI tutor questions per day",       ok: true  },
  { label: "Basic practice quizzes",              ok: true  },
  { label: "Leaderboard & XP points",             ok: true  },
  { label: "Progress dashboard",                  ok: true  },
  { label: "All subjects unlocked",               ok: false },
  { label: "Unlimited AI tutor",                  ok: false },
  { label: "AI Revision engine",                  ok: false },
  { label: "Certificates",                        ok: false },
  { label: "Offline access",                      ok: false },
  { label: "Parent dashboard",                    ok: false },
  { label: "Priority support",                    ok: false },
];

const PREMIUM_FEATURES = [
  { label: "1,200+ video lessons — all unlocked", ok: true },
  { label: "Unlimited AI tutor questions",        ok: true },
  { label: "All subjects & all classes",          ok: true },
  { label: "AI Revision engine",                  ok: true },
  { label: "Downloadable certificates",           ok: true },
  { label: "Leaderboard & live battles",          ok: true },
  { label: "Full progress analytics",             ok: true },
  { label: "Parent dashboard & controls",         ok: true },
  { label: "Multi-language (EN/HI/PA/BHO)",      ok: true },
  { label: "Offline access (mobile)",             ok: true },
  { label: "Previous year papers",                ok: true },
  { label: "Priority support",                    ok: true },
];

const FALLBACK_PREMIUM_PRICE = 199; // shown only if the live plans fetch fails

const FAQS = [
  { q: "Is there a free trial for Premium?", a: "Yes — new users get a 7-day free trial of Premium. No credit card required to start." },
  { q: "Can I cancel anytime?",              a: "Absolutely. Cancel anytime from your Subscription page. You'll keep Premium access until the end of your billing period." },
  { q: "Is there a discount for longer billing periods?", a: "Yes — quarterly and annual plans work out cheaper per month than paying monthly. See exact current pricing for each duration inside the app after signing up." },
  { q: "Can parents pay for their child's subscription?", a: "Yes. The parent can sign up for a parent account, link their child's student account, and manage the subscription from the parent dashboard." },
  { q: "What payment methods do you accept?", a: "UPI apps (PhonePe, Google Pay, Paytm, Amazon Pay, BHIM), net banking, debit/credit cards (Visa, Mastercard, RuPay), and popular wallets via Cashfree." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "EduLearn Premium",
  "description": "Full access to 1,200+ NCERT video lessons, unlimited AI tutoring, and all subjects for Class 1–12.",
  "offers": [
    { "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "INR" },
    { "@type": "Offer", "name": "Premium", "price": "199", "priceCurrency": "INR", "billingDuration": "P1M" }
  ]
};

export default function PricingPage() {
  const { data: livePlans } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => paymentApi.plans().then(r => r.data as LivePlan[]),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Cheapest active plan stands in for "Premium" on this page — the actual
  // per-duration breakdown (monthly/quarterly/annual) lives on
  // SubscriptionPage; this comparison table only needs one reference price
  // and it must match what a visitor will actually be charged.
  const cheapestPlan = livePlans?.length
    ? [...livePlans].sort((a, b) => a.price - b.price)[0]
    : null;
  const premiumPrice = cheapestPlan?.price ?? FALLBACK_PREMIUM_PRICE;
  const premiumPeriod = cheapestPlan
    ? cheapestPlan.duration_days >= 28 && cheapestPlan.duration_days <= 31
      ? "per month"
      : `per ${cheapestPlan.duration_days} days`
    : "per month";

  const PLANS = [
    {
      name: "Free", price: "₹0", period: "forever",
      highlight: false, cta: "Get started free", ctaTo: "/register",
      features: FREE_FEATURES,
    },
    {
      name: "Premium", price: `₹${premiumPrice}`, period: premiumPeriod,
      highlight: true, cta: "Start Premium free trial", ctaTo: "/register",
      features: PREMIUM_FEATURES,
    },
  ];

  return (
    <>
      <SEOHead
        title="Pricing — Free & Premium Plans"
        description={`EduLearn is free to start. Upgrade to Premium for ₹${premiumPrice}/month — 1,200+ videos, unlimited AI tutoring, all subjects, certificates, and more.`}
        canonical="/pricing"
        jsonLd={jsonLd}
      />

      <div className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h1 className="text-3xl font-bold mb-3">Simple, honest pricing</h1>
          <p className="text-primary-100 text-base">Start free, upgrade when you're ready. No hidden fees.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumb items={[{ label: "Pricing", href: "/pricing" }]} />

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 max-w-3xl mx-auto">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={
                plan.highlight
                  ? "rounded-2xl p-7 flex flex-col bg-primary-600 text-white border border-primary-600 relative shadow-md"
                  : "rounded-2xl p-7 flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
              }
            >
              {plan.highlight && (
                <Badge variant="warning" className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  7-DAY FREE TRIAL
                </Badge>
              )}
              <p className={`text-lg font-semibold mb-1 ${plan.highlight ? "text-white" : "text-gray-900 dark:text-white"}`}>{plan.name}</p>
              <p className={`text-3xl font-bold mb-1 ${plan.highlight ? "text-white" : "text-gray-900 dark:text-white"}`}>{plan.price}</p>
              <p className={`text-sm mb-6 ${plan.highlight ? "text-primary-100" : "text-gray-400"}`}>{plan.period}</p>

              <ul className="space-y-2.5 flex-1 mb-7">
                {plan.features.map(f => (
                  <li key={f.label} className={`flex items-start gap-2.5 text-sm ${plan.highlight ? (f.ok ? "text-primary-50" : "text-primary-200/50 line-through") : (f.ok ? "text-gray-700 dark:text-gray-300" : "text-gray-300 dark:text-gray-600 line-through")}`}>
                    {f.ok
                      ? <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.highlight ? "text-white" : "text-success-500"}`} />
                      : <X className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-300 dark:text-gray-600" />
                    }
                    {f.label}
                  </li>
                ))}
              </ul>

              <Link to={plan.ctaTo} className="block">
                <Button variant={plan.highlight ? "secondary" : "primary"} fullWidth>
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">Premium trial requires no card. ₹199/month after 7 days if you choose to continue.</p>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-8">Pricing FAQs</h2>
          <div className="space-y-4">
            {FAQS.map(f => (
              <Card key={f.q}>
                <p className="font-semibold text-gray-900 dark:text-white text-sm mb-2">{f.q}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.a}</p>
              </Card>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400 mt-6">
            More questions? <Link to="/faq" className="text-primary-600 dark:text-primary-400 font-medium">See full FAQ</Link> or <Link to="/contact" className="text-primary-600 dark:text-primary-400 font-medium">contact us</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
