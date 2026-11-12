import { LogIn, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { esVisitanteCasual, type ConsultaPlaca } from '@/api';
import { formatoDuracion, formatoHora } from '@/lib/formato';
import { Aviso, Boton, Insignia, InsigniaEstado, Placa, Tarjeta } from '@/ui';

export interface ResultadoConsultaProps {
  consulta: ConsultaPlaca;
  registrando: boolean;
  alEntrada: () => void;
  alSalida: () => void;
}

/** Tarjeta con el resultado de buscar una placa y la acción que corresponde (tabla de situaciones de P3). */
export function ResultadoConsulta({ consulta, registrando, alEntrada, alSalida }: ResultadoConsultaProps) {
  const { moto, cliente, membresia, estancia_abierta: dentro, advertencias } = consulta;
  const vencida = advertencias.includes('membresia_vencida');
  const sinMembresia = advertencias.includes('sin_membresia');
  const porVencer = advertencias.includes('membresia_por_vencer');
  const casual = esVisitanteCasual({ cliente });
  const detalleMoto = [moto.marca, moto.color].filter(Boolean).join(' · ');

  return (
    <Tarjeta aria-label={`Resultado de ${moto.placa}`} className="space-y-3">
      <div className="flex items-center gap-3">
        <Placa placa={moto.placa} tamano="lg" />
        {detalleMoto && <span className="text-cuerpo text-asfalto-700">{detalleMoto}</span>}
      </div>
      <p className="text-subtitulo text-asfalto-900">{cliente.nombre}</p>
      {casual ? <Insignia tono="info">Visitante diario</Insignia> : <InsigniaEstado estado={membresia?.estado ?? null} diasRestantes={membresia?.dias_restantes} />}

      {dentro ? (
        <Aviso tono="info">Dentro desde las {formatoHora(dentro.entrada_en)} ({formatoDuracion(dentro.duracion_minutos)}).</Aviso>
      ) : (
        <>
          {porVencer && <Aviso tono="aviso">La membresía vence pronto.</Aviso>}
          {vencida && (
            <Aviso
              tono="peligro"
              accion={membresia && <Link to={`/pagos/nuevo?membresia=${membresia.id}`} className="font-semibold underline">Registrar pago</Link>}
            >
              Membresía vencida. Puedes registrar la entrada y cobrar la renovación.
            </Aviso>
          )}
          {sinMembresia && (
            <Aviso tono="peligro" accion={<Link to={`/clientes/${cliente.id}`} className="font-semibold underline">Crear membresía</Link>}>
              Este cliente no tiene membresía.
            </Aviso>
          )}
        </>
      )}

      {dentro ? (
        <Boton variante="secundario" tamano="xl" anchoCompleto icono={<LogOut aria-hidden="true" className="size-6" />} cargando={registrando} onClick={alSalida}>
          Registrar salida
        </Boton>
      ) : (
        <Boton variante="exito" tamano="xl" anchoCompleto icono={<LogIn aria-hidden="true" className="size-6" />} cargando={registrando} onClick={alEntrada}>
          {vencida || sinMembresia ? 'Registrar entrada de todos modos' : 'Registrar entrada'}
        </Boton>
      )}
      {!casual && <Link to={`/clientes/${cliente.id}`} className="block text-center text-cuerpo text-info underline">Ver cliente</Link>}
    </Tarjeta>
  );
}
