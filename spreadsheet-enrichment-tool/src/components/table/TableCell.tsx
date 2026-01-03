import React from 'react';
import type { CellValue, DataType } from '../../types';
import { DataType as DataTypeValues } from '../../types';
import { formatCellValue } from '../../services/csvParser';
import { Spinner } from '../ui/Spinner';
import { ExclamationCircleIcon, LinkIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '../ui/Tooltip';

interface TableCellProps {
  value: CellValue;
  dataType: DataType;
  isProcessing?: boolean;
}

export const TableCell: React.FC<TableCellProps> = ({
  value,
  dataType,
  isProcessing = false,
}) => {
  if (isProcessing) {
    return (
      <td className="px-4 py-3 border-r border-gray-200">
        <div className="flex items-center justify-center">
          <Spinner size="sm" />
        </div>
      </td>
    );
  }

  const formattedValue = formatCellValue(value, dataType);
  const isErrorCell = typeof formattedValue === 'string' && formattedValue.startsWith('ERROR:');

  if (isErrorCell) {
    const errorMessage = formattedValue.replace('ERROR: ', '');
    return (
      <td className="px-4 py-3 border-r border-gray-200">
        <Tooltip content={errorMessage}>
          <div className="flex items-center space-x-2 text-red-600">
            <ExclamationCircleIcon className="h-4 w-4" />
            <span className="text-xs">Error</span>
          </div>
        </Tooltip>
      </td>
    );
  }

  if (dataType === DataTypeValues.URL && formattedValue) {
    return (
      <td className="px-4 py-3 border-r border-gray-200">
        <a
          href={String(formattedValue)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          <LinkIcon className="h-3 w-3" />
          <span className="text-sm truncate max-w-xs">{formattedValue}</span>
        </a>
      </td>
    );
  }

  return (
    <td className="px-4 py-3 border-r border-gray-200">
      <span className="text-sm text-gray-900">{formattedValue || ''}</span>
    </td>
  );
};
