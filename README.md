# B2B Lead Enrichment Platform 🚀

A modern, sleek spreadsheet interface inspired by Clay.com that allows you to upload CSV files of B2B leads and enrich them with AI-powered insights using ChatGPT.

![Lead Enrichment Platform](https://img.shields.io/badge/React-18.2.0-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.2.2-blue) ![Vite](https://img.shields.io/badge/Vite-5.0.8-purple) ![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4.0-cyan)

## ✨ Features

- 📊 **Modern Spreadsheet Interface** - Beautiful, responsive table with sorting, filtering, and search
- 🤖 **AI-Powered Enrichment** - Use ChatGPT to enrich your leads with any publicly available data
- 🎯 **Custom Queries** - Ask anything about your companies (SOC2 compliance, funding status, tech stack, etc.)
- ⚡ **Real-time Updates** - See enrichment results populate in real-time
- 📥 **CSV Import/Export** - Upload CSV files and export enriched data
- 🎨 **Clay.com-Inspired Design** - Sleek, modern UI with gradient accents
- 🔒 **Secure** - API keys stored locally in your browser only

## 🎥 Demo

Upload a CSV of B2B leads and ask questions like:
- "Is this company SOC2 compliant? Answer YES or NO"
- "What is the approximate employee count?"
- "Has this company raised venture capital?"
- "What are the main technologies this company uses?"

The AI will research each company and add the answers to new columns in your spreadsheet!

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
npm run preview
```

## 📖 How to Use

### 1. Set Your OpenAI API Key

- Click the "Set API Key" button in the header
- Enter your OpenAI API key
- The key is stored locally in your browser and only used for direct API calls to OpenAI

### 2. Upload Your CSV

- Click "Choose CSV File" or drag and drop
- Your CSV should have headers in the first row
- Example columns: Company Name, Website, Industry, Location, etc.

A sample CSV file (`sample_leads.csv`) is included in this repository.

### 3. Enrich Your Data

Choose from quick-start templates or create custom queries:

**Quick Templates:**
- SOC2 Compliance
- Company Size
- Funding Status
- Tech Stack

**Custom Queries:**
1. Enter your enrichment question (e.g., "What industry is this company in?")
2. Specify the new column name (e.g., "Industry_Type")
3. Click "Enrich All Rows"

The AI will process each row and add results to your table!

### 4. Export Results

- Click "Export CSV" in the header
- Download your enriched data with all new columns included

## 🛠️ Tech Stack

- **Frontend Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **UI Components:** Custom components with Tailwind CSS
- **Table:** TanStack Table (React Table v8)
- **CSV Parsing:** PapaParse
- **AI Integration:** OpenAI API (GPT-4)
- **Icons:** Lucide React
- **Styling:** Tailwind CSS with custom gradients

## 📂 Project Structure

```
├── src/
│   ├── components/
│   │   ├── ApiKeyModal.tsx      # API key management
│   │   ├── DataTable.tsx        # Spreadsheet table component
│   │   └── EnrichmentPanel.tsx  # AI enrichment controls
│   ├── App.tsx                  # Main application component
│   ├── main.tsx                 # Application entry point
│   └── index.css                # Global styles
├── public/                      # Static assets
├── sample_leads.csv             # Sample data for testing
├── index.html                   # HTML entry point
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript configuration
├── tailwind.config.js           # Tailwind CSS configuration
└── vite.config.ts               # Vite configuration
```

## 🎨 Features in Detail

### Modern Spreadsheet Interface

- ✅ Sortable columns (click headers)
- ✅ Global search across all data
- ✅ Responsive table with scroll
- ✅ Alternating row colors
- ✅ Hover effects and smooth transitions
- ✅ Real-time data updates

### AI Enrichment

- ✅ Custom prompt support
- ✅ Pre-built templates for common queries
- ✅ Batch processing of all rows
- ✅ Progressive updates (see results as they come)
- ✅ Error handling and retry logic
- ✅ Token-efficient queries

### Security & Privacy

- 🔒 API keys stored in browser localStorage only
- 🔒 Direct API calls to OpenAI (no intermediary servers)
- 🔒 No data sent to third parties
- 🔒 Client-side only application

## 💡 Example Use Cases

1. **Sales Intelligence**
   - Enrich lead lists with company size, funding, decision-maker info

2. **Compliance Checking**
   - Check SOC2, GDPR, ISO certifications

3. **Market Research**
   - Identify tech stacks, competitors, market positioning

4. **Lead Qualification**
   - Assess company maturity, growth stage, hiring trends

## 🔧 Configuration

### Changing the AI Model

Edit `src/App.tsx` line 58:

```typescript
model: 'gpt-4', // Change to 'gpt-3.5-turbo' for faster/cheaper results
```

### Adjusting API Parameters

In `src/App.tsx`, modify the OpenAI API call:

```typescript
{
  model: 'gpt-4',
  temperature: 0.3,    // Lower = more focused, Higher = more creative
  max_tokens: 150      // Maximum response length
}
```

## 🐛 Troubleshooting

### API Key Issues
- Ensure your OpenAI API key starts with `sk-`
- Check you have credits available in your OpenAI account
- Verify the key has proper permissions

### CSV Upload Issues
- Ensure the file has headers in the first row
- Check the file is valid CSV format
- Try with the included `sample_leads.csv`

### Enrichment Errors
- Check browser console for detailed error messages
- Verify internet connection
- Ensure OpenAI API is accessible in your region

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests

## 🌟 Acknowledgments

- Inspired by [Clay.com](https://clay.com)
- Built with [OpenAI GPT-4](https://openai.com)
- UI components styled with [Tailwind CSS](https://tailwindcss.com)

## 📧 Support

For questions or issues, please open a GitHub issue.

---

**Built with ❤️ for better B2B lead intelligence**
