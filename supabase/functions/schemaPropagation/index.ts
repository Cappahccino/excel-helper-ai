
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
    const { workflowId, sourceNodeId, targetNodeId, sheetName, forceRefresh } = await req.json();
    
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
          sourceSchema = JSON.parse(cachedSchema as string);
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
          columns: schema.columns.map(column => ({
            name: column,
            type: schema.data_types[column] || 'unknown'
          })),
          fileId: schema.file_id,
          sheetName: sheetName || schema.sheet_name || 'Sheet1'
        };
        
        // Cache the retrieved schema
        await redis.set(cacheKey, JSON.stringify(sourceSchema), { ex: 300 });
      }
      
      // Standardize column names and types
      const standardizedColumns = sourceSchema.columns.map(col => {
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
      await redis.set(targetCacheKey, JSON.stringify({
        columns: finalColumns,
        fileId: sourceSchema.fileId,
        sheetName: sheetName || sourceSchema.sheetName || 'Sheet1'
      }), { ex: 300 });
      
      // Increment schema version
      const versionKey = `schema_version:${workflowId}:${targetNodeId}:${sheetName || 'default'}`;
      const newVersion = await redis.incr(versionKey);
      await redis.expire(versionKey, 300);
      
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
  } catch (error) {
    console.error('Error in schema propagation:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
