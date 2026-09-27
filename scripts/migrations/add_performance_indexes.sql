-- ============================================================
-- EduLearn — Production Performance Index Migration
-- Phase 2: 50,000-user scale
-- Run with: psql $DATABASE_URL -f add_performance_indexes.sql
-- All indexes use CONCURRENTLY to avoid table locks.
-- ============================================================

-- ─── SUBSCRIPTIONS ───────────────────────────────────────────
-- Subscription check fires on every AI/premium API call (high frequency)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_subscriptions_user_status
    ON subscriptions (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_subscriptions_active_expires
    ON subscriptions (expires_at)
    WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_subscriptions_plan
    ON subscriptions (plan, status);

-- ─── QUIZ SERVICE ─────────────────────────────────────────────
-- questions: quiz load fetches all questions by quiz_id (seq scan without this)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_questions_quiz_id
    ON questions (quiz_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_questions_chapter_id
    ON questions (chapter_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_questions_subject_class
    ON questions (subject, class_num);

-- quiz_attempts: user history, completion queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_quiz_attempts_user_id
    ON quiz_attempts (user_id)
    WHERE status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_quiz_attempts_user_status
    ON quiz_attempts (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_quiz_attempts_user_completed
    ON quiz_attempts (user_id, completed_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_quiz_attempts_quiz_id
    ON quiz_attempts (quiz_id);

-- quiz_answers: finalization does SELECT WHERE attempt_id = ? (critical path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_quiz_answers_attempt_id
    ON quiz_answers (attempt_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_quiz_answers_attempt_question
    ON quiz_answers (attempt_id, question_id);

-- ─── GAMIFICATION ─────────────────────────────────────────────
-- Leaderboard: ORDER BY total_xp DESC — full table sort without index
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_xp_total_xp_desc
    ON user_xp (total_xp DESC);

-- XP transactions: season aggregation by date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_xp_transactions_user_created
    ON xp_transactions (user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_xp_transactions_event
    ON xp_transactions (user_id, event);

-- Badge deduplication: has user X already earned badge type Y?
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_badges_user_badge_type
    ON user_badges (user_id, badge_type);

-- EduPoint redemptions: ownership check per item
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_edupoint_redemptions_user_item
    ON edupoint_redemptions (user_id, item_key);

-- Challenge progress: daily challenge completion check
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_challenge_progress_user_challenge
    ON user_challenge_progress (user_id, challenge_id);

-- ─── ANALYTICS ────────────────────────────────────────────────
-- Student progress: upsert runs on every quiz completion
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_student_progress_user_chapter
    ON student_progress (user_id, chapter_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_student_progress_user_subject
    ON student_progress (user_id, subject_id);

-- Weak topic analysis: sort by accuracy within user
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weak_topic_user_accuracy
    ON weak_topic_analysis (user_id, accuracy ASC);

-- ─── CONTENT SERVICE ──────────────────────────────────────────
-- All FK columns on content hierarchy (unindexed by default in content.py models)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_classes_board_id
    ON classes (board_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_subjects_class_id
    ON subjects (class_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_chapters_subject_id
    ON chapters (subject_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_topics_chapter_id
    ON topics (chapter_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_videos_topic_id
    ON videos (topic_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notes_chapter_id
    ON notes (chapter_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_exercises_chapter_id
    ON exercises (chapter_id);

-- Video progress: resume-point lookup on every video play
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_video_progress_user_video
    ON video_progress (user_id, video_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_video_progress_user_status
    ON video_progress (user_id, status, is_completed);

-- Learning progress: completion dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_learning_progress_user_type_status
    ON user_learning_progress (user_id, entity_type, status);

-- ─── BATTLE SERVICE ──────────────────────────────────────────
-- Battle leaderboard: ORDER BY total_score DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_battle_stats_total_score_desc
    ON battle_stats (total_score DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_battle_stats_battles_won
    ON battle_stats (battles_won DESC);

-- Battle participants: user history + status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_battle_participants_user_status
    ON battle_participants (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_battle_participants_team
    ON battle_participants (battle_id, team);

-- ─── PAYMENT SERVICE ──────────────────────────────────────────
-- Payment history per user
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payments_user_status
    ON payments (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payments_subscription_id
    ON payments (subscription_id)
    WHERE subscription_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payments_user_created
    ON payments (user_id, created_at DESC);

-- ─── REFERRAL SERVICE ─────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_referrals_referrer_status
    ON referrals (referrer_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_referral_rewards_user_claimed
    ON referral_rewards (user_id, is_claimed);

-- ─── USER SERVICE ────────────────────────────────────────────
-- Parent-student links: frequent lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_parent_student_links_parent
    ON parent_student_links (parent_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_parent_student_links_student
    ON parent_student_links (student_user_id);

-- ─── VERIFY INDEXES CREATED ──────────────────────────────────
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE indexname LIKE 'ix_%'
  AND schemaname = 'public'
ORDER BY tablename, indexname;
