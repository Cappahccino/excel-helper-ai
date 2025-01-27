import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import * as XLSX from 'xlsx'

interface ExcelPreviewProps {
  file: File | null
}

export const ExcelPreview = ({ file }: ExcelPreviewProps) => {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    const parseExcel = async () => {
      if (!file) return

      const reader = new FileReader()
      reader.onload = (e) => {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const parsedData = XLSX.utils.sheet_to_json(sheet)
        setData(parsedData.slice(0, 20)) // Limit to 20 rows
      }
      reader.readAsBinaryString(file)
    }

    parseExcel()
  }, [file])

  if (!data || data.length === 0) return null

  const headers = Object.keys(data[0])

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={index}>
              {headers.map((header) => (
                <TableCell key={`${index}-${header}`}>{row[header]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}