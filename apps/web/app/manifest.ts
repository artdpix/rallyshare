import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RallyShare',
    short_name: 'RallyShare',
    description: 'Envia as tuas fotos e clips para a transmissão de rally.',
    lang: 'pt',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    categories: ['photo', 'video', 'sports'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/api/icon/192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/api/icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Submeter',
        short_name: 'Submeter',
        url: '/submit',
        description: 'Enviar foto ou vídeo',
      },
    ],
  };
}
