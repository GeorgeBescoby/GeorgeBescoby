import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import { ClaudeModel } from '../../types';
import { validateAPIKey } from '../../services/claudeAPI';
import { validateSpiderAPIKey } from '../../services/spiderAPI';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

export const SettingsModal: React.FC = () => {
  const { state, setShowSettings, setAPIKeys } = useApp();
  const [claudeKey, setClaudeKey] = useState(state.apiKeys.claude || '');
  const [spiderKey, setSpiderKey] = useState(state.apiKeys.spider || '');
  const [model, setModel] = useState<ClaudeModel>(state.apiKeys.model || ClaudeModel.SONNET);
  const [validating, setValidating] = useState(false);
  const [claudeValid, setClaudeValid] = useState<boolean | null>(null);
  const [spiderValid, setSpiderValid] = useState<boolean | null>(null);

  const isOpen = state.showSettings;

  const handleSave = async () => {
    setValidating(true);
    setClaudeValid(null);
    setSpiderValid(null);

    let isValid = true;

    // Validate Claude API key if provided
    if (claudeKey.trim()) {
      const valid = await validateAPIKey(claudeKey.trim());
      setClaudeValid(valid);
      if (!valid) isValid = false;
    }

    // Validate Spider API key if provided
    if (spiderKey.trim()) {
      const valid = await validateSpiderAPIKey(spiderKey.trim());
      setSpiderValid(valid);
      if (!valid) isValid = false;
    }

    setValidating(false);

    if (isValid || (!claudeKey.trim() && !spiderKey.trim())) {
      setAPIKeys({
        claude: claudeKey.trim() || undefined,
        spider: spiderKey.trim() || undefined,
        model,
      });

      if (isValid) {
        setShowSettings(false);
      }
    }
  };

  const handleClose = () => {
    setClaudeKey(state.apiKeys.claude || '');
    setSpiderKey(state.apiKeys.spider || '');
    setModel(state.apiKeys.model || ClaudeModel.SONNET);
    setClaudeValid(null);
    setSpiderValid(null);
    setShowSettings(false);
  };

  const modelOptions = [
    { value: ClaudeModel.HAIKU, label: 'Claude Haiku (Fastest)' },
    { value: ClaudeModel.SONNET, label: 'Claude Sonnet (Balanced)' },
    { value: ClaudeModel.OPUS, label: 'Claude Opus (Most Capable)' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Settings" size="md">
      <div className="space-y-4">
        {/* Claude API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Claude API Key
          </label>
          <div className="relative">
            <input
              type="password"
              value={claudeKey}
              onChange={(e) => {
                setClaudeKey(e.target.value);
                setClaudeValid(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-10"
              placeholder="sk-ant-..."
            />
            {claudeValid !== null && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {claudeValid ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircleIcon className="h-5 w-5 text-red-500" />
                )}
              </div>
            )}
          </div>
          {claudeValid === false && (
            <p className="text-xs text-red-600 mt-1">Invalid Claude API key</p>
          )}
        </div>

        {/* Spider API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Spider.cloud API Key
          </label>
          <div className="relative">
            <input
              type="password"
              value={spiderKey}
              onChange={(e) => {
                setSpiderKey(e.target.value);
                setSpiderValid(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-10"
              placeholder="spider_..."
            />
            {spiderValid !== null && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {spiderValid ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircleIcon className="h-5 w-5 text-red-500" />
                )}
              </div>
            )}
          </div>
          {spiderValid === false && (
            <p className="text-xs text-red-600 mt-1">Invalid Spider API key</p>
          )}
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Claude Model
          </label>
          <Dropdown
            options={modelOptions}
            value={model}
            onChange={(value) => setModel(value as ClaudeModel)}
          />
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            API keys are stored in memory only and will be cleared when you close the browser.
            Get your Claude API key from{' '}
            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-900"
            >
              console.anthropic.com
            </a>
            {' '}and Spider API key from{' '}
            <a
              href="https://spider.cloud/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-900"
            >
              spider.cloud
            </a>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={validating}
          >
            {validating ? 'Validating...' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
