import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { RightSidebar } from '../components/RightSidebar';
import { PlatformContent } from '../components/PlatformContent';
import { useState } from 'react';

export function AboutPage() {
  const [platformSelectedItem, setPlatformSelectedItem] = useState('');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-[1fr_280px] gap-6">
            <div>
              {platformSelectedItem ? (
                <PlatformContent selectedItem={platformSelectedItem} />
              ) : (
                <div className="bg-white border rounded-lg p-8">
                  <h1 className="text-3xl font-bold text-gray-900 mb-4">About</h1>
                  <p className="text-gray-600">준비 중입니다.</p>
                </div>
              )}
            </div>
            <RightSidebar selectedItem={platformSelectedItem} onSelectItem={setPlatformSelectedItem} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}