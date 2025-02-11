
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ChevronDown, Info } from "lucide-react";
import { Handle, Position } from '@xyflow/react';

export default function AskAINode({ data }: { data: { label: string } }) {
  const [loopMode, setLoopMode] = useState(false);
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Card className="w-[400px] rounded-2xl border-2 border-pink-300 shadow-md p-4 bg-pink-50">
        <CardHeader className="flex flex-row justify-between items-center bg-pink-100 p-3 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white rounded-lg shadow-md">
              🤖
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{data.label}</h3>
              <p className="text-sm text-gray-600">
                Prompt an AI language model. Provide context for better results.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">Loop Mode</span>
            <Switch checked={loopMode} onCheckedChange={setLoopMode} />
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-3">
          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center space-x-1">
              Prompt <Info className="h-4 w-4 text-gray-500" />
            </label>
            <Input
              type="text"
              placeholder="Summarize the article in the context"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center space-x-1">
              Context <Info className="h-4 w-4 text-gray-500" />
            </label>
            <Input
              type="text"
              placeholder="Optional context for AI model"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Choose AI Model</label>
            <Select>
              <SelectTrigger className="mt-1">
                Claude 3 Haiku
                <ChevronDown className="ml-2 h-4 w-4 text-gray-500" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                <SelectItem value="gpt-4">GPT-4</SelectItem>
                <SelectItem value="mistral">Mistral</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setShowMore(!showMore)}>
              Show More Options
            </Button>
          </div>

          {showMore && (
            <div className="p-3 mt-2 border rounded-lg bg-gray-50">
              <p className="text-sm text-gray-600">Advanced settings coming soon...</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
