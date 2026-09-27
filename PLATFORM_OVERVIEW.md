# EduLearn — Complete Platform Overview

This is the single consolidated reference for the EduLearn platform: what it does, how every role uses it, and how the business logic actually works end to end across the backend, the web frontend, the mobile app, and the admin panel. Every claim in this document is grounded in the current source code — it replaces the previously separate `backend.md`, `mobile.md`, `requirements.md`, and `production-readiness.md`, several of which had drifted out of date as the code evolved.

---

## 1. What EduLearn Is

EduLearn is an online learning platform for school students in India (CBSE, ICSE, and state boards), built around one idea: a student should be able to learn a chapter, prove they learned it, and be rewarded for it — while their parent can see it happening.

A student picks their board and class once, and from that moment the entire product personalises around them: the curriculum tree, the videos recommended on their dashboard, the quizzes that unlock, the papers they can practise, and the AI tutor's answers are all scoped to their syllabus. Learning is structured as a chain — watch the video, unlock the notes, complete the exercise, take the quiz, complete the chapter, earn a certificate — and every step is verified by the platform from real activity, not taken on trust from the client app.

Around that learning spine sit three things that make the platform sticky and commercially viable:

1. **Gamification** — XP, levels, EduPoints (a spendable currency), streaks, badges, daily goals, multi-day challenge programs, and live multiplayer quiz battles.
2. **Parent involvement** — a parent links to their child's account (with the child's consent), then monitors progress, sets study-time limits, messages the child, approves purchases, requests meetings, and asks an AI assistant plain-language questions about how their child is doing.
3. **AI** — a syllabus-grounded study tutor for students, an AI assistant for parents grounded in their own child's real records, AI-generated practice papers and question banks, and AI-assisted mistake analysis, flashcards, and revision plans.

The platform monetises through subscription plans (with coupons, parent-paid billing, and referral rewards) via Cashfree, and is operated day to day by an internal admin team through a dedicated admin panel.

---

## 2. Who Uses It

### Student
The primary user. Signs up with a phone number and a one-time SMS password, picks "Student", completes a profile with board and class, and gets the full learning product: curriculum, videos, notes, exercises, quizzes, previous-year papers, AI-generated papers, the AI study tutor, battles, leaderboards, gamification, career exploration, chat, and their own subscription.

Key rules:
- Board and class are mandatory before the personalised catalog becomes available. A student may change curriculum twice; after the second change it locks for 90 days.
- A student can only ever see and act on their own data. Quiz scores are always computed server-side — anything the client submits as a score or correctness flag is discarded and recomputed.
- The student is the only one who can approve a parent's link request (an admin can also approve on the student's behalf).
- **Role choice is server-enforced and permanent.** `PATCH /auth/role` hard-rejects the call once a role is already set (`services/auth_service/app/routes/account.py`) — this used to be settable as a query parameter on the OTP-verify call itself, which let a brand-new user commit to a role before making any real choice; that has since been fixed so the choice is a genuinely separate, deliberate step.

### Parent
Signs up the same way and picks "Parent". A parent's account is empty until they link to at least one child (by entering the child's raw UUID — there is no invite link or QR code flow). Every parent capability requires an **approved** link; a pending link grants nothing anywhere in the platform.

Once approved, a parent gets: a per-child monitoring dashboard, an AI chat about that child, read-only (and audit-logged) visibility into the child's chat rooms, study-time limit controls, direct messaging with the child, purchase-approval powers, meeting requests, and the ability to pay for the child's subscription.

A parent may link up to 7 children (server-enforced cap). If a student declines a link request, the parent is blocked from re-requesting for 3 days (30 days after 3+ declines) — a real anti-harassment cooldown, not just a UI nicety.

### Teacher
An authoring role with a real, working backend but almost no working frontend today. `require_teacher`-gated endpoints genuinely exist and are enforced — quiz/question authoring (`quiz_service`), exercise/practice-question/previous-year-paper authoring (`content_service`) — but **Knowledge Hub content creation is admin-only**, not teacher-accessible, despite being adjacent content.

On both web and mobile, the only teacher-facing screen is a single dashboard (`/teacher/dashboard` on web; the "Cohort" tab on mobile) with roughly 8–9 tabs. Exactly **one tab is real** — cohort analytics, showing an anonymised board+class aggregate (active students, videos watched, quizzes completed, average score, weak topics) via `analytics_service`'s `teacher/cohort` endpoint. Every other tab (My Students/roster, Attendance, Assignments, Live Class, Announcements, Parent Connect, Student Support, AI Teaching Assistant) is **explicit, honestly-labelled static mock UI** — every one of those files carries a code comment stating outright *"STATIC PREVIEW — no backend yet. Every value here is a fixed mock."* — with disabled buttons and a visible "Coming Soon" badge. There is deliberately no teacher→student roster or classroom-assignment system in the platform today; a teacher only ever sees an anonymous cohort aggregate. This is a known, intentionally-scoped gap, not a bug — but it means teacher authoring (quiz/PYP creation) in practice happens through the admin panel, since there's no dedicated teacher authoring UI on web or mobile either.

### Admin / Super Admin
Internal staff who run the platform from a separate admin web application, logging in with email and password (never OTP). Admins hold every management capability: users, curriculum, quizzes, assignments, papers, Knowledge Hub, plans, coupons, payments, gamification configuration, challenge programs, AI ingestion and generation, careers and opportunities, broadcasts, announcements, maintenance mode, meeting requests, moderation, and platform analytics.

**Admin vs. Super Admin: no functional distinction exists anywhere in the admin UI.** Both roles pass the exact same login gate and see the identical sidebar and identical page actions; the role is shown only as a cosmetic badge. If any super-admin-only restriction exists, it is enforced purely server-side and invisibly to this UI — nothing in the admin panel conditionally hides or disables anything based on which of the two roles is signed in.

**A real, low-severity risk worth knowing about:** the Users page lets any admin (or super_admin) promote any other user straight to `admin` via a plain dropdown + Save, with **no confirmation dialog and no check of the acting user's own role**. `super_admin` itself cannot be granted through this UI (it's absent from the assignable list), so the blast radius is capped at "any admin can mint more admins" — but that action itself has zero friction today.

### The pending state
Between "verified a phone number" and "chose a role" there is a real intermediate account state (`role = PENDING`). An account in this state can do exactly two things: choose its role, and complete its profile. It cannot reach any student, parent, teacher, or admin feature.

---

## 3. Architecture

EduLearn runs as **12 independent backend microservices** behind a single public API gateway, with three client applications: a combined student/parent web app, a separate admin web app, and an Expo/React Native mobile app for students and parents (no mobile admin experience exists).

| Service | What it owns |
|---|---|
| **auth_service** | Identity for the whole platform: phone-OTP login/signup, admin password login, Google OAuth, JWT issuance/refresh/blacklisting, device sessions, the one-time role choice, account lifecycle. |
| **user_service** | Profiles, the parent–child relationship and its consent flow, study-time limits, purchase-approval requests, meeting requests, friend requests, and the full real-time chat system (DMs, groups, presence, reactions, parent chat monitoring). |
| **content_service** | The curriculum tree (boards → classes → subjects → chapters → topics → exercises → questions → videos/notes), watch progress, completion state, bookmarks, assignments, certificates, previous-year papers, and the Knowledge Hub. |
| **quiz_service** | Quiz/question definitions, the full attempt lifecycle (start/answer/pause/resume/submit), server-side grading, weak-topic detection, leaderboards. |
| **battle_service** | Real-time multiplayer/solo quiz battles over a websocket, spectating, replays, rematches, XP-staked friend challenges. |
| **gamification_service** | The engagement engine: XP/levels, EduPoints/shop, streaks/freezes, badges, activity feed, daily rewards, daily goals, daily challenges, multi-day challenge programs, leaderboards, feature-usage quota enforcement. |
| **payment_service** | Plans, Cashfree checkout/verification/webhooks, coupons, subscriptions, parent-pays-for-child billing, the purchase-approval gate — the single authority on who is a paying subscriber. |
| **notification_service** | All outbound communication (push via Firebase, email via SMTP, SMS + WhatsApp via Twilio) plus the in-app notification inbox, preferences, announcements, maintenance mode, parent/teacher↔student message threads, and every scheduled reminder job. |
| **analytics_service** | The durable record of learning outcomes: progress, weak-topic accuracy, daily activity, quiz history, revision sessions, leaderboards, parent summaries, admin dashboards. |
| **referral_service** | Referral codes, signup tracking, activity-verified qualification, milestone rewards. |
| **career_service** | Career catalog, per-student career goals, AI skill-gap analysis, the Opportunities Hub. |
| **ai_service** | The student study tutor, the parent AI chat, admin content ingestion, AI paper/question generation, the student question bank, generated-paper attempts, mistake analysis/flashcards/revision plans. |
| **api_gateway** | The single public entry point (the only host-exposed port). Pure reverse proxy — confirmed via code read that it holds **no JWT-decoding logic of its own**; it forwards the `Authorization` header as-is to whichever backend service the path routes to, including for both websocket connections (chat and battle). It does hold real logic for CORS, rate limiting, and per-service health/circuit-breaking. |

### How services actually talk to each other

**Identity is centralised but verified independently by every service.** Every service that isn't `auth_service` carries its own copy of a shared authentication module (`services/_shared_auth/auth_core.py`, propagated to every service's `app/core/_shared_auth.py` via `tools/sync_shared_auth.py` — a real, current mechanism, not the "each service reimplements this independently with no shared code" state an older doc described). Concretely: every service decodes the JWT locally against a shared `SECRET_KEY` (which must therefore be identical across every service's `.env` — a real cross-service coupling), checks a Redis-backed logout blacklist by JTI, and confirms the user is still active. A short-lived Redis cache (60s TTL) sits in front of the equivalent `GET /auth/verify` HTTP call for cases where local decode isn't used. **A Redis outage previously crashed authentication platform-wide** because the cached Redis client object was never re-validated after its first successful ping — this was found and fixed this session (see §11).

**Cross-service actions are verified, not asserted.** When one service tells another that something happened — a video was watched, a quiz was completed, a referral qualified, a Challenge Program task finished — the receiving service re-confirms it against the owning service's own records before acting. Concrete example: `gamification_service`'s Challenge Program task-progress trigger independently re-queries `quiz_service`/`content_service`/`battle_service` for the actual completion record rather than trusting the calling service's HTTP call — the exact same "never trust the caller's assertion" pattern the referral qualification funnel and the parent-child link checks all use.

**All cross-service calls to `/internal/*` routes require both** a Docker-internal-network-range source IP (`127./10./172./192.168.`) **and** an `X-Internal-Secret` header compared via constant-time `hmac.compare_digest`. Failures return 404, not 403, specifically so a failed internal-auth probe never confirms the endpoint exists.

**Long or unreliable work happens in the background** — Celery (RabbitMQ broker, Redis backend) for email/push/WhatsApp/AI generation/content ingestion, or FastAPI's in-process `BackgroundTasks` for lighter async work like progress recording. Only SMS is delivered synchronously, because the login flow is waiting on it.

**Database philosophy**: each service owns its own Postgres database; there are no cross-service foreign keys anywhere (every cross-service reference — `user_id`, `student_id`, etc. — is a bare indexed UUID column). Only 5 of 12 services (battle, content, gamification, payment, quiz) have Alembic migration history; the other 7 rely on `create_all()` at startup plus hand-rolled idempotent `ALTER TABLE ... ADD COLUMN/CONSTRAINT` bootstrap statements in each service's own startup lifespan — this is a deliberately deferred gap (see §12), not an oversight.

---

## 4. Core Flows

### 4.1 Student sign-up and login — phone OTP only

Students and parents sign in **exclusively** by phone SMS-OTP. This is not a legacy claim from an old doc — it is directly confirmed in the live code: email/password registration and email-OTP verification have been **removed entirely** (`services/auth_service/app/routes/registration.py` is now nearly empty, with an explicit comment documenting the removal), and `SessionService.login()` hard-rejects any non-admin account attempting email/password login with *"Please sign in with your mobile number and OTP instead."* — this check runs before the password is even verified.

1. **Phone entry** → 6-digit SMS code, 10-minute expiry, Redis-backed attempt lockout.
2. **Verification** → creates a new `PENDING`-role account on first sight, or logs into an existing one. A dev-only bypass code exists, gated on three conditions that must *all* hold (literal `APP_ENV=="development"`, a non-empty configured code, an exact match) — it fails closed in any real deployment.
3. **Role choice** (new accounts only) → one-time, server-enforced (see §2).
4. **Profile completion** → name, optional school, mandatory board+class.
5. **Dashboard.**

Admins sign in on the separate admin app with email+password; that path is rejected for every other role. Google OAuth is a third, independent login mechanism available to students/parents (an ID-token exchange, not a redirect the mobile app hands off to a browser for).

**Session mechanics**: access tokens are short-lived JWTs; refresh tokens are opaque random strings (never JWTs) with only their SHA-256 hash stored server-side. Refresh is **single-use with rotation** — reusing an already-rotated refresh token is treated as a possible theft/replay event and revokes the user's *entire* token family and every device session, not just that one token. Logout blacklists the current access token's JTI in Redis so it's invalidated immediately rather than waiting for natural expiry.

### 4.2 The learning chain: curriculum → video → quiz → completion → certificate

Every link in this chain is verified server-side, never trusted from the client.

**Browse** → the catalog is resolved from the student's own profile, never a client-supplied filter. **Watch** → progress is skip-resistant (a single progress report can only claim credit proportional to real elapsed time since the last report). **Unlock notes** at 70% genuine watch time. **Complete the video** at 90%. **Complete exercise → chapter → subject**, each derived from the level beneath it. **Unlock the quiz** once the same video-completion threshold is met — the same signal drives both what the UI shows and what the server allows, so they can never disagree. **Certificate** issuance is idempotent (asking again returns the existing one) and publicly verifiable by its certificate number.

### 4.3 Taking a quiz

Attempt lifecycle: start → answer (per-question or batched) → pause/resume (checkpointed, held up to 24h) → submit → server-side grading against the stored answer key.

**A previously real bug is now fixed**: `submit_quiz()` (per-question flow) and `batch_submit()` (all-at-once flow) used to be two independently-maintained code paths, and only one of them actually fired the downstream gamification/goal-progress/leaderboard side effects — meaning a real completion via the "wrong" path silently skipped XP, goal progress, and leaderboard updates. Both paths now call the identical shared `QuizSideEffects` class (verified directly in `services/quiz_service/app/services/quiz_service.py` and `quiz_side_effects.py`), with the fix's rationale documented in-code specifically to prevent this regressing.

**A separate, currently-real bug exists on mobile only**: the quiz-submission API response contains no `xp_earned` field at all (confirmed against the actual response schema), yet the mobile quiz-results screen displays `data?.xp_earned ?? Math.round(score * 10)` as the "+XP earned!" toast — since that field is always `undefined`, the toast **always shows a fabricated client-computed guess**, never the real tiered amount (`QUIZ_COMPLETED=20` / `QUIZ_SCORE_80=30` / `QUIZ_PERFECT=50`) the backend actually awarded. The real amount only surfaces later when the profile/leaderboard is fetched — the two numbers can visibly disagree.

Four distinct assessment types look similar to a student but are separate systems: **Quiz** (teacher/admin-authored, `quiz_service`), **Previous-year paper** (`content_service`), **AI-generated paper** (`ai_service`), **Battle** (`battle_service`).

### 4.4 Parent links to a child and monitors them

**There is exactly one implementation that creates a link row**, despite three HTTP entry points existing for backward compatibility (`POST /users/parents/{parent_id}/students`, the legacy `POST /users/parent-link`, and `POST /users/parent/link-student`) — the two legacy routes explicitly delegate to the same canonical service method, a deliberate consolidation documented in the code specifically to prevent the two legacy paths from ever silently reintroducing a bug where they used to skip the duplicate/role/cap checks the canonical path enforces.

Status is modelled as a single boolean (`is_approved`), not an enum — there is no separate "rejected" state; declining a still-pending request is a `DELETE`, not a status flip. The link-creation flow independently verifies (via a real HTTP call to `auth_service`, failing closed if that call fails) that the target is genuinely a student account — this closed a real, previously-live bug where a parent could link to *another parent's* account.

**Every downstream parent capability funnels through one server-side check** (`verify_parent_child_link`, in `user_service`, documented in its own code as "the single source of truth for parent→child ownership checks... an unapproved link must grant no access anywhere this is consulted"): study-time limits, the purchase-approval gate, meeting requests, the student monitoring dashboard, chat monitoring, the parent AI chat, family subscription-entitlement inheritance, and even which students get nightly re-indexed for the parent AI feature. Every other service that needs this check calls one of `user_service`'s dedicated internal endpoints rather than keeping its own copy of the relationship — there is exactly one table backing all of it.

### 4.5 Battles

Nine modes (solo-vs-AI, 1v1, group, public, class, school, subject/chapter, team, study party). Public battles are open-listed; private battles need an invite code, except 1v1-by-friend-ID which is allowed without one. XP is awarded by finishing rank and battle type; friend challenges can be played for an XP stake (50/100/200/500), with the loser's balance never going below zero. Finishing a battle is idempotent.

### 4.6 Gamification: XP, EduPoints, streaks, and three distinct daily loops

**XP** determines a fixed ten-level ladder and resets each season (EduPoints never reset). **EduPoints** are a parallel spendable currency (shop: practice content, learning unlocks, cosmetics, streak freezes). Every award — whether self-service (`POST /xp/award`, IDOR-guarded so a user can only award to themselves unless they're an admin) or triggered internally by another service — is deduplicated on `(user_id, event, reference_id)`, so a retried or repeated award is a no-op rather than a double credit. **Caveat verified in code**: the self-service endpoint has no server-side check that the claimed event *actually happened* for events that need no `reference_id` (e.g. daily login) — the dedup only stops *repeated* claims of the same reference, not a first fabricated one. In practice the real mobile client doesn't call this self-service path for anything observed; genuine XP gains flow through internal, trusted service-to-service calls (e.g. quiz_service → gamification_service on a real quiz completion).

**Streaks** use the server's plain local date with **no per-user timezone logic at all** — every student's streak day boundary is effectively the server's own midnight (UTC in this deployment), regardless of the student's real-world timezone. A purchasable streak freeze (capped at 3 banked) auto-consumes if exactly one day is missed; missing two or more resets the streak regardless of banked freezes.

**Three deliberately distinct daily systems**, verified end to end:
- **Daily Reward** — a 7-day check-in calendar, claimable once per day.
- **Daily Goal** — a personalised set of up to 4 slots per student per day (video/quiz/AI-doubt/streak), auto-assigned each morning from admin-authored templates; the streak slot auto-completes just by opening the app.
- **Daily Challenge** — one global task, the same for every student, chosen by admins.
- **Challenge Program** — a separate, richer multi-day system (e.g. a "7-Day Maths Challenge"): admin-authored days containing ordered tasks across five types. **A student can never mark a task complete themselves** — there is deliberately no such route anywhere on any client; task advancement only happens when the owning service (content/quiz/battle/analytics) reports a genuine completion, and gamification re-verifies that report against the owning service's own records before advancing the student's day.

All three loops' rewards ultimately settle through the exact same core award methods inside `gamification_service` — none of them re-enters over its own public HTTP API; only genuinely cross-service callers (quiz_service, battle_service) go over HTTP.

### 4.7 Payments and subscriptions

**Order creation never activates a subscription by itself** — this is enforced identically on web and mobile, and both clients' own code comments say so explicitly. The Cashfree SDK/checkout UI's client-side "success" signal is never trusted; only the backend's own `/verify` call (which re-queries Cashfree server-to-server for the real order status) or Cashfree's independent signed webhook can actually activate anything.

**Idempotency, concretely verified**:
- `/verify` short-circuits safely if the payment is already `CAPTURED` (returns the existing subscription unchanged) or already terminally `FAILED` (rejects immediately rather than re-checking status, which in test mode would otherwise always report "paid").
- The webhook's success handler uses a single **atomic conditional UPDATE** (`SET status=CAPTURED WHERE status != CAPTURED`) as its claim mechanism — this is the actual fix behind the "payment idempotency" work referenced in project history, closing a real race between Cashfree's own webhook retries and a concurrent client `/verify` call.
- Coupon redemption is reserved atomically at order-creation time (an `UPDATE ... WHERE used_count < max_uses` that only one concurrent request can win), not merely checked-then-incremented — this was specifically to prevent a limited-use coupon being over-redeemed by simultaneous checkouts.

**A real, narrow inconsistency exists between the two activation paths**: `/verify`'s full activation logic carries over remaining time from a still-active previous subscription; the webhook's independent activation path (used when the client never gets to call `/verify` at all — app killed, network drop) does not replicate that carry-over computation. Whichever path wins the atomic claim race "wins" for that payment, so no double-subscription is ever created either way, but if the webhook wins first, that specific activation doesn't get any carry-over days added.

**Parent-pays-for-child** is a distinct route family that creates the order under the *student's* `user_id`; the purchase-approval gate that guards a student's own self-checkout does not apply here (a parent paying directly is itself the approval). Separately, `payment_service` implements **read-only family entitlement inheritance**: a student with no subscription of their own inherits "premium" from an *approved* parent's own active subscription — this is checked by `gamification_service` (to gate free-vs-premium feature quotas, failing open to the *stricter* free tier on any error) but, per direct code search, **not** by `content_service` or `ai_service`, which appear not to call `payment_service` for gating at all — worth confirming intent before relying on this for content-level gating.

### 4.8 AI features

Two architecturally distinct AI pipelines exist under `ai_service`, and confusing them is a common mistake:

**Student study tutor** (`POST /ai/study`) retrieves from curriculum content that an admin has uploaded and ingested into a Qdrant vector store — safety-screened input → intent classification → cache check → single-flight-locked embedding+retrieval+reranking → a versioned, injection-hardened system prompt → a provider fallback chain (Groq → Claude → OpenAI → local Ollama → a retrieval-only snippet answer if every provider is down, never a hard failure) → an output safety check for hallucination signals before the answer is returned. Every layer degrades gracefully rather than erroring, and the response says plainly when it's operating in a degraded mode.

**Parent AI chat** (`POST /ai/parent-chat`) is fundamentally different: it does **not** query curriculum content at all. It queries a *separate* vector collection populated from the student's own live activity across 10 other microservices, refreshed hourly on-demand and nightly for every student with an approved parent link. Critically, **every count/average/total the assistant states comes from a live-computed stats block injected verbatim into the prompt** — the vector search only supplies narrative/episodic detail (dates, specific quiz results) — because the design explicitly distrusts an LLM's ability to do its own arithmetic over retrieved records. A documented prior bug (a hardcoded offline fallback showing plausible-looking but entirely fake numbers, indistinguishable from a real answer) has been fixed — the current no-LLM fallback returns the real computed statistics in plain sentences instead. **One asymmetry confirmed in code**: the student tutor's output passes through a hallucination/grounding safety check before being returned; the parent chat's output does not — the parent path relies on its stats-injection design and prompt rules instead of a matching output check.

Both students and parents get real subscription-based gating (paid plans required for most AI features; a parent asking about an approved-linked child is free), plus separate free-tier daily quotas.

**AI-generated papers** are a third, separate feature (admin-triggered generation, rule-based auto-verification, and — critically — **rule-based, not LLM, grading** of student attempts against a stored answer key; only papers with no machine-checkable key at all fall back to trusting the client's submitted score, a narrow real trust boundary).

### 4.9 Referrals

Every user gets a shareable code. A referred signup starts pending and progresses through a qualification checklist that is **re-verified against content_service's and quiz_service's own completion records**, not merely claimed by the app. Both sides are rewarded once qualified; the referrer's milestone tiers (1/2/3/5/7/10 referrals) top out in genuine free premium subscription days, not just XP/points.

### 4.10 Notifications — five channels, three of which are genuinely live

Reaches users over **in-app** (always written, the reliable baseline), **push**, **email**, **SMS**, and **WhatsApp**.

- **Push** has two independent, both-live send implementations that coexist for historical reasons: a legacy raw-FCM HTTP call (used specifically by `user_service`'s offline-chat-push feature) and a Celery task using the firebase-admin SDK (used by every scheduled job and every other internal trigger). Despite the mobile app being built on Expo, **it registers a raw native FCM/APNs device token, not an Expo push token** — the backend's sender expects that, not Expo's own push relay.
- **Email** goes over plain SMTP (Gmail's relay by default), queued via Celery.
- **SMS** is Twilio, used synchronously only for login OTPs (because the user is actively waiting on it) — every other outbound channel is asynchronous.
- **WhatsApp is implemented with a genuine Twilio WhatsApp API integration, but is functionally dead in practice today**: the credentials are blank in this environment, no scheduled job or internal service-to-service call ever triggers it, and — a real, currently-live bug — the admin broadcast composer lets an admin tick a "WhatsApp" channel checkbox that the backend silently ignores, sending email-only regardless of what was selected.

Ten scheduled jobs run on a fixed cadence (goal reminders, streak reminders, friend-activity nudges, a weekly student report, a weekly parent summary, battle-starting-soon reminders every minute, dormant-user win-back at 3/7/30-day tiers, and deferred nudge delivery every 15 minutes) — deliberately deferred rather than instant, because a prompt fired the second a quiz ends reads as nagging rather than coaching.

**Announcements** (admin-authored banners) and **Contact Us** (a public, unauthenticated inbound form) are both entirely separate from this delivery pipeline — creating either one never triggers push/email/SMS/WhatsApp to anyone.

### 4.11 Chat and messaging — three genuinely distinct systems

1. **Social chat** (student↔student) — friend requests, direct and group rooms (capped at 10 members + creator, max 3 groups per student), real-time delivery, presence, typing, read receipts, replies, and reactions. Keyword-moderated. 7-day default message retention.
2. **Parent↔child direct messaging** — a simple one-to-one thread, separate from the social system above.
3. **Teacher/parent↔student message threads** — a structured system where a teacher, parent, or admin opens a thread and the student replies; students cannot initiate these.

**Parent chat monitoring** sits alongside all of this: an approved parent can read (never send in) their child's social-chat rooms, and every such view is recorded — who viewed what, when.

---

## 5. Platforms

### Web frontend (student + parent, one codebase)
A React SPA covering the full product for both roles, differentiated by `RoleGuard`. Public marketing/legal/CMS pages sit in front of the authenticated app behind a separate layout. Supports English, Hindi, Punjabi, and Urdu (Urdu rendered right-to-left) — **note that several of the site's own marketing pages (FAQ, Features, Docs, the landing page) currently advertise "English, Hindi, Punjabi, and Bhojpuri," which does not match the actual supported language set** (`en`/`hi`/`pa`/`ur` — confirmed against the real `i18n/translations.ts`); this is a documentation/copy bug in the product itself, not in this overview.

**Two things worth knowing that don't appear anywhere in the app's own navigation:**
- A fully-functional, unrouted admin-style CRUD component (`components/AdminContentPanel.tsx`, ~1100 lines, real curriculum/PYP/Knowledge-Hub CRUD wired to real endpoints) exists in this codebase but is imported nowhere — it's unreachable dead code, most likely a leftover from work that was superseded by the separate admin app.
- `RoleGuard`'s role groups allow-list `admin`/`super_admin` into every route group, even though this app has no admin-specific route or dashboard for them to land on — this reads as defensive/inherited logic (the admin app is a genuinely separate codebase) rather than a live security hole, since there's simply nowhere for that bypass to lead today.

### Mobile
An Expo/React Native app for iOS and Android, at broad feature parity with web for students and parents. Role-based tab navigation (students: Dashboard/Learn/AI/Chat/Profile; parents: Home/Monitor/AI Chat/Messages/Profile). Onboarding starts with a language picker matching the web app's real four-language set. Tokens live in secure device storage with transparent refresh (single-flight, so multiple concurrent 401s don't race the single-use refresh-token rotation into failing each other). Push tokens are registered per-device and are raw native FCM/APNs tokens, not Expo's push relay (see §4.10). There is no mobile administration experience — administration is web-only, on the separate admin app.

### Admin panel
A separate React application, its own password-only login restricted to `admin`/`super_admin`. Covers every management surface described throughout this document. A consistent pattern worth knowing: destructive-action confirmation is inconsistent across the app — only 3 of the ~24 management pages use a real confirmation dialog before deleting something; several genuinely destructive actions (deactivating a user's account from the moderation queue, deleting an announcement or activity-feed item, changing a user's role) fire immediately on a single click with no confirmation step at all. Two admin-CMS features (Blog Posts and Info Pages) are, underneath their separate sidebar entries, the same generic backend resource distinguished only by a slug-naming convention — editing one doesn't affect the other's list, but they share one underlying table.

---

## 6. Known Gaps and Deliberate Deferrals

Documented plainly, distinguishing what's intentionally scoped-out from what's an open bug:

- **Teacher-facing UI is almost entirely mock** (§2) — intentional and clearly disclosed in the product itself, not hidden from admins reviewing it.
- **Alembic migration tooling exists on only 5 of 12 services** — a real, deliberately deferred gap (the underlying multi-worker startup race this was originally flagged for is already independently mitigated via Postgres advisory locks in every service, which lowered the urgency; bootstrapping the remaining 7 services was explicitly postponed pending a dedicated pass).
- **WhatsApp notification delivery is implemented but effectively unreachable** in this deployment (§4.10) — needs real Twilio WhatsApp credentials plus a fix to the admin broadcast route actually reading the channel selection.
- **The mobile quiz-results XP toast shows a fabricated number**, not the real server-computed amount (§4.3) — a genuine, currently-open client bug.
- **Payment carry-over logic is asymmetric between the `/verify` and webhook activation paths** (§4.7) — narrow, only matters if the webhook wins the activation race for a user who had unexpired time on a previous plan.
- **A Redis outage previously crashed authentication platform-wide** — found and fixed this session (the shared auth module's cached Redis client was never re-validated after its first successful connection); see the project's own QA-pass notes for the full fix and live verification.
- **A duplicate-row race condition existed in progress-tracking writes** — concurrent requests for the same student+chapter/topic could create duplicate database rows under load; found, reproduced live, and fixed this session with a database uniqueness constraint plus an atomic upsert/advisory-lock pattern.

---

*This document supersedes `backend.md`, `frontend.md`, `mobile.md`, `production-readiness.md`, and `requirements.md`. It was compiled by re-verifying every major claim directly against the current source code — file:line citations for every finding summarised here exist in the research that produced it, and are available on request rather than reproduced inline to keep this document readable.*
