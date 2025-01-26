import { FileUpload } from "@/components/FileUpload";
import { Chat } from "@/components/Chat";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="flex items-center justify-center w-full py-20">
        <div className="container flex flex-col items-center justify-center">
          <div className="mx-auto flex max-w-screen-lg flex-col items-center gap-6 animate-fade-up">
            <h1 className="text-center text-4xl font-extrabold lg:text-6xl text-excel font-bricolage">
              I hate excel
            </h1>
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