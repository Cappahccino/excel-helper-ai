import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

interface ExcelPreviewProps {
  data: any[]
}

export const ExcelPreview = ({ data }: ExcelPreviewProps) => {
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