import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getInitialTheme, applyTheme } from './utils/theme';

// Применяем сохранённую тему до первого рендера — без "мигания" белой/чёрной страницы
applyTheme(getInitialTheme());

createRoot(document.getElementById('root')!).render(<App />);
