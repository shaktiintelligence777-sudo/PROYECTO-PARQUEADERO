import { useQueryClient } from '@tanstack/react-query';
import { obtenerApi } from '@/api';
import { MockApi } from '@/api/mock/MockApi';
import { entorno, type ModoApi } from '@/lib/entorno';
import { BannerDemo } from '@/ui';

/**
 * Conecta BannerDemo con `reiniciarDemo()`. Solo se pinta en modo `mock`.
 * "Reiniciar datos" vuelve a sembrar y limpia la caché de consultas; la sesión se conserva.
 */
export function ConexionBannerDemo({ modo = entorno.modo }: { modo?: ModoApi }) {
  const qc = useQueryClient();
  if (modo !== 'mock') return null;
  const reiniciar = () => {
    const api = obtenerApi();
    if (api instanceof MockApi) api.reiniciarDemo();
    void qc.resetQueries();
  };
  return <BannerDemo alReiniciar={reiniciar} />;
}
