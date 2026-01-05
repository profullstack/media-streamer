'use client';

/**
 * News Page
 *
 * Displays news articles from TheNewsAPI.
 * This is a premium feature.
 */

import { useState } from 'react';
import { Search } from 'lucide-react';
import { MainLayout } from '@/components/layout';
import { NewsSection } from '@/components/news';

export default function NewsPage(): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState('');
  const [customSearch, setCustomSearch] = useState('');

  const handleCustomSearch = (e: React.FormEvent): void => {
    e.preventDefault();
    setSearchTerm(customSearch.trim());
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-text-primary">News</h1>
          <p className="mt-2 text-text-secondary">
            Stay up to date with the latest entertainment news
          </p>
        </div>

        {/* Search Input */}
        <form onSubmit={handleCustomSearch} className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={customSearch}
              onChange={(e) => setCustomSearch(e.target.value)}
              placeholder="Search news..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            Search
          </button>
        </form>

        <NewsSection searchTerm={searchTerm} limit={50} />
      </div>
    </MainLayout>
  );
}
