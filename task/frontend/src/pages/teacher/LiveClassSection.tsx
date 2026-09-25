import { Card, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { Video, Calendar, Play, Clock, Users, Radio } from "lucide-react";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real live-class feature (scheduling,
 * a video-conferencing integration, attendance) is built. */
const UPCOMING_CLASSES = [
  { id: "1", title: "Quadratic Equations — Live Doubt Session", subject: "Mathematics", time: "Today, 4:00 PM", students: 32 },
  { id: "2", title: "Photosynthesis Deep Dive", subject: "Biology", time: "Tomorrow, 11:00 AM", students: 28 },
  { id: "3", title: "Weekly Revision — Algebra", subject: "Mathematics", time: "Fri, 3:30 PM", students: 32 },
];

const PAST_RECORDINGS = [
  { id: "1", title: "Trigonometry Basics", date: "2 days ago", duration: "42 min", views: 27 },
  { id: "2", title: "Cell Structure & Function", date: "5 days ago", duration: "38 min", views: 25 },
];

export default function LiveClassSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="warning">Coming Soon</Badge>
          <p className="text-sm text-gray-500 dark:text-gray-400">Preview of the upcoming Live Class feature — not yet functional</p>
        </div>
        <Button variant="primary" disabled>
          <Calendar className="w-4 h-4" /> Schedule a Class
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="w-4 h-4 text-danger-500" /> Upcoming Classes
          </CardTitle>
        </CardHeader>
        <div className="space-y-3">
          {UPCOMING_CLASSES.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <Video className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.title}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    <span>{c.subject}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {c.time}</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.students} students</span>
                  </div>
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled className="flex-shrink-0">
                <Play className="w-3.5 h-3.5" /> Start
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="w-4 h-4 text-gray-400" /> Past Recordings
          </CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {PAST_RECORDINGS.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{r.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{r.date} · {r.duration} · {r.views} views</p>
              </div>
              <Button size="sm" variant="ghost" disabled className="flex-shrink-0">
                <Play className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
