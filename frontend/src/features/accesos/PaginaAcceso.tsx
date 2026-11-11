import { useSearchParams } from 'react-router-dom';
import { useMotosDentro } from '@/api/hooks';
import { CabeceraPagina, GrupoOpciones, cx } from '@/ui';
import { PanelDentro } from './PanelDentro';
import { PanelRegistrar } from './PanelRegistrar';

type Vista = 'registrar' | 'dentro';

/** P3 · Registro de acceso. En móvil son dos pestañas (la activa vive en `?vista=`); desde `md`, dos columnas. */
export function PaginaAcceso() {
  const [params, setParams] = useSearchParams();
  const vista: Vista = params.get('vista') === 'dentro' ? 'dentro' : 'registrar';
  const total = useMotosDentro(undefined, 30_000).data?.total;

  const elegir = (v: Vista) => setParams(v === 'dentro' ? { vista: 'dentro' } : {}, { replace: true });

  return (
    <div>
      <CabeceraPagina titulo="Acceso" />
      <GrupoOpciones
        etiqueta="Vista"
        valor={vista}
        onChange={elegir}
        className="mb-4 md:hidden"
        opciones={[
          { valor: 'registrar', etiqueta: 'Registrar' },
          { valor: 'dentro', etiqueta: total === undefined ? 'Dentro' : `Dentro (${total})` },
        ]}
      />
      <div className="md:grid md:grid-cols-2 md:gap-6">
        <div className={cx(vista !== 'registrar' && 'hidden md:block')}><PanelRegistrar /></div>
        <div className={cx(vista !== 'dentro' && 'hidden md:block')}><PanelDentro /></div>
      </div>
    </div>
  );
}
