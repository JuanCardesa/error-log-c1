import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  // La demo puede convivir con la app personal sin compartir el bloqueo de desarrollo.
  distDir: process.env['ERRORLOG_DEMO'] === '1'
    ? '.next-demo'
    : process.env['ERRORLOG_E2E'] === '1' ? '.next-e2e' : '.next',
};

export default nextConfig;
