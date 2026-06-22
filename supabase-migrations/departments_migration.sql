-- Departments table
CREATE TABLE IF NOT EXISTS departments (
    department_id   SERIAL PRIMARY KEY,
    department_name VARCHAR(150) NOT NULL,
    department_code VARCHAR(20)  NOT NULL UNIQUE,
    department_desc TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add assigned-department FK to issues
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS request_to_department_id INTEGER
        REFERENCES departments(department_id) ON DELETE SET NULL;
