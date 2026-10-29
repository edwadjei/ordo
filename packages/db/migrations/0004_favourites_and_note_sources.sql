-- Project favourites and note sources. Both are new columns with defaults,
-- so no table is rebuilt and every existing row keeps its id and revision:
-- existing projects are not favourites and existing notes are 'manual'.
-- Neither column is part of full-text search.

ALTER TABLE projects ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1));

ALTER TABLE notes ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'recording', 'email', 'transcript'));
