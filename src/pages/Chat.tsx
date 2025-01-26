import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BarChart2, Table2, FileSpreadsheet } from "lucide-react";

const Chat = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const workflows = [
    {
      icon: <BarChart2 className="w-8 h-8" />,
      title: "Quick Visualization",
      description: "Visually explore your spreadsheet data",
      runs: "42250 runs"
    },
    {
      icon: <Table2 className="w-8 h-8" />,
      title: "Data Cleaner",
      description: "Methodically clean your data",
      runs: "11000 runs"
    },
    {
      icon: <FileSpreadsheet className="w-8 h-8" />,
      title: "Extract Tables",
      description: "Extract tables from spreadsheets",
      runs: "4367 runs"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm fixed top-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold">Excel Helper</h1>
            <Button
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/");
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">What do you want to analyze today?</h2>
          <div className="max-w-2xl mx-auto relative">
            <Input
              type="text"
              placeholder="Add a file or start a conversation now and add files later..."
              className="w-full bg-gray-800 border-gray-700 text-white pl-4 pr-12 py-6"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Upload className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer" />
          </div>
        </div>

        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">Or start from ready workflows</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search workflows..."
                className="pl-10 bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((workflow, index) => (
              <div
                key={index}
                className="p-6 rounded-lg border border-gray-800 bg-gray-800/50 hover:bg-gray-800/70 transition-colors cursor-pointer"
              >
                <div className="mb-4 text-blue-400">{workflow.icon}</div>
                <h4 className="text-lg font-semibold mb-2">{workflow.title}</h4>
                <p className="text-gray-400 text-sm mb-4">{workflow.description}</p>
                <p className="text-xs text-gray-500">{workflow.runs}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Chat;