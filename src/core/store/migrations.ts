/** Append-only. Never edit a shipped migration; add a new one. */
export const migrations: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE kv (
        ns TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (ns, key)
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX messages_session ON messages(session_id, seq);
      CREATE TABLE widgets (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        data TEXT NOT NULL,
        runs INTEGER NOT NULL DEFAULT 0,
        last_run_at INTEGER,
        next_run_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        due_at INTEGER,
        done_at INTEGER,
        job_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `,
  },
  {
    // Sessions (docs/AGENT-HARNESS.md §2): the v1 table gains list metadata. Messages and model
    // history live as one JSON record per session in kv('session').
    version: 2,
    sql: `
      ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN title_source TEXT NOT NULL DEFAULT 'fallback';
      ALTER TABLE sessions ADD COLUMN preview TEXT NOT NULL DEFAULT '';
      ALTER TABLE sessions ADD COLUMN provider_id TEXT;
      ALTER TABLE sessions ADD COLUMN model TEXT;
      ALTER TABLE sessions ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX sessions_updated ON sessions(updated_at);
    `,
  },
  {
    // Usage records, one row per model request (docs/AGENT-HARNESS.md §6.1). turn_id groups the
    // steps of one user turn (optional).
    version: 3,
    sql: `
      CREATE TABLE usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        purpose TEXT NOT NULL,
        input INTEGER NOT NULL DEFAULT 0,
        cached_input INTEGER NOT NULL DEFAULT 0,
        output INTEGER NOT NULL DEFAULT 0,
        reasoning INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        tools TEXT NOT NULL DEFAULT '[]',
        turn_id TEXT
      );
      CREATE INDEX usage_at ON usage(at);
      CREATE INDEX usage_session ON usage(session_id, purpose, at);
    `,
  },
];
