
export function MessageLoadingState() {
  return (
    <div className="flex items-center gap-2 py-3 min-h-[40px]">
      <div className="flex space-x-1">
        <span className="h-2 w-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
        <span className="h-2 w-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
        <span className="h-2 w-2 bg-blue-500 rounded-full animate-bounce"></span>
      </div>
      <span className="text-sm text-gray-600">
        Thinking...
      </span>
    </div>
  );
}
