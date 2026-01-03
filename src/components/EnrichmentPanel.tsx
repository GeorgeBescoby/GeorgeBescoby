import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'

interface EnrichmentPanelProps {
  onEnrich: (query: string, columnName: string) => void
  isEnriching: boolean
  hasApiKey: boolean
}

export default function EnrichmentPanel({
  onEnrich,
  isEnriching,
  hasApiKey,
}: EnrichmentPanelProps) {
  const [query, setQuery] = useState('')
  const [columnName, setColumnName] = useState('')

  const handleEnrich = () => {
    if (!query.trim() || !columnName.trim()) {
      alert('Please enter both a query and column name')
      return
    }

    onEnrich(query, columnName)
  }

  const quickPrompts = [
    {
      label: 'SOC2 Compliance',
      query: 'Is this company SOC2 compliant? Answer only YES or NO.',
      column: 'SOC2_Compliant'
    },
    {
      label: 'Company Size',
      query: 'What is the approximate employee count for this company? Provide a number or range.',
      column: 'Employee_Count'
    },
    {
      label: 'Funding Status',
      query: 'Has this company raised venture capital? Answer YES or NO.',
      column: 'VC_Funded'
    },
    {
      label: 'Tech Stack',
      query: 'What are the main technologies or tech stack this company uses?',
      column: 'Tech_Stack'
    },
  ]

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-gradient-to-br from-purple-100 to-blue-100 p-2 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">AI Enrichment</h3>
          <p className="text-sm text-slate-500">
            Add intelligent insights to your leads
          </p>
        </div>
      </div>

      {!hasApiKey && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Please set your OpenAI API key in the header to enable enrichment
          </p>
        </div>
      )}

      {/* Quick Prompts */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Quick Start Templates
        </label>
        <div className="grid grid-cols-2 gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt.label}
              onClick={() => {
                setQuery(prompt.query)
                setColumnName(prompt.column)
              }}
              className="px-3 py-2 text-sm text-left bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg hover:from-blue-100 hover:to-purple-100 transition-all"
            >
              <div className="font-medium text-blue-900">{prompt.label}</div>
              <div className="text-xs text-blue-600 truncate">{prompt.column}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Query */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Enrichment Query
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g., "Is this company SOC2 compliant? Answer only YES or NO."'
            rows={3}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            This prompt will be sent to ChatGPT for each row in your dataset
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            New Column Name
          </label>
          <input
            type="text"
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
            placeholder="e.g., SOC2_Compliant"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
          <p className="mt-1 text-xs text-slate-500">
            Results will be added to this column
          </p>
        </div>

        <button
          onClick={handleEnrich}
          disabled={isEnriching || !hasApiKey}
          className={`
            w-full px-6 py-3 font-medium rounded-lg transition-all shadow-md
            ${
              isEnriching || !hasApiKey
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 hover:shadow-lg transform hover:scale-[1.02]'
            }
          `}
        >
          {isEnriching ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Enriching Data...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" />
              Enrich All Rows
            </span>
          )}
        </button>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          💡 <strong>Pro Tip:</strong> Be specific in your queries for best results.
          Ask for specific formats like "YES/NO" or provide context about what you're looking for.
        </p>
      </div>
    </div>
  )
}
