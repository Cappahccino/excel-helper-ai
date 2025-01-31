import React from "react";

export function ChatHeader() {
  return (
    <nav className="bg-gray-900/50 backdrop-blur-sm fixed top-0 w-full z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold text-excel font-bricolage">New Chat</h1>
          </div>
        </div>
      </div>
    </nav>
  );
}