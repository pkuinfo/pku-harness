import { createContext, useContext } from 'react';

/**
 * Height of the floating glass tab bar that tab screens scroll under (0 outside the tabs).
 * Scroll content adds it as bottom padding so nothing ends up hidden behind the bar.
 */
export const TabBarInset = createContext(0);

export const useTabBarInset = () => useContext(TabBarInset);
