import { Card, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { Sparkles, Lightbulb, FileBarChart, Send, Bot } from "lucide-react";

/** STATIC PREVIEW — no backend yet. Every value here is a fixed mock so the
 * layout/flow can be reviewed before the real AI classroom-insights and
 * weekly-report-generation feature is built. */
const INSIGHTS = [
  "12 students in Class 10-A are weak in Trigonometry — consider a revision session before Friday's test.",
  "Quiz completion rate dropped 15% this week compared to last week.",
  "Rohan Gupta's engagement has declined for 4 consecutive days — may need a check-in.",
];

const SUGGESTIONS = [
  { title: "Assign: Trigonometry Revision Pack", reason: "Based on class-wide weak-topic pattern" },
  { title: "Assign: Quick Recall Quiz — Cell Biology", reason: "Reinforces last week's low-scoring topic" },
];

export default function AITeachingAssistantSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Coming Soon</Badge>
        <p className="text-sm text-gray-500 dark:text-gray-400">Preview of AI-powered classroom insights — not yet functional</p>
      </div>

      <Card className="bg-gradient-to-br from-indigo-500 to-primary-600 border-none text-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Ask your AI Teaching Assistant</p>
            <p className="text-xs text-white/80 mt-0.5">"Which students need a Trigonometry refresher?"</p>
          </div>
          <Button variant="secondary" disabled className="flex-shrink-0 !bg-white/20 !text-white">
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-amber-500" /> Classroom Insights
          </CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {INSIGHTS.map((insight, i) => (
            <div key={i} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{insight}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="w-4 h-4 text-indigo-500" /> Smart Assignment Suggestions
          </CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {SUGGESTIONS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.title}</p>
                <p className="text-xs text-gray-400 truncate">{s.reason}</p>
              </div>
              <Button size="sm" variant="secondary" disabled className="flex-shrink-0">Use</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileBarChart className="w-4 h-4 text-emerald-500" /> Weekly Report & Parent Digest
          </CardTitle>
        </CardHeader>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Generate an AI-written weekly summary of your classroom's performance, ready to share with parents.
        </p>
        <Button variant="primary" disabled className="mt-3">
          <FileBarChart className="w-4 h-4" /> Generate Weekly Report
        </Button>
      </Card>
    </div>
  );
}
