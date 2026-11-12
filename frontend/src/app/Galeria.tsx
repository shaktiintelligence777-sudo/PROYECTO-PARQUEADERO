import { Inbox, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Aviso, Boton, BotonIcono, Buscador, CabeceraPagina, Campo, DatoEtiquetado, DialogoConfirmar, Elemento, Entrada, AreaTexto, Selector,
  EntradaDinero, EntradaPlaca, Esqueleto, EstadoError, EstadoVacio, GrupoOpciones, Hoja, Indicador, Insignia, InsigniaEstado,
  ListaElementos, Paginador, Placa, Spinner, Tabla, Tarjeta, useToast, type Tono,
} from '@/ui';

const TONOS: Tono[] = ['exito', 'aviso', 'peligro', 'info', 'neutro'];
const FILAS = [
  { id: '1', placa: 'ABC12D', cliente: 'Carlos Pérez', total: '$60.000' },
  { id: '2', placa: 'XYZ34E', cliente: 'María Gómez', total: '$18.000' },
];

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`g-${titulo}`} className="mb-8">
      <h2 id={`g-${titulo}`} className="mb-3 text-subtitulo">{titulo}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

/** Catálogo de todos los componentes de `ui/` en sus variantes y estados. Solo existe en desarrollo (`/#/galeria`). */
export function Galeria() {
  const toast = useToast();
  const [placa, setPlaca] = useState('');
  const [dinero, setDinero] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia' | 'otro' | null>('efectivo');
  const [pagina, setPagina] = useState(1);
  const [hoja, setHoja] = useState(false);
  const [dialogo, setDialogo] = useState(false);

  return (
    <main className="mx-auto max-w-contenido p-4 md:p-6">
      <CabeceraPagina titulo="Galería de componentes" accion={<Boton icono={<Plus aria-hidden="true" className="size-5" />}>Acción</Boton>} />

      <Seccion titulo="Botón">
        {(['primario', 'secundario', 'fantasma', 'peligro', 'exito'] as const).map((v) => <Boton key={v} variante={v}>{v}</Boton>)}
        <Boton tamano="lg">Grande</Boton>
        <Boton tamano="xl" variante="exito">Entrada</Boton>
        <Boton cargando>Guardando</Boton>
        <Boton disabled>Deshabilitado</Boton>
        <Boton anchoCompleto variante="secundario">Ancho completo</Boton>
        <BotonIcono aria-label="Agregar"><Plus aria-hidden="true" className="size-5" /></BotonIcono>
      </Seccion>

      <Seccion titulo="Formularios">
        <Campo etiqueta="Nombre" ayuda="Como aparece en el documento."><Entrada defaultValue="Carlos Pérez" /></Campo>
        <Campo etiqueta="Teléfono" error="Escribe entre 7 y 15 dígitos."><Entrada defaultValue="abc" /></Campo>
        <Campo etiqueta="Notas"><AreaTexto defaultValue="" /></Campo>
        <Campo etiqueta="Plan"><Selector defaultValue="30"><option value="30">Mensual</option></Selector></Campo>
        <Campo etiqueta="Placa"><EntradaPlaca value={placa} onChange={setPlaca} /></Campo>
        <Campo etiqueta="Monto"><EntradaDinero value={dinero} onChange={setDinero} /></Campo>
        <Buscador alBuscar={() => undefined} placeholder="Nombre, documento o placa" />
        <GrupoOpciones etiqueta="Método de pago" valor={metodo} onChange={setMetodo} opciones={[
          { valor: 'efectivo', etiqueta: 'Efectivo' }, { valor: 'transferencia', etiqueta: 'Transferencia' }, { valor: 'otro', etiqueta: 'Otro' },
        ]} />
      </Seccion>

      <Seccion titulo="Datos">
        {(['sm', 'md', 'lg'] as const).map((t) => <Placa key={t} placa="ABC12D" tamano={t} />)}
        <InsigniaEstado estado="activa" />
        <InsigniaEstado estado="por_vencer" diasRestantes={2} />
        <InsigniaEstado estado="vencida" diasRestantes={-5} />
        <InsigniaEstado estado="cancelada" />
        <InsigniaEstado estado={null} />
        {TONOS.map((t) => <Insignia key={t} tono={t}>{t}</Insignia>)}
        <DatoEtiquetado etiqueta="Documento">900000001</DatoEtiquetado>
        <Tarjeta className="w-72"><Tarjeta.Titulo>Tarjeta</Tarjeta.Titulo>Contenido de ejemplo.<Tarjeta.Pie><Boton variante="secundario">Cancelar</Boton></Tarjeta.Pie></Tarjeta>
        <Indicador etiqueta="Motos dentro" valor="12" detalle="de 40" tono="info" />
        <Indicador etiqueta="Por vencer" valor="2" tono="aviso" enlace="/membresias" />
      </Seccion>

      <Seccion titulo="Listas y tablas">
        <ListaElementos etiqueta="Ejemplo" className="w-full md:w-96">
          <Elemento titulo="Carlos Pérez" subtitulo="900000001" inicio={<Placa placa="ABC12D" tamano="sm" />} fin={<InsigniaEstado estado="activa" />} alClic={() => undefined} />
          <Elemento titulo="María Gómez" subtitulo="900000002" para="/clientes" />
        </ListaElementos>
        <Tabla descripcion="Pagos de ejemplo" columnas={[
          { clave: 'placa', encabezado: 'Placa', celda: (f) => f.placa },
          { clave: 'cliente', encabezado: 'Cliente', celda: (f) => f.cliente },
          { clave: 'total', encabezado: 'Total', celda: (f) => f.total, alinear: 'derecha' },
        ]} filas={FILAS} claveFila={(f) => f.id} className="w-full md:w-96" />
        <Paginador pagina={pagina} paginas={7} alCambiar={setPagina} className="w-full md:w-96" />
      </Seccion>

      <Seccion titulo="Retroalimentación">
        {TONOS.map((t) => <Aviso key={t} tono={t} titulo={`Aviso ${t}`}>Texto de apoyo.</Aviso>)}
        <Spinner />
        <Esqueleto className="h-6 w-40" />
        <EstadoVacio icono={<Inbox aria-hidden="true" className="size-10" />} titulo="Sin resultados" texto="Prueba con otra búsqueda." accion={<Boton variante="secundario">Limpiar</Boton>} />
        <EstadoError mensaje="No se pudo cargar." alReintentar={() => undefined} />
        <Boton variante="secundario" onClick={() => toast.mostrar({ tono: 'exito', mensaje: 'Entrada registrada' })}>Toast éxito</Boton>
        <Boton variante="secundario" onClick={() => toast.mostrar({ tono: 'peligro', mensaje: 'No se pudo guardar' })}>Toast error</Boton>
      </Seccion>

      <Seccion titulo="Capas">
        <Boton variante="secundario" onClick={() => setHoja(true)}>Abrir hoja</Boton>
        <Boton variante="peligro" onClick={() => setDialogo(true)}>Abrir diálogo</Boton>
        <Hoja abierta={hoja} alCerrar={() => setHoja(false)} titulo="Hoja de ejemplo" pie={<Boton onClick={() => setHoja(false)}>Listo</Boton>}>
          <p>Contenido de la hoja.</p>
        </Hoja>
        <DialogoConfirmar abierta={dialogo} titulo="Anular pago" texto="Esta acción no se puede deshacer." pedirMotivo varianteConfirmar="peligro" textoConfirmar="Anular"
          alCancelar={() => setDialogo(false)} alConfirmar={() => setDialogo(false)} />
      </Seccion>
    </main>
  );
}
