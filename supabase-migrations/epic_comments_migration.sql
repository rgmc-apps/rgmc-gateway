CREATE TABLE IF NOT EXISTS public.epic_comments (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    epic_id    TEXT        NOT NULL,
    username   TEXT        NOT NULL,
    comment    TEXT        NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epic_comments_epic_id    ON public.epic_comments(epic_id);
CREATE INDEX IF NOT EXISTS idx_epic_comments_created_at ON public.epic_comments(created_at DESC);
