
import { useState, useEffect } from "react";
import { Tag } from "@/types/tags";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Loader2, Tag as TagIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TagFeedback } from "./TagFeedback";

interface TagSelectProps {
  selectedTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  isLoading?: boolean;
  error?: string;
  className?: string;
}

export function TagSelect({ 
  selectedTags, 
  onTagsChange, 
  isLoading,
  error,
  className 
}: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  useEffect(() => {
    // In a real implementation, this would fetch from your API
    // For now, we'll simulate some tags
    setAvailableTags([
      { id: '1', name: 'sales', type: 'custom' },
      { id: '2', name: 'finance', type: 'custom' },
      { id: '3', name: 'inventory', type: 'custom' },
    ]);
  }, []);

  const handleSelect = (tag: Tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      onTagsChange([...selectedTags, tag]);
    }
    setInputValue("");
  };

  const handleRemove = (tagId: string) => {
    onTagsChange(selectedTags.filter(t => t.id !== tagId));
  };

  const handleCreateNew = () => {
    if (inputValue.trim()) {
      const newTag: Tag = {
        id: `new-${Date.now()}`,
        name: inputValue.trim().toLowerCase(),
        type: 'custom'
      };
      handleSelect(newTag);
      setOpen(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between"
            disabled={isLoading}
          >
            <div className="flex items-center gap-2">
              <TagIcon className="w-4 h-4" />
              <span>{selectedTags.length > 0 ? `${selectedTags.length} tags selected` : "Select tags..."}</span>
            </div>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronsUpDown className="w-4 h-4 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search or create new tag..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandEmpty>
              <button
                className="flex items-center gap-2 p-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full"
                onClick={handleCreateNew}
              >
                Create tag "{inputValue}"
              </button>
            </CommandEmpty>
            <CommandGroup>
              {availableTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  onSelect={() => handleSelect(tag)}
                  className="flex items-center justify-between"
                >
                  <span>{tag.name}</span>
                  {selectedTags.find(t => t.id === tag.id) && (
                    <Check className="w-4 h-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {tag.name}
              <X
                className="w-3 h-3 cursor-pointer hover:text-destructive"
                onClick={() => handleRemove(tag.id)}
              />
            </Badge>
          ))}
        </div>
      )}

      {(isLoading || error) && (
        <TagFeedback
          tags={selectedTags}
          status={error ? 'error' : isLoading ? 'loading' : 'success'}
          error={error}
        />
      )}
    </div>
  );
}
