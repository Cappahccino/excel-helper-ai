
/**
 * Highlight search terms in the provided text
 * This is a simple implementation that wraps matches in a placeholder that can be styled
 * 
 * @param text The text to search in
 * @param searchTerm The term to highlight
 * @returns Text with highlighted search terms
 */
export const highlightSearchTerms = (text: string, searchTerm: string): string => {
  if (!searchTerm.trim()) {
    return text;
  }

  // Simple highlighting by wrapping matched terms in a special marker
  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '**$1**');
};
