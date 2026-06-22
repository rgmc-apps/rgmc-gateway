CREATE TABLE IF NOT EXISTS task_item_logs (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id     UUID NOT NULL REFERENCES user_tasks(id) ON DELETE CASCADE,
    username    TEXT NOT NULL,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_item_logs_task_id_idx    ON task_item_logs(task_id);
CREATE INDEX IF NOT EXISTS task_item_logs_created_at_idx ON task_item_logs(created_at DESC);
