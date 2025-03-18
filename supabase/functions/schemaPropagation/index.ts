
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Redis } from "https://esm.sh/@upstash/redis@1.20.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );

    // Initialize Redis client using Upstash
    const redis = new Redis({
      url: Deno.env.get('UPSTASH_REDIS_REST_URL') || '',
      token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '',
    });
    
    // Parse request body
    const body = await req.json();
    const { action } = body;
    
    // Handle different actions
    switch (action) {
      case 'cacheSchema':
        return handleCacheSchema(body, redis, corsHeaders);
      
      case 'getSchema':
        return handleGetSchema(body, redis, corsHeaders);
      
      case 'invalidateSchema':
        return handleInvalidateSchema(body, redis, corsHeaders);
      
      case 'invalidateWorkflowSchema':
        return handleInvalidateWorkflowSchema(body, redis, corsHeaders);
      
      case 'getWorkflowSchemas':
        return handleGetWorkflowSchemas(body, redis, corsHeaders);
      
      case 'healthCheck':
        return handleHealthCheck(redis, corsHeaders);
      
      case 'subscribeToSchemaUpdates':
        return handleSubscribeToSchemaUpdates(body, redis, supabase, corsHeaders);
      
      case 'unsubscribeFromSchemaUpdates':
        return handleUnsubscribeFromSchemaUpdates(body, redis, corsHeaders);
      
      case 'checkForSchemaUpdates':
        return handleCheckForSchemaUpdates(body, redis, corsHeaders);
      
      case 'refreshSchema':
        return handleRefreshSchema(body, redis, supabase, corsHeaders);
      
      // Handle schema propagation (default action for backward compatibility)
      default:
        return handleSchemaPropagation(body, redis, supabase, corsHeaders);
    }
  } catch (error) {
    console.error('Error in Edge Function:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// Handle caching schema in Redis
async function handleCacheSchema(body, redis, corsHeaders) {
  const { workflowId, nodeId, schema, source, sheetName, version } = body;
  
  if (!workflowId || !nodeId || !schema) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    const cacheKey = `schema:${workflowId}:${nodeId}:${sheetName || 'default'}`;
    const versionKey = `schema_version:${workflowId}:${nodeId}:${sheetName || 'default'}`;
    
    // Get current version or start at 1
    let nextVersion = version;
    if (!nextVersion) {
      const currentVersion = await redis.get(versionKey);
      nextVersion = currentVersion ? Number(currentVersion) + 1 : 1;
    }
    
    // Cache the schema with metadata
    await redis.set(cacheKey, JSON.stringify({
      schema,
      timestamp: Date.now(),
      source: source || 'manual',
      version: nextVersion
    }), { ex: 300 }); // Expire after 5 minutes
    
    // Update version
    await redis.set(versionKey, nextVersion, { ex: 300 });
    
    // Publish update notification
    await redis.publish(`schema_update:${workflowId}`, JSON.stringify({
      nodeId,
      sheetName: sheetName || 'default',
      version: nextVersion,
      timestamp: Date.now()
    }));
    
    return new Response(
      JSON.stringify({ success: true, version: nextVersion }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error caching schema:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle retrieving schema from Redis
async function handleGetSchema(body, redis, corsHeaders) {
  const { workflowId, nodeId, maxAge, sheetName } = body;
  
  if (!workflowId || !nodeId) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    const cacheKey = `schema:${workflowId}:${nodeId}:${sheetName || 'default'}`;
    const cachedData = await redis.get(cacheKey);
    
    if (!cachedData) {
      return new Response(
        JSON.stringify({ success: true, schema: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const parsed = JSON.parse(cachedData);
    
    // Check if cache is still valid
    const cacheAge = Date.now() - parsed.timestamp;
    if (maxAge && cacheAge > maxAge) {
      return new Response(
        JSON.stringify({ success: true, schema: null, reason: 'cache_expired' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        schema: parsed.schema,
        version: parsed.version,
        source: parsed.source,
        age: cacheAge
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error getting schema from cache:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle invalidating schema cache
async function handleInvalidateSchema(body, redis, corsHeaders) {
  const { workflowId, nodeId, sheetName } = body;
  
  if (!workflowId || !nodeId) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    if (sheetName) {
      // Invalidate specific sheet
      const cacheKey = `schema:${workflowId}:${nodeId}:${sheetName}`;
      await redis.del(cacheKey);
      
      // Also invalidate version
      const versionKey = `schema_version:${workflowId}:${nodeId}:${sheetName}`;
      await redis.del(versionKey);
    } else {
      // Invalidate all sheets for this node (get keys matching pattern)
      const nodePattern = `schema:${workflowId}:${nodeId}:*`;
      const keys = await redis.keys(nodePattern);
      
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
      
      // Also invalidate versions
      const versionPattern = `schema_version:${workflowId}:${nodeId}:*`;
      const versionKeys = await redis.keys(versionPattern);
      
      if (versionKeys && versionKeys.length > 0) {
        await redis.del(...versionKeys);
      }
    }
    
    // Publish invalidation event
    await redis.publish(`schema_invalidate:${workflowId}`, JSON.stringify({
      nodeId,
      sheetName: sheetName || 'all',
      timestamp: Date.now()
    }));
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error invalidating schema cache:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle invalidating all schemas for a workflow
async function handleInvalidateWorkflowSchema(body, redis, corsHeaders) {
  const { workflowId } = body;
  
  if (!workflowId) {
    return new Response(
      JSON.stringify({ error: 'Missing workflowId parameter' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    // Get all schema cache keys for this workflow
    const schemaPattern = `schema:${workflowId}:*`;
    const schemaKeys = await redis.keys(schemaPattern);
    
    if (schemaKeys && schemaKeys.length > 0) {
      await redis.del(...schemaKeys);
    }
    
    // Get all version keys for this workflow
    const versionPattern = `schema_version:${workflowId}:*`;
    const versionKeys = await redis.keys(versionPattern);
    
    if (versionKeys && versionKeys.length > 0) {
      await redis.del(...versionKeys);
    }
    
    // Publish invalidation event
    await redis.publish(`schema_invalidate:${workflowId}`, JSON.stringify({
      nodeId: 'all',
      sheetName: 'all',
      timestamp: Date.now()
    }));
    
    return new Response(
      JSON.stringify({ success: true, keysRemoved: (schemaKeys?.length || 0) + (versionKeys?.length || 0) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error invalidating workflow schema cache:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle retrieving all schemas for a workflow
async function handleGetWorkflowSchemas(body, redis, corsHeaders) {
  const { workflowId } = body;
  
  if (!workflowId) {
    return new Response(
      JSON.stringify({ error: 'Missing workflowId parameter' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    // Get all schema cache keys for this workflow
    const schemaPattern = `schema:${workflowId}:*`;
    const keys = await redis.keys(schemaPattern);
    
    const schemas = {};
    
    if (keys && keys.length > 0) {
      // Get all schemas in one batch operation
      const values = await redis.mget(...keys);
      
      // Parse each schema and organize by nodeId
      keys.forEach((key, index) => {
        if (values[index]) {
          const parts = key.split(':');
          if (parts.length >= 3) {
            const nodeId = parts[2];
            const parsed = JSON.parse(values[index]);
            
            if (!schemas[nodeId]) {
              schemas[nodeId] = {};
            }
            
            const sheetName = parts[3] || 'default';
            schemas[nodeId][sheetName] = parsed.schema;
          }
        }
      });
    }
    
    return new Response(
      JSON.stringify({ success: true, schemas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error getting workflow schemas:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle Redis health check
async function handleHealthCheck(redis, corsHeaders) {
  try {
    // Try a simple Redis command
    const pong = await redis.ping();
    const healthy = pong === 'PONG';
    
    // Get some stats
    const stats = {
      uptime: await redis.info('server'),
      memory: await redis.info('memory'),
      stats: await redis.info('stats')
    };
    
    return new Response(
      JSON.stringify({ healthy, stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in health check:', error);
    
    return new Response(
      JSON.stringify({ healthy: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle schema propagation (original functionality)
async function handleSchemaPropagation(body, redis, supabase, corsHeaders) {
  const { workflowId, sourceNodeId, targetNodeId, sheetName, forceRefresh } = body;
  
  if (!workflowId || !sourceNodeId || !targetNodeId) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  // Standardize workflow ID (remove temp- prefix if present)
  const dbWorkflowId = workflowId.startsWith('temp-') 
    ? workflowId.substring(5) 
    : workflowId;
  
  // Acquire a distributed lock to prevent race conditions
  const lockKey = `lock:schema:${dbWorkflowId}:${sourceNodeId}:${targetNodeId}`;
  const lockAcquired = await redis.set(lockKey, '1', { nx: true, ex: 30 });
  
  if (!lockAcquired) {
    return new Response(
      JSON.stringify({ status: 'already_processing' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    console.log(`Propagating schema: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'default'}`);
    
    // Check Redis cache for source schema first
    const cacheKey = `schema:${workflowId}:${sourceNodeId}:${sheetName || 'default'}`;
    let sourceSchema = null;
    
    if (!forceRefresh) {
      const cachedSchema = await redis.get(cacheKey);
      if (cachedSchema) {
        sourceSchema = JSON.parse(cachedSchema);
        console.log(`Using cached schema for source node ${sourceNodeId}`);
      }
    }
    
    // If not in Redis cache, get source schema from database
    if (!sourceSchema) {
      const { data: dbSchema, error: sourceError } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types, file_id, sheet_name')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .is('is_temporary', false);
        
      if (sourceError || !dbSchema || dbSchema.length === 0) {
        console.error('Error or no schema found for source node:', sourceError || 'No schema found');
        return new Response(
          JSON.stringify({ error: 'Source schema not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }
      
      let schema = dbSchema[0];
      
      if (sheetName && dbSchema.length > 1) {
        const sheetSchema = dbSchema.find(s => s.sheet_name === sheetName);
        if (sheetSchema) {
          schema = sheetSchema;
        }
      }
      
      // Convert to standard format
      sourceSchema = {
        schema: schema.columns.map(column => ({
          name: column,
          type: schema.data_types[column] || 'unknown'
        })),
        fileId: schema.file_id,
        sheetName: sheetName || schema.sheet_name || 'Sheet1'
      };
      
      // Cache the retrieved schema
      await redis.set(cacheKey, JSON.stringify({
        ...sourceSchema,
        timestamp: Date.now(),
        source: 'database'
      }), { ex: 300 });
    }
    
    // Standardize column names and types
    const standardizedColumns = sourceSchema.schema.map(col => {
      // Standardize column name
      let standardName = col.name.trim().replace(/\s+/g, '_');
      standardName = standardName.replace(/[^a-zA-Z0-9_]/g, '');
      if (!/^[a-zA-Z_]/.test(standardName)) {
        standardName = 'col_' + standardName;
      }
      
      // Standardize column type
      let standardType = col.type.toLowerCase();
      if (['varchar', 'char', 'text', 'string', 'str'].includes(standardType)) {
        standardType = 'string';
      } else if (['int', 'integer', 'float', 'double', 'decimal', 'number', 'num', 'numeric'].includes(standardType)) {
        standardType = 'number';
      } else if (['date', 'datetime', 'timestamp', 'time'].includes(standardType)) {
        standardType = 'date';
      } else if (['bool', 'boolean'].includes(standardType)) {
        standardType = 'boolean';
      } else if (['object', 'json', 'map'].includes(standardType)) {
        standardType = 'object';
      } else if (['array', 'list'].includes(standardType)) {
        standardType = 'array';
      } else {
        standardType = 'string';
      }
      
      return { name: standardName, type: standardType };
    });
    
    // Check for duplicates
    const uniqueNames = new Map<string, number>();
    const finalColumns = standardizedColumns.map(col => {
      // Handle duplicate names by adding suffix
      let finalName = col.name;
      if (uniqueNames.has(finalName)) {
        const count = uniqueNames.get(finalName)! + 1;
        uniqueNames.set(finalName, count);
        finalName = `${finalName}_${count}`;
      } else {
        uniqueNames.set(finalName, 1);
      }
      
      return { name: finalName, type: col.type };
    });
    
    // Update target schema
    const targetSchema = {
      workflow_id: dbWorkflowId,
      node_id: targetNodeId,
      columns: finalColumns.map(col => col.name),
      data_types: finalColumns.reduce((acc, col) => {
        acc[col.name] = col.type;
        return acc;
      }, {} as Record<string, string>),
      file_id: sourceSchema.fileId,
      sheet_name: sheetName || sourceSchema.sheetName || 'Sheet1',
      has_headers: true,
      updated_at: new Date().toISOString()
    };
    
    const { error: targetError } = await supabase
      .from('workflow_file_schemas')
      .upsert(targetSchema, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
      
    if (targetError) {
      console.error('Error updating target schema:', targetError);
      return new Response(
        JSON.stringify({ error: 'Failed to update target schema' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    // Cache the target schema
    const targetCacheKey = `schema:${workflowId}:${targetNodeId}:${sheetName || 'default'}`;
    
    // Increment schema version
    const versionKey = `schema_version:${workflowId}:${targetNodeId}:${sheetName || 'default'}`;
    const newVersion = await redis.incr(versionKey);
    await redis.expire(versionKey, 300);
    
    await redis.set(targetCacheKey, JSON.stringify({
      schema: finalColumns,
      fileId: sourceSchema.fileId,
      sheetName: sheetName || sourceSchema.sheetName || 'Sheet1',
      timestamp: Date.now(),
      source: 'propagation',
      version: newVersion
    }), { ex: 300 });
    
    // Publish schema update notification
    await redis.publish(`schema_update:${workflowId}`, JSON.stringify({
      nodeId: targetNodeId,
      sheetName: sheetName || sourceSchema.sheetName,
      version: newVersion,
      timestamp: Date.now()
    }));
    
    console.log(`Schema successfully propagated from ${sourceNodeId} to ${targetNodeId}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        schema: finalColumns, 
        version: newVersion 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    // Always release the lock
    await redis.del(lockKey);
  }
}

// Handle subscribing to schema updates
async function handleSubscribeToSchemaUpdates(body, redis, supabase, corsHeaders) {
  const { workflowId, nodeId } = body;
  
  if (!workflowId || !nodeId) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    // Check if Redis pub/sub is available
    const pong = await redis.ping();
    const redisPubSubAvailable = pong === 'PONG';
    
    if (!redisPubSubAvailable) {
      return new Response(
        JSON.stringify({ subscribed: false, reason: 'redis_unavailable' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get the current schema to return
    const cacheKey = `schema:${workflowId}:${nodeId}:default`;
    const cachedSchema = await redis.get(cacheKey);
    
    let schema = null;
    let version = 1;
    
    if (cachedSchema) {
      const parsed = JSON.parse(cachedSchema);
      schema = parsed.schema;
      version = parsed.version || 1;
    } else {
      // No cached schema, try to get from database
      const dbWorkflowId = workflowId.startsWith('temp-') 
        ? workflowId.substring(5) 
        : workflowId;
        
      const { data: dbSchema, error } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      if (!error && dbSchema && dbSchema.columns) {
        schema = dbSchema.columns.map(column => ({
          name: column,
          type: dbSchema.data_types[column] || 'unknown'
        }));
        
        // Cache this schema
        await redis.set(cacheKey, JSON.stringify({
          schema,
          timestamp: Date.now(),
          source: 'database',
          version
        }), { ex: 300 });
      }
    }
    
    // Record subscription (could be used for tracking active subscriptions)
    const subscriptionKey = `subscription:${workflowId}:${nodeId}`;
    await redis.set(subscriptionKey, Date.now(), { ex: 300 });
    
    return new Response(
      JSON.stringify({ 
        subscribed: true,
        schema,
        version
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleSubscribeToSchemaUpdates:', error);
    
    return new Response(
      JSON.stringify({ subscribed: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle unsubscribing from schema updates
async function handleUnsubscribeFromSchemaUpdates(body, redis, corsHeaders) {
  const { workflowId, nodeId } = body;
  
  if (!workflowId || !nodeId) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    // Remove subscription record
    const subscriptionKey = `subscription:${workflowId}:${nodeId}`;
    await redis.del(subscriptionKey);
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleUnsubscribeFromSchemaUpdates:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle checking for schema updates
async function handleCheckForSchemaUpdates(body, redis, corsHeaders) {
  const { workflowId, nodeId, lastVersion } = body;
  
  if (!workflowId || !nodeId) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    // Get current schema version
    const versionKey = `schema_version:${workflowId}:${nodeId}:default`;
    const currentVersion = await redis.get(versionKey);
    
    const hasUpdates = currentVersion && lastVersion && Number(currentVersion) > Number(lastVersion);
    
    let schema = null;
    
    if (hasUpdates) {
      // Get the current schema
      const cacheKey = `schema:${workflowId}:${nodeId}:default`;
      const cachedSchema = await redis.get(cacheKey);
      
      if (cachedSchema) {
        const parsed = JSON.parse(cachedSchema);
        schema = parsed.schema;
      }
    }
    
    return new Response(
      JSON.stringify({ 
        hasUpdates: hasUpdates || false,
        currentVersion: currentVersion ? Number(currentVersion) : null,
        schema
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleCheckForSchemaUpdates:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

// Handle refreshing schema
async function handleRefreshSchema(body, redis, supabase, corsHeaders) {
  const { workflowId, nodeId } = body;
  
  if (!workflowId || !nodeId) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
  
  try {
    // Standardize workflow ID
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get schema from database
    const { data: dbSchema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, sheet_name')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (error || !dbSchema) {
      return new Response(
        JSON.stringify({ error: error?.message || 'Schema not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }
    
    // Convert to schema format
    const schema = dbSchema.columns.map(column => ({
      name: column,
      type: dbSchema.data_types[column] || 'unknown'
    }));
    
    // Cache the schema
    const cacheKey = `schema:${workflowId}:${nodeId}:${dbSchema.sheet_name || 'default'}`;
    const versionKey = `schema_version:${workflowId}:${nodeId}:${dbSchema.sheet_name || 'default'}`;
    
    // Increment version
    const newVersion = await redis.incr(versionKey);
    await redis.expire(versionKey, 300);
    
    await redis.set(cacheKey, JSON.stringify({
      schema,
      timestamp: Date.now(),
      source: 'refresh',
      version: newVersion
    }), { ex: 300 });
    
    // Publish update notification
    await redis.publish(`schema_update:${workflowId}`, JSON.stringify({
      nodeId,
      sheetName: dbSchema.sheet_name || 'default',
      version: newVersion,
      timestamp: Date.now()
    }));
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        schema,
        version: newVersion
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in handleRefreshSchema:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}
