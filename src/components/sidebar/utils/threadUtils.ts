
import { ThreadMetadata } from "../types/thread";

export const transformThreadMetadata = (metadata: unknown): ThreadMetadata | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  
  const meta = metadata as Record<string, unknown>;
  if ('title' in meta || 'summary' in meta) {
    return {
      title: typeof meta.title === 'string' ? meta.title : null,
      summary: typeof meta.summary === 'string' ? meta.summary : null
    };
  }
  return null;
};
