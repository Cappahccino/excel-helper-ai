-- Create message_pins table for pinned messages
CREATE TABLE IF NOT EXISTS message_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure unique pins per message
  CONSTRAINT unique_message_pin UNIQUE (message_id, user_id)
);

-- Add indexes to improve performance
CREATE INDEX IF NOT EXISTS idx_message_pins_message_id ON message_pins(message_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_session_id ON message_pins(session_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_user_id ON message_pins(user_id);

-- Add row-level security for message_pins table
ALTER TABLE message_pins ENABLE ROW LEVEL SECURITY;

-- Policies for message_pins
CREATE POLICY "Users can select their own pins" 
  ON message_pins 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pins" 
  ON message_pins 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pins" 
  ON message_pins 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Add a function to get all pinned messages for a session
CREATE OR REPLACE FUNCTION get_pinned_messages(p_session_id TEXT)
RETURNS TABLE (
  message_id UUID,
  content TEXT,
  role TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  pinned_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id AS message_id,
    cm.content,
    cm.role,
    cm.status,
    cm.created_at,
    mp.created_at AS pinned_at
  FROM 
    message_pins mp
    JOIN chat_messages cm ON mp.message_id = cm.id
  WHERE 
    mp.session_id = p_session_id
    AND mp.user_id = auth.uid()
  ORDER BY 
    mp.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a trigger to clean up old pins when messages are deleted (soft deleted)
CREATE OR REPLACE FUNCTION delete_pins_for_deleted_messages()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM message_pins WHERE message_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_delete_pins_for_deleted_messages
AFTER UPDATE OF deleted_at ON chat_messages
FOR EACH ROW
WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION delete_pins_for_deleted_messages();

COMMENT ON TABLE message_pins IS 'Stores pinned messages for users';
COMMENT ON COLUMN message_pins.id IS 'Unique identifier for the pin';
COMMENT ON COLUMN message_pins.message_id IS 'Reference to the pinned message';
COMMENT ON COLUMN message_pins.session_id IS 'Session ID the message belongs to';
COMMENT ON COLUMN message_pins.user_id IS 'User who pinned the message';
COMMENT ON COLUMN message_pins.created_at IS 'When the message was pinned';
