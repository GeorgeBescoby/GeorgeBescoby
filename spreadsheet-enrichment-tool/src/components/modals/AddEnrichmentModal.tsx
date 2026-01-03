import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import { EnrichmentType } from '../../types';

export const AddEnrichmentModal: React.FC = () => {
  const { state, setShowAddEnrichment, addEnrichmentColumn } = useApp();
  const [enrichmentType, setEnrichmentType] = useState<EnrichmentType>(EnrichmentType.CUSTOM_LLM);
  const [enrichmentName, setEnrichmentName] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const isOpen = state.showAddEnrichment;

  const columnOptions = activeProject?.columns.map((col) => ({
    value: col.name,
    label: col.name,
  })) || [];

  // Auto-generate enrichment name from prompt
  useEffect(() => {
    if (prompt && !enrichmentName) {
      const words = prompt.split(' ').slice(0, 3).join(' ');
      const generated = words.length > 30 ? words.substring(0, 30) + '...' : words;
      setEnrichmentName(generated);
    }
  }, [prompt]);

  const handleColumnSelect = (value: string | string[]) => {
    const columns = Array.isArray(value) ? value : [value];
    setSelectedColumns(columns);

    // Insert {column_name} at cursor position
    if (textareaRef.current && columns.length > 0) {
      const textarea = textareaRef.current;
      const cursorPos = textarea.selectionStart;
      const textBefore = prompt.substring(0, cursorPos);
      const textAfter = prompt.substring(cursorPos);
      const columnRef = `{${columns[columns.length - 1]}}`;

      setPrompt(textBefore + columnRef + textAfter);

      // Set cursor position after inserted text
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          cursorPos + columnRef.length,
          cursorPos + columnRef.length
        );
      }, 0);
    }
  };

  const validatePrompt = (): boolean => {
    // Extract {column_name} references from prompt
    const matches = prompt.match(/\{([^}]+)\}/g);
    if (!matches) return true;

    const columnNames = activeProject?.columns.map((c) => c.name) || [];
    for (const match of matches) {
      const columnName = match.slice(1, -1);
      if (!columnNames.includes(columnName)) {
        setError(`Column "${columnName}" does not exist`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = () => {
    setError('');

    if (!enrichmentName.trim()) {
      setError('Enrichment name is required');
      return;
    }

    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    if (!validatePrompt()) {
      return;
    }

    if (selectedColumns.length === 0) {
      setError('Please select at least one input column');
      return;
    }

    if (!activeProject) return;

    // Extract all column references from prompt
    const matches = prompt.match(/\{([^}]+)\}/g);
    const referencedColumns = matches ? matches.map((m) => m.slice(1, -1)) : [];

    addEnrichmentColumn(activeProject.id, {
      type: enrichmentType,
      prompt: prompt.trim(),
      inputColumns: [...new Set([...selectedColumns, ...referencedColumns])],
      columnName: enrichmentName.trim(),
    });

    // Reset form
    setEnrichmentType(EnrichmentType.CUSTOM_LLM);
    setEnrichmentName('');
    setSelectedColumns([]);
    setPrompt('');
    setError('');
    setShowAddEnrichment(false);
  };

  const handleClose = () => {
    setEnrichmentType(EnrichmentType.CUSTOM_LLM);
    setEnrichmentName('');
    setSelectedColumns([]);
    setPrompt('');
    setError('');
    setShowAddEnrichment(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Enrichment" size="lg">
      <div className="space-y-4">
        {/* Enrichment Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Enrichment Type
          </label>
          <Dropdown
            options={[
              { value: EnrichmentType.RESEARCH, label: 'Research (Spider + Claude)' },
              { value: EnrichmentType.CUSTOM_LLM, label: 'Custom LLM (Claude only)' },
            ]}
            value={enrichmentType}
            onChange={(value) => setEnrichmentType(value as EnrichmentType)}
          />
        </div>

        {/* Enrichment Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Enrichment Name
          </label>
          <input
            type="text"
            value={enrichmentName}
            onChange={(e) => setEnrichmentName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Auto-generated from prompt"
          />
        </div>

        {/* Input Column Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Input Columns
            <span className="text-xs text-gray-500 ml-2">
              (Select columns to insert into prompt)
            </span>
          </label>
          <Dropdown
            options={columnOptions}
            value={selectedColumns}
            onChange={handleColumnSelect}
            placeholder="Select columns..."
            multiple
          />
        </div>

        {/* Prompt Textarea */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Prompt
            <span className="text-xs text-gray-500 ml-2">
              (Use {'{column_name}'} syntax to reference columns)
            </span>
          </label>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
            placeholder={
              enrichmentType === EnrichmentType.RESEARCH
                ? 'Example: Is this company SOC2 compliant? Return "YES" or "NO"'
                : 'Example: Analyze {company_description} and determine if B2B or B2C. Return only "B2B" or "B2C"'
            }
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Add Enrichment
          </Button>
        </div>
      </div>
    </Modal>
  );
};
