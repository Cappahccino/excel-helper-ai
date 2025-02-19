
import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Tag } from "@/types/tags";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagSelectProps {
  tags: Tag[];
  selectedTags: Tag[];
  onTagInput: (tagName: string) => void;
  onRemove: (tag: Tag) => void;
  className?: string;
}

export function TagSelect({
  tags,
  selectedTags,
  onTagInput,
  onRemove,
  className
}: TagSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // Filter suggestions based on input
  const suggestions = tags
    .filter(tag => 
      !selectedTags.find(t => t.id === tag.id) && 
      tag.name.toLowerCase().includes(inputValue.toLowerCase())
    )
    .slice(0, 5);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        event.target !== inputRef.current
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setShowSuggestions(true);
    setSelectedSuggestionIndex(-1);
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        onTagInput(suggestions[selectedSuggestionIndex].name);
      } else if (inputValue.trim()) {
        onTagInput(inputValue.trim());
      }
      
      setInputValue("");
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleSuggestionClick = (tag: Tag) => {
    onTagInput(tag.name);
    setInputValue("");
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className={className}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Type to add tags..."
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          className="w-full"
        />

        {showSuggestions && suggestions.length > 0 && (
          <div 
            ref={dropdownRef}
            className="absolute z-10 w-full mt-1 bg-white rounded-md border shadow-lg max-h-60 overflow-auto"
          >
            <div className="p-1">
              {suggestions.map((tag, index) => (
                <button
                  key={tag.id}
                  onClick={() => handleSuggestionClick(tag)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm rounded",
                    "hover:bg-accent hover:text-accent-foreground",
                    selectedSuggestionIndex === index && "bg-accent text-accent-foreground"
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
