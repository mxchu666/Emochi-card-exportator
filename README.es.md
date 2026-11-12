# Universal Character Card Exporter

[English](README.md) · **Español** · [日本語](README.ja.md) · [Italiano](README.it.md) · [Deutsch](README.de.md) · [Русский](README.ru.md)

Una extensión de navegador que lee un personaje de **JanitorAI**, **Emochi**, **Polybuzz**, **Character.ai** o **Crushon.ai** y lo guarda como una tarjeta de personaje portable, para que puedas hacer una copia de seguridad o llevarlo a otro frontend. Sin cuenta, sin compilación, sin servidor. Se ejecuta en tu propio navegador, con tu propia sesión.

**Nuevo en 0.9.0:** lectores de Character.ai y Crushon.ai, diálogos de ejemplo de Polybuzz, un parser de Emochi que dejó de perder campos, y el Emochi Lab. Todo el detalle está en el [changelog](CHANGELOG.md) y en el [devlog](#devlog).

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

### Character.ai

1. Abre un personaje en [character.ai](https://character.ai) con la sesión iniciada (`character.ai/character/...`).
2. Deja que la página termine de cargar y pulsa **Extract card** → **Quick scan**.
3. Exporta.

| Campo de la tarjeta | Origen en Character.ai |
|---|---|
| Nombre, creador, avatar | el registro del personaje |
| Description | `title` (el lema) seguido de `description` (el texto de «Acerca de») |
| Greeting | `greeting` |
| Diálogo de ejemplo | `definition` — la definición de texto libre del creador, cuando es pública |

**Sobre la definición.** Character.ai esconde la definición de un personaje detrás de un segundo interruptor del creador llamado **Definition Visibility**, separado de la visibilidad del personaje. Cuando está apagado, el sitio no envía el texto a nadie, así que el bloque de diálogo de ejemplo sale vacío y el panel lo dice en una nota al pie. El resto de campos está ahí igualmente.

El lector funciona observando las peticiones de la propia página: un script pequeño en el mundo de la página (`src/intercept.js`) copia la cabecera `Authorization` a una etiqueta oculta y reemite cada respuesta JSON como un evento del DOM, que el lector recoge. Nunca modifica una petición ni manda una propia con tu token. Cuando la página todavía no ha hecho la llamada, el lector repite los mismos tres endpoints que usa el sitio, a través del service worker de la extensión.

### Crushon.ai

1. Abre un personaje en [crushon.ai](https://crushon.ai) (`crushon.ai/character/...`).
2. Deja que la página termine de cargar y pulsa **Extract card** → **Quick scan**.
3. Exporta.

Crushon se renderiza por completo en el cliente, así que el lector lee el registro que la propia página renderizó en lugar de llamar a una API. Los alias de campo cubren todas las grafías que el sitio ha usado entre versiones: `firstMessage` / `first_mes` / `greeting`, `description` / `introduction` / `intro`, `avatar` / `avatarUrl` / `image`, `mes_example` / `exampleDialogue` / `dialogue`. Si la página aún no ha pedido el personaje, recárgala y vuelve a escanear.

**Nota sobre los nombres de campo.** El importador de Crushon mapea una tarjeta Tavern invertida: la `personality` de la tarjeta se convierte en la *Introduction* de Crushon, y la `description` de la tarjeta se convierte en la *Personality* de Crushon. El lector informa lo que Crushon publica en el campo al que pertenece en la tarjeta, así que pasar por ambas herramientas deja el texto donde estaba.

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
11. **Reutilizar antes de escribir.** Character.ai y Crushon.ai solo entregan el registro a su propio JavaScript, así que un solo mecanismo cubre a los dos: un sniffer en el mundo de la página y un recorrido con puntuación sobre las cargas. Un archivo nuevo para cada uno, más dos compartidos, y los exportadores no se tocaron.
12. **Acreditar el origen de un enfoque.** El patrón de intercepción viene del [exportador de taquanta](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), y el crédito está arriba del archivo y en este README, no solo en un mensaje de commit.
13. **Decir lo que no está verificado.** Los dos sitios nuevos responden `403` de Cloudflare a una máquina sin navegador, así que los contratos están documentados y la lectura en vivo no. Eso está escrito en tres sitios en lugar de disimularse.

**Esta herramienta está en desarrollo activo y seguirá recibiendo actualizaciones.** Se añaden sitios, se arreglan lectores rotos y las notas de API se corrigen cuando un sitio cambia. Si algo se rompe, normalmente es porque un sitio cambió la forma de su carga, y eso tiene arreglo.

---

## Devlog

El registro de cómo se llegó realmente a cada versión: qué se intentó, qué falló y qué enseñó el fallo. Lo más reciente primero. La versión corta está en el [changelog](CHANGELOG.md); esta es la larga.

### 0.9.0 — dos sitios cerrados, un solo mecanismo, y un parser de Emochi con tres errores

**Emochi primero, porque era la prioridad.** Había dos informes abiertos: personalidad y escenario ausentes en algunos bots, y `characterExampleConversation` que nunca llegaba a la tarjeta.

El fallo de las conversaciones de ejemplo se resolvió en diez minutos. La ruta de definición devuelve `characterExampleConversation` como un **array de turnos**, y el lector le aplicaba `String(...)`. Un array se convierte en `"[object Object],[object Object]"` en algunos entornos y en `""` en el helper `s()` del normalizador — en ningún caso, diálogo. Ahora se parsea como turnos, y el parser acepta `{role, content}`, `{user, ai}`, `{isUser, text}` y un envoltorio `{dialogue: [...]}`, porque el grabador de Emochi usa la primera forma, los importadores de tarjetas usan la segunda, y el resto aparece en registros anteriores a un cambio de esquema.

El fallo de la personalidad tardó más y resultó ser tres fallos distintos apilados:

1. **La instrucción de cierre se trataba como un límite.** Todo prompt compilado acaba con `Do not write as {{user}} or assume {{user}}'s reaction or response.` El lector cortaba el texto ahí y descartaba toda la cola. Eso es correcto para un prompt que termina con la regla, que es lo que produce el compilador. Es incorrecto en el momento en que un creador cita la regla dentro de sus propios antecedentes o su diálogo de ejemplo, y pasa más de lo que parece: hay gente que pega la regla en su ejemplo a propósito, para enseñársela al modelo. Cada sección posterior a la cita desaparecía. El arreglo es eliminar esa frase donde aparezca y conservar el texto que la rodea.
2. **La gramática de secciones aceptaba una sola redacción exacta.** Los marcadores eran `'s personality:`, `'s background:`, `scenario of role-play:`. Un creador que escribió `Personality:` — mayúscula, sin posesivo, porque escribió su propio prompt en lugar de usar el constructor — parseaba a nada, y el prompt entero caía en la rama de «sin marcadores, trátalo como personalidad». Ahora hay un segundo conjunto de marcadores anclado a línea que tolera la deriva, y gana la pasada que reconoce más secciones. Un empate conserva la gramática estricta, así que los prompts que produjo el compilador se parsean exactamente igual que antes.
3. **La nota de sección vacía era una suposición.** El lector decía «el creador dejó la personalidad y el diálogo de ejemplo vacíos» siempre que esos campos salían en blanco, incluso cuando el parser no había reconocido la estructura — en cuyo caso estaban en blanco por culpa del parser. La nota ahora solo se dispara cuando también se reconoció la línea del nombre, es decir, cuando la estructura se entendió de verdad.

Los tres están cubiertos por tests escritos desde las formas que fallaban, no desde las que pasaban.

**Después, los diálogos de ejemplo de Polybuzz.** El ticket traía una captura del editor de *Estilo de diálogo*: las filas con avatar al lado son `{{user}}`, las filas sin avatar son `{{char}}`. Leer el bundle de la página de creación confirmó la forma — `dialogueStyleObj` es un array de pares `{user, ai}`, una entrada por intercambio, y el registro de detalle lo devuelve bajo `dialogueStyle.dialogue`. Ambos se parsean ahora a líneas de tarjeta. La cadena plana `conversationExample` es el mismo dato como `user;ai` por línea, y esa forma también se reescribe.

Una trampa: una cadena plana bajo `dialogueStyle` es la **etiqueta de estilo** (`Descriptivo, frases cortas`), no diálogo. La primera versión del parser reescribió alegremente una etiqueta de estilo como `{{char}}: Descriptivo, frases cortas` y la metió en el bloque de ejemplos. Los tests lo cazaron. Ahora las cadenas nunca se convierten en diálogo; solo los arrays y el texto `user;ai`.

**Después, Character.ai.** El enfoque está tomado del [exportador de taquanta](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), que resolvió el mismo problema: el registro solo lo pide el JavaScript de la propia página, con una cabecera `Authorization: Token <hex>` que la extensión no puede fabricar. La implementación de referencia ejecuta un script en el mundo de la página (`MAIN`), intercepta `fetch` y `XMLHttpRequest`, y guarda la cabecera en el DOM. Es la única forma de ver una cabecera que el navegador añade fuera de tu contexto.

Dos cambios sobre ella. El token va en una etiqueta meta con espacio de nombres propio en lugar de una que pueda colisionar. Y cada respuesta JSON que recibe la página se reemite como un evento del DOM que lleva una **cadena** — los objetos no sobreviven a la frontera entre un script `MAIN` y un content script aislado, pero las cadenas sí. Ese único cambio convirtió el sniffer de «captura el token y repite la llamada» en «captura el token *y* la respuesta», así que el lector sigue funcionando cuando la repetición es rechazada.

La definición es el campo interesante. Character.ai la cierra detrás de **Definition Visibility**, un segundo interruptor separado de la visibilidad del personaje, y cuando está apagado el texto no se envía a nadie. Así que una tarjeta con el bloque de diálogo de ejemplo vacío es una configuración del creador, no una lectura fallida, y el panel lo dice exactamente así en lugar de mostrar un error.

**Después, Crushon.ai.** Renderizado por completo en el cliente y detrás de un muro anti-bots. No hay API pública que repetir y las llamadas de la página llevan estado de sesión, así que el lector no llama a nada: recorre las cargas que la página ya recibió y puntúa cada objeto por cuántos nombres de campo conocidos lleva. Gana el más rico. Los alias cubren las grafías que el sitio ha usado entre versiones, porque fallar en una grafía cuesta el campo entero.

La parte compartida de ambos lectores es `src/harvest.js`: recogida de cargas, lectura del token y el recorrido con puntuación. Dos lectores nuevos, dos archivos compartidos, cero cambios en `exporters.js` o `panel.js` — la regla de que cada lector llena el mismo objeto de tarjeta es lo que lo hizo posible, y es por lo que el siguiente sitio cuesta un archivo.

**Lo que no se pudo verificar.** Los dos hosts nuevos responden `403` de Cloudflare a la máquina donde se construyó esto, así que ningún lector se ha ejercitado contra un navegador con sesión. Lo que sí se verificó: el endpoint neo está vivo y responde `{"status":"NOT_OK","error":"bad request"}` a un id sintético, que es la ruta quejándose del cuerpo y no del llamante. Los contratos de campo vienen de la implementación funcional de taquanta. Está escrito como no verificado en el changelog, en la lista de tareas y aquí, porque un lector que no se ejercitó es una afirmación distinta de uno que sí.

### 0.8.0 — el fork recibe nombre y seis idiomas

El repositorio conservaba su nombre original mientras soportaba cuatro sitios. Renombrado a **Universal Character Card Exporter**, que es lo que hace. La pestaña de Issues se habilitó al mismo tiempo, porque la sección de reporte de errores mandaba a la gente a una pestaña que no existía.

La documentación pasó a seis idiomas en una sola pasada. La referencia de API sitio por sitio se queda en inglés y lo dice al principio de la sección: es material de referencia que se queda obsoleto más rápido, y seis copias de un documento obsoleto son seis veces el mantenimiento sin ninguna ganancia. Las traducciones enlazan a ella.

La sección de Polybuzz se reescribió. Antes decía que los antecedentes «no se pueden recuperar» como conclusión. Ahora la evidencia está debajo: la etiqueta de privado por diseño en el formulario de creación, el barrido exhaustivo de rutas, el `210002` en el bot de otra persona, el experimento controlado con `ZZZ-123` en dos cuentas. Un resultado negativo afirmado no vale nada; un resultado negativo con su método adjunto vale algo.

### 0.7.13 — personalidad a partir de las etiquetas del propio creador

Polybuzz no publica antecedentes ni campo de personalidad, lo que dejaba las tarjetas con el bloque de Personality vacío. El árbol de etiquetas ya se pedía para la lista de etiquetas de la tarjeta, así que se leyó con más cuidado: cada etiqueta se archiva bajo uno de cuatro padres, y `Personalidad` contiene 41 palabras de temperamento que el creador elige a mano. Eso es la caracterización del propio creador, escrita por él, publicada por el sitio.

El cruce es honesto de una forma concreta: las etiquetas de género, origen e identidad se quedan fuera de Personality y siguen en la lista de etiquetas, y un `systemRole` real sigue teniendo prioridad sobre las etiquetas cuando existe. Medido en 10 bots en vivo: 10/10 produjeron un bloque de Personality real. Una lista de etiquetas es más fina que unos antecedentes escritos, pero son palabras del creador en lugar de una suposición.

### 0.7.10 – 0.7.12 — un eco no es un campo

Tres versiones, una idea. `getsceneconfig` con un id de escena responde con el texto de introducción compilado como respaldo. Cinco escaneos con sesión de bots que la cuenta no posee devolvieron un `systemRole` idéntico carácter por carácter a `sceneBrief`. Así es como el servidor renderiza unos antecedentes vacíos, no un segundo campo que coincide por casualidad. Un eco exacto ahora se trata como ausencia, cada ruta conserva su propia respuesta en lugar de la primera no vacía, y el panel muestra una nota al pie en lugar de un aviso, porque un campo privado del creador es el caso normal.

El escenario salió del mismo trabajo: los saludos de Polybuzz suelen abrir con una dirección escénica (`*Bangchan es tu esposo*`), que es la premisa del propio creador. Se promueve literal cuando el registro no lleva `templateIntro`. Nunca se parafrasea nada.

---

## Changelog

Historial completo de versiones, con cada arreglo y su motivo: **[CHANGELOG.md](CHANGELOG.md)**.

Versión corta:

| Versión | Qué llegó |
|---|---|
| 0.9.0 | Lectores de Character.ai y Crushon.ai, diálogos de ejemplo de Polybuzz, arreglos del parser de Emochi, Emochi Lab, 89 tests |
| 0.8.0 | Renombrado, documentación en seis idiomas, sección de crédito, reescritura de la evidencia de Polybuzz, Issues habilitado |
| 0.7.13 | Personality de Polybuzz desde las etiquetas `Personalidad` del creador |
| 0.7.12 | Scenario de Polybuzz desde la dirección escénica del saludo |
| 0.7.11 | Candidatos por ruta, para que un eco no tape unos antecedentes reales |
| 0.7.10 | Cadena de configuración con conversación, panel silencioso |
| 0.7.0 – 0.7.9 | Soporte de Polybuzz, de principio a fin |
| 0.6.0 – 0.6.1 | Lector de Emochi y escaneo profundo del historial de prompts |
| 0.5.0 y anteriores | JanitorAI, heredado de la extensión original de erpocalypse |

---

## Tareas pendientes

- [x] **Añadir soporte para Character.ai.** Hecho en 0.9.0. La definición sigue dependiendo del interruptor Definition Visibility del creador.
- [x] **Añadir soporte para Crushon.ai.** Hecho en 0.9.0, leyendo lo que la página renderiza.
- [x] **Prioridad — Emochi: algunos bots no muestran personalidad ni escenario.** Arreglado en 0.9.0. Tres causas, todas en el parser: la instrucción de cierre se trataba como límite de corte, la gramática de secciones solo aceptaba una redacción exacta, y la nota de «el creador lo dejó vacío» se disparaba con una estructura que no se había reconocido. Detalle en el [changelog](CHANGELOG.md).
- [x] **Prioridad — Emochi: no se están recuperando las conversaciones de ejemplo.** Arreglado en 0.9.0. `characterExampleConversation` llega como array de turnos y la coerción a cadena lo convertía en `""`. Ahora se parsea como turnos.
- [x] **Soporte del Emochi Lab.** Las URLs de Story, Soundstage y LiveRoom se leen contra el mismo registro de prompt, tomando el último segmento de la ruta como id. La sesión sin iniciar nunca expuso la forma real de las URLs del Lab, así que una superficie con otro tipo de registro informa de la ruta fallida en lugar de devolver media tarjeta.
- [ ] **Añadir soporte para Saucepan AI.**
- [ ] **Añadir soporte para WyvernChat.com.**
- [ ] **Verificar los lectores de Character.ai y Crushon.ai contra una sesión iniciada.** Los dos hosts responden `403` de Cloudflare a la máquina donde se construyó esta versión, así que los contratos están verificados pero la lectura en vivo no. Si alguno de los dos lectores falla en tu caso, un issue con el mensaje del panel es exactamente lo que hace falta.
- [ ] **Añadir soporte para Chub.ai y Venus.chub.ai.**

Un lector que funciona a medias en un sitio soportado es peor que un sitio más que funciona del todo, y por eso los dos puntos de Emochi estuvieron por encima de añadir sitios nuevos hasta que se cerraron.

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

`src/scraper.js` lee JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz, `src/cai.js` Character.ai y `src/crushon.js` Crushon.ai. Los cinco llenan la misma forma de tarjeta, así que los exportadores y el panel nunca saben en qué sitio estás. `src/exporters.js` convierte, `src/panel.js` y `src/panel.css` son el panel en la página, `background.js` es el service worker para peticiones que un content script no puede hacer (CORS, cabeceras prohibidas).

Dos archivos existen solo para los sitios que nunca publican su registro en una API: `src/intercept.js` se ejecuta en el mundo de la propia página (`world: "MAIN"`, `document_start`) y copia al DOM lo que la página ya sabe; `src/harvest.js` recoge esas cargas y puntúa cada objeto contra una lista de nombres de campo conocidos. Añadir un tercer sitio cerrado significa un archivo que declare sus claves.

**El registro de API sitio por sitio está en el README en inglés** ([Developer reference](README.md#developer-reference-english-only)). Se mantiene en inglés a propósito: es material de referencia y la parte que más se queda obsoleta cuando un sitio cambia. Se traducirá cuando se estabilice.

---

## Licencia

[MIT](LICENSE).
