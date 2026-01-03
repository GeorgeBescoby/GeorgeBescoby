import React, { createContext, useContext, useState, useCallback } from 'react';
import type {
  AppState,
  AppContextType,
  Project,
  EnrichmentConfig,
  APIKeys,
  Column,
} from '../types';
import {
  EnrichmentType,
  ClaudeModel,
} from '../types';
import { parseCSV, exportToCSV } from '../services/csvParser';
import { callClaudeAPI } from '../services/claudeAPI';
import { scrapeWebsite } from '../services/spiderAPI';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>({
    projects: [],
    activeProjectId: null,
    apiKeys: {
      model: ClaudeModel.SONNET,
    },
    showSettings: false,
    showAddEnrichment: false,
  });

  const uploadCSV = useCallback(async (file: File) => {
    const { data, columns } = await parseCSV(file);

    const newProject: Project = {
      id: crypto.randomUUID(),
      name: file.name.replace('.csv', ''),
      data,
      columns,
      selectedRows: new Set(),
      searchQuery: '',
      processingProgress: null,
    };

    setState((prev) => ({
      ...prev,
      projects: [...prev.projects, newProject],
      activeProjectId: newProject.id,
    }));
  }, []);

  const closeProject = useCallback((projectId: string) => {
    setState((prev) => {
      const newProjects = prev.projects.filter((p) => p.id !== projectId);
      const newActiveId =
        prev.activeProjectId === projectId
          ? newProjects.length > 0
            ? newProjects[newProjects.length - 1].id
            : null
          : prev.activeProjectId;

      return {
        ...prev,
        projects: newProjects,
        activeProjectId: newActiveId,
      };
    });
  }, []);

  const setActiveProject = useCallback((projectId: string) => {
    setState((prev) => ({ ...prev, activeProjectId: projectId }));
  }, []);

  const updateProject = useCallback((projectId: string, updates: Partial<Project>) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId ? { ...p, ...updates } : p
      ),
    }));
  }, []);

  const addEnrichmentColumn = useCallback((projectId: string, config: EnrichmentConfig) => {
    setState((prev) => {
      const project = prev.projects.find((p) => p.id === projectId);
      if (!project) return prev;

      // Check for duplicate column name and auto-increment
      let columnName = config.columnName;
      let counter = 2;
      while (project.columns.some((c) => c.name === columnName)) {
        columnName = `${config.columnName} ${counter}`;
        counter++;
      }

      const newColumn: Column = {
        name: columnName,
        dataType: 'text' as any,
        isEnrichment: true,
        enrichmentConfig: { ...config, columnName },
      };

      return {
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                columns: [...p.columns, newColumn],
                data: p.data.map((row) => ({ ...row, [columnName]: null })),
              }
            : p
        ),
      };
    });
  }, []);

  const deleteColumn = useCallback((projectId: string, columnName: string) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.id !== projectId) return p;

        const newColumns = p.columns.filter((c) => c.name !== columnName);
        const newData = p.data.map((row) => {
          const { [columnName]: _, ...rest } = row;
          return rest;
        });

        return { ...p, columns: newColumns, data: newData };
      }),
    }));
  }, []);

  const renameColumn = useCallback((projectId: string, oldName: string, newName: string) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.id !== projectId) return p;

        // Update column name
        const newColumns = p.columns.map((c) => {
          if (c.name === oldName) {
            return { ...c, name: newName };
          }
          // Update references in enrichment configs
          if (c.enrichmentConfig) {
            const updatedPrompt = c.enrichmentConfig.prompt.replace(
              new RegExp(`\\{${oldName}\\}`, 'g'),
              `{${newName}}`
            );
            const updatedInputColumns = c.enrichmentConfig.inputColumns.map((col) =>
              col === oldName ? newName : col
            );
            return {
              ...c,
              enrichmentConfig: {
                ...c.enrichmentConfig,
                prompt: updatedPrompt,
                inputColumns: updatedInputColumns,
              },
            };
          }
          return c;
        });

        // Update data
        const newData = p.data.map((row) => {
          const { [oldName]: value, ...rest } = row;
          return { ...rest, [newName]: value };
        });

        return { ...p, columns: newColumns, data: newData };
      }),
    }));
  }, []);

  const runEnrichment = useCallback(
    async (projectId: string, columnName: string, rowLimit?: number) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return;

      const column = project.columns.find((c) => c.name === columnName);
      if (!column || !column.enrichmentConfig) return;

      const config = column.enrichmentConfig;
      const rowsToProcess = rowLimit ? project.data.slice(0, rowLimit) : project.data;

      // Set processing progress
      updateProject(projectId, {
        processingProgress: {
          total: rowsToProcess.length,
          processed: 0,
          columnName,
        },
      });

      // Process rows with concurrency limit
      const concurrencyLimit = 5;
      const results: { index: number; value: string; error?: string }[] = [];

      for (let i = 0; i < rowsToProcess.length; i += concurrencyLimit) {
        const batch = rowsToProcess.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(async (row, batchIndex) => {
          const actualIndex = i + batchIndex;
          try {
            let result: string;

            if (config.type === EnrichmentType.RESEARCH) {
              // Research enrichment: Spider + Claude
              const domainColumn = config.inputColumns[0];
              const domain = String(row[domainColumn] || '');

              if (!domain) {
                throw new Error('No domain provided');
              }

              // Scrape website
              const scrapedContent = await scrapeWebsite(
                domain,
                { apiKey: state.apiKeys.spider || '', maxPages: 10, timeout: 60000 }
              );

              // Concatenate all scraped content
              const fullContent = scrapedContent
                .map((page) => `URL: ${page.url}\nTitle: ${page.title}\n\n${page.content}`)
                .join('\n\n---\n\n');

              // Build final prompt
              const finalPrompt = `Based on the following website content, ${config.prompt}\n\nWebsite Content:\n${fullContent}`;

              // Call Claude
              result = await callClaudeAPI(finalPrompt, {
                apiKey: state.apiKeys.claude || '',
                model: state.apiKeys.model || ClaudeModel.SONNET,
              });
            } else {
              // Custom LLM enrichment: Claude only
              let prompt = config.prompt;

              // Replace {column_name} placeholders with actual values
              config.inputColumns.forEach((colName) => {
                const value = String(row[colName] || '');
                prompt = prompt.replace(new RegExp(`\\{${colName}\\}`, 'g'), value);
              });

              result = await callClaudeAPI(prompt, {
                apiKey: state.apiKeys.claude || '',
                model: state.apiKeys.model || ClaudeModel.SONNET,
              });
            }

            return { index: actualIndex, value: result.trim() };
          } catch (error: any) {
            return { index: actualIndex, value: '', error: error.message };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Update progress
        updateProject(projectId, {
          processingProgress: {
            total: rowsToProcess.length,
            processed: results.length,
            columnName,
          },
        });
      }

      // Update data with results
      setState((prev) => {
        const updatedProjects = prev.projects.map((p) => {
          if (p.id !== projectId) return p;

          const newData = p.data.map((row, index) => {
            const result = results.find((r) => r.index === index);
            if (!result) return row;

            return {
              ...row,
              [columnName]: result.error ? `ERROR: ${result.error}` : result.value,
            };
          });

          return { ...p, data: newData, processingProgress: null };
        });

        return { ...prev, projects: updatedProjects };
      });
    },
    [state.projects, state.apiKeys, updateProject]
  );

  const deleteRows = useCallback((projectId: string, rowIndices: number[]) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.id !== projectId) return p;

        const newData = p.data.filter((_, index) => !rowIndices.includes(index));
        return { ...p, data: newData, selectedRows: new Set() };
      }),
    }));
  }, []);

  const exportCSV = useCallback((projectId: string, filename: string) => {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;

    exportToCSV(project.data, project.columns, filename);
  }, [state.projects]);

  const setSearchQuery = useCallback((projectId: string, query: string) => {
    updateProject(projectId, { searchQuery: query });
  }, [updateProject]);

  const toggleRowSelection = useCallback((projectId: string, rowIndex: number) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.id !== projectId) return p;

        const newSelectedRows = new Set(p.selectedRows);
        if (newSelectedRows.has(rowIndex)) {
          newSelectedRows.delete(rowIndex);
        } else {
          newSelectedRows.add(rowIndex);
        }

        return { ...p, selectedRows: newSelectedRows };
      }),
    }));
  }, []);

  const setAPIKeys = useCallback((keys: APIKeys) => {
    setState((prev) => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, ...keys },
    }));
  }, []);

  const setShowSettings = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showSettings: show }));
  }, []);

  const setShowAddEnrichment = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showAddEnrichment: show }));
  }, []);

  const value: AppContextType = {
    state,
    uploadCSV,
    closeProject,
    setActiveProject,
    updateProject,
    addEnrichmentColumn,
    deleteColumn,
    renameColumn,
    runEnrichment,
    deleteRows,
    exportCSV,
    setSearchQuery,
    toggleRowSelection,
    setAPIKeys,
    setShowSettings,
    setShowAddEnrichment,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
