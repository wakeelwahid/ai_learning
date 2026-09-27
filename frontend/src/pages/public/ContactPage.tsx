import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageSquare, Clock, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { contentApi, notificationApi } from "@/lib/api";
import { Card, Button, Input, Select, Textarea } from "@/components/ui";

const DEFAULTS = {
  email:   "support@edulearn.app",
  phone:   "+91 98765 43210",
  address: "",
  hours:   "Mon–Sat, 9:00 AM – 7:00 PM IST",
};

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const { data: cms } = useQuery({
    queryKey: ["cms", "contact"],
    queryFn: () => contentApi.infoPage("contact").then(r => r.data).catch(() => null),
    staleTime: 10 * 60 * 1000,
  });

  const info = { ...DEFAULTS, ...(cms?.data ?? {}) };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await notificationApi.submitContactMessage(form);
      setSent(true);
    } catch {
      toast.error("Could not send your message. Please try again or email us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEOHead
        title="Contact Us — EduLearn Support"
        description="Get in touch with the EduLearn team. We're here to help with questions about courses, pricing, technical issues, or partnerships."
        canonical="/contact"
      />

      <div className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Get in touch</h1>
          <p className="text-primary-100 text-lg">We typically reply within 24 hours on school days.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumb items={[{ label: "Contact", href: "/contact" }]} />

        <div className="mt-8 grid md:grid-cols-3 gap-8">
          {/* Info column */}
          <div className="space-y-6">
            <Card>
              <div className="w-10 h-10 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl flex items-center justify-center mb-3">
                <Mail className="w-5 h-5" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white mb-1">Email support</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{info.email}</p>
            </Card>
            <Card>
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl flex items-center justify-center mb-3">
                <Clock className="w-5 h-5" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white mb-1">Response time</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{info.hours}</p>
            </Card>
            <Card>
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white mb-1">Quick answers</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Check our FAQ first — most questions are answered there.</p>
              <Link to="/faq" className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline">Browse FAQ →</Link>
            </Card>
          </div>

          {/* Form column */}
          <div className="md:col-span-2">
            {sent ? (
              <Card className="p-10 text-center">
                <div className="w-16 h-16 bg-success-100 dark:bg-success-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-success-600 dark:text-success-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Message sent!</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">We'll get back to you within 24 hours. Check your email for a confirmation.</p>
              </Card>
            ) : (
              <form onSubmit={handleSubmit} className="card space-y-5">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Send us a message</h2>
                <div className="grid sm:grid-cols-2 gap-5">
                  <Input
                    label="Your name"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    placeholder="Rahul Sharma"
                  />
                  <Input
                    label="Email address"
                    required
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({...f, email: e.target.value}))}
                    placeholder="rahul@example.com"
                  />
                </div>
                <Select
                  label="Subject"
                  required
                  value={form.subject}
                  onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                >
                  <option value="">Select a topic</option>
                  <option>Technical issue</option>
                  <option>Billing or pricing</option>
                  <option>Content question</option>
                  <option>Account help</option>
                  <option>Partnership / B2B inquiry</option>
                  <option>Other</option>
                </Select>
                <Textarea
                  label="Message"
                  required
                  rows={5}
                  value={form.message}
                  onChange={e => setForm(f => ({...f, message: e.target.value}))}
                  className="resize-none"
                  placeholder="Describe your question or issue in detail..."
                />
                <Button type="submit" variant="primary" fullWidth size="lg" disabled={submitting}>
                  {submitting ? "Sending…" : "Send message"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
