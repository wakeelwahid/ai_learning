export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  category: string;
  author: string;
  authorRole: string;
  date: string;           // ISO
  readTime: number;       // minutes
  tags: string[];
  coverColor: string;     // tailwind gradient for placeholder cover
  excerpt: string;
  content: Section[];
}

export interface Section {
  heading?: string;
  body?: string;
  list?: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-score-95-cbse-class-10-board-exams-2025",
    title: "How to Score 95%+ in CBSE Class 10 Board Exams 2025",
    description: "A complete, chapter-wise action plan to help Class 10 students score above 95% in CBSE boards — covering schedule, NCERT mastery, and last-minute revision.",
    category: "Exam Strategy",
    author: "EduLearn Team",
    authorRole: "Academic Experts",
    date: "2026-01-10",
    readTime: 8,
    tags: ["CBSE", "Class 10", "Board Exams", "Study Tips", "NCERT"],
    coverColor: "from-indigo-500 to-purple-600",
    excerpt: "Scoring 95%+ in CBSE Class 10 boards is achievable with the right strategy. Here's a proven, step-by-step plan that top scorers follow.",
    content: [
      {
        heading: "Why Class 10 Boards Matter More Than Ever",
        body: "Class 10 board results influence stream selection, scholarship eligibility, and early college shortlisting. A score above 95% opens doors to science and commerce streams in the best schools. The good news: CBSE rewards students who understand concepts over those who rote-memorize."
      },
      {
        heading: "Step 1 — Master the NCERT Textbooks First",
        body: "CBSE sets 80–85% of board questions directly from NCERT textbooks. Students who read every line, solve every example, and attempt every exercise question before turning to guides consistently outscore those who skip to reference books.",
        list: [
          "Read each chapter twice — once for understanding, once for retention",
          "Solve all in-text questions immediately after reading the section",
          "Mark every bold term and definition — these are high-yield",
          "Do all chapter-end exercises, even the 'optional' ones"
        ]
      },
      {
        heading: "Step 2 — Build a 4-Month Study Schedule",
        body: "Starting in November for March boards gives you 16 weeks. Allocate them like this:",
        list: [
          "Weeks 1–8: Complete all chapters with NCERT (2 subjects per day, rotating)",
          "Weeks 9–11: First revision pass — topic-wise notes and formula sheets",
          "Weeks 12–14: Previous year papers (2013–2024) under timed conditions",
          "Weeks 15–16: Weak areas only, sample papers, and final formula revision"
        ]
      },
      {
        heading: "Step 3 — Practice Previous Year Papers Religiously",
        body: "CBSE repeats question patterns. Students who solve 10+ years of previous year papers identify recurring question types, weightage distribution, and common mistakes. Aim to solve one full paper every weekend from January onwards, strictly within 3 hours."
      },
      {
        heading: "Step 4 — Use the EduLearn AI Tutor for Weak Topics",
        body: "When you're stuck on a concept — trigonometric identities, balancing chemical equations, or heredity problems — an AI tutor gives you instant, personalized explanations without waiting for your teacher. Use it to ask 'why' questions, not just 'what' questions. Understanding the reasoning behind a formula helps you handle twisted questions in the exam."
      },
      {
        heading: "Step 5 — Answer Writing is a Skill",
        body: "Marks are often lost not because students don't know the answer, but because they don't write it properly.",
        list: [
          "Start every answer with a direct one-line statement",
          "Use diagrams wherever applicable — they fetch guaranteed marks in Science",
          "Underline key terms the examiner looks for",
          "For Maths, show all steps even if you know the shortcut",
          "In English, write clearly and avoid cutting — a clean paper influences mood"
        ]
      },
      {
        heading: "Final Week Strategy",
        body: "The last week is not for learning new things. It's for consolidation. Sleep 7–8 hours, revise your personal formula sheet daily, and attempt one sample paper per day. On exam day, read the question paper for the full 15-minute reading time before writing anything."
      }
    ]
  },

  {
    slug: "ncert-mathematics-class-12-complete-strategy",
    title: "NCERT Mathematics Class 12: Complete Chapter-Wise Strategy",
    description: "Master Class 12 NCERT Mathematics with our chapter-wise weightage breakdown, key formulas to memorize, and the most common board question patterns.",
    category: "Subject Guide",
    author: "EduLearn Team",
    authorRole: "Mathematics Faculty",
    date: "2026-01-18",
    readTime: 10,
    tags: ["Class 12", "Mathematics", "NCERT", "CBSE", "Board Exams"],
    coverColor: "from-blue-500 to-cyan-500",
    excerpt: "Class 12 Mathematics frightens many students, but its board questions follow predictable patterns. Here's exactly what to study and how much time to spend on each chapter.",
    content: [
      {
        heading: "Understanding CBSE Class 12 Maths Weightage",
        body: "The total marks for Class 12 Maths is 80 (theory) + 20 (internal). The theory paper is divided into six units with fixed marks allocation:",
        list: [
          "Relations and Functions — 8 marks",
          "Algebra (Matrices + Determinants) — 10 marks",
          "Calculus (largest unit) — 35 marks",
          "Vectors and 3D Geometry — 14 marks",
          "Linear Programming — 5 marks",
          "Probability — 8 marks"
        ]
      },
      {
        heading: "Calculus: The 35-Mark Giant",
        body: "More than 43% of the paper comes from Calculus alone. Within calculus, focus on: Continuity & Differentiability (derivatives of composite, implicit, logarithmic functions), Applications of Derivatives (increasing/decreasing, maxima/minima), Integrals (integration by parts, special integrals), Applications of Integrals (area between curves), and Differential Equations (separable variables, linear DEs). Spend at least 40% of your study time on Calculus."
      },
      {
        heading: "Vectors & 3D Geometry: High Return on Effort",
        body: "14 marks from Vectors and 3D together, with very predictable question types. Master dot product, cross product, section formula, equation of a line in vector form, angle between two lines/planes, and distance of a point from a plane. These follow fixed templates — once you know the template, you can solve any variant."
      },
      {
        heading: "Matrices and Determinants: Don't Skip Elementary Operations",
        body: "Students often lose 4–6 marks in Matrices by skipping the properties of determinants. Practice inverse of a matrix using elementary row operations, and solve at least 20 system-of-equations problems using matrix method."
      },
      {
        heading: "Probability: Conditional and Bayes' Theorem",
        body: "The 8-mark Probability section always includes one Conditional Probability question and one Bayes' Theorem problem. These are formula-driven and highly scoring once you understand the setup. Practice problems with urns, cards, and defective items — these are the standard setups CBSE uses."
      },
      {
        heading: "Key Study Habits for Maths",
        list: [
          "Maintain a separate formula register — write every formula by hand, don't type",
          "Solve each NCERT exercise question, including 'Miscellaneous' sections",
          "For Integration, practice daily — speed comes only from repetition",
          "After learning a chapter, immediately do 5 previous year questions from that chapter",
          "Time yourself: 80 marks in 180 minutes means 2.25 minutes per mark"
        ]
      }
    ]
  },

  {
    slug: "ai-tutor-vs-traditional-tuition-cbse-students",
    title: "AI Tutor vs Traditional Tuitions: What Works Better for CBSE Students?",
    description: "An honest comparison of AI-powered tutoring and traditional private tuitions for Indian students — covering cost, effectiveness, accessibility, and results.",
    category: "EdTech Insights",
    author: "EduLearn Team",
    authorRole: "Research & Academics",
    date: "2026-02-03",
    readTime: 7,
    tags: ["AI Tutoring", "EdTech", "CBSE", "Tuitions", "Online Learning"],
    coverColor: "from-violet-500 to-pink-500",
    excerpt: "Millions of Indian students spend ₹3,000–₹15,000/month on private tuitions. Could an AI tutor deliver better results at a fraction of the cost?",
    content: [
      {
        heading: "The State of Private Tuitions in India",
        body: "India's private tutoring market is worth over ₹5 lakh crore. More than 70% of urban Class 9–12 students attend private tuitions in addition to school. Despite this massive spend, nearly 30% of Class 10 students score below 60% in board exams. Something in the equation isn't working."
      },
      {
        heading: "What Traditional Tuitions Do Well",
        body: "A good tuition teacher provides structured accountability, real-time doubt clearing, mentorship, and peer learning. The human relationship matters — a teacher who knows a student's weaknesses can target them. For students who need social learning environments or strict external discipline, traditional tuitions still deliver."
      },
      {
        heading: "Where Traditional Tuitions Fall Short",
        list: [
          "Fixed batch timing doesn't accommodate individual pace",
          "One teacher explaining to 20–30 students means personalization is limited",
          "Costly: ₹3,000–₹15,000/month for a single subject",
          "Doubt at 11 PM before an exam? Your tutor isn't available",
          "Quality is inconsistent — highly dependent on the individual teacher"
        ]
      },
      {
        heading: "What AI Tutors Do Exceptionally Well",
        body: "AI tutors like EduLearn's built-in assistant are available 24/7, never frustrated, and endlessly patient. They adapt to your level instantly — if you're struggling with simultaneous equations, the AI adjusts its explanation style until you understand. More importantly, they can identify patterns across thousands of students to tell you exactly which type of question you're likely to get wrong."
      },
      {
        heading: "The Honest Limitations of AI Tutoring",
        list: [
          "Cannot replace the motivational relationship with a great human teacher",
          "Doesn't proactively schedule your revision — you need self-discipline",
          "Can't verify handwritten exam techniques (though screen-sharing helps)",
          "Less effective for students who need real-time spoken explanation in their regional dialect"
        ]
      },
      {
        heading: "The Best Model: AI + Structured Self-Study",
        body: "Top-scoring students use AI tools not as a replacement for school, but as an on-demand resource. They watch concept videos when they first learn a topic, use the AI tutor to ask follow-up questions, take adaptive quizzes to test retention, and consult their school teacher only for doubts the AI couldn't resolve. This hybrid approach costs less than a single subject tuition while delivering better outcomes."
      },
      {
        heading: "The Verdict",
        body: "For Class 6–10, a good AI platform is a credible alternative to most private tuitions. For Class 11–12 and competitive exam prep (JEE/NEET), the ideal is an AI platform for concept clarity and practice, combined with a subject expert for mentorship and strategy. The era where a single tuition teacher is both affordable and highly effective is narrowing fast."
      }
    ]
  },

  {
    slug: "jee-neet-study-plan-2025",
    title: "Complete 12-Month Study Plan for JEE & NEET 2025–26 Aspirants",
    description: "A month-by-month, subject-wise JEE and NEET preparation strategy for Class 11 and 12 students — covering syllabus, mock tests, and revision cycles.",
    category: "Competitive Exams",
    author: "EduLearn Team",
    authorRole: "IIT Alumni & Medical Faculty",
    date: "2026-02-15",
    readTime: 12,
    tags: ["JEE", "NEET", "Competitive Exams", "Class 11", "Class 12", "Study Plan"],
    coverColor: "from-orange-500 to-red-500",
    excerpt: "Cracking JEE or NEET requires a 12-month roadmap, not last-minute cramming. Here's the complete month-by-month plan that successful aspirants follow.",
    content: [
      {
        heading: "Why Most JEE/NEET Aspirants Fail",
        body: "Most students who don't crack JEE or NEET do not fail due to intelligence — they fail due to poor time allocation, ignoring NCERT, and starting mock tests too late. The students who crack it start with a clear roadmap and stick to it with discipline."
      },
      {
        heading: "Phase 1 (Class 11): Foundation Building (June–March)",
        body: "Class 11 concepts form 45–50% of both JEE and NEET papers. Students who treat Class 11 seriously have a massive advantage.",
        list: [
          "Physics: Mechanics, Thermodynamics, Waves & Oscillations",
          "Chemistry: Basic concepts, Chemical bonding, Equilibrium, Organic chemistry basics",
          "Maths (JEE): Sets, Relations, Trigonometry, Coordinate Geometry, Limits",
          "Biology (NEET): Cell biology, Plant physiology, Human physiology basics",
          "Weekly: 1 chapter test per subject, review mistakes same day"
        ]
      },
      {
        heading: "Phase 2 (Class 12 + Revision): April–December",
        body: "Now you're covering Class 12 content while simultaneously revising Class 11. This is the most intense period.",
        list: [
          "Start one full mock test every two weeks from July",
          "Increase to one mock per week from October",
          "Maintain an error log — every wrong answer is a lesson",
          "Don't start new topics after December — only revision"
        ]
      },
      {
        heading: "The NCERT Rule for NEET",
        body: "NEET is 90%+ NCERT-based. Students who've read NCERT Biology, Chemistry, and Physics line by line — including examples, diagrams, and footnotes — consistently score 600+. Many coaching institutes teach concepts well but neglect the exact NCERT language NEET questions use. Combine coaching with thorough NCERT reading."
      },
      {
        heading: "Mock Tests: The Single Most Effective Tool",
        body: "Research shows students who take 30+ full mock tests before JEE/NEET outperform those who only study theory by a significant margin. Mocks build exam temperament, improve time management, and expose gaps in understanding that chapter tests miss. Take every mock under exact exam conditions — timed, no breaks, no phone."
      },
      {
        heading: "Mental Health & Consistency",
        body: "JEE/NEET preparation is a marathon. Students who study 10 hours today and 0 hours tomorrow consistently underperform compared to those who study 6 consistent hours daily. Build a sustainable schedule. Exercise 30 minutes daily, sleep 7–8 hours, and take one half-day off per week. Burnout is the most common reason capable students don't crack these exams."
      }
    ]
  },

  {
    slug: "time-management-tips-board-exam-preparation",
    title: "10 Time Management Tips Every Student Needs Before Board Exams",
    description: "Practical, science-backed time management strategies for Class 10 and Class 12 students preparing for board exams — including scheduling, focus techniques, and avoiding burnout.",
    category: "Study Skills",
    author: "EduLearn Team",
    authorRole: "Academic Counselors",
    date: "2026-03-01",
    readTime: 6,
    tags: ["Time Management", "Board Exams", "Study Tips", "Productivity", "Students"],
    coverColor: "from-emerald-500 to-teal-500",
    excerpt: "Most students don't fail exams because they don't know the content — they fail because they run out of time. These 10 strategies fix that.",
    content: [
      {
        heading: "Why Time Is the Real Exam Challenge",
        body: "CBSE board papers are designed to be challenging to complete in 3 hours. Roughly 30% of students who know all the answers still score below their potential because they don't finish. Time management isn't just a study skill — it's an exam skill."
      },
      {
        heading: "The 10 Essential Tips",
        list: [
          "Plan weekly, not daily. Create a weekly timetable every Sunday night and protect it.",
          "Use the 2-minute rule: if a task takes less than 2 minutes, do it immediately.",
          "Study your hardest subject in your peak energy window (usually morning for most students).",
          "Use Pomodoro: 25 minutes focused study, 5-minute break, repeat 4 times, then take 20 minutes.",
          "Keep your phone in a different room during study sessions — every notification breaks your flow.",
          "Track time spent per subject each week to spot imbalances before they become crises.",
          "Set exam-day deadlines during practice: allocate 2.25 minutes per mark and stick to it.",
          "Batch similar tasks: do all reading in one block, all problem-solving in another.",
          "Prioritize by marks, not comfort: study high-weightage chapters more, not the ones you already know.",
          "End each study session by writing 3 things you learned — this forces processing and cuts review time."
        ]
      },
      {
        heading: "The 80/20 Rule Applied to Board Exams",
        body: "80% of exam marks come from 20% of the syllabus. In CBSE boards, this means: NCERT examples, chapter-end exercises, and previous year question patterns. Students who identify and master these high-yield areas consistently outperform those who try to cover every corner of the syllabus equally."
      },
      {
        heading: "Handling Distractions in the Digital Age",
        body: "The average student checks their phone 96 times per day. In a 6-hour study session, that's one distraction every 3.75 minutes. Use apps like Forest (mobile focus app), schedule social media to exactly one 30-minute window per day, and tell family members your study hours so they avoid interrupting."
      }
    ]
  },

  {
    slug: "spaced-repetition-active-recall-double-your-score",
    title: "How Spaced Repetition & Active Recall Can Double Your Exam Scores",
    description: "Learn how the two most evidence-backed study techniques — spaced repetition and active recall — work, and how to apply them for CBSE and competitive exam preparation.",
    category: "Study Science",
    author: "EduLearn Team",
    authorRole: "Learning Science Team",
    date: "2026-03-20",
    readTime: 9,
    tags: ["Study Techniques", "Spaced Repetition", "Active Recall", "Memory", "Exam Prep"],
    coverColor: "from-pink-500 to-rose-500",
    excerpt: "Most students study by re-reading notes. Science says this is one of the least effective study methods. Here's what actually works.",
    content: [
      {
        heading: "The Problem with Re-Reading",
        body: "Re-reading creates an illusion of knowing. You recognize the material because you've seen it before, but recognition ≠ recall. In an exam, no one shows you the answer — you have to retrieve it from memory. Most students discover this gap too late."
      },
      {
        heading: "What Is Spaced Repetition?",
        body: "Spaced repetition is a scheduling technique that shows you information at increasing intervals — right before you're about to forget it. Instead of studying Chapter 1 on Day 1 and never revisiting, you study it on Day 1, review on Day 3, again on Day 7, then Day 21. This exploits the 'spacing effect' — one of the most robust findings in cognitive psychology. Retention after spaced practice is 200–300% higher than massed practice."
      },
      {
        heading: "What Is Active Recall?",
        body: "Active recall means forcing your brain to retrieve information from scratch, rather than passively reading it. Techniques include: closing your book and writing everything you remember about a chapter, covering the right side of your notes and testing yourself on definitions, using flashcards (physical or digital), or answering past paper questions without looking at your notes first."
      },
      {
        heading: "How to Apply These to CBSE/NCERT Preparation",
        list: [
          "After reading a chapter, close the book and write a 'brain dump' of everything you remember",
          "Use EduLearn's quiz feature immediately after watching a video lesson — this is active recall in action",
          "Schedule 10-minute 'recall sessions' for each chapter 3 days after first study, then 1 week later",
          "For formulas: write them from memory each morning before the day's study begins",
          "For definitions: use the say-it-out-loud method — verbalizing activates more memory pathways"
        ]
      },
      {
        heading: "The Combination Effect",
        body: "The real power comes from combining both techniques. After your first study session (active recall), schedule a review for 3 days later. In that review, don't re-read — only test yourself. Schedule the next review for 7 days later. This way, you spend less total time studying but remember exponentially more. Students who use both techniques typically outperform peers who spend 50% more total study hours using passive re-reading."
      },
      {
        heading: "Tools to Help",
        list: [
          "EduLearn's adaptive quiz engine — automatically schedules practice on topics you're weakest on",
          "Anki (free app) — digital flashcards with built-in spaced repetition algorithm",
          "Physical index cards for formulas and definitions",
          "The 'Cornell Notes' method — divides your page into cues and summary for self-testing",
          "Past year papers — the ultimate active recall tool"
        ]
      }
    ]
  }
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find(p => p.slug === slug);
}
