import { Star } from "lucide-react";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { FileUpload } from "@/components/FileUpload";
import { Chat } from "@/components/Chat";

const demoData = {
  avatars: [
    { src: "https://i.pravatar.cc/150?img=1", alt: "User 1" },
    { src: "https://i.pravatar.cc/150?img=2", alt: "User 2" },
    { src: "https://i.pravatar.cc/150?img=3", alt: "User 3" },
  ],
  rating: {
    value: 4.9,
    count: 150,
  },
};

const Index = () => {
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
          </div>

          <div className="mt-10 flex w-full max-w-fit flex-col items-center justify-center gap-4 sm:flex-row">
            <span className="inline-flex items-center -space-x-4">
              {demoData.avatars.map((avatar, index) => (
                <Avatar key={index} className="h-14 w-14 border">
                  <AvatarImage src={avatar.src} alt={avatar.alt} />
                </Avatar>
              ))}
            </span>
            <div className="flex flex-col items-center sm:items-start">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, index) => (
                  <Star
                    key={index}
                    className="h-5 w-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
                <span className="font-semibold">{demoData.rating.value}</span>
              </div>
              <p className="font-medium text-muted-foreground">
                from {demoData.rating.count}+ happy users
              </p>
            </div>
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