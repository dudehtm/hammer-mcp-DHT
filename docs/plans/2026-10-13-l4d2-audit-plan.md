# Plan de auditoría funcional de L4D2 y del MCP

Fecha: **2026-10-13**. Rama: `feat/l4d2-workflow-integration`.

**Estado: plan preparado; ejecución de la auditoría completa pendiente.**
Las etapas 4 y 5 ya tienen verificación de implementación: build, typecheck,
1027 pruebas aprobadas y 83 omitidas. Eso no equivale a haber usado todas las
herramientas desde un cliente MCP.

## Objetivo y alcance

Crear un mapa pequeño de L4D2 mediante el MCP, inspeccionarlo, editarlo en lotes,
compilarlo y verificar sus archivos. Cubrir las 78 herramientas registradas con
una matriz que indique ejecución positiva, control negativo, oráculo y evidencia.
Las funciones auxiliares se cubren con las suites existentes y los casos de
integración que las alcanzan; se registran los huecos que queden.

La auditoría será acotada: un mapa principal, variantes pequeñas de ese mapa y
fixtures propios para formatos auxiliares. Las herramientas específicas de
compatibilidad y los binarios opcionales tendrán casos separados. Una ausencia
de requisitos se registra como tal, nunca como éxito ni como prueba en L4D2.

El servidor actual registra herramientas, sin recursos MCP ni prompts propios.
Se comprobarán las capacidades declaradas al conectar el cliente. Aquí
“recursos” también incluye FGDs, modelos, materiales, skyboxes, compilers,
sidecar, fixtures, índices, imágenes y logs locales.

## Escenario principal y aislamiento

- Trabajar bajo `stateDir/audits/<run-id>/`, con salidas separadas para VMF,
  BSP, variantes, imágenes, logs y evidencia. Usar rutas explícitas para todos
  los escritores y limitar los writeRoots del contexto de auditoría a ese espacio.
- Perfil `l4d2`, backend nativo, FGD `left4dead2.fgd` y compiladores stock.
  Leer la configuración local ignorada. La instalación Steam se consulta.
- Diseñar dos estancias conectadas: interior total de 512 × 384 × 192 unidades,
  abertura de 64 × 128 y geometría alineada a una cuadrícula de 16. Son dimensiones
  elegidas para el fixture, no límites ni mínimos certificados del juego.
- Descubrir un material, un prop y un cielo existentes; usar sus nombres y bounds
  reales. Añadir spawn, Director, luces y una cadena I/O cuyas clases, claves,
  entradas y salidas se hayan leído del FGD instalado.
- Crear los brushes con `solids[]` y las entidades con `ops[]`. Los selectores
  apuntan al VMF anterior al lote; conectar entidades recién añadidas en otra llamada.
- Partir de copias del fixture para operaciones destructivas y controles negativos.
  Mantener el mapa principal como caso de aceptación. Medir hashes y mtime alrededor
  de las llamadas que deban rechazar o ejecutar dryRun.
- No distribuir assets de Valve ni binarios. Los artefactos locales quedan ignorados;
  el informe versionado incluye únicamente evidencia resumida y reproducible.

## Ruta de ejecución

### S1. Conexión, inventario y contratos

Conectar un cliente del SDK por stdio al build actual. Comprobar inicialización,
`tools/list`, instrucciones, 78 nombres únicos, schemas, confirmaciones y
capacidades de recursos/prompts. Invocar herramientas mediante `tools/call`,
para cubrir validación, guard y audit log del servidor además de sus handlers.

Registrar `health`, juegos detectados, versión de Node/Python/srctools, perfil,
FGDs y compiladores. Distinguir Hammer y Hammer++ como editores de la cadena
de compiladores. Verificar build no obsoleto y la reconexión del cliente.

Controles negativos: argumentos inválidos, perfil desconocido, falta de confirm,
rutas fuera de writeRoots y una ruta bajo los árboles prohibidos en un fixture
local. El rechazo debe conservar los archivos y generar una respuesta coherente.

### S2. Búsqueda de assets y nueva caché

Consultar materiales y modelos, elegir nombres de resultados y leer FGD/bounds.
Comparar búsqueda resumida, detalles y páginas: mismo total, orden estable y sin
duplicación entre páginas sobre contenido sin cambios. Probar offsets fuera del
rango, patrón vacío y nombres inexistentes.

Ejecutar `scripts/benchmark-content.mjs`: rebuild, consultas repetidas, detalles,
siguiente página y 36 llamadas al sidecar en grupos de 12. Registrar tiempos reales
y warnings, sin exigir un umbral de hardware.

En un montaje sintético propio probar adición/eliminación de archivos anidados,
cambio de gameinfo y metadata VPK, índice corrupto, reconstrucción explícita y
writeRoots que impidan persistir. Los detalles de un VMT modificado deben leerse
en vivo. Verificar que el índice queda bajo stateDir, aislado por perfil/ruta real,
se reemplaza atómicamente y no sale en la respuesta pública.

### S3. Construcción y lotes

Crear el mapa y sus componentes agrupados; verificar volúmenes e IDs con lectores
independientes. Incorporar un fitting y un prop colocado a partir de sus bounds.
Comprobar worldspawn, inventario, FGD, I/O y preflight L4D2.

Verificar una escritura y un backup del original por lote; dryRun conserva bytes
y mtime. Introducir un brush inválido o una entidad inválida al final del lote,
material con inyección KeyValues, operaciones solapadas y claves competidoras.
El lote entero debe rechazar antes del backup/escritura. Comprobar que comentarios
y espaciado ajenos a la edición sobreviven. Reutilizar `test/batch.test.ts` y el
benchmark de lotes como evidencia, sin convertir llamadas separadas en una transacción.

### S4. Herramientas de edición en variantes

En copias pequeñas probar formas compuestas, transformaciones, borrado, corte,
vértices, hollow, materiales, UVs, smoothing, grupos, visgroups y cordon.
Ejercitar displacements contiguos: crear, esculpir con seed, pintar, coser y releer.
Probar func_detail, hints, lightmapscale y un portal adecuado a la geometría.

Oráculos: reconstrucción de volúmenes desde planos, bounds esperados, IDs únicos
de los objetos nuevos, valores leídos de vuelta y costuras coincidentes. Probar
también rechazos geométricos; un contador no sustituye la comprobación de forma.
Desactivar cordon y retirar los experimentos antes de compilar la aceptación.

### S5. Espacio, reglas y revisión visual

Medir trazas/rayos y hulls, visibilidad, distancias, superficies, estancias,
clearance, aproximación y sightlines. Usar puntos elegidos con resultados conocidos:
un segmento cruza un muro, otro atraviesa la puerta y un punto está dentro de un brush.

Definir reglas del fixture que sí coincidan con objetos existentes. Exigir evidencia
para los fallos y `skipped` cuando no se pueda medir. Comparar el mapa sellado con
una variante sin pared, mediante el detector de fugas offline.

Renderizar vista, tour y plano; inspeccionar las imágenes y describir proporciones,
puerta, prop e iluminación representada. El render offline no prueba texturas ni
iluminación del motor. El ajuste para mapas grandes de la etapa 6 se registra aparte;
esta auditoría no declara esa etapa completada.

### S6. Compilación y lectores BSP

Compilar con la cadena stock de L4D2 y analizar logs, leak, entidades, descriptor
BSP 21, extents, geometría, props, materiales, brush entities, iluminación, visleaves,
sightlines y reporte. Leer BSP por offsets y comprobar que el informe identifica
la rama y deja omitidos los límites L4D2 aún no calibrados.

Control negativo: quitar una pared en una copia, compilar, detectar el leak e
identificar posición/entidad. No presentar etapas posteriores a la fuga como válidas.
Comparar las dimensiones y entidades del BSP con las del VMF y las salidas de
compiladores como oráculos independientes.

### S7. Dependencias, empaquetado, misión y NAV

Auditar referencias del BSP: packed, contenido instalado y missing. En un fixture
controlado provocar una dependencia ausente para demostrar el diagnóstico.
Revisar procedencia de archivos sueltos antes de decidir empaquetado.

Usar una copia del BSP y un archivo propio para `run_pack`; comprobar el índice
del pakfile, extraer ese archivo a otra salida y comparar su hash con el original.
Probar rechazo de rutas de extracción inseguras y de sobrescritura involuntaria.

Crear una misión y addoninfo propios para el BSP de prueba, validar capítulos y
AppID, y demostrar el fallo cuando falta el BSP referenciado. Leer un NAV existente
si está disponible: comparar metadata con el BSP; “fresh” por tamaño no prueba bots,
flujo ni jugabilidad. La generación NAV y el juego en vivo se evalúan en otra fase.

### S8. Compatibilidad y binarios opcionales

Usar fixtures propios para GMA y LMP: índice, extracción/round-trip, entidades,
revisión de mapa y estado del patch. Los patches no se despliegan; la compatibilidad
de carga en L4D2 se declara no verificada hasta una prueba en el motor.

Si health confirma los binarios, probar rename de BSP, seis caras de skybox y
conversión HDR sobre copias/assets propios, leyendo los resultados de vuelta.
Si faltan, verificar el diagnóstico y registrar el bloqueo. No instalar herramientas
ni copiar DLLs a Steam como parte de esta auditoría pequeña.

## Matriz de las herramientas registradas

Inventario leído de `dist/tools/index.js` y contrastado con `src/tools/index.ts`:
78 herramientas, 32 guarded, 26 con metadata de confirmación del cliente.
Cada fila se completará con caso, resultado y ruta de evidencia al ejecutar el plan.
“S8” puede terminar bloqueado por requisitos o con prueba de formato únicamente;
eso no se cuenta como éxito en L4D2.

| Herramienta | Escenario | Confirm | Requisitos iniciales | Estado de ejecución |
|---|---|---|---|---|
| `health` | S1 | No | Fixture local | Pendiente |
| `read_source_games` | S1 | No | Fixture local | Pendiente |
| `read_fgd_class` | S2 | No | Contenido/FGD + sidecar | Pendiente |
| `read_game_content` | S2 | No | Contenido/FGD + sidecar | Pendiente |
| `read_model_info` | S2 | No | Contenido/FGD + sidecar | Pendiente |
| `write_vmf` | S3 | Sí | Fixture local | Pendiente |
| `write_vmf_solid` | S3 | Sí | Fixture local | Pendiente |
| `write_vmf_fitting` | S3 | Sí | Fixture local | Pendiente |
| `edit_vmf` | S3 | Sí | Fixture local | Pendiente |
| `read_vmf` | S3 | No | Fixture local | Pendiente |
| `read_vmf_lint` | S3 | No | Fixture local | Pendiente |
| `read_vmf_solids` | S3 | No | Fixture local | Pendiente |
| `read_entity_report` | S3 | No | Fixture local | Pendiente |
| `validate_io` | S3 | No | Fixture local | Pendiente |
| `check_l4d2_map` | S3 | No | Fixture local | Pendiente |
| `set_map_properties` | S3 | Sí | Fixture local | Pendiente |
| `read_displacements` | S4 | No | Fixture local | Pendiente |
| `write_displacement` | S4 | Sí | Fixture local | Pendiente |
| `sew_displacements` | S4 | Sí | Fixture local | Pendiente |
| `sculpt_displacement` | S4 | Sí | Fixture local | Pendiente |
| `paint_displacement` | S4 | Sí | Fixture local | Pendiente |
| `transform_solids` | S4 | Sí | Fixture local | Pendiente |
| `delete_solids` | S4 | Sí | Fixture local | Pendiente |
| `clip_solids` | S4 | Sí | Fixture local | Pendiente |
| `move_vertices` | S4 | Sí | Fixture local | Pendiente |
| `hollow_solids` | S4 | Sí | Fixture local | Pendiente |
| `set_face_material` | S4 | Sí | Fixture local | Pendiente |
| `align_faces` | S4 | Sí | Fixture local | Pendiente |
| `set_smoothing_groups` | S4 | Sí | Fixture local | Pendiente |
| `read_map_organisation` | S4 | No | Fixture local | Pendiente |
| `set_visgroup` | S4 | Sí | Fixture local | Pendiente |
| `group_solids` | S4 | Sí | Fixture local | Pendiente |
| `set_cordon` | S4 | Sí | Fixture local | Pendiente |
| `write_hint_brush` | S4 | Sí | Fixture local | Pendiente |
| `set_solid_class` | S4 | Sí | Fixture local | Pendiente |
| `set_lightmap_scale` | S4 | Sí | Fixture local | Pendiente |
| `write_portal` | S4 | Sí | Fixture local | Pendiente |
| `read_vmf_trace` | S5 | No | Fixture local | Pendiente |
| `read_vmf_visibility` | S5 | No | Fixture local | Pendiente |
| `read_vmf_nearest_surface` | S5 | No | Fixture local | Pendiente |
| `read_vmf_leak` | S5 | No | Fixture local | Pendiente |
| `read_vmf_rooms` | S5 | No | Fixture local | Pendiente |
| `read_vmf_surfaces` | S5 | No | Fixture local | Pendiente |
| `measure_vmf_clearance` | S5 | No | Fixture local | Pendiente |
| `measure_vmf_approach` | S5 | No | Fixture local | Pendiente |
| `read_vmf_sightlines` | S5 | No | Fixture local | Pendiente |
| `check_vmf_rules` | S5 | No | Fixture local | Pendiente |
| `render_vmf_view` | S5 | No | Fixture local | Pendiente |
| `render_vmf_tour` | S5 | No | Fixture local | Pendiente |
| `render_vmf_plan` | S5 | No | Fixture local | Pendiente |
| `run_compile` | S6 | Sí | BSP/recursos L4D2 | Pendiente |
| `read_compile_log` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_leak` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_bsp_info` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_bsp_entities` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_map_extents` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_map_geometry` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_prop_survey` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_sightlines` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_brush_volumes` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_materials` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_lightmap_budget` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_visleaf_stats` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `read_map_report` | S6 | No | BSP/recursos L4D2 | Pendiente |
| `check_l4d2_mission` | S7 | No | BSP/recursos L4D2 | Pendiente |
| `read_map_dependencies` | S7 | No | BSP/recursos L4D2 | Pendiente |
| `read_pakfile` | S7 | No | BSP/recursos L4D2 | Pendiente |
| `run_pack` | S7 | Sí | BSP/recursos L4D2 | Pendiente |
| `run_pakfile_extract` | S7 | Sí | BSP/recursos L4D2 | Pendiente |
| `read_nav` | S7 | No | NAV existente; no generación offline | Pendiente |
| `read_gma` | S8 | No | Fixture de compatibilidad / binario opcional | Pendiente |
| `run_gma_extract` | S8 | Sí | Fixture de compatibilidad / binario opcional | Pendiente |
| `read_lump_patch` | S8 | No | Fixture de compatibilidad / binario opcional | Pendiente |
| `write_lump_patch` | S8 | Sí | Fixture de compatibilidad / binario opcional | Pendiente |
| `read_lump_patch_status` | S8 | No | Fixture de compatibilidad / binario opcional | Pendiente |
| `run_bsp_rename` | S8 | Sí | Fixture de compatibilidad / binario opcional | Pendiente |
| `run_tga2skybox` | S8 | Sí | Fixture de compatibilidad / binario opcional | Pendiente |
| `run_cubemap2hdr` | S8 | Sí | Fixture de compatibilidad / binario opcional | Pendiente |

## Hallazgos preliminares para revisar

1. `run_vtf_convert` tiene implementación y suites, pero `vtfTools` no se agrega
   a `allTools`. Por eso no es accesible por MCP ni pertenece a las 78 filas.
   Se corrige su presentación como herramienta disponible en la documentación.
   En la ejecución se decidirá si registrar la herramienta, actualizar el conteo
   y probar el contrato; VTFCmd/DevIL no están disponibles en la instalación
   previamente inspeccionada.
2. Hay escritores históricos, como `write_lump_patch`, que emplean escritura
   directa con guards, en vez de pasar por el helper central. Revisar alcance,
   payload binario y pruebas de rutas antes de cambiar esa implementación.
   La observación por sí sola no demuestra que se pueda escapar del guard.
3. Los gates de Wine/Hammer++ en GMod son históricos y específicos de esa rama.
   No prueban disponibilidad de compiladores Hammer++ ni juego en vivo de L4D2.
4. Corregir las descripciones que hayan quedado atrás frente al registro/schemas,
   incluido el número de confirmaciones del cliente y la configuración de fog.

## Resultados y criterio de cierre

Registrar por herramienta y por caso: input, perfil, requisito, resultado positivo
o control negativo, duración, oráculo, evidencia y estado. Estados permitidos:
`passed`, `failed`, `blocked_missing_prerequisite`,
`format_only_runtime_unverified`, `not_applicable_to_l4d2` y `not_run`.
Un diagnóstico de binario ausente puede pasar su control negativo mientras que
el caso positivo queda bloqueado. Las dos cosas se muestran por separado.

Entregar un informe en `docs/audits/<fecha>-l4d2-functional-audit.md` y un
`coverage.json` local. Guardar logs de compilación, audit JSONL, imágenes y hashes
de originales/variantes junto a los artefactos locales. No versionar BSP/FGD/assets
de Valve, índices ni configuración de esta máquina.

El cierre exige:

- 78 filas con un resultado explícito, sin omisiones silenciosas.
- Camino principal VMF → preflight → compilación stock → BSP → dependencias verificado.
- Índice y lotes con controles positivos/negativos demostrados.
- Revisiones de imágenes documentadas.
- Fallos priorizados por bloqueo del flujo L4D2 y correcciones acotadas.
- Build, typecheck y suite obligatoria después de cualquier corrección; separar
  aprobadas, fallidas y omitidas. Cada prueba nueva debe demostrar que puede fallar,
  según CONTRIBUTING.md.
- Un apartado de pendientes para runtime, Hammer/Hammer++ GUI, NAV/bots, assets
  opcionales y perfiles de compatibilidad, sin presentarlos como verificados.

Referencias: [plan de integración](2026-10-03-l4d2-hardening.md),
[medición de las etapas 4 y 5](../measurements/2026-10-13-content-and-batches.md),
[paridad Hammer](../hammer-parity.md) y [gates](../gates.md).
