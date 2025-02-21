
CREATE OR REPLACE FUNCTION assign_tag_to_file(
  p_message_id UUID,
  p_file_id UUID,
  p_tag_id UUID,
  p_ai_context TEXT
)
RETURNS message_file_tags
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_file_tag message_file_tags;
BEGIN
  -- Check if association already exists
  SELECT * INTO v_message_file_tag
  FROM message_file_tags
  WHERE message_id = p_message_id
    AND file_id = p_file_id
    AND tag_id = p_tag_id;

  IF FOUND THEN
    -- Update existing association
    UPDATE message_file_tags
    SET usage_count = usage_count + 1,
        ai_context = COALESCE(p_ai_context, ai_context)
    WHERE message_id = p_message_id
      AND file_id = p_file_id
      AND tag_id = p_tag_id
    RETURNING * INTO v_message_file_tag;
  ELSE
    -- Create new association
    INSERT INTO message_file_tags (
      message_id,
      file_id,
      tag_id,
      ai_context,
      usage_count
    )
    VALUES (
      p_message_id,
      p_file_id,
      p_tag_id,
      p_ai_context,
      1
    )
    RETURNING * INTO v_message_file_tag;
  END IF;

  RETURN v_message_file_tag;
END;
$$;
