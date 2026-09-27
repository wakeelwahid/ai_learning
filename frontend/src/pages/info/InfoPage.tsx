import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { contentApi } from "@/lib/api";
import {
  ChevronLeft, ChevronDown, Mail, Phone, MapPin, Clock,
  HelpCircle, FileText, AlertCircle, Send,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { SkeletonLine } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";

interface InfoPageData {
  slug: string;
  title: string;
  content: string;
  data: any;
  updated_at: string | null;
}

export default function InfoPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["info-page", slug],
    queryFn: () => contentApi.infoPage(slug!).then((r) => r.data as InfoPageData),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        <SkeletonLine className="h-7 w-40" />
        <div className="h-48 w-full rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="w-full">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mb-4 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <Card>
          <EmptyState icon={AlertCircle} title="This page isn't available yet" />
        </Card>
      </div>
    );
  }

  const paragraphs = (data.content || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const faqItems: { q: string; a: string }[] = slug === "faq" && Array.isArray(data.data?.items) ? data.data.items : [];

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
          {slug === "faq" ? <HelpCircle className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            : slug === "contact-us" ? <Mail className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            : <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.title}</h1>
      </div>

      <div className="xl:flex xl:gap-8 xl:items-start">
        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 min-w-0 space-y-5">
          {paragraphs.length > 0 && (
            <div className="space-y-3">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{p}</p>
              ))}
            </div>
          )}

          {slug === "faq" && faqItems.length > 0 && (
            <FaqAccordion items={faqItems} />
          )}

          {slug === "contact-us" && <ContactSection data={data.data} title={data.title} />}

          {data.updated_at && (
            <p className="text-xs text-gray-400 pt-2">Last updated: {new Date(data.updated_at).toLocaleDateString()}</p>
          )}
        </div>

        {/* ── RIGHT SIDEBAR (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-64 flex-shrink-0 sticky top-6 self-start space-y-4">
          {slug === "faq" && faqItems.length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Questions</p>
              <ul className="space-y-1.5">
                {faqItems.map((item, i) => (
                  <li key={i}>
                    <button
                      onClick={() => {
                        const el = document.getElementById(`faq-${i}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="text-xs text-left text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 leading-snug transition-colors line-clamp-2"
                    >
                      {i + 1}. {item.q}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {slug === "contact-us" && (
            <Card>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick Contact</p>
              <div className="space-y-3">
                {data.data?.email && (
                  <a href={`mailto:${data.data.email}`} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                    <Mail className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" /> {data.data.email}
                  </a>
                )}
                {data.data?.phone && (
                  <a href={`tel:${data.data.phone}`} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                    <Phone className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" /> {data.data.phone}
                  </a>
                )}
                {data.data?.hours && (
                  <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {data.data.hours}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card className="text-center">
            <p className="text-2xl mb-1">
              {slug === "faq" ? "💡" : slug === "contact-us" ? "📬" : "📄"}
            </p>
            <p className="text-xs font-semibold text-gray-900 dark:text-white">
              {slug === "faq" ? "Still have questions?" : slug === "contact-us" ? "We're here to help" : "Information"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {slug === "faq" ? "Contact our support team for more help" : "Average response within 24 hours"}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ── FAQ accordion ─────────────────────────────────────────────────────────────
function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <Card key={i} noPadding className="overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{it.q}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && (
            <div className="px-4 pb-3 -mt-1">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{it.a}</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Contact details + predefined-message form ─────────────────────────────────
function ContactSection({ data, title }: { data: any; title: string }) {
  const email = data?.email || "support@edulearn.com";
  const [message, setMessage] = useState("");

  // Prefill the predefined message
  useEffect(() => {
    if (data?.predefined_message) setMessage(data.predefined_message);
  }, [data?.predefined_message]);

  const send = () => {
    const subject = encodeURIComponent(`Support request — ${title}`);
    const body = encodeURIComponent(message);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const rows = [
    data?.email   && { icon: Mail,   label: "Email",   value: data.email,   href: `mailto:${data.email}` },
    data?.phone   && { icon: Phone,  label: "Phone",   value: data.phone,   href: `tel:${data.phone}` },
    data?.address && { icon: MapPin, label: "Address", value: data.address },
    data?.hours   && { icon: Clock,  label: "Hours",   value: data.hours },
  ].filter(Boolean) as { icon: any; label: string; value: string; href?: string }[];

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <Card className="space-y-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <r.icon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">{r.label}</p>
                {r.href
                  ? <a href={r.href} className="text-sm font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 break-words">{r.value}</a>
                  : <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{r.value}</p>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Message form (predefined message prefilled) */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Send us a message</p>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Type your message…"
          className="resize-none"
        />
        <Button onClick={send} disabled={!message.trim()} fullWidth>
          <Send className="w-4 h-4" /> Send Message
        </Button>
      </Card>
    </div>
  );
}
