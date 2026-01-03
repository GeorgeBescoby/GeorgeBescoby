import { useState } from 'react'
import { X, Key, ExternalLink } from 'lucide-react'

interface ApiKeyModalProps {
  onSave: (apiKey: string) => void
  onClose: () => void
  currentKey: string
}

export default function ApiKeyModal({ onSave, onClose, currentKey }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState(currentKey)
  const [showKey, setShowKey] = useState(false)

  const handleSave = () => {
    if (!apiKey.trim()) {
      alert('Please enter a valid API key')
      return
    }
    onSave(apiKey.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="bg-gradient-to-br from-blue-100 to-purple-100 p-3 rounded-xl">
            <Key className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">OpenAI API Key</h2>
            <p className="text-sm text-slate-500">Required for AI enrichment</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-2 pr-20 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <p className="text-xs text-blue-800">
              <strong>Where to get your API key:</strong>
            </p>
            <ol className="text-xs text-blue-700 space-y-1 ml-4 list-decimal">
              <li>Go to OpenAI Platform</li>
              <li>Sign in or create an account</li>
              <li>Navigate to API Keys section</li>
              <li>Create a new API key</li>
            </ol>
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-2"
            >
              Open OpenAI Platform
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              ⚠️ <strong>Security Note:</strong> Your API key is stored locally in your browser
              and never sent to our servers. It's only used to make direct requests to OpenAI.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 font-medium text-white bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  )
}
