-- ============================================================
--  建表。在 Cloudflare 后台 → 存储和数据库 → D1 → 你的库 → 控制台，
--  把下面整段贴进去执行一次即可。
-- ============================================================

CREATE TABLE IF NOT EXISTS memories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  photo        TEXT,              -- 压缩后的 data:image/jpeg;base64,... 
  title        TEXT,
  note         TEXT,
  happened_at  TEXT,              -- YYYY-MM-DD
  author       TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  author       TEXT,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_created ON memories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC);
