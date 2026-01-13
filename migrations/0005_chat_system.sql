-- Chat History
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    context_type TEXT, -- 'run', 'plan', 'general'
    context_id TEXT    -- e.g., run_id
);

-- Coach Actions (Audit log of what the AI did)
CREATE TABLE coach_actions (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL, -- 'update_plan', 'shift_schedule', 'suggest_rest'
    description TEXT NOT NULL,
    parameters TEXT, -- JSON string of params used
    status TEXT DEFAULT 'success',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_id TEXT, -- Triggering chat message
    FOREIGN KEY(message_id) REFERENCES chat_messages(id)
);
