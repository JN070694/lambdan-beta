import { useEffect } from 'react';
import type { AppSettings } from '@/types';

// Sets data-theme on <html>, which index.css uses to redefine the app's
// core color variables (--black, --white, --grey-100..600). Since every
// shared CSS class in that file already reads colors through those
// variables, this one attribute is enough to re-theme the whole app.
export function useTheme(theme: AppSettings['theme']) {
  useEffect(() => {
    if (theme === 'ultra-luxe') {
      document.documentElement.setAttribute('data-theme', 'ultra-luxe');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [theme]);
}
