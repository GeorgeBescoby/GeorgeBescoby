import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { Cog6ToothIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

export const NavBar: React.FC = () => {
  const { uploadCSV, setShowSettings, state } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await uploadCSV(file);
      } catch (error) {
        console.error('Error uploading CSV:', error);
        alert('Failed to upload CSV. Please check the file and try again.');
      }
      // Reset input so the same file can be uploaded again
      e.target.value = '';
    }
  };

  const showAPIKeyWarning = !state.apiKeys.claude || !state.apiKeys.spider;

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center space-x-3">
        <h1 className="text-xl font-bold text-gray-900">Enrichment Tool</h1>
        {showAPIKeyWarning && (
          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
            API keys not configured
          </span>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <Button variant="primary" size="md" onClick={handleUploadClick}>
          <div className="flex items-center space-x-2">
            <ArrowUpTrayIcon className="h-4 w-4" />
            <span>Upload CSV</span>
          </div>
        </Button>

        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="Settings"
        >
          <Cog6ToothIcon className="h-5 w-5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </nav>
  );
};
