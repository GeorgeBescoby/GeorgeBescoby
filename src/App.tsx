import { useState } from 'react'
import { Upload, Sparkles } from 'lucide-react'
import Papa from 'papaparse'
import DataTable from './components/DataTable'
import EnrichmentPanel from './components/EnrichmentPanel'
import ApiKeyModal from './components/ApiKeyModal'

interface TableData {
  headers: string[]
  rows: Record<string, string>[]
}

function App() {
  const [data, setData] = useState<TableData | null>(null)
  const [apiKey, setApiKey] = useState<string>('')
  const [showApiModal, setShowApiModal] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || []
        const rows = results.data as Record<string, string>[]
        setData({ headers, rows })
      },
      error: (error) => {
        console.error('Error parsing CSV:', error)
        alert('Error parsing CSV file. Please check the file format.')
      }
    })
  }

  const handleEnrich = async (query: string, columnName: string) => {
    if (!apiKey) {
      setShowApiModal(true)
      return
    }

    if (!data) return

    setIsEnriching(true)

    try {
      const enrichedRows = [...data.rows]

      for (let i = 0; i < enrichedRows.length; i++) {
        const row = enrichedRows[i]

        // Build context from the row
        const context = Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'You are a B2B lead enrichment assistant. Provide concise, accurate answers based on publicly available information. If you cannot find the information, respond with "N/A".'
              },
              {
                role: 'user',
                content: `Given this company information: ${context}\n\nQuestion: ${query}`
              }
            ],
            temperature: 0.3,
            max_tokens: 150
          })
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`)
        }

        const result = await response.json()
        const answer = result.choices[0]?.message?.content?.trim() || 'N/A'

        enrichedRows[i] = {
          ...row,
          [columnName]: answer
        }

        // Update table progressively
        setData({
          headers: data.headers.includes(columnName)
            ? data.headers
            : [...data.headers, columnName],
          rows: enrichedRows
        })
      }
    } catch (error) {
      console.error('Enrichment error:', error)
      alert(`Enrichment failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsEnriching(false)
    }
  }

  const handleSaveApiKey = (key: string) => {
    setApiKey(key)
    setShowApiModal(false)
  }

  const exportToCSV = () => {
    if (!data) return

    const csv = Papa.unparse({
      fields: data.headers,
      data: data.rows
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `enriched_leads_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Lead Enrichment Platform
                </h1>
                <p className="text-sm text-slate-500">Powered by ChatGPT</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApiModal(true)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {apiKey ? '🔑 API Key Set' : '⚙️ Set API Key'}
              </button>
              {data && (
                <button
                  onClick={exportToCSV}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
                >
                  📥 Export CSV
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {!data ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="mb-8 inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl">
                <Upload className="w-12 h-12 text-blue-600" />
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-3">
                Upload Your B2B Leads
              </h2>
              <p className="text-slate-600 mb-8 max-w-md">
                Upload a CSV file with your lead data and start enriching with AI-powered insights
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-lg cursor-pointer hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105">
                <Upload className="w-5 h-5" />
                Choose CSV File
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-md mx-auto">
                <p className="text-sm text-blue-800">
                  💡 <strong>Tip:</strong> Your CSV should include columns like Company Name, Website, Industry, etc.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    Your Data ({data.rows.length} rows)
                  </h2>
                  <p className="text-sm text-slate-500">
                    Enrich your leads with AI-powered insights
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg cursor-pointer hover:bg-slate-200 transition-colors">
                  <Upload className="w-4 h-4" />
                  Upload New
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <DataTable data={data} />
            </div>

            <EnrichmentPanel
              onEnrich={handleEnrich}
              isEnriching={isEnriching}
              hasApiKey={!!apiKey}
            />
          </div>
        )}
      </main>

      {showApiModal && (
        <ApiKeyModal
          onSave={handleSaveApiKey}
          onClose={() => setShowApiModal(false)}
          currentKey={apiKey}
        />
      )}
    </div>
  )
}

export default App
