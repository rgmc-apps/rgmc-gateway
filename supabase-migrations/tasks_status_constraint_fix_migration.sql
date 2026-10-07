-- Fix: PATCH /api/tasks/<id> returns 500 when moving a task to any status
-- other than 'open', 'in_progress', 'for_review', or 'done'.
--
-- Root cause: tasks.status still carries its original hardcoded CHECK
-- constraint from tasks_migration.sql:
--     CHECK (status IN ('open','in_progress','for_review','done'))
-- but task statuses are now fully dynamic and admin/department-configurable
-- via the task_statuses table (see controllers/task_statuses.py). Its
-- default seed uses the slug 'ongoing' (not 'in_progress'), and admins/dept
-- heads can add arbitrary custom status columns from the Kanban board UI.
-- Moving a task to 'ongoing' (the default middle column!) or any custom
-- status violates the stale constraint, Postgres rejects the UPDATE, and
-- api_update_task() in controllers/tasks.py catches that failure and
-- returns {"error": "Update failed"}, 500.
--
-- Run in Supabase Dashboard -> SQL Editor -> New Query -> paste & run.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
