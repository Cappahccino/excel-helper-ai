import * as XLSX from 'xlsx';

export const processExcelFile = async (fileBuffer: ArrayBuffer) => {
  const workbook = XLSX.read(new Uint8Array(fileBuffer));
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet);
};