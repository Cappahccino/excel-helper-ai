
CREATE OR REPLACE FUNCTION create_and_assign_tag(
  p_tag_name TEXT,
  p_message_id UUID,
  p_file_id UUID,
  p_category TEXT,
  p_ai_context TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tag file_tags;
  v_message_file_tag message_file_tags;
BEGIN
  -- Start transaction
  BEGIN
    -- Create or get existing tag
    SELECT * INTO v_tag FROM create_tag_with_validation(
      p_tag_name,
      p_category,
      'custom',
      false
    );

    -- Assign tag to file
    SELECT * INTO v_message_file_tag FROM assign_tag_to_file(
      p_message_id,
      p_file_id,
      v_tag.id,
      p_ai_context
    );

    -- Return combined result
    RETURN jsonb_build_object(
      'tag', to_jsonb(v_tag),
      'messageFileTag', to_jsonb(v_message_file_tag)
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error details
      RAISE LOG 'Error in create_and_assign_tag: %', SQLERRM;
      -- Re-raise the error
      RAISE;
  END;
END;
$$;
