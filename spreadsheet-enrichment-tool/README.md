# Spreadsheet Enrichment Tool

A modern, browser-based spreadsheet enrichment tool inspired by Clay.com. Upload CSV files, create AI-powered enrichment columns using Claude API and Spider.cloud web scraping, and export enriched results.

## Features

- **CSV Upload & Management**: Import CSV files of any size with automatic data type detection
- **Multi-Project Tabs**: Work on multiple CSV files simultaneously with tab-based project management
- **AI-Powered Enrichments**:
  - **Research Enrichment**: Scrape websites with Spider.cloud and analyze with Claude API
  - **Custom LLM Enrichment**: Direct analysis using Claude API without web scraping
- **Smart Data Type Detection**: Automatically detects URLs, numbers, dates, and text
- **Column Operations**: Rename, delete, and manage columns with right-click context menus
- **Row Operations**: Select, filter, search, and delete rows
- **Real-time Processing**: Monitor enrichment progress with concurrent API calls
- **CSV Export**: Export enriched data with all columns preserved

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **UI Components**: Headless UI
- **APIs**: Anthropic Claude API + Spider.cloud API
- **CSV Handling**: PapaParse

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Claude API key from [console.anthropic.com](https://console.anthropic.com/)
- Spider.cloud API key from [spider.cloud](https://spider.cloud/)

### Installation

1. Clone this repository
2. Navigate to the project directory:
```bash
cd spreadsheet-enrichment-tool
```

3. Install dependencies:
```bash
npm install
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to the URL shown (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The build output will be in the `dist` directory. You can preview the production build with:

```bash
npm run preview
```

## Usage

### 1. Configure API Keys

1. Click the **Settings** icon (⚙️) in the top right
2. Enter your Claude API key
3. Enter your Spider.cloud API key
4. Select your preferred Claude model (Haiku, Sonnet, or Opus)
5. Click **Save**

**Note**: API keys are stored in memory only and will be cleared when you close the browser.

### 2. Upload a CSV File

1. Click **Upload CSV** in the top navigation
2. Select your CSV file
3. The file will be parsed and displayed in a new tab

### 3. Create Enrichment Columns

1. Click **Add Enrichment** button
2. Choose enrichment type:
   - **Research**: Scrapes websites using Spider.cloud and analyzes with Claude
   - **Custom LLM**: Direct Claude analysis without web scraping
3. Enter an enrichment name (auto-generated from prompt)
4. Select input columns to reference in your prompt
5. Write your prompt using `{column_name}` syntax to reference columns
6. Click **Add Enrichment**

#### Example Prompts

**Research Enrichment** (requires domain column):
```
Is this company SOC2 compliant? Return "YES" or "NO"
```

**Custom LLM Enrichment**:
```
Analyze {company_description} and determine if B2B or B2C. Return only "B2B" or "B2C"
```

### 4. Run Enrichments

Each enrichment column has three run options:
- **Run 10**: Test on first 10 rows
- **Run All**: Process all rows
- (After running 10) **Run Remaining**: Process unprocessed rows

### 5. Column Management

Right-click on any column header to:
- **Rename**: Update column name (auto-updates all prompt references)
- **Delete**: Remove column from table

### 6. Row Management

- **Select Rows**: Click checkboxes to select rows
- **Delete Selected**: Click the delete button after selecting rows
- **Search**: Use the search bar to filter rows across all columns

### 7. Export Data

1. Click **Export CSV**
2. Enter a filename
3. Click **Export**

All columns (original + enrichments) will be included in the export.

## Project Structure

```
src/
├── components/
│   ├── table/
│   │   ├── Table.tsx          # Main table component
│   │   ├── TableHeader.tsx    # Column headers with controls
│   │   ├── TableRow.tsx       # Individual table rows
│   │   └── TableCell.tsx      # Cell rendering with formatting
│   ├── modals/
│   │   ├── AddEnrichmentModal.tsx  # Enrichment creation
│   │   └── SettingsModal.tsx       # API key management
│   ├── ui/
│   │   ├── Button.tsx         # Reusable button component
│   │   ├── Modal.tsx          # Modal wrapper
│   │   ├── Dropdown.tsx       # Select dropdown
│   │   ├── Tooltip.tsx        # Tooltip component
│   │   └── Spinner.tsx        # Loading spinner
│   ├── NavBar.tsx             # Top navigation
│   └── TabBar.tsx             # Project tabs
├── context/
│   └── AppContext.tsx         # Global state management
├── services/
│   ├── csvParser.ts           # CSV parsing and export
│   ├── claudeAPI.ts           # Claude API integration
│   └── spiderAPI.ts           # Spider.cloud integration
├── types/
│   └── index.ts               # TypeScript type definitions
├── App.tsx                    # Main app component
└── main.tsx                   # Entry point
```

## Key Features Explained

### Data Type Detection

The tool automatically detects:
- **URLs**: Clickable links with link icon
- **Numbers**: Formatted with commas (e.g., 1,000)
- **Dates**: Formatted using locale date format
- **Text**: Plain text display

### Processing System

- **Concurrency**: 5 concurrent API calls at a time
- **Progress Tracking**: Real-time progress display
- **Error Handling**: Shows specific error messages with hover tooltips
- **Interruption Protection**: Warns before closing tabs or switching during processing

### Column Reference System

Use `{column_name}` syntax in prompts to reference CSV columns:
- Auto-completion when selecting columns
- Validation to ensure referenced columns exist
- Automatic updates when columns are renamed

## Limitations & Notes

- **Session-only storage**: Projects and API keys are cleared on browser close
- **Client-side processing**: All enrichment happens in the browser
- **API rate limits**: Respects Claude and Spider.cloud API rate limits
- **No retry logic**: Failed enrichments must be manually re-run

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run type-check
```

## Troubleshooting

### "API keys not configured" warning
- Click the Settings icon and enter your API keys

### Build errors with Tailwind CSS
- Ensure `@tailwindcss/postcss` is installed
- Check `postcss.config.js` uses `@tailwindcss/postcss`

### CSV upload fails
- Check file is valid CSV format
- Ensure file has headers in first row

### Enrichment errors
- Verify API keys are valid
- Check API rate limits haven't been exceeded
- Review column references in prompt are correct

## License

MIT

## Contributing

This is a demonstration project. Feel free to fork and modify for your own use.
