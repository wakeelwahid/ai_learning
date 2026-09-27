-- Migration: add user_learning_progress table for production progress tracking
-- Run against edtech_content DB:
--   docker exec -i <postgres_container> psql -U edtech_user -d edtech_content < migrate_progress.sql

\c edtech_content

CREATE TABLE IF NOT EXISTS user_learning_progress (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL,
    entity_type     VARCHAR(20) NOT NULL,   -- 'video', 'exercise', 'chapter', 'subject'
    entity_id       UUID        NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'started',  -- started | in_progress | completed
    score           FLOAT,                  -- percentage 0-100 (nullable)
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_entity_progress UNIQUE (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ulp_user_id ON user_learning_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_ulp_entity  ON user_learning_progress (entity_type, entity_id);

\echo 'user_learning_progress table created OK';
