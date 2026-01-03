import { AppProvider } from './context/AppContext';
import { NavBar } from './components/NavBar';
import { TabBar } from './components/TabBar';
import { Table } from './components/table/Table';
import { AddEnrichmentModal } from './components/modals/AddEnrichmentModal';
import { SettingsModal } from './components/modals/SettingsModal';

function App() {
  return (
    <AppProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
        <NavBar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Table />
        </div>
        <TabBar />
        <AddEnrichmentModal />
        <SettingsModal />
      </div>
    </AppProvider>
  );
}

export default App;
