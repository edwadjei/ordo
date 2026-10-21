ALTER TABLE tasks ADD COLUMN due_time text, ADD COLUMN follow_up_time text, ADD COLUMN responsible_person text, ADD COLUMN waiting_on text;
ALTER TABLE tasks ADD CONSTRAINT tasks_due_time_format CHECK (due_time IS NULL OR due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE tasks ADD CONSTRAINT tasks_follow_up_time_format CHECK (follow_up_time IS NULL OR follow_up_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE tasks ADD CONSTRAINT tasks_due_time_requires_date CHECK (due_time IS NULL OR due_date IS NOT NULL);
ALTER TABLE tasks ADD CONSTRAINT tasks_follow_up_time_requires_date CHECK (follow_up_time IS NULL OR follow_up_date IS NOT NULL);
ALTER TABLE tasks ADD CONSTRAINT tasks_responsible_person_length CHECK (responsible_person IS NULL OR char_length(responsible_person) BETWEEN 1 AND 80);
ALTER TABLE tasks ADD CONSTRAINT tasks_waiting_on_length CHECK (waiting_on IS NULL OR char_length(waiting_on) BETWEEN 1 AND 80);
DROP INDEX tasks_search_idx;
CREATE INDEX tasks_search_idx ON tasks USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(responsible_person, '') || ' ' || coalesce(waiting_on, ''))) WHERE deleted_at IS NULL;
