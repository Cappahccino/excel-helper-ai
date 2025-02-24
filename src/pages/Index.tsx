
import { useNavigate } from "react-router-dom";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { SignUpDialog } from "@/components/SignUpDialog";
import { SignInDialog } from "@/components/SignInDialog";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F2FCE2] via-white to-[#E8F9E3]">
      <nav className="w-full py-4 px-8 flex items-center justify-between border-b bg-white/80 backdrop-blur-sm">
        <div className="flex-1"></div>
        <div className="flex items-center justify-center flex-1">
          <img 
            src="/lovable-uploads/ed952818-c1cf-45d2-a8ed-ec764da497cc.png" 
            alt="Tallyze Logo" 
            className="h-10"
          />
        </div>
        <div className="flex items-center justify-end gap-4 flex-1">
          <SignInDialog />
          <SignUpDialog />
        </div>
      </nav>

      <section className="flex items-center justify-center w-full py-20">
        <div className="container flex flex-col items-center justify-center">
          <div className="mx-auto flex max-w-screen-lg flex-col items-center gap-6 animate-fade-up">
            <h1 className="text-center text-4xl font-bold tracking-tight lg:text-6xl text-gray-900 font-['Darker_Grotesque']">
              Analyze and Make Sense of Your Excel Files
            </h1>
            <p className="text-balance text-center text-gray-600 lg:text-lg max-w-2xl font-['Darker_Grotesque']">
              Upload your Excel file and get instant help with formulas, analysis, and troubleshooting. Our AI assistant is here to make Excel easy.
            </p>
            <RainbowButton 
              onClick={() => navigate("/auth")}
              className="bg-[#27B67A] hover:bg-[#229163] text-white font-['Darker_Grotesque']"
            >
              Get Started
            </RainbowButton>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
