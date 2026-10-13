# Plan de endurecimiento de hammer-mcp para L4D2

Fecha: **2026-10-03**.

## Siguiente entrega: auditoria funcional

El [plan de auditoria del 2026-10-13](2026-10-13-l4d2-audit-plan.md) cubre las
78 herramientas registradas, los recursos locales y un recorrido de creacion,
edicion, compilacion y empaquetado L4D2. La auditoria completa esta pendiente;
las verificaciones de las etapas 4 y 5 se conservan como evidencia previa.
La rama remota fue publicada con las etapas 1-3; ahora se publican las etapas
4-5 y este plan. El funcionamiento dentro del juego continua pendiente.

## Estado de etapas 4 y 5 al 2026-10-13

- Etapa 4 integrada: paginacion consistente, tiempos por fase y audit log de busquedas.
  El recorrido dominaba el coste, por lo que se agrego un indice de nombres bajo
  `stateDir`, aislado por perfil/ruta real e invalidado con metadata de montaje,
  gameinfo, VPK y directorios sueltos. Se escribe con guard y reemplazo atomico.
  Los detalles se leen siempre en vivo; `rebuildIndex` permite reconstruirlo.
- En la instalacion L4D2, una busqueda sin indice tomo 1330 ms y las repetidas con
  indice 285-297 ms. No se reprodujo MaxListenersExceededWarning con 36 llamadas
  concurrentes en grupos de 12; no se modificaron listeners.
- Etapa 5 integrada usando `solids[]` y `ops[]`: validacion completa antes de una
  escritura y un backup por lote, comprobacion del documento final y rechazo de
  conflictos. Un benchmark creo 24 brushes y 12 entidades en dos escrituras, unos
  15 ms en total. No hay evidencia que justifique agregar una herramienta de escena.
- Build y typecheck pasan. Suite completa: 1027 pruebas aprobadas, 83 omitidas.
  Las 14 nuevas pruebas se sabotearon individualmente, fallaron y se restauraron.
- Evidencia y comandos reproducibles: [medicion de contenido y lotes](../measurements/2026-10-13-content-and-batches.md).

## Estado de integracion al 2026-10-12

- Rama de trabajo: `feat/l4d2-workflow-integration`; conserva el diff local previo.
- L4D2 es el perfil predeterminado. La configuracion local ignorada apunta a la
  instalacion de Steam indicada por el usuario y usa backend nativo.
- `health` distingue `hammerplusplus.exe` del conjunto de compiladores Hammer++.
  En esta instalacion solo se observo el editor y los compiladores stock.
- `bol_test_box.bsp` se leyo como BSP 21 con descriptor L4D2; su VMF paso el
  preflight de FGD e I/O. Una recompilacion stock en la carpeta de estado local
  completo `vbsp`, `vvis` y `vrad` con codigo 0.
- `check_l4d2_map` y `check_l4d2_mission` agregan revision offline especifica.
  El segundo se verifico contra el ejemplo DeadLine2 de Authoring Tools.
- La auditoria de dependencias del BSP encontro tres recursos sueltos del arbol
  del juego. Requieren revisar procedencia antes de decidir si se empaquetan.
  La frescura del NAV solo compara el tamano BSP guardado; no
  demuestra flujo, bots ni jugabilidad.
- Falta prueba dentro de L4D2 y una referencia remota Git actualizada; la red
  de GitHub no estuvo disponible en la inspeccion inicial.

Este documento es el handoff ejecutable para continuar el trabajo desde el repositorio
`hammer-mcp-DHT`. El objetivo es corregir los fallos encontrados al construir y compilar
`bol_test_box` para Left 4 Dead 2 y hacer de L4D2 el flujo predeterminado del MCP.
Los perfiles de otras ramas siguen disponibles para compatibilidad, pero no gobiernan
las instrucciones, ejemplos ni la validacion de este proyecto.

## Repositorios y casos de prueba

- MCP: `C:\Users\Usuario\Desktop\Projects\Tools\hammer-mcp-DHT`.
- Campana: `C:\Users\Usuario\Desktop\Projects\Mods\L4D2\BolCampain`.
- VMF externo de aceptacion: `maps/src/bol_test_box.vmf` dentro de BolCampain.
- BSP externo de aceptacion:
  `build/maps/bol_test_box/bol_test_box.bsp` dentro de BolCampain.
- No copiar el BSP ni contenido de Valve al repositorio del MCP.
- No editar la instalacion de L4D2.

Antes de implementar, leer:

- `README.md`.
- `CONTRIBUTING.md`.
- `docs/architecture.md`.
- `docs/formats.md`.
- `docs/compiling.md`.

La disciplina de `CONTRIBUTING.md` es obligatoria: cada test nuevo debe sabotearse temporalmente,
comprobar que falla y restaurarse. Los numeros y limites deben tener una fuente leida o una
medicion reproducible.

## Hallazgo critico confirmado

La hipotesis inicial de un entity lump LZMA era incorrecta. El BSP de L4D2 no tiene comprimido el
lump de entidades. El fallo esta en la interpretacion del directorio de lumps de BSP version 21.

El lector actual interpreta el descriptor del entity lump como:

```text
offset=0, length=18000, version=789, fourCC=0
```

Para este BSP de L4D2 los mismos enteros significan:

```text
version=0, offset=18000, length=789, fourCC=0
```

La lectura directa de 789 bytes desde el offset 18000 empieza con:

```text
{
"world_maxs" "2048 2048 1024"
"world_mins" "-2048 -2048 0"
"skyname" "sky_day0...
```

y termina en `}\n\0`. Esto demuestra que el parser actual lee bytes del encabezado como si fueran
texto de entidades. El mismo intercambio aparece en otros lumps:

| Lump | Lectura actual | Interpretacion L4D2 esperada |
| --- | --- | --- |
| `ENTITIES` | offset 0, length 18000, version 789 | version 0, offset 18000, length 789 |
| `MODELS` | offset 0, length 10752, version 48 | version 0, offset 10752, length 48 |
| `PLANES` | offset 0, length 7152, version 2400 | version 0, offset 7152, length 2400 |
| `NODES` | offset 0, length 10800, version 4928 | version 0, offset 10800, length 4928 |
| `LEAFS` | offset 1, length 1984, version 4992 | version 1, offset 1984, length 4992 |

Este defecto explica directamente:

- `read_bsp_entities`: `unterminated quoted string at offset 988`.
- Extensiones y modelos BSP incorrectos.
- Trazas construidas sobre offsets equivocados.
- Fallos derivados de `read_map_geometry` y `read_map_report`.

La correccion del layout BSP es P0 y debe completarse antes de optimizaciones o herramientas nuevas.

## Principios de alcance

- Corregir el nucleo de manera general cuando el defecto pertenece al formato.
- Encapsular diferencias de rama, FGD, compiladores y limites en el perfil `l4d2`.
- No presentar limites SDK 2013 como limites de L4D2.
- No introducir un daemon para el sidecar sin evidencia que invalide el diseno stateless.
- Aprovechar los lotes existentes antes de crear una API nueva.
- No ampliar el MCP para controlar el motor, generar NAV o publicar Workshop.
- Distinguir siempre entre investigado, implementado, compilado y probado en juego.

## Fase 0: linea base

Objetivo: conservar una referencia reproducible antes de modificar comportamiento.

1. Inspeccionar `git status`, `git diff` y el historial reciente. No revertir cambios ajenos.
2. Ejecutar la linea base:

```powershell
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
```

3. Registrar tests omitidos por falta de toolchain, sidecar o contenido real.
4. Confirmar con `health` o las funciones internas que el perfil activo externo es `l4d2`, con
   `left4dead2.fgd` y compiladores stock de L4D2.
5. Conservar `bol_test_box.bsp` como aceptacion externa local, no como fixture versionado.

Criterio de salida: linea base documentada y fallos preexistentes separados de los que introduzca
el trabajo.

## Fase 1: directorio BSP de L4D2

Archivos iniciales:

```text
src/bsp/header.ts
src/bsp/entities.ts
src/bsp/models.ts
src/bsp/trace.ts
src/bsp/geometry.ts
test/bsp.test.ts
test/lzma.test.ts
```

Cambios:

1. Modelar explicitamente los layouts de descriptor BSP soportados.
2. Mantener el layout Source existente:

```text
offset, length, version, fourCC
```

3. Añadir el layout observado en L4D2 version 21:

```text
version, offset, length, fourCC
```

4. Elegir el layout mediante validacion estructural de candidatos, no mediante una suposicion
   basada unicamente en `version === 21`.
5. Rechazar un archivo cuando ningun candidato sea valido o cuando la deteccion sea ambigua.
6. Incluir el layout reconocido en `BspHeader` y en la salida de `read_bsp_info`.
7. Validar enteros negativos, rangos fuera del archivo, overflow de `offset + length` y lecturas
   cortas.
8. Evaluar solapamientos de lumps. Si el formato permite alguno, documentar la excepcion exacta;
   no aceptar todos los solapamientos para hacer pasar un fixture.
9. Centralizar el requisito de lump sin compresion para lectores que necesitan el cuerpo.
10. `readGeometry()` puede describir metadata de un lump comprimido, pero no debe inventar conteos.

Tests minimos:

- Header sintetico con layout clasico.
- Header sintetico con layout L4D2.
- Caso donde interpretar L4D2 como clasico produce offsets aparentemente numericos pero invalidos.
- Offset o longitud negativos.
- Rango que termina fuera del archivo.
- Lectura corta.
- Lump comprimido rechazado por entidades, modelos y trazas con un mensaje que nombre LZMA.
- Control positivo de esos lectores sobre lumps no comprimidos.

Aceptacion externa con `bol_test_box.bsp`:

- `read_bsp_info` informa BSP 21 y el layout L4D2 reconocido.
- `ENTITIES` queda en offset 18000, longitud 789, version 0.
- `read_bsp_entities` encuentra `worldspawn`, `info_player_start` e `info_director`.
- El entity lump se reconoce como terminado en NUL.
- `MODELS` queda en offset 10752 y longitud 48.
- `read_map_extents` devuelve dimensiones plausibles para una plaza de 4096 x 4096 unidades.
- Las trazas no leen bytes del encabezado como planos, nodos u hojas.

Criterio de salida: lectores BSP basicos correctos en el fixture version 20 existente y en el BSP
version 21 de L4D2.

## Fase 2: metricas y presupuestos por rama

Problema:

- `src/bsp/geometry.ts` contiene tamaños y techos de SDK 2013.
- `source-stock` se presenta como perfil general por defecto.
- El perfil de juego `l4d2` ya declara que sus limites difieren y que no han sido leidos.

Cambios:

1. Separar la lectura estructural de lumps de la aplicacion de techos y politicas.
2. Hacer que las herramientas de geometria y reporte conozcan la rama activa o reciban el juego.
3. Para L4D2, devolver conteos solo donde el tamaño del registro este verificado para esa rama.
4. No aplicar porcentajes ni fallos de SDK 2013 a una llamada L4D2.
5. Marcar criterios no calibrados como `skipped`, con una explicacion concreta.
6. Añadir `l4d2-stock` solamente despues de leer headers de la rama o construir probes que midan
   los compiladores reales de L4D2.
7. Mantener procedencia y fecha junto a cada limite verificado.

Tests:

- Una consulta L4D2 no usa silenciosamente `source-stock`.
- Un criterio sin limite L4D2 queda `skipped`, nunca `pass`.
- Los perfiles SDK 2013 existentes conservan su comportamiento.
- Un perfil desconocido sigue siendo rechazado sin fallback.

Criterio de salida: `read_map_geometry` y `read_map_report` no producen afirmaciones de limites de
otra rama al analizar un BSP L4D2.

## Fase 3: escritura VMF segura

Archivos iniciales:

```text
src/vmf/edit.ts
src/tools/vmfedit.ts
src/kv/lex.ts
test/vmfedit.test.ts
test/kv.test.ts
```

Cambio minimo recomendado:

1. Validar claves y valores antes de construir un splice.
2. Rechazar comillas, CR, LF y cualquier caracter que genere KeyValues invalido.
3. Ejecutar la validacion antes de crear backup o escribir.
4. Mantener la barra invertida literal mientras no exista un fixture real que pruebe otra semantica.
5. No implementar escapes especulativos.

Tests:

- `add` rechaza una clave o valor peligroso.
- `update` rechaza una clave o valor peligroso.
- `addOutput` rechaza una salida que romperia la linea KeyValues.
- El archivo y su mtime permanecen intactos al rechazar.
- Valores normales de rutas, outputs y espacios siguen funcionando.

Criterio de salida: `edit_vmf` no puede escribir un VMF que su propio lexer rechace.

## Fase 4: rendimiento de busqueda de contenido

Archivos iniciales:

```text
sidecar/content.py
src/tools/content.ts
src/sidecar/client.ts
test/content.test.ts
test/sidecar.test.ts
```

Orden de trabajo:

1. Medir por separado arranque de Python, montaje, recorrido, lectura de detalles y serializacion.
2. Añadir duracion util al audit log si puede hacerse sin convertirla en una promesa de rendimiento.
3. Cambiar `_walk()` para no construir primero una lista completa de todos los archivos cuando una
   sola iteracion filtrada cubre la consulta.
4. Añadir paginacion estable con `offset`, `limit`, `total`, `shown` y `truncated`.
5. Mantener respuestas resumidas por defecto y detalles solo bajo solicitud.
6. Reproducir `MaxListenersExceededWarning` con un test o harness antes de modificar listeners.
7. Medir de nuevo.
8. Añadir un indice persistente solo si el recorrido sigue dominando el coste.

Si se justifica un indice:

- Guardarlo bajo `stateDir`, nunca dentro del juego.
- Identificarlo por perfil y ruta real de `gameDir`.
- Invalidarlo con metadata de `gameinfo.txt`, VPK y arbol suelto relevante.
- Escribirlo atomicamente.
- Permitir reconstruccion explicita.
- No introducir un daemon ni un lock residente.

Criterio de salida: busquedas amplias tienen salida acotada, paginable y medida; las busquedas
repetidas mejoran de forma demostrable si se implementa cache.

## Fase 5: operaciones atomicas por lotes

Primero utilizar lo que ya existe:

- `write_vmf_solid.solids[]` para multiples brushes.
- `edit_vmf.ops[]` para multiples entidades y outputs.

Actualizar descripciones o documentacion para que un agente no haga una llamada por brush o por
entidad.

Solo si el audit log demuestra que dos escritores separados siguen siendo un cuello de botella,
añadir una operacion de escena que:

1. Lea el VMF una vez.
2. Aplique solidos y entidades en memoria.
3. Valide todos los brushes creados.
4. Valide que el resultado final se puede parsear.
5. Produzca un solo backup.
6. Escriba una sola vez.
7. Soporte `dryRun`.
8. Rechace el lote completo si cualquier parte falla.

No incluir por ahora presets de plazas, ciudades o campañas. Eso requiere evidencia de repeticion
despues del slice minimo.

Criterio de salida: construir una escena pequeña no requiere decenas de escrituras ni puede dejar
medio lote aplicado.

## Fase 6: planos de mapas grandes

Problema observado: `bol_test_box.vmf` necesita 5,427,075 celdas a 16 unidades, por encima del
presupuesto predeterminado de cuatro millones.

Cambios:

1. Exponer el tamaño de celda del analisis, separado del espaciado visual de la grilla.
2. Permitir configurarlo explicitamente.
3. Cuando el presupuesto se exceda, degradar de forma controlada de 16 a 32 o 64 unidades.
4. Informar el tamaño realmente usado y la perdida de precision.
5. No presentar anchos aproximados como medidas exactas despues de degradar.

Tests:

- Mapa pequeño conserva 16 unidades.
- Mapa grande elige una resolucion permitida y no falla por presupuesto.
- La salida informa la adaptacion.
- Un valor explicito imposible produce un error accionable.

Criterio de salida: `render_vmf_plan` produce un plano util de `bol_test_box.vmf` sin ocultar la
resolucion reducida.

## Fase 7: perfil L4D2 y documentacion

Actualizar con la evidencia obtenida el 2026-10-03:

- El perfil `l4d2` fue descubierto en una instalacion real.
- `left4dead2.fgd` fue cargado y usado sin hallazgos sobre el VMF de prueba.
- Los compiladores stock L4D2 ejecutaron `VBSP`, `VVIS` y `VRAD` con codigo 0.
- El BSP resultante es version 21 y usa el layout de descriptor documentado arriba.
- Esto no prueba NAV, bots, jugabilidad ni limites de todos los lumps.

Archivos candidatos:

```text
src/games/profile.ts
README.md
docs/formats.md
docs/compiling.md
test/games.test.ts
```

No convertir evidencia local en una afirmacion universal. La procedencia debe distinguir entre:

- Dato integrado en la tabla builtin.
- Archivo descubierto en esta maquina.
- Compile real completado.
- Comportamiento todavia no probado.

Criterio de salida: `health` y la documentacion dejan de afirmar que L4D2 nunca fue ejecutado, sin
afirmar que toda la rama esta validada.

## Fase 8: verificacion final

Ejecutar siempre:

```powershell
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
```

Despues:

1. Confirmar que `dist/` es mas reciente que `src/`.
2. Reiniciar o reconectar el cliente MCP para cargar herramientas y schemas nuevos.
3. Ejecutar sobre `bol_test_box.vmf`:
   `read_vmf`, `read_vmf_lint`, `read_vmf_solids`, `read_vmf_leak` y `validate_io`.
4. Ejecutar sobre `bol_test_box.bsp`:
   `read_bsp_info`, `read_bsp_entities`, `read_map_extents`, `read_map_geometry`,
   `read_map_report`, `read_prop_survey` y las trazas aplicables.
5. Repetir un compile stock L4D2 en una carpeta de resultados separada.
6. Comparar logs y dependencias con la linea base.
7. No declarar el mapa jugable sin carga en L4D2, NAV y prueba con bots.

## Cambio separado en BolCampain

`BolCampain/opencode.json` configura actualmente:

```json
"timeout": 10000
```

El sidecar permite llamadas de hasta 120 segundos, por lo que diez segundos pueden cortar una
busqueda valida. Antes de cambiarlo, confirmar si el timeout de OpenCode gobierna todas las llamadas
MCP o solo conexion/inicializacion.

- Si gobierna busquedas, usar como minimo 120 segundos.
- Si tambien gobierna `run_compile`, alinearlo con el presupuesto permitido por esa herramienta.
- Mantener las raices de escritura actuales.
- No permitir escritura dentro de la instalacion de L4D2.
- Tratarlo como cambio de configuracion de la campana, separado de los commits del MCP.

## Fuera de alcance

- Arrancar o controlar L4D2 desde este MCP offline.
- Generar o analizar NAV dentro del motor.
- Declarar jugabilidad a partir de archivos.
- Copiar compiladores de otra rama.
- Editar directamente VPK publicados.
- Publicar en Workshop.
- Requerir plugins del servidor o reemplazos globales.
- Retirar de golpe los perfiles historicos de Source; primero se mantiene compatibilidad.

## Orden recomendado de entregas

1. `fix: parse L4D2 BSP lump directories`.
2. `fix: reject unsupported compressed BSP bodies safely`.
3. `fix: keep branch-specific limits out of L4D2 reports`.
4. `fix: reject unsafe VMF keyvalue text`.
5. `perf: paginate and measure game content searches`.
6. `feat: adapt VMF plan resolution to its cell budget`.
7. API atomica de escena solo si las mediciones posteriores la justifican.

No crear commits, hacer push ni abrir PR sin solicitud explicita. Cada entrega debe actualizar la
documentacion que su cambio vuelva falsa.
