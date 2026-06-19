-- User workspace: team-scoped task board
CREATE TABLE IF NOT EXISTS user_tasks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT        NOT NULL,
    description     TEXT,
    status          TEXT        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'ongoing', 'done')),
    department_id   INTEGER     REFERENCES departments(department_id) ON DELETE SET NULL,
    department_name TEXT,
    created_by      TEXT        NOT NULL,
    due_date        DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_tasks_dept       ON user_tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_created_by ON user_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_user_tasks_status     ON user_tasks(status);
