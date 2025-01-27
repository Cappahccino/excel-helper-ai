import { useState } from 'react'
import { FileUpload } from '@/components/FileUpload'
import { ExcelPreview } from '@/components/ExcelPreview'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function Chat() {
  const [analysis, setAnalysis] = useState<string>('')
  const [previewData, setPreviewData] = useState<any[]>([])
  const [userPrompt, setUserPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSendPrompt = async () => {
    if (!userPrompt.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch(
        'https://saxnxtumstrsqowuwwbt.supabase.co/functions/v1/analyze-excel',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            fileContent: previewData,
            userPrompt,
          }),
        }
      )

      const { analysis: newAnalysis, error } = await response.json()
      if (error) throw new Error(error)

      setAnalysis(newAnalysis)
      setUserPrompt('')
    } catch (error) {
      console.error('Error sending prompt:', error)
      toast({
        title: 'Error',
        description: 'Failed to process your request. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="space-y-4">
        <FileUpload
          onFileAnalyzed={setAnalysis}
          onPreviewData={setPreviewData}
        />

        {previewData.length > 0 && (
          <ExcelPreview data={previewData} />
        )}

        {analysis && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Analysis:</h3>
            <p className="whitespace-pre-wrap">{analysis}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Ask a question about your Excel file..."
            onKeyPress={(e) => e.key === 'Enter' && handleSendPrompt()}
          />
          <Button
            onClick={handleSendPrompt}
            disabled={isLoading || !userPrompt.trim()}
          >
            {isLoading ? (
              <span className="animate-spin">⌛</span>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}