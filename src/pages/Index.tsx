import { FileUpload } from "@/components/FileUpload";
import { Chat } from "@/components/Chat";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { useNavigate } from "react-router-dom";
import { SignUpDialog } from "@/components/SignUpDialog";
import { SignInDialog } from "@/components/SignInDialog";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="w-full py-4 px-8 flex items-center justify-between border-b bg-white">
        <div className="flex-1"></div>
        <h1 className="text-2xl font-bold text-excel font-bricolage flex-1 text-center">
          I hate excel
        </h1>
        <div className="flex items-center justify-end gap-4 flex-1">
          <SignInDialog />
          <SignUpDialog />
        </div>
      </nav>
      <section className="flex items-center justify-center w-full py-20">
        <div className="container flex flex-col items-center justify-center">
          <div className="mx-auto flex max-w-screen-lg flex-col items-center gap-6 animate-fade-up">
            <h2 className="text-center text-4xl font-light tracking-tight lg:text-6xl text-black font-gt-super">
              Analyze and make sense of your Excel files
            </h2>
            <p className="text-balance text-center text-muted-foreground lg:text-lg max-w-2xl">
              Upload your Excel file and get instant help with formulas, analysis, and troubleshooting. Our AI assistant is here to make Excel easy.
            </p>
            <RainbowButton onClick={() => navigate("/auth")}>
              Get Started
            </RainbowButton>
          </div>

          <div className="mt-16 w-full max-w-4xl space-y-8 p-4">
            <FileUpload />
            <Chat />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;