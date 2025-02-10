
import { Button } from "@/components/ui/button";
import { 
  FolderPlus, 
  FilePlus, 
  BookOpen, 
  Info,
  Template
} from "lucide-react";

export default function Workflows() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Create New Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Create New</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:border-excel hover:text-excel group"
            onClick={() => {/* TODO: Implement folder creation */}}
          >
            <FolderPlus className="h-8 w-8 group-hover:text-excel" />
            <span>Create Folder</span>
          </Button>
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:border-excel hover:text-excel group"
            onClick={() => {/* TODO: Implement workflow creation */}}
          >
            <FilePlus className="h-8 w-8 group-hover:text-excel" />
            <span>Create Workflow</span>
          </Button>
        </div>
      </section>

      {/* Templates Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Data Cleanup",
              description: "Automatically clean and format Excel data",
              icon: <Template className="h-6 w-6" />,
            },
            {
              title: "Report Generator",
              description: "Generate reports from Excel data",
              icon: <Template className="h-6 w-6" />,
            },
            {
              title: "Data Merger",
              description: "Merge multiple Excel files into one",
              icon: <Template className="h-6 w-6" />,
            },
          ].map((template, index) => (
            <div
              key={index}
              className="border rounded-lg p-6 hover:border-excel cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                {template.icon}
                <h3 className="font-semibold">{template.title}</h3>
              </div>
              <p className="text-gray-600 text-sm">{template.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Resources Section */}
      <section>
        <h2 className="text-2xl font-bold mb-6">Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="/docs/quickstart"
            className="flex items-start gap-4 p-6 border rounded-lg hover:border-excel group"
          >
            <BookOpen className="h-6 w-6 flex-shrink-0 group-hover:text-excel" />
            <div>
              <h3 className="font-semibold mb-2">Quick Start Guide</h3>
              <p className="text-sm text-gray-600">
                Learn the basics of creating and managing workflows
              </p>
            </div>
          </a>
          <a
            href="/docs/tips"
            className="flex items-start gap-4 p-6 border rounded-lg hover:border-excel group"
          >
            <Info className="h-6 w-6 flex-shrink-0 group-hover:text-excel" />
            <div>
              <h3 className="font-semibold mb-2">Tips & Tricks</h3>
              <p className="text-sm text-gray-600">
                Get the most out of your automation workflows
              </p>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
