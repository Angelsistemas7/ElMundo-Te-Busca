"use client";

import { useEffect, useState } from "react";
import { getSessionUserAction } from "@/app/actions";

/**
 * ¿Hay sesión abierta? `null` mientras se está comprobando (los componentes lo
 * usan para no mostrar "inicia sesión" antes de saberlo). Varios controles
 * repetían este mismo efecto: votos de disponibilidad e insumos, reportes de
 * estado, denuncias.
 *
 * @param refreshKey cuando cambia, se vuelve a comprobar la sesión (por
 * ejemplo al abrir un modal, para no arrastrar una respuesta vieja).
 */
export function useLoggedIn(refreshKey?: unknown): boolean | null {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  useEffect(() => {
    getSessionUserAction()
      .then((u) => setLoggedIn(!!u))
      .catch(() => setLoggedIn(false));
  }, [refreshKey]);
  return loggedIn;
}
