
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, FileText, MessageCircle } from "lucide-react";

interface TabFile {
  name: string;
  size: string;
  type: string;
  icon?: React.ReactNode;
}

interface TabData {
  title: string;
  files: (string | TabFile)[];
}

const TAB_CONTENT: TabData[] = [
  {
    title: "Recent",
    files: [
      {
        name: "Sales Report 2024.xlsx",
        size: "2.3 MB",
        type: "Excel",
        icon: <Clock className="w-4 h-4" />
      },
      {
        name: "Q1 Analysis.xlsx",
        size: "1.1 MB",
        type: "Excel",
        icon: <Clock className="w-4 h-4" />
      }
    ]
  },
  {
    title: "All Files",
    files: [
      {
        name: "Financial Data.xlsx",
        size: "3.4 MB",
        type: "Excel",
        icon: <FileText className="w-4 h-4" />
      },
      {
        name: "Market Research.xlsx",
        size: "2.8 MB",
        type: "Excel",
        icon: <FileText className="w-4 h-4" />
      }
    ]
  },
  {
    title: "Conversations",
    files: [
      "What are the trends in Q1 sales?",
      "Compare revenue between regions",
      "Generate monthly report summary"
    ]
  }
];

const renderFile = (file: string | TabFile) => {
  if (typeof file === 'string') {
    return (
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-muted-foreground" />
        <span>{file}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {file.icon}
        <span>{file.name}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {file.size}
      </div>
    </div>
  );
};

const TabContent = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 lg:px-6 pb-6">
      <div className="relative w-full min-h-[400px] flex justify-center p-6 font-sans md:text-base text-xs sm:text-sm rounded-2xl shadow-lg px-0 py-0 my-0 mx-[5px] bg-zinc-50/80 backdrop-blur-sm border border-gray-100/50">
        <div className="w-11/12 md:w-4/5 relative mt-16">
          <div className="absolute inset-0" style={{
            filter: "url(#goo-filter)"
          }}>
            {/* Tab Headers */}
            <div className="flex w-full">
              {TAB_CONTENT.map((_, index) => (
                <div key={index} className="relative flex-1 h-8 md:h-10">
                  {activeTab === index && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute inset-0 bg-[#efefef]"
                      transition={{
                        type: "spring",
                        bounce: 0.0,
                        duration: 0.4
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Tab Content */}
            <div className="w-full h-[150px] sm:h-[200px] md:h-[250px] bg-[#efefef] overflow-hidden text-muted-foreground">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -50, filter: "blur(10px)" }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="p-6 md:p-8"
                >
                  <div className="space-y-4 mt-2 sm:mt-4 md:mt-4">
                    <ul className="space-y-3">
                      {TAB_CONTENT[activeTab].files.map(file => (
                        <li
                          key={typeof file === 'string' ? file : file.name}
                          className={`
                            ${typeof file === 'string' ? 'border-b border-muted-foreground/50 pt-2 pb-1' : ''} 
                            text-black
                          `}
                        >
                          {renderFile(file)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Tab Buttons */}
          <div className="relative flex w-full">
            {TAB_CONTENT.map((tab, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className="flex-1 h-8 md:h-10"
              >
                <span className={`
                  w-full h-full flex items-center justify-center
                  ${activeTab === index ? "text-black" : "text-muted-foreground"}
                `}>
                  {tab.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Filter for Gooey Effect */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="goo-filter">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
    </div>
  );
};

export default TabContent;
