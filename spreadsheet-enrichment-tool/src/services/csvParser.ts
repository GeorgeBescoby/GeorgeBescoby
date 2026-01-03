import Papa from 'papaparse';
import { TableRow, Column, DataType } from '../types';

export const parseCSV = (file: File): Promise<{ data: TableRow[]; columns: Column[] }> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: false, // Keep everything as strings initially
      skipEmptyLines: false,
      complete: (results) => {
        const data = results.data as TableRow[];
        const headers = results.meta.fields || [];

        // Create columns with data type detection
        const columns: Column[] = headers.map((name) => ({
          name,
          dataType: detectDataType(data, name),
          isEnrichment: false,
        }));

        resolve({ data, columns });
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};

export const detectDataType = (data: TableRow[], columnName: string): DataType => {
  // Sample first 100 rows for type detection
  const sampleSize = Math.min(100, data.length);
  const samples = data.slice(0, sampleSize).map((row) => row[columnName]);

  let urlCount = 0;
  let numberCount = 0;
  let dateCount = 0;

  for (const value of samples) {
    if (!value || value === '') continue;

    const strValue = String(value).trim();

    // Check for URL
    if (isURL(strValue)) {
      urlCount++;
    }
    // Check for number
    else if (isNumeric(strValue)) {
      numberCount++;
    }
    // Check for date
    else if (isDate(strValue)) {
      dateCount++;
    }
  }

  const total = samples.filter(v => v && String(v).trim() !== '').length;
  if (total === 0) return DataType.TEXT;

  // If more than 70% of samples match a type, classify as that type
  const threshold = 0.7;

  if (urlCount / total > threshold) return DataType.URL;
  if (numberCount / total > threshold) return DataType.NUMBER;
  if (dateCount / total > threshold) return DataType.DATE;

  return DataType.TEXT;
};

const isURL = (str: string): boolean => {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isNumeric = (str: string): boolean => {
  // Remove commas and check if it's a number
  const cleaned = str.replace(/,/g, '');
  return !isNaN(Number(cleaned)) && cleaned.trim() !== '';
};

const isDate = (str: string): boolean => {
  // Basic date detection
  const date = new Date(str);
  return !isNaN(date.getTime()) && str.match(/\d/) !== null;
};

export const exportToCSV = (data: TableRow[], columns: Column[], filename: string): void => {
  const csv = Papa.unparse({
    fields: columns.map(c => c.name),
    data: data.map(row => columns.map(c => row[c.name] ?? '')),
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const formatCellValue = (value: any, dataType: DataType): string | number => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const strValue = String(value);

  switch (dataType) {
    case DataType.NUMBER:
      const num = parseFloat(strValue.replace(/,/g, ''));
      return isNaN(num) ? strValue : num.toLocaleString();

    case DataType.DATE:
      const date = new Date(strValue);
      if (isNaN(date.getTime())) return strValue;
      return date.toLocaleDateString();

    case DataType.URL:
    case DataType.TEXT:
    default:
      return strValue;
  }
};
