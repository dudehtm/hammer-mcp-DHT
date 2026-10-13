# Hoja de ruta de automatizacion y referencias

Fecha: **2026-10-03**.

Este documento conserva las mejoras futuras para acelerar la creacion de mapas custom y hacer
que un agente trabaje con referencias reales sin convertir datos no verificados en hechos. Es un
backlog de arquitectura, no una orden de implementar todas las piezas ahora.

## Decision actual

- Mantener `hammer-mcp` como nucleo offline para VMF, BSP, validacion, compilacion y medicion.
- No reemplazarlo por un MCP monolitico mientras las responsabilidades sigan siendo locales y
  deterministas.
- Mantener el engine/runtime en `gmod-mcp` o en un servicio equivalente separado.
- Crear un orquestador separado solo cuando haya ejecucion multiagente, leases, handoffs o
  coordinacion entre procesos.
- No afirmar que un BSP puede reconstruirse como el VMF original: la decompilacion es aproximada.

## Base disponible

El nucleo actual ya permite:

- Crear y editar VMF sin reserializar el contenido intacto.
- Construir brushes, fittings y displacements con validacion geometrica.
- Ejecutar lint contra el FGD del juego, comprobar leak, rooms, reglas y clearances.
- Generar planos, tours y medidas offline.
- Compilar, leer BSP por offsets, revisar limites, dependencias, packing y nav.
- Leer y extraer contenido de Workshop sin copiarlo automaticamente al repositorio.

La base es suficiente para mapas custom pequenos y medianos. No es suficiente todavia para copiar
un mapa existente con fidelidad de produccion, reconstruir su fuente desde un BSP o validar por si
sola jugabilidad, bots, NAV, cubemaps y comportamiento runtime.

## Backlog prioritario

### P0: Pipeline declarativo

Reducir el flujo de muchas llamadas independientes a un proyecto reproducible.

- Introducir un manifiesto de proyecto con brief, juego, rama, referencias, restricciones y
  objetivos medibles.
- Anadir una operacion provisional como `run_map_pipeline` que ejecute etapas con checkpoints:
  brief, referencia, generacion, lint, geometria, compilacion, auditoria, render y comparacion.
- Registrar hashes de entradas y salidas, artefactos, logs, versiones y estado por etapa.
- Soportar `dryRun`, reanudacion idempotente y diff antes de escribir.
- Devolver un resumen corto para el agente y conservar el detalle en artefactos consultables.

No debe ser un `generate_map` opaco que esconda errores. Cada etapa debe poder ejecutarse y
validarse de forma independiente.

### P1: Catalogo de referencias

Crear un indice local y de solo lectura para VMF, BSP, GMA, modelos y materiales.

- Guardar ruta, hash, juego/rama, FGD, dimensiones, habitaciones, puertas, entidades, I/O,
  materiales, modelos, dependencias y procedencia.
- Generar miniaturas o planos para que el agente pueda comparar forma y escala.
- Permitir consultas estructurales antes de usar busqueda semantica o embeddings.
- Mantener fuera del repositorio las referencias grandes y el contenido de Valve.

El catalogo debe indicar siempre si un dato viene de un VMF, de un BSP, de una medicion o de una
estimacion.

### P1: Prefabs y variantes desde VMF

Priorizar esta ruta antes de la decompilacion BSP, porque conserva mucha mas informacion.

- Extraer una region, entidad, habitacion o modulo desde un VMF.
- Transformar posicion, escala permitida, orientacion, IDs, targetnames y conexiones I/O.
- Sustituir materiales, modelos y clases mediante un mapa explicito.
- Preservar comentarios, formato y procedencia del bloque original cuando sea posible.
- Validar el resultado con FGD, solids, leak, reglas y compilacion.

Los modos deben estar separados:

- `reference`: solo lectura y medidas; no copia archivos.
- `template`: copia explicita desde un VMF fuente con procedencia y diff.
- `decompile`: resultado aproximado desde BSP, siempre marcado como `lossy`.

No copiar mapas o assets externos silenciosamente ni eliminar su licencia/procedencia.

### P1: Colocacion semantica

Automatizar lo que actualmente requiere muchas decisiones manuales.

- Ajustar props al suelo usando bounds reales del modelo.
- Orientar puertas, ventanas, counters y fittings respecto a paredes y salas.
- Comprobar clearance, altura, espacio de aproximacion y colisiones.
- Copiar alineacion de textura entre caras y permitir seleccionar orientaciones `+x`, `-x`,
  `+y` y `-y`, no solo `up/down/side`.
- Crear reglas de sustitucion por estilo, juego y disponibilidad de contenido.

### P2: Decompilacion BSP aislada

Integrar un wrapper de `bspsrc` u otra herramienta equivalente solo cuando haya una necesidad real
de reutilizar mapas que no tienen VMF.

- Ejecutar la herramienta en un sandbox o carpeta de resultados separada.
- No modificar la instalacion del juego ni importar automaticamente el resultado.
- Marcar perdida de visgroups, hints, clasificacion detail/world, instancias y otras intenciones.
- Ejecutar lint, validacion geometrica, leak, compilacion y comparacion visual despues.
- Mantener el BSP como referencia original y el VMF decompilado como derivado, nunca como fuente
  original confirmada.

### P2: Dependencias y assets

Ampliar `read_map_dependencies` para cubrir manifests, soundscapes, particulas y convenciones de
scripts que hoy no se recorren completamente.

- Resolver materiales hacia texturas y modelos hacia sus dependencias.
- Producir un manifiesto de contenido para cada variante generada.
- Distinguir assets del juego, del addon, del Workshop y del proyecto.
- Permitir un modo de sustitucion cuando el asset de referencia no esta disponible.

### P2: Bucle de engine

No mover estas responsabilidades al nucleo offline. Coordinar con `gmod-mcp` cuando se necesite:

- Probar carga real del mapa.
- Generar o validar NAV.
- Probar spawns, bots, puertas, I/O y entidades runtime.
- Construir cubemaps y verificar materiales con el engine.
- Capturar evidencia visual y de rendimiento dentro del juego.

El resultado del pipeline debe distinguir claramente entre `offline-validado` y `runtime-validado`.

### P3: Coordinacion multiagente

Crear un servicio separado solo si varios agentes modifican el mismo proyecto en paralelo.

- Identidad de sesion, claims, leases y handoffs.
- Precondiciones por hash o revision del VMF.
- Cola de tareas y artefactos compartidos.
- Rechazo de escrituras obsoletas en lugar de sobrescribir trabajo.
- Registro de quien produjo cada cambio y por que.

No introducir locks persistentes ni un daemon en `hammer-mcp` mientras siga siendo una herramienta
local-first de un solo flujo.

## Arquitectura objetivo

- `hammer-mcp`: nucleo offline determinista.
- `reference-mcp` o modulo de referencias: catalogo, prefabs y decompilacion controlada cuando el
  corpus crezca.
- `gmod-mcp`: comprobaciones dentro del engine.
- `map-orchestrator`: pipeline y coordinacion cuando la automatizacion requiera varios procesos.

La primera implementacion puede vivir como modulos y herramientas de `hammer-mcp`. Separar un MCP
solo cuando cambien sus permisos, ciclo de vida, volumen de datos o necesidad de estado.

## Criterios para activar una fase

- Activar el pipeline cuando una tarea normal requiera muchas llamadas manuales o deba reanudarse.
- Activar el catalogo cuando se consulten repetidamente varias referencias reales.
- Activar prefabs cuando se repitan edificios, habitaciones, puertas o fachadas con variaciones.
- Activar decompilacion solo cuando existan mapas sin VMF y la perdida sea aceptable.
- Activar el puente runtime cuando una afirmacion dependa de NAV, bots, cubemaps o jugabilidad.
- Activar el coordinador cuando haya cambios concurrentes de mas de un agente.

## Definicion de terminado

Una mejora futura no se considera lista hasta que:

- Sea determinista, reanudable y tenga `dryRun` cuando escriba archivos.
- Devuelva procedencia, rama, juego y dependencias de cada referencia usada.
- Pueda demostrar que falla cuando se rompe la condicion que cubre su test.
- Produzca VMF validable por el propio parser, lint y compiladores.
- Separe mediciones, politicas y juicios esteticos.
- No presente como exacta una reconstruccion derivada de BSP.
- Mantenga la validacion runtime fuera del nucleo offline.
