// ─── Shared UI / Domain Constants ────────────────────────────────────────────
//
// These values mirror backend enums / accepted field values.
// Update here when the backend model changes; no frontend deploy needed for
// purely cosmetic label changes.

import { Layers, FileText, BookOpen } from "lucide-react";

// ─── Previous Year Papers ─────────────────────────────────────────────────────

/** Mirrors DifficultyLevel enum in content_service/app/models/content.py */
export const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: "easy",   label: "Easy"   },
  { value: "medium", label: "Medium" },
  { value: "hard",   label: "Hard"   },
];

/** Accepted exam_type values for PreviousYearPaper model (string field, not enum) */
export const EXAM_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "board",       label: "Board Exam"   },
  { value: "midterm",     label: "Midterm"      },
  { value: "annual",      label: "Annual"       },
  { value: "unit_test",   label: "Unit Test"    },
  { value: "sample",      label: "Sample Paper" },
];

// ─── Admin Content Panel Tabs ─────────────────────────────────────────────────

/** Top-level navigation tabs for AdminContentPanel */
export const ADMIN_CONTENT_TABS = [
  { id: "hierarchy" as const, label: "Content Hierarchy",    icon: Layers   },
  { id: "pyps"      as const, label: "Previous Year Papers", icon: FileText },
  { id: "hub"       as const, label: "Knowledge Hub",        icon: BookOpen },
];

export type AdminContentTabId = typeof ADMIN_CONTENT_TABS[number]["id"];

// ─── Table Column Headers ─────────────────────────────────────────────────────

/** Column headers for the Previous Year Papers table */
export const PYP_TABLE_HEADERS = [
  "Title", "Board", "Class", "Subject", "Year", "Exam Type", "Difficulty", "Actions",
] as const;

/** Column headers for the Knowledge Hub Categories table */
export const HUB_CATEGORY_TABLE_HEADERS = [
  "Name", "Description", "Actions",
] as const;

/** Column headers for the Knowledge Hub Articles table */
export const HUB_ARTICLE_TABLE_HEADERS = [
  "Title", "Category", "Duration", "Trending", "Actions",
] as const;
