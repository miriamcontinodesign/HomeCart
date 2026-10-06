import React, { createContext, useContext } from 'react';
import { tokens, ThemeColors } from './colors';

// HomeCart ships a single light theme (see theme/colors.ts). The context stays so components
// read tokens through one hook, and a second theme could be added here later.
interface ThemeContextValue {
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeContext.Provider value={{ colors: tokens }}>{children}</ThemeContext.Provider>
);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
