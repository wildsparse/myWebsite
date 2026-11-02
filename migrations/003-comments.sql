-- ============================================================
--  第三步迁移：评论
--  在你的 D1 数据库 → 控制台，整段粘贴执行一次。
--  评论挂在「回忆」和「留言」下面，只有文字。
-- ============================================================

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,     -- 'memory' 或 'message'
  target_id   TEXT NOT NULL,     -- 对应的回忆 / 留言 id
  author      TEXT,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (target_type, target_id, created_at);
