import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';

export const TabBar: React.FC = () => {
  const { state, setActiveProject, closeProject, updateProject } = useApp();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const handleTabClick = (projectId: string) => {
    const project = state.projects.find((p) => p.id === projectId);
    if (project?.processingProgress) {
      const confirmed = window.confirm(
        'Processing in progress. Stop and switch tabs?'
      );
      if (!confirmed) return;
    }
    setActiveProject(projectId);
  };

  const handleCloseTab = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setConfirmCloseId(projectId);
  };

  const confirmClose = () => {
    if (confirmCloseId) {
      closeProject(confirmCloseId);
      setConfirmCloseId(null);
    }
  };

  const handleStartEdit = (e: React.MouseEvent, projectId: string, currentName: string) => {
    e.stopPropagation();
    setEditingTabId(projectId);
    setEditingName(currentName);
  };

  const handleSaveEdit = (projectId: string) => {
    if (editingName.trim()) {
      updateProject(projectId, { name: editingName.trim() });
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, projectId: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(projectId);
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  if (state.projects.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 flex items-center space-x-2 overflow-x-auto">
        {state.projects.map((project) => (
          <div
            key={project.id}
            onClick={() => handleTabClick(project.id)}
            className={`group flex items-center space-x-2 px-4 py-2 rounded-t-lg cursor-pointer transition-colors ${
              state.activeProjectId === project.id
                ? 'bg-white text-gray-900 shadow-sm border-t border-x border-gray-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {editingTabId === project.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleSaveEdit(project.id)}
                onKeyDown={(e) => handleKeyDown(e, project.id)}
                className="w-32 px-1 py-0.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="text-sm font-medium whitespace-nowrap">
                  {project.name}
                </span>
                <button
                  onClick={(e) => handleStartEdit(e, project.id, project.name)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-300 rounded transition-opacity"
                  title="Rename"
                >
                  <PencilIcon className="h-3 w-3" />
                </button>
              </>
            )}
            <button
              onClick={(e) => handleCloseTab(e, project.id)}
              className="ml-2 p-0.5 hover:bg-red-100 rounded transition-colors"
              title="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm Close Dialog */}
      {confirmCloseId && (
        <div className="fixed inset-0 bg-black bg-opacity-25 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Close Project</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to close this project?
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setConfirmCloseId(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmClose}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
