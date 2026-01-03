import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TableHeader } from './TableHeader';
import { TableRow } from './TableRow';
import { Button } from '../ui/Button';
import { MagnifyingGlassIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

export const Table: React.FC = () => {
  const {
    state,
    setSearchQuery,
    toggleRowSelection,
    deleteRows,
    exportCSV,
    setShowAddEnrichment,
  } = useApp();
  const [exportFilename, setExportFilename] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const filteredData = useMemo(() => {
    if (!activeProject) return [];
    if (!activeProject.searchQuery) return activeProject.data;

    const query = activeProject.searchQuery.toLowerCase();
    return activeProject.data.filter((row) =>
      Object.values(row).some((value) =>
        String(value || '').toLowerCase().includes(query)
      )
    );
  }, [activeProject?.data, activeProject?.searchQuery]);

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-4">No project open</p>
          <p className="text-gray-400">Upload a CSV to get started</p>
        </div>
      </div>
    );
  }

  const selectedRowIndices = Array.from(activeProject.selectedRows);
  const hasSelection = selectedRowIndices.length > 0;

  const handleDeleteSelected = () => {
    if (window.confirm(`Delete ${selectedRowIndices.length} rows?`)) {
      deleteRows(activeProject.id, selectedRowIndices);
    }
  };

  const handleExport = () => {
    setShowExportDialog(true);
  };

  const handleConfirmExport = () => {
    if (exportFilename.trim()) {
      const filename = exportFilename.trim().endsWith('.csv')
        ? exportFilename.trim()
        : `${exportFilename.trim()}.csv`;
      exportCSV(activeProject.id, filename);
      setShowExportDialog(false);
      setExportFilename('');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={activeProject.searchQuery}
              onChange={(e) => setSearchQuery(activeProject.id, e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Delete selected */}
          {hasSelection && (
            <Button variant="danger" size="sm" onClick={handleDeleteSelected}>
              <div className="flex items-center space-x-1">
                <TrashIcon className="h-4 w-4" />
                <span>Delete {selectedRowIndices.length}</span>
              </div>
            </Button>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Processing progress */}
          {activeProject.processingProgress && (
            <div className="text-sm text-gray-600">
              Processing {activeProject.processingProgress.processed}/
              {activeProject.processingProgress.total} rows...
            </div>
          )}

          {/* Export button */}
          <Button variant="secondary" size="sm" onClick={handleExport}>
            Export CSV
          </Button>

          {/* Add Enrichment button */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddEnrichment(true)}
            disabled={!!activeProject.processingProgress}
          >
            <div className="flex items-center space-x-1">
              <PlusIcon className="h-4 w-4" />
              <span>Add Enrichment</span>
            </div>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <TableHeader columns={activeProject.columns} projectId={activeProject.id} />
          <tbody>
            {filteredData.map((row, index) => (
              <TableRow
                key={index}
                row={row}
                columns={activeProject.columns}
                isSelected={activeProject.selectedRows.has(index)}
                onToggleSelect={() => toggleRowSelection(activeProject.id, index)}
              />
            ))}
          </tbody>
        </table>

        {filteredData.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No data found</p>
          </div>
        )}
      </div>

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-25 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Export CSV</h3>
            <input
              type="text"
              placeholder="Enter filename"
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmExport();
                if (e.key === 'Escape') setShowExportDialog(false);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="flex justify-end space-x-2 mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowExportDialog(false);
                  setExportFilename('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmExport}
                disabled={!exportFilename.trim()}
              >
                Export
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
