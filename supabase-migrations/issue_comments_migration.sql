-- Migration: Create issue_comments table
-- Run in Supabase → SQL Editor → New Query.

CREATE TABLE IF NOT EXISTS issue_comments (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    username   TEXT NOT NULL,
    comment    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_created_at ON issue_comments(created_at);
