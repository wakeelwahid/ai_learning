import { Card, CardHeader, CardTitle, Badge, Button, Textarea } from "@/components/ui";
import { Megaphone, Send } from "lucide-react";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real class-broadcast feature is
 * built. Parent-facing messages/meetings live in the separate Parent
 * Connect tab. */
const RECENT_ANNOUNCEMENTS = [
  { id: "1", text: "Reminder: Unit test on Chapter 5 this Friday. Please revise thoroughly.", time: "2 hours ago" },
  { id: "2", text: "Great performance on the last quiz, class! Keep it up.", time: "Yesterday" },
];

export default function AnnouncementsSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Coming Soon</Badge>
        <p className="text-sm text-gray-500 dark:text-gray-400">Preview of class broadcasts — not yet functional</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-4 h-4 text-indigo-500" /> Class Announcements
          </CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <Textarea placeholder="Write an announcement to your class..." rows={3} disabled />
          <Button variant="primary" disabled className="w-full sm:w-auto">
            <Send className="w-4 h-4" /> Send to Class
          </Button>
          <div className="pt-2 space-y-2">
            {RECENT_ANNOUNCEMENTS.map((a) => (
              <div key={a.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-sm">
                <p className="text-gray-700 dark:text-gray-300">{a.text}</p>
                <p className="text-xs text-gray-400 mt-1">{a.time}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
