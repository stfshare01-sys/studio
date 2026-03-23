import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ignorar advertencias de Cloud Workstations en desarrollo
  serverExternalPackages: ['firebase-admin'],
  // La propiedad raíz que espera Next.js para evitar el error de preview
  // Se agregan los orígenes en la nube (la parte base de cloudworkstations)
  // o también se pueden usar comodines dependiendo de la versión exacta de Next
  // pero .idx.dev y .cloudworkstations.dev son comunes en Google Cloud
  allowedDevOrigins: [
    "localhost", 
    "*.cloudworkstations.dev",
    "9003-firebase-studio-1767801041930.cluster-l2bgochoazbomqgfmlhuvdvgiy.cloudworkstations.dev",
    "*.idx.dev"
  ],
  /* config options here */
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
