-- tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name           TEXT        NOT NULL,
  task_type           TEXT,
  issue_id            UUID        REFERENCES issues(id) ON DELETE SET NULL,
  status              TEXT        NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','in_progress','for_review','done')),
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  description         TEXT,
  start_date          DATE,
  estimated_end_date  DATE,
  actual_end_date     DATE,
  created_by          TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_issue_id  ON tasks(issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_active ON tasks(is_active);

-- activity logs
CREATE TABLE IF NOT EXISTS task_activity_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  username   TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_activity_logs(task_id);

-- link issues to tasks
ALTER TABLE issues ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
