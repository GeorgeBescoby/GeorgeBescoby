import React from 'react';
import type { TableRow as TableRowType, Column } from '../../types';
import { TableCell } from './TableCell';

interface TableRowProps {
  row: TableRowType;
  columns: Column[];
  isSelected: boolean;
  onToggleSelect: () => void;
}

export const TableRow: React.FC<TableRowProps> = ({
  row,
  columns,
  isSelected,
  onToggleSelect,
}) => {
  return (
    <tr className={`hover:bg-gray-50 ${isSelected ? 'bg-indigo-50' : 'bg-white'}`}>
      <td className="w-12 px-4 py-3 border-r border-gray-200">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
      </td>
      {columns.map((column) => (
        <TableCell
          key={column.name}
          value={row[column.name]}
          dataType={column.dataType}
        />
      ))}
    </tr>
  );
};
