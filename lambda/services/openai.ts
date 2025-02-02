import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export const analyzeExcelData = async (jsonData: any[], query: string) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are analyzing Excel data. Provide clear, concise insights."
      },
      {
        role: "user",
        content: `Analyze this Excel data: ${JSON.stringify(jsonData.slice(0, 100))}. Query: ${query}`
      }
    ]
  });

  return completion;
};