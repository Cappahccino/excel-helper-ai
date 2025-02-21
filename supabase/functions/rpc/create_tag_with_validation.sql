
CREATE OR REPLACE FUNCTION create_tag_with_validation(
  p_name TEXT,
  p_category TEXT,
  p_type TEXT,
  p_is_system BOOLEAN
)
RETURNS file_tags
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tag file_tags;
BEGIN
  -- Check if tag already exists
  SELECT * INTO v_tag
  FROM file_tags
  WHERE LOWER(name) = LOWER(p_name)
  LIMIT 1;

  IF FOUND THEN
    RETURN v_tag;
  END IF;

  -- Validate tag name
  IF p_name IS NULL OR LENGTH(TRIM(p_name)) = 0 THEN
    RAISE EXCEPTION 'Tag name cannot be empty';
  END IF;

  IF LENGTH(p_name) > 50 THEN
    RAISE EXCEPTION 'Tag name cannot exceed 50 characters';
  END IF;

  -- Create new tag
  INSERT INTO file_tags (name, category, type, is_system, metadata)
  VALUES (
    LOWER(TRIM(p_name)),
    p_category,
    p_type,
    p_is_system,
    jsonb_build_object('usage_stats', jsonb_build_object(
      'total_uses', 0,
      'file_count', 0
    ))
  )
  RETURNING * INTO v_tag;

  RETURN v_tag;
END;
$$;
