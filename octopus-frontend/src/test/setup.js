import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Con la suite completa en paralelo los workers compiten por CPU y el
// timeout por defecto (1000 ms) de findBy*/waitFor se queda corto.
configure({ asyncUtilTimeout: 5000 });
