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

const CATEGORY_PILLS = [
  { label: 'Top News', search: 'breaking news' },
  { label: 'World', search: 'world news' },
  { label: 'Politics', search: 'politics' },
  { label: 'Business', search: 'business' },
  { label: 'Tech', search: 'technology' },
  { label: 'Science', search: 'science' },
  { label: 'Health', search: 'healthcare' },
  { label: 'Sports', search: 'sports' },
  { label: 'Entertainment', search: 'entertainment' },
  { label: 'Environment', search: 'environment climate' },
  { label: 'Crypto', search: 'cryptocurrency bitcoin' },
];

export default function NewsPage(): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState('breaking news');
  const [customSearch, setCustomSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('breaking news');

  const handleCategoryClick = (search: string): void => {
    setActiveCategory(search);
    setSearchTerm(search);
    setCustomSearch('');
  };

  const handleCustomSearch = (e: React.FormEvent): void => {
    e.preventDefault();
    if (customSearch.trim()) {
      setActiveCategory('');
      setSearchTerm(customSearch.trim());
    }
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

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          {CATEGORY_PILLS.map((pill) => (
            <button
              key={pill.search}
              onClick={() => handleCategoryClick(pill.search)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                activeCategory === pill.search
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <NewsSection searchTerm={searchTerm} limit={50} />
      </div>
    </MainLayout>
  );
}
