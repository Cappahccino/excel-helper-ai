import React from "react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";

interface ChatInputProps {
  placeholders: string[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export function ChatInput({
  placeholders,
  searchQuery,
  setSearchQuery,
  handleSubmit,
}: ChatInputProps) {
  return (
    <div className="mt-8">
      <PlaceholdersAndVanishInput
        placeholders={placeholders}
        onChange={(e) => setSearchQuery(e.target.value)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}