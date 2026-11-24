import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // the user's home folder also has a lockfile – pin the project root
  outputFileTracingRoot: path.join(__dirname),
  // fonts, logos and people cutouts are read from ./assets at runtime
  outputFileTracingIncludes: { '/api/**/*': ['./assets/**/*'] },
  outputFileTracingExcludes: { '/api/**/*': ['./docs/**/*', './out/**/*', './.probe/**/*'] },
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
