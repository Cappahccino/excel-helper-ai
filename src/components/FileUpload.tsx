import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from './ui/button'
import { Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from './ui/use-toast'

interface FileUploadProps {
  onFileAnalyzed: (analysis: string) => void
  onPreviewData: (data: any[]) => void
}

export const FileUpload = ({ onFileAnalyzed, onPreviewData }: FileUploadProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an Excel file (.xlsx or .xls)',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      // Read the file
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      // Preview first 20 rows
      const previewData = jsonData.slice(0, 20)
      onPreviewData(previewData)

      // Upload file to Supabase Storage
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('User not authenticated')

      const filePath = `${userData.user.id}/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Store file metadata in database
      const { error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          user_id: userData.user.id,
        })

      if (dbError) throw dbError

      // Call Edge Function to analyze file
      const response = await fetch(
        'https://saxnxtumstrsqowuwwbt.supabase.co/functions/v1/analyze-excel',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            fileContent: jsonData,
            userPrompt: '',
          }),
        }
      )

      const { analysis, error } = await response.json()
      if (error) throw new Error(error)

      onFileAnalyzed(analysis)
      
      toast({
        title: 'Success',
        description: 'File uploaded and analyzed successfully',
      })
    } catch (error) {
      console.error('Error processing file:', error)
      toast({
        title: 'Error',
        description: 'Failed to process file. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  })

  return (
    <div
      {...getRootProps()}
      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
    >
      <input {...getInputProps()} />
      <Button disabled={isLoading} variant="outline" className="w-full">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : isDragActive ? (
          'Drop the file here'
        ) : (
          'Upload Excel File'
        )}
      </Button>
    </div>
  )
}