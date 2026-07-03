import { loadEnvConfig } from '@next/env';

const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);
