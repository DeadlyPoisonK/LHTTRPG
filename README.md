# Log Horizon TRPG (ログ・ホライズンTRPG) - Foundry VTT

Sistema no oficial de [Log Horizon TRPG](https://en.wikipedia.org/wiki/Log_Horizon) para Foundry Virtual Tabletop.

Este repositorio continúa el desarrollo del sistema originalmente creado por **Kyane (Tenyryas)**, con
mantenimiento activo a cargo de **DeadlyPoisonK** desde 2026 con permiso del autor original, quien dejó
de mantener el proyecto.

- Repositorio original: https://github.com/Tenyryas/lhtrpg

## Instalación

En Foundry VTT, desde la pestaña de Sistemas, usa el siguiente manifiesto:

```
https://raw.githubusercontent.com/DeadlyPoisonK/LHTTRPG/main/system.json
```

## Compatibilidad

- Foundry VTT v13 o superior.

## Contenido de los compendios (packs)

El sistema trae sus compendios: razas y clases (con sus skills iniciales), skills (básicas, comunes y
de subclase, raciales, de arquetipo, de clase y de montura), GM EX Powers, items, bestiario y reglas.
Los íconos son los genéricos de cada tipo de item/actor; cada mesa puede cambiarlos en su mundo.

Log Horizon TRPG es obra de Mamare Touno / Kadokawa; este sistema no es oficial ni está afiliado a
ellos. Recomendamos tener los manuales.

### Editar los compendios del sistema (desarrollo)

Las fuentes están en `src/packs/<compendio>/*.json`; las bases LevelDB de `packs/` se generan a partir
de ellas (no están en git). Requiere Node.js y `npm install`.

- `npm run packs:build` — `src/packs` → `packs` (con el mundo cerrado: Foundry bloquea los compendios abiertos).
- `npm run packs:unpack` — `packs` → `src/packs`, tras editar los compendios del sistema dentro de Foundry.

## Licencia

El código de este sistema (módulo, plantillas, estilos y localización) está bajo licencia MIT — ver
[LICENSE.txt](LICENSE.txt). Esa licencia no cubre contenido de reglas de Log Horizon TRPG.

## Créditos

- Kyane / Tenyryas — creador original del sistema.
- Asacolips Projects / Foundry Mods — base original de la que partió el sistema.
- DeadlyPoisonK — mantenimiento actual.
