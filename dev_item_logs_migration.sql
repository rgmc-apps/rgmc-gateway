CREATE TABLE IF NOT EXISTS dev_item_logs (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id     UUID NOT NULL REFERENCES dev_items(id) ON DELETE CASCADE,
    username    TEXT NOT NULL,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_item_logs_item_id_idx   ON dev_item_logs(item_id);
CREATE INDEX IF NOT EXISTS dev_item_logs_created_at_idx ON dev_item_logs(created_at DESC);
