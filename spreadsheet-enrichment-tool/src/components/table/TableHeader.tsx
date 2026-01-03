import React, { useState } from 'react';
import type { Column, DataType } from '../../types';
import { DataType as DataTypeValues } from '../../types';
import { useApp } from '../../context/AppContext';
import { Tooltip } from '../ui/Tooltip';
import { Button } from '../ui/Button';
import {
  LinkIcon,
  HashtagIcon,
  CalendarIcon,
  DocumentTextIcon,
  TrashIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

interface TableHeaderProps {
  columns: Column[];
  projectId: string;
}

export const TableHeader: React.FC<TableHeaderProps> = ({ columns, projectId }) => {
  const { deleteColumn, renameColumn, runEnrichment, state } = useApp();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    columnName: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const handleContextMenu = (e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, columnName });
  };

  const handleRename = (columnName: string) => {
    setRenaming(columnName);
    setNewName(columnName);
    setContextMenu(null);
  };

  const handleSaveRename = (oldName: string) => {
    if (newName.trim() && newName !== oldName) {
      renameColumn(projectId, oldName, newName.trim());
    }
    setRenaming(null);
  };

  const handleDelete = (columnName: string) => {
    if (window.confirm(`Delete column "${columnName}"?`)) {
      deleteColumn(projectId, columnName);
    }
    setContextMenu(null);
  };

  const handleRunEnrichment = async (columnName: string, rowLimit?: number) => {
    await runEnrichment(projectId, columnName, rowLimit);
  };

  const getDataTypeIcon = (dataType: DataType) => {
    switch (dataType) {
      case DataTypeValues.URL:
        return <LinkIcon className="h-4 w-4" />;
      case DataTypeValues.NUMBER:
        return <HashtagIcon className="h-4 w-4" />;
      case DataTypeValues.DATE:
        return <CalendarIcon className="h-4 w-4" />;
      default:
        return <DocumentTextIcon className="h-4 w-4" />;
    }
  };

  const project = state.projects.find((p) => p.id === projectId);
  const isProcessing = !!project?.processingProgress;

  React.useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      <thead className="bg-gray-50 sticky top-0 z-10">
        <tr>
          <th className="w-12 px-4 py-3 border-r border-gray-200"></th>
          {columns.map((column) => (
            <th
              key={column.name}
              onContextMenu={(e) => handleContextMenu(e, column.name)}
              className="px-4 py-3 text-left border-r border-gray-200 bg-gray-50 relative group"
            >
              {renaming === column.name ? (
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => handleSaveRename(column.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(column.name);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="w-full px-2 py-1 text-sm border border-indigo-500 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">{getDataTypeIcon(column.dataType)}</span>
                    {column.enrichmentConfig ? (
                      <Tooltip content={column.enrichmentConfig.prompt}>
                        <span className="text-sm font-semibold text-gray-900 cursor-help">
                          {column.name}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-sm font-semibold text-gray-900">{column.name}</span>
                    )}
                  </div>

                  {/* Enrichment controls */}
                  {column.enrichmentConfig && (
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRunEnrichment(column.name, 10)}
                        disabled={isProcessing}
                        className="text-xs"
                      >
                        Run 10
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleRunEnrichment(column.name)}
                        disabled={isProcessing}
                        className="text-xs"
                      >
                        Run All
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => handleRename(contextMenu.columnName)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
          >
            <PencilIcon className="h-4 w-4" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => handleDelete(contextMenu.columnName)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2 text-red-600"
          >
            <TrashIcon className="h-4 w-4" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </>
  );
};
