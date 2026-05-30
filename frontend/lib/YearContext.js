'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const YearContext = createContext();

export function YearProvider({ children }) {
  const [year, setYearState] = useState('2026'); // Default to 2026

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selectedYear');
      if (saved) {
        setYearState(saved);
      }
    }
  }, []);

  const changeYear = (newYear) => {
    setYearState(newYear);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedYear', newYear);
    }
  };

  return (
    <YearContext.Provider value={{ year, setYear: changeYear }}>
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  const context = useContext(YearContext);
  if (!context) {
    throw new Error('useYear must be used within a YearProvider');
  }
  return context;
}
