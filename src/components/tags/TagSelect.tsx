
import { useState, useRef, KeyboardEvent } from "react";
import { Tag } from "@/types/tags";
import { Input } from "@/components/ui/input";
import { TagBadge } from "./TagBadge";
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // Filter suggestions based on input
  const suggestions = tags
    .filter(tag => 
      !selectedTags.find(t => t.id === tag.id) && 
      tag.name.toLowerCase().includes(inputValue.toLowerCase())
    )
    .slice(0, 5);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setShowSuggestions(true);
    setSelectedSuggestionIndex(-1);
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        // Select existing tag
        onTagInput(suggestions[selectedSuggestionIndex].name);
      } else if (inputValue.trim()) {
        // Input new tag
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
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedTags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            onRemove={() => onRemove(tag)}
          />
        ))}
      </div>
      
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
          <div className="absolute z-10 w-full mt-1 bg-white rounded-md border shadow-lg max-h-60 overflow-auto">
            <div className="p-1">
              {suggestions.map((tag, index) => (
                <button
                  key={tag.id}
                  onClick={() => handleSuggestionClick(tag)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded",
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
