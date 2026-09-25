import { Card, CardHeader, CardTitle, Badge, Avatar, Button } from "@/components/ui";
import { MessageSquare, CalendarClock, Video, Check, X } from "lucide-react";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real parent-messaging and
 * meeting-scheduling feature is built. */
const PARENT_MESSAGES = [
  { id: "1", parent: "Priya Patel's Parent", preview: "Thank you for the update on Priya's progress.", time: "1h ago", unread: false },
  { id: "2", parent: "Rohan Gupta's Parent", preview: "Could we schedule a call to discuss Rohan's recent scores?", time: "5h ago", unread: true },
  { id: "3", parent: "Vikram Rao's Parent", preview: "Is there extra practice material for weak topics?", time: "1d ago", unread: true },
];

const MEETING_REQUESTS = [
  { id: "1", parent: "Rohan Gupta's Parent", topic: "Discuss recent quiz performance", requestedFor: "Sat, 11:00 AM" },
  { id: "2", parent: "Meera Joshi's Parent", topic: "Progress review meeting", requestedFor: "Mon, 4:00 PM" },
];

export default function ParentConnectSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Coming Soon</Badge>
        <p className="text-sm text-gray-500 dark:text-gray-400">Preview of parent messaging & meeting requests — not yet functional</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4 text-emerald-500" /> Parent Messages
            </CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {PARENT_MESSAGES.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <Avatar name={m.parent} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.parent}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{m.time}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.preview}</p>
                </div>
                {m.unread && <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="w-4 h-4 text-indigo-500" /> Meeting Requests
            </CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {MEETING_REQUESTS.map((m) => (
              <div key={m.id} className="p-3 rounded-xl border border-gray-100 dark:border-gray-700 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{m.parent}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{m.topic}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Video className="w-3 h-3" /> Requested: {m.requestedFor}
                  </span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" disabled>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
