import { useQuery } from "@tanstack/react-query";
import { contentApi } from "@/lib/api";

const DEFAULT_FOOTER = "© 2026 Your Platform. All rights reserved. Built for the future of learning.";

export default function SiteFooter() {
  const { data } = useQuery({
    queryKey: ["info-page", "footer"],
    queryFn: () => contentApi.infoPage("footer").then((r) => r.data).catch(() => null),
    staleTime: 10 * 60 * 1000,
  });
  const line = (data as any)?.content?.trim() || DEFAULT_FOOTER;

  return (
    <footer className="mt-10 border-t border-gray-100 dark:border-gray-800 pt-6 pb-4">
      <p className="text-center text-xs text-gray-400 dark:text-gray-500">{line}</p>
    </footer>
  );
}
