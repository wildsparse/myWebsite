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
  crop         TEXT,              -- 卡片取景：{"x":0,"y":0,"w":1,"h":0.75}
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  author       TEXT,
  content      TEXT NOT NULL,
  photos       TEXT,              -- JSON 数组，最多两张压缩后的图
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  text         TEXT NOT NULL,
  done         INTEGER NOT NULL DEFAULT 0,
  author       TEXT,
  created_at   TEXT NOT NULL,
  done_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_created ON memories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_todos_created ON todos (created_at DESC);

-- 评论：回忆和留言共用一张表，用 target_type 区分
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,     -- 'memory' 或 'message'
  target_id   TEXT NOT NULL,
  author      TEXT,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (target_type, target_id, created_at);
