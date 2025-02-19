
import { useState } from "react";
import { Tag } from "@/types/tags";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { TagBadge } from "./TagBadge";
import { Check, ChevronsUpDown, Plus, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagSelectProps {
  tags: Tag[];
  selectedTags: Tag[];
  onSelect: (tag: Tag) => void;
  onRemove: (tag: Tag) => void;
  onCreate?: (name: string) => Promise<void>;
  className?: string;
}

export function TagSelect({
  tags,
  selectedTags,
  onSelect,
  onRemove,
  onCreate,
  className
}: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Group tags by type and category
  const systemTags = tags.filter(tag => tag.is_system);
  const customTags = tags.filter(tag => !tag.is_system);

  // Group system tags by category
  const systemTagsByCategory = systemTags.reduce((acc, tag) => {
    const category = tag.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(tag);
    return acc;
  }, {} as Record<string, Tag[]>);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {selectedTags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            onRemove={() => onRemove(tag)}
          />
        ))}
      </div>
      
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-8 px-2 gap-1 w-[200px] justify-between"
            >
              <div className="flex items-center gap-2 truncate">
                <TagIcon className="h-4 w-4 shrink-0 opacity-50" />
                <span className="truncate">
                  {selectedTags.length > 0 
                    ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''} selected`
                    : "Add tags"}
                </span>
              </div>
              <ChevronsUpDown className="h-4 w-4 opacity-50 ml-auto" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput 
                placeholder="Search tags..."
                value={inputValue}
                onValueChange={setInputValue}
              />
              
              {/* System Tags */}
              {Object.entries(systemTagsByCategory).map(([category, tags]) => (
                <CommandGroup key={category} heading={category}>
                  {tags
                    .filter(tag => !selectedTags.find(t => t.id === tag.id))
                    .map((tag) => (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        onSelect={() => {
                          onSelect(tag);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedTags.find(t => t.id === tag.id) 
                              ? "opacity-100" 
                              : "opacity-0"
                          )}
                        />
                        {tag.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}

              {systemTags.length > 0 && customTags.length > 0 && (
                <CommandSeparator />
              )}

              {/* Custom Tags */}
              {customTags.length > 0 && (
                <CommandGroup heading="Custom Tags">
                  {customTags
                    .filter(tag => !selectedTags.find(t => t.id === tag.id))
                    .map((tag) => (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        onSelect={() => {
                          onSelect(tag);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedTags.find(t => t.id === tag.id) 
                              ? "opacity-100" 
                              : "opacity-0"
                          )}
                        />
                        {tag.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}

              <CommandEmpty>
                {onCreate && inputValue && (
                  <button
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full"
                    onClick={() => {
                      onCreate(inputValue);
                      setInputValue("");
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Create "{inputValue}"
                  </button>
                )}
              </CommandEmpty>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
