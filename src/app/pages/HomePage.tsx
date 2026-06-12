import { useState } from 'react';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { MainContent } from '../components/MainContent';
import { RightSidebar } from '../components/RightSidebar';
import { PlatformContent } from '../components/PlatformContent';
import { Footer } from '../components/Footer';

export function HomePage() {
  const [selectedItem, setSelectedItem] = useState('1');
  const [platformSelectedItem, setPlatformSelectedItem] = useState('');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-[300px_1fr_280px] gap-6">
            <Sidebar selectedItem={selectedItem} onSelectItem={setSelectedItem} />
            {platformSelectedItem ? (
              <PlatformContent selectedItem={platformSelectedItem} />
            ) : (
              <MainContent selectedItem={selectedItem} />
            )}
            <RightSidebar selectedItem={platformSelectedItem} onSelectItem={setPlatformSelectedItem} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}