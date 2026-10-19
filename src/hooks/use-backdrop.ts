import { createContext, useContext } from 'react';

/** True under a layout that already paints the aurora (the tabs), so screens don't add another. */
export const BackdropProvided = createContext(false);

export const useBackdropProvided = () => useContext(BackdropProvided);
