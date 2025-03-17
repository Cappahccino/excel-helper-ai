
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';

/**
 * Checks schema consistency between source and target nodes
 */
export async function checkSchemaConsistency(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options?: {
    sheetName?: string;
    strict?: boolean;
  }
): Promise<{
  isConsistent: boolean;
  issues: string[];
  sourceColumns?: string[];
  targetColumns?: string[];
  missingColumns?: string[];
  extraColumns?: string[];
  typeMismatches?: { column: string; sourceType: string; targetType: string }[];
}> {
  const { sheetName = 'Sheet1', strict = false } = options || {};
  
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get source schema
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .eq('sheet_name', sheetName)
      .maybeSingle();
      
    if (sourceError || !sourceSchema) {
      return {
        isConsistent: false,
        issues: [`Source schema not found: ${sourceError?.message || 'No schema'}`]
      };
    }
    
    // Get target schema
    const { data: targetSchema, error: targetError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .eq('sheet_name', sheetName)
      .maybeSingle();
      
    if (targetError) {
      return {
        isConsistent: false,
        issues: [`Error fetching target schema: ${targetError.message}`]
      };
    }
    
    if (!targetSchema) {
      return {
        isConsistent: false,
        issues: ['Target node has no schema'],
        sourceColumns: sourceSchema.columns
      };
    }
    
    const sourceColumns = sourceSchema.columns || [];
    const targetColumns = targetSchema.columns || [];
    
    // Start comparison
    const issues: string[] = [];
    const missingColumns: string[] = [];
    const extraColumns: string[] = [];
    const typeMismatches: { column: string; sourceType: string; targetType: string }[] = [];
    
    // Check for missing columns in target
    for (const column of sourceColumns) {
      if (!targetColumns.includes(column)) {
        missingColumns.push(column);
        issues.push(`Column "${column}" exists in source but not in target`);
      } else {
        // Check data types for columns that exist in both
        const sourceType = sourceSchema.data_types[column] || 'unknown';
        const targetType = targetSchema.data_types[column] || 'unknown';
        
        if (sourceType !== targetType) {
          typeMismatches.push({
            column,
            sourceType,
            targetType
          });
          
          issues.push(`Type mismatch for column "${column}": source=${sourceType}, target=${targetType}`);
        }
      }
    }
    
    // Check for extra columns in target (only if strict mode)
    if (strict) {
      for (const column of targetColumns) {
        if (!sourceColumns.includes(column)) {
          extraColumns.push(column);
          issues.push(`Column "${column}" exists in target but not in source`);
        }
      }
    }
    
    return {
      isConsistent: issues.length === 0,
      issues,
      sourceColumns,
      targetColumns,
      missingColumns: missingColumns.length > 0 ? missingColumns : undefined,
      extraColumns: extraColumns.length > 0 ? extraColumns : undefined,
      typeMismatches: typeMismatches.length > 0 ? typeMismatches : undefined
    };
  } catch (error) {
    console.error('Error in checkSchemaConsistency:', error);
    return {
      isConsistent: false,
      issues: [(error as Error).message]
    };
  }
}

/**
 * Fix schema inconsistencies by updating the target schema
 */
export async function fixSchemaInconsistencies(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options?: {
    sheetName?: string;
    autoFix?: boolean;
  }
): Promise<{
  success: boolean;
  message: string;
  fixedIssues?: number;
}> {
  const { sheetName = 'Sheet1', autoFix = false } = options || {};
  
  try {
    // First check consistency
    const consistency = await checkSchemaConsistency(workflowId, sourceNodeId, targetNodeId, {
      sheetName
    });
    
    if (consistency.isConsistent) {
      return {
        success: true,
        message: 'Schema is already consistent'
      };
    }
    
    if (!autoFix) {
      return {
        success: false,
        message: `Schema inconsistencies found: ${consistency.issues.join(', ')}`
      };
    }
    
    // Auto-fix mode
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get source schema for update
    const { data: sourceSchema, error: sourceError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .eq('sheet_name', sheetName)
      .maybeSingle();
      
    if (sourceError || !sourceSchema) {
      return {
        success: false,
        message: `Cannot fix: ${sourceError?.message || 'Source schema not found'}`
      };
    }
    
    // Update target schema
    const { error: updateError } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: dbWorkflowId,
        node_id: targetNodeId,
        columns: sourceSchema.columns,
        data_types: sourceSchema.data_types,
        file_id: sourceSchema.file_id,
        sheet_name: sheetName,
        has_headers: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
      
    if (updateError) {
      return {
        success: false,
        message: `Error updating target schema: ${updateError.message}`
      };
    }
    
    // Calculate fixes
    const fixedIssues = (consistency.missingColumns?.length || 0) + 
                         (consistency.typeMismatches?.length || 0);
    
    return {
      success: true,
      message: `Fixed ${fixedIssues} schema inconsistencies`,
      fixedIssues
    };
  } catch (error) {
    console.error('Error in fixSchemaInconsistencies:', error);
    return {
      success: false,
      message: `Error: ${(error as Error).message}`
    };
  }
}

/**
 * Check and enforce schema consistency across the workflow
 */
export async function enforceWorkflowSchemaConsistency(
  workflowId: string,
  options?: {
    autoFix?: boolean;
    notifyUser?: boolean;
  }
): Promise<{
  consistencyStatus: 'consistent' | 'inconsistent' | 'fixed' | 'error';
  issues: string[];
  fixedIssues: number;
}> {
  const { autoFix = false, notifyUser = true } = options || {};
  
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get all edges in the workflow
    const { data: edges, error: edgeError } = await supabase
      .from('workflow_edges')
      .select('source_node_id, target_node_id')
      .eq('workflow_id', dbWorkflowId);
      
    if (edgeError) {
      console.error('Error fetching workflow edges:', edgeError);
      return {
        consistencyStatus: 'error',
        issues: [`Error fetching workflow structure: ${edgeError.message}`],
        fixedIssues: 0
      };
    }
    
    if (!edges || edges.length === 0) {
      return {
        consistencyStatus: 'consistent',
        issues: [],
        fixedIssues: 0
      };
    }
    
    // Check each connection for consistency
    const allIssues: string[] = [];
    let totalFixedIssues = 0;
    
    for (const edge of edges) {
      const { source_node_id, target_node_id } = edge;
      
      // Skip if missing IDs
      if (!source_node_id || !target_node_id) continue;
      
      // Check consistency
      const consistency = await checkSchemaConsistency(workflowId, source_node_id, target_node_id);
      
      if (!consistency.isConsistent) {
        // Add connection context to issues
        const contextualIssues = consistency.issues.map(issue => 
          `${source_node_id} → ${target_node_id}: ${issue}`
        );
        
        allIssues.push(...contextualIssues);
        
        // Try to fix if configured
        if (autoFix) {
          const fixResult = await fixSchemaInconsistencies(workflowId, source_node_id, target_node_id, {
            autoFix: true
          });
          
          if (fixResult.success) {
            totalFixedIssues += fixResult.fixedIssues || 0;
          } else {
            allIssues.push(`Failed to fix ${source_node_id} → ${target_node_id}: ${fixResult.message}`);
          }
        }
      }
    }
    
    // Determine overall status
    let consistencyStatus: 'consistent' | 'inconsistent' | 'fixed' | 'error' = 'consistent';
    
    if (allIssues.length > 0) {
      if (totalFixedIssues > 0) {
        consistencyStatus = 'fixed';
      } else {
        consistencyStatus = 'inconsistent';
      }
    }
    
    // Notify user if configured
    if (notifyUser) {
      if (consistencyStatus === 'inconsistent') {
        toast.warning('Schema inconsistencies detected');
      } else if (consistencyStatus === 'fixed') {
        toast.success(`Fixed ${totalFixedIssues} schema inconsistencies`);
      }
    }
    
    return {
      consistencyStatus,
      issues: allIssues,
      fixedIssues: totalFixedIssues
    };
  } catch (error) {
    console.error('Error in enforceWorkflowSchemaConsistency:', error);
    return {
      consistencyStatus: 'error',
      issues: [`Error: ${(error as Error).message}`],
      fixedIssues: 0
    };
  }
}
