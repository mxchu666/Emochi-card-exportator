# Universal Character Card Exporter

[English](README.md) · **Español** · [日本語](README.ja.md) · [Italiano](README.it.md) · [Deutsch](README.de.md) · [Русский](README.ru.md)

Una extensión de navegador que lee un personaje de **JanitorAI**, **Emochi** o **Polybuzz** y lo guarda como una tarjeta de personaje portable, para que puedas hacer una copia de seguridad o llevarlo a otro frontend. Sin cuenta, sin compilación, sin servidor. Se ejecuta en tu propio navegador, con tu propia sesión.

> Gratis y de código abierto. Si te resulta útil y quieres apoyar el trabajo original, pásate por [inkwell.rip](https://inkwell.rip). Eso es lo que mantiene vivos este tipo de herramientas.

---

## Crédito al autor original

Este proyecto es un **fork** de **[Character Card Extractor / JAI Card Extractor](https://github.com/erpocalypse/jai-card-extractor)** de **[erpocalypse](https://github.com/erpocalypse)**. La extensión original, el lector de JanitorAI, el panel, el flujo de exportación y todo el trabajo sobre el formato de tarjetas vienen de ahí.

**Si usas, bifurcas, redistribuyes o construyes sobre esto, debes dar crédito al creador original y enlazar a [github.com/erpocalypse/jai-card-extractor](https://github.com/erpocalypse/jai-card-extractor).** Es una condición de este fork, no una petición.

Este fork lo mantiene **[mxchu666](https://github.com/mxchu666)**. Añade soporte para Emochi y Polybuzz, el flujo unificado de tarjetas y la documentación que estás leyendo.

**Cómo se hizo este fork.** El código se escribió con **OpenCode** ejecutando **DeepSeek v4.1-flash:free**. Todos los prompts que le di al agente los escribí en español y los traduje yo mismo al inglés a mano, uno por uno, antes de usarlos. Los hallazgos, las pruebas y las notas de API de la sección para desarrolladores son el resultado de ese trabajo, verificados contra los sitios en vivo.

---

## Qué exporta

| Formato | Archivo | Lo leen |
|---|---|---|
| Tarjeta SillyTavern | `.card.json` | SillyTavern, Tavo, Agnai, RisuAI, Inkwell, la mayoría de frontends |
| Tarjeta SillyTavern en PNG | `.card.png` | Igual que arriba, con la tarjeta incrustada en el chunk de la imagen |
| Lorebook / World Info | `.lorebook.json` | SillyTavern, Tavo |
| JSON de JanitorAI | `.jai.json` | Lo más cercano al registro original |
| Texto plano | `.txt` | Cualquier cosa que lea texto |

Todo ocurre en local. No se sube nada, no hay analítica y no se carga código externo.

---

## Cómo funciona la herramienta

La extensión son cuatro piezas pequeñas con una tarea cada una, y una sola regla que lo sostiene todo: **todos los lectores de sitio producen el mismo objeto de tarjeta**.

```
página del sitio
   │
   ├─ src/scraper.js    lee JanitorAI
   ├─ src/emochi.js     lee Emochi
   └─ src/polybuzz.js   lee Polybuzz
           │
           ▼
     un objeto de tarjeta
     { name, creator, avatarUrl, gender, tags,
       fields: { description, personality, scenario,
                 greeting, altGreetings, exampleDialogue },
       lorebooks[], scriptRefs[] }
           │
           ├─ src/exporters.js  ──▶ .card.json / .card.png / .lorebook.json / .jai.json / .txt
           └─ src/panel.js      ──▶ la interfaz en la página: lista de bloques, casillas, botones
```

1. **Leer.** El lector del sitio en el que estás reúne el personaje. Cada uno lo hace distinto, porque cada sitio expone una superficie distinta: JanitorAI tiene una API JSON interna, Emochi tiene un backend Next.js con un prompt compilado, Polybuzz tiene una carga Nuxt renderizada en servidor más una API REST.
2. **Normalizar.** El registro crudo se aplana en el objeto de tarjeta de arriba. Aquí se traducen los nombres de campo de cada sitio: `sceneBrief` de Polybuzz pasa a `description`, `speechText` a `greeting`, `templateIntro` a `scenario`. No se inventa nada. Si un campo no se publica, queda vacío.
3. **Mostrar.** El panel lista cada bloque encontrado con una casilla y una vista previa, para que puedas quitar una línea de jailbreak o un prompt de sistema que venía incluido. El contador de arriba (`x/y kept`) dice exactamente qué se va a escribir.
4. **Exportar.** `toBlocks()` convierte los bloques marcados al formato elegido. El exportador es agnóstico al sitio: nunca ha oído hablar de Emochi ni de Polybuzz, solo conoce el objeto de tarjeta. Por eso cada sitio obtiene los cinco formatos gratis.
5. **Guardar.** Se crea un Blob y se pulsa mediante un `<a download>`. Nada cruza la red.

Hay una protección deliberada en `toBlocks()`: si un bloque de Personalidad acaba siendo idéntico carácter por carácter al bloque de Descripción, se descarta en silencio. Esa situación casi siempre es un servidor repitiendo un campo en otro, no un creador escribiendo el mismo párrafo dos veces.

### Por qué una extensión y no un sitio web

Todos estos sitios protegen al menos parte de sus datos detrás de una sesión iniciada. Una aplicación web necesitaría tus cookies; una extensión puede tomar prestada la sesión que el navegador ya tiene, sin ver nunca tu contraseña. Eso es toda la razón por la que la herramienta vive donde vive.

---

## Instalarlo (unos dos minutos)

No necesitas saber programar. No hay nada que compilar.

1. **Descarga el proyecto.** Pulsa el botón verde **Code** en la página de GitHub y luego **Download ZIP**. Descomprímelo en un sitio permanente, como el Escritorio.
2. **Abre la página de extensiones.** Chrome: escribe `chrome://extensions`. Edge: `edge://extensions`.
3. **Activa el modo de desarrollador** (interruptor arriba a la derecha).
4. Pulsa **Load unpacked** / **Cargar descomprimida** y elige la carpeta que contiene `manifest.json`.

> Si mueves o borras esa carpeta, la extensión deja de funcionar. Guárdala en un sitio permanente.

---

## Usarla

### JanitorAI

1. Abre un personaje en [janitorai.com](https://janitorai.com) con la sesión iniciada.
2. Pulsa **Extract card** en la esquina inferior derecha.
3. **Quick scan** lee el personaje. **Deep scan** además recorre todos los lorebooks asociados: más lento, más completo.
4. Desmarca lo que no quieras. **Select all** / **Select none** están para eso.
5. Elige un formato de exportación.

Si un personaje tiene más de un lorebook, aparece un botón **Separate books** después del escaneo profundo, para que un libro de mundo compartido se guarde como archivo reutilizable.

### Emochi

1. Abre un personaje en [emochi.com](https://emochi.com) (`emochi.com/character/...`).
2. **Quick scan** lee la carga pública: nombre, lema/descripción, mensaje de bienvenida, etiquetas, avatar, creador.
3. **Deep scan** además pide la definición del creador: personalidad, escenario, conversaciones de ejemplo. Esa ruta solo responde para personajes de **tu propia cuenta**; inicia sesión primero.

Algunos personajes de Emochi realmente no tienen texto de personalidad ni de escenario guardado en ningún sitio, porque el sitio los maneja desde etiquetas y genera la persona en el chat. Eso es una propiedad del personaje, no una lectura fallida.

### Polybuzz

1. Abre un personaje en [polybuzz.ai](https://polybuzz.ai) (`polybuzz.ai/es/character/chat/...`).
2. Pulsa **Extract card** → **Quick scan**.
3. Exporta.

Una tarjeta de Polybuzz sale con lo que el sitio publica:

| Campo de la tarjeta | Origen en Polybuzz |
|---|---|
| Description | `sceneBrief` — la introducción corta |
| Greeting | `speechText` — el mensaje de apertura |
| Scenario | `templateIntro` cuando el bot es de plantilla; si no, la dirección escénica que el creador escribió al principio del saludo |
| Personality | las etiquetas de **Personalidad** del propio creador (`Frío`, `Celoso`, `Tsundere`…), más el estilo de diálogo cuando se publica |
| Gender | `sceneGender`, como línea `Gender: Male/Female/Non-binary` en la descripción |
| Etiquetas, avatar, nombre, creador | el registro de la escena |

---

## Polybuzz: la información de antecedentes no se puede recuperar. Por esto.

La guía de creación de Polybuzz enumera siete cosas de las que se compone un personaje: nombre, género, introducción corta, saludo, etiquetas, **antecedentes** y **estilo de diálogo** (más el diálogo de ejemplo que enseña el estilo). Una página pública publica cinco. Las otras dos — `systemRole` (los antecedentes, etiquetados *Antecedentes*) y `conversationExample` (los diálogos de ejemplo) — **no se envían a nadie excepto al creador de ese personaje**. Esto no es un endpoint que falte ni algo que esta extensión o cualquier otra pueda sortear, porque **los datos se ensamblan en el servidor y nunca se serializan hacia alguien que no sea el propietario**.

La evidencia, en corto:

- El propio formulario de creación muestra el campo como `Antecedentes (Visto en privado)`. Es una nota solo para el creador, por diseño.
- Se llamó a todas las rutas de API de solo lectura que conoce el cliente web contra bots públicos con una sesión de invitado nueva. La única que contiene la clave es `scene/detailguest`, y devuelve `""`.
- La ruta del propietario `scene/getscenedetail` responde `210002` para un bot que tu cuenta no posee. Ese código es definitivo: el servidor rechaza el registro.
- En los 225 chunks de JavaScript cargados de forma diferida, `systemRole` y `conversationExample` aparecen en **un** archivo: la página de creación. Ninguna otra página los pide, así que ninguna otra página puede mostrarlos.
- Un experimento controlado lo zanja: un bot creado con el marcador `ZZZ-123` en sus Antecedentes, escaneado después desde una segunda cuenta, nunca mostró el marcador. El valor no sale de la sesión del creador.
- Pedirle al modelo que recite sus propias instrucciones tampoco funciona. El pipeline del chat construye el prompt de sistema en el servidor y el stream solo lleva trozos de texto. La vez que se le pidió a un bot su propia biografía, se inventó una infancia que no tenía: la paráfrasis no es el texto guardado, y esta extensión no va a hacer pasar una generación por una recuperación.

**Lo que hace la extensión en su lugar:** usa los campos que Polybuzz sí publica, y lo dice en una nota al pie debajo de la lista de bloques. La personalidad sale de las etiquetas que eligió el creador; el escenario sale de la dirección de apertura del propio saludo, literal; no se parafrasea nada y no se inventa nada.

Si el personaje es tuyo, las tres rutas autenticadas se siguen preguntando en cada escaneo, y tus propios bots vuelven completos.

---

## Cómo se construyó este fork, de principio a fin

Un registro breve, porque la forma del proceso explica por qué los límites anteriores son fiables.

1. **Empezar con la herramienta original.** La extensión original ya leía JanitorAI. Se convirtió en la base, y la regla para todo lo demás fue: nunca cambiar el comportamiento heredado, solo añadir al lado.
2. **Añadir un lector, no un caso especial.** Emochi se añadió como `src/emochi.js` llenando el mismo objeto de tarjeta, así que `exporters.js` y `panel.js` no necesitaron ningún cambio.
3. **Encontrar la carga real.** Emochi es una app Next.js sobre el backend de FlowGPT; los datos útiles están en una cadena `initPrompt` compilada dentro del objeto público del prompt. Esa cadena se vuelve a parsear en personalidad, antecedentes, escenario y diálogo de ejemplo.
4. **Medir, no suponer.** La afirmación de que Emochi publica una definición para cerca de un tercio de los personajes salió de muestrear tres listas en vivo independientes (30, 19 y 9 personajes) y contarlos. Es un flag de publicación (`visibility: true`), no una puerta de inicio de sesión.
5. **Añadir Polybuzz igual.** Nuxt renderiza el personaje en el servidor dentro de la página, así que la carga está en el DOM como un array devalue. Ese array se expande y se busca dentro. Un content script no puede ver `window.__NUXT__`, así que se usa la etiqueta `<script id="__NUXT_DATA__">`.
6. **Enumerar la API, no adivinarla.** El bundle de JavaScript del sitio declara 214 configuraciones de petición. Se llamó a todas las de solo lectura contra bots públicos. Así se llegó a la conclusión de que los antecedentes son inalcanzables: no fallando una vez, sino agotando la superficie.
7. **Demostrar el negativo con un control.** El experimento `ZZZ-123`, hecho en dos cuentas, es lo que convirtió "no lo encontramos" en "no está ahí para encontrarlo".
8. **Mantener el panel en silencio.** Un campo privado del creador que falta es el caso normal, no un error. El panel muestra una nota al pie, no un aviso. Solo un fallo real (sin sesión, ninguna ruta respondió) recibe un mensaje.
9. **Probar todo lo que se puede probar.** `node --test` cubre los lectores, el normalizador, los exportadores y el constructor de bloques. 71 tests en el momento de escribir esto. Cada afirmación sobre la API en este README se verificó contra el sitio en vivo, y las que no se pudieron verificar están marcadas como tales.
10. **Escribirlo.** La sección para desarrolladores existe para que la siguiente persona no tenga que volver a deducirlo.

**Esta herramienta está en desarrollo activo y seguirá recibiendo actualizaciones.** Se añaden sitios, se arreglan lectores rotos y las notas de API se corrigen cuando un sitio cambia. Si algo se rompe, normalmente es porque un sitio cambió la forma de su carga, y eso tiene arreglo.

---

## Tareas pendientes

- [ ] **Añadir soporte para Character.ai.**
- [ ] **Añadir soporte para Saucepan AI.**
- [ ] **Añadir soporte para WyvernChat.com.**
- [ ] **Prioridad — Emochi: algunos bots no muestran personalidad ni escenario.** Una parte de los personajes de Emochi realmente no guarda definición, pero la tasa de fallo es más alta de lo que predice la medición del flag de publicación. Hay que aislarlo: ¿es la carga, el parser o el personaje?
- [ ] **Prioridad — Emochi: no se están recuperando las conversaciones de ejemplo.** La ruta de definición lleva `characterExampleConversation`; no está llegando a la tarjeta. Esto rompe la fidelidad del diálogo de ejemplo y tiene que funcionar antes de poder dar Emochi por terminado.

Los dos puntos de Emochi tienen prioridad sobre añadir sitios nuevos. Un lector que funciona a medias en un sitio soportado es peor que un sitio más que funciona del todo.

---

## Reportar errores

Usa la **[pestaña Issues](https://github.com/mxchu666/Universal-Character-Card-Exporter/issues)**. Está activada. Incluye:

- El sitio y la URL del personaje.
- Qué versión tienes — **pasa el cursor por el pie del panel de exportación y la versión aparece en el tooltip**.
- Qué esperabas y qué obtuviste. Una captura del panel es lo más útil que puedes adjuntar.
- Cualquier mensaje que mostrara el panel. El panel nombra la ruta y el código de respuesta cuando falla una consulta, y ese texto es exactamente lo que hace falta para arreglarlo.

Las peticiones de funciones son bienvenidas en el mismo sitio.

---

## ¿Está permitido?

Es una herramienta de copia de seguridad personal. Lee lo que ya puedes ver con la sesión iniciada y lo guarda en un formato abierto. No salta ningún muro de pago ni desbloquea nada que no pudieras ver de otra forma.

Los términos de los sitios pueden restringir el acceso automatizado. Úsala para tus propios personajes y copias personales, da crédito a los creadores cuando vuelvas a compartir su trabajo y no martillees los sitios.

## Privacidad

- Los datos del personaje escaneado nunca salen de tu navegador. Sin analítica, sin código externo.
- Sin permisos especiales. La extensión solo se ejecuta en las páginas de los sitios que abres.
- Las únicas llamadas de red que hace van al sitio en el que ya estás.

---

## Para desarrolladores

La extensión es JavaScript puro, sin dependencias y sin paso de compilación. Edita `src/` y recarga desde la página de extensiones.

```sh
node --test
```

`src/scraper.js` lee JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz. Los tres llenan la misma forma de tarjeta, así que los exportadores y el panel nunca saben en qué sitio estás. `src/exporters.js` convierte, `src/panel.js` y `src/panel.css` son el panel en la página, `background.js` es el service worker para peticiones que un content script no puede hacer (CORS, cabeceras prohibidas).

**El registro de API sitio por sitio está en el README en inglés** ([Developer reference](README.md#developer-reference-english-only)). Se mantiene en inglés a propósito: es material de referencia y la parte que más se queda obsoleta cuando un sitio cambia. Se traducirá cuando se estabilice.

---

## Licencia

[MIT](LICENSE).
