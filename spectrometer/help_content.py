# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

HELP_TOPICS = {
    "Introducción": {
        "content": """<h2>1. Introducción</h2>
        <p>Esta aplicación permite controlar un espectrofotómetro basado en el sensor AS726X y una cámara térmica MLX90640 en una Raspberry Pi con doble bus I2C.</p>
        <p><b>Conexiones de los sensores:</b></p>
        <ul>
            <li><b>MLX90640 (Cámara Térmica) – I2C-1:</b> SDA → GPIO2, SCL → GPIO3</li>
            <li><b>AS726X (Espectrofotómetro) – I2C-22:</b> SDA → GPIO23, SCL → GPIO24</li>
            <li><b>LED externo:</b> VIN → GPIO17</li>
        </ul>"""
    },
    "Suite Estadística Avanzada": {
        "content": """<h2>Suite Estadística Avanzada</h2>
        <p>La aplicación integra herramientas estadísticas de nivel analítico para procesamiento de señales espectroscópicas y térmicas:</p>
        <ul>
            <li><b>Estadística Descriptiva en Tiempo Real:</b> Cálculo instantáneo de medias, desviación estándar (σ), %CV (Coeficiente de Variación), asimetría (skewness) y curtosis. Esto permite evaluar la dispersión espectral sobre la marcha.</li>
            <li><b>Métricas de Desempeño Analítico:</b> Cálculo automático del Límite de Detección (LOD = 3σ/m) y Límite de Cuantificación (LOQ = 10σ/m), cruciales para validar la sensibilidad de las calibraciones.</li>
            <li><b>Regresión Lineal Avanzada:</b> Extrae R², R² ajustado, RMSE (Root Mean Square Error), y el Error Estándar de Estimación (SEE). Evalúa el ajuste real ponderando los grados de libertad.</li>
            <li><b>Intervalos de Confianza y Predicción (IC/IP 95%):</b> Herramienta gráfica que delimita la incertidumbre (bandas de error estocástico) alrededor de las curvas de calibración basándose en el estadístico t-Student.</li>
            <li><b>Control de Calidad (QC):</b> Sistema de semáforos que evalúa reglas configurables (ej. R² > 0.99, %CV < 5%) para asegurar resultados confiables antes de la cuantificación de muestras.</li>
            <li><b>Pruebas de Hipótesis:</b> Análisis distribucional (Shapiro-Wilk) para determinar normalidad de datos, y t-test paramétrico para evaluar significancia frente a valores de referencia (μ₀).</li>
        </ul>"""
    },
    "Conexión": {
        "content": """<h2>Módulo de Conexión: Tu Puerta de Entrada</h2>
        <p>¡Bienvenido al puente entre el hardware físico (tu Raspberry Pi) y esta interfaz web! Este módulo es el encargado de "despertar" a los sensores para que comiencen a enviarte datos.</p>
        <h3>¿Cómo funciona "por debajo"? (Marco Teórico)</h3>
        <p>Los sensores (Espectrofotómetro AS726X y Cámara Térmica MLX90640) hablan un idioma digital llamado <b>I²C (Inter-Integrated Circuit)</b>. Este protocolo es como un bus escolar que recoge a los estudiantes (datos) parando en distintas direcciones preasignadas.</p>
        <ul>
            <li><b>Dirección 0x49:</b> Aquí "vive" el Espectrofotómetro.</li>
            <li><b>Dirección 0x33:</b> Aquí "vive" la Cámara Térmica.</li>
        </ul>
        <p>Cuando presionas <b>Conectar I2C</b>, el cerebro del servidor (Django/Python) envía un pulso eléctrico preguntando "¿Hay alguien en la casa 0x49?". Si el sensor responde, la conexión es exitosa.</p>
        <h3>Guía de Uso Rápido (Para Principiantes)</h3>
        <ol>
            <li>Verifica que los cables de tu sensor estén bien conectados a la Raspberry Pi (SDA con SDA, SCL con SCL).</li>
            <li>Presiona <b>Conectar I2C</b>. Si el semáforo se pone verde, el hardware está listo.</li>
            <li>Si da error, puede que el pin I2C-22 no esté configurado. ¡No te preocupes! Siempre puedes usar la aplicación sin hardware experimentando en el <i>"Modo Simulado"</i> que creará datos aleatorios para que juegues y aprendas a usar la plataforma estadística.</li>
        </ol>"""
    },
    "Medición": {
        "content": """<h2>Panel de Medición: ¿Cómo leemos la luz?</h2>
        <p>Aquí es donde capturamos lo que el espectrofotómetro "ve". En química, el color y la intensidad de la luz que atraviesa un líquido nos cuenta exactamente cuánta sustancia hay disuelta. Pero para hacerlo matemáticamente perfecto, necesitamos ser metódicos.</p>
        <h3>El Concepto del "Blanco" ($I_0$)</h3>
        <p>¿Qué pasa si el vaso (cubeta) o el agua pura atrapan un poco de luz por sí solos? ¡Tus mediciones estarían sumando un error falso! Por eso siempre debes calcular un "Blanco".</p>
        <p><b>Ecuación Fundamental Diferencial:</b><br>
        La máquina leerá la cantidad total de fotones (Pura Intensidad Raw). Cuando tomas un Blanco, la máquina guarda esta lectura original como $I_0$. Todas las muestras futuras se calcularán comparadas con este $I_0$ maestro.</p>
        <h3>¿Qué Modo de Medición Elegir?</h3>
        <ul>
            <li><b>Continuo:</b> Dispara ráfagas de lectura sin parar. <i>¿Cuándo usarlo?</i> Cuando estás ajustando la lámpara, limpiando un vaso y quieres ver cómo se comporta en tiempo real.</li>
            <li><b>Único y Promediado (¡El Mejor!):</b> Toma muchísimas fotografías invisibles (ej. 10 lecturas seguidas) y saca una Media perfecta. Matemáticamente, según la Ley de los Grandes Números, el ruido o "temblor" de los electrones decrece en un factor de $\sqrt{M}$. Úsalo siempre para tus cálculos serios finales.</li>
            <li><b>Secuencial:</b> Úsalo si quieres ver cómo un líquido cambia de color solo con el paso del tiempo dejándolo quieto en la máquina.</li>
        </ul>"""
    },
    "Concentración": {
        "content": """<h2>Módulo de Concentración: Traduciendo LUZ a NÚMEROS</h2>
        <p>Este es el motor donde transformamos simples destellos de luz en cuántos miligramos, moles o cucharadas de sustancia química hay dentro del líquido misterioso.</p>
        <h3>La Gran Ecuación: La Ley de Lambert-Beer</h3>
        <p>Todo el espectrofotómetro se basa en una regla de oro maravillosamente lógica: <i>"Si un vaso tiene el doble de pintura, cruzará exactamente decaerá la mitad de luz logarítmicamente."</i></p>
        <p style="text-align:center; font-size:1.4em; font-family:serif; background:var(--bg-card); padding:10px; border-radius:8px;">A = ε · c · b</p>
        <ul>
            <li><b>$A$ (Absorbancia):</b> Lo que oscurece el líquido. Se calcula con el logaritmo <b>$-log_{10}(Transparencia)$</b>.</li>
            <li><b>$\epsilon$ (Absortividad):</b> Una huella dactilar de cada compuesto. Si es Azul de Metileno, atrapará mucha luz verde, pero dejará pasar la azul.</li>
            <li><b>$b$ (Paso Óptico):</b> El ancho de tu cubo de plástico (1 centímetro por norma internacional).</li>
            <li><b>$C$ (Concentración):</b> ¡Lo que queremos descubrir!</li>
        </ul>
        <h3>¿Para qué sirve este Panel Práctico?</h3>
        <p>Si no tienes una "Curva Previa", inserta Concentraciones Falsas o conocidas (ej 1, 2, 3) y dale <i>"Añadir Punto"</i> para ver cómo va dibujándose una recta creciente a medida que el líquido que insertas es más opaco.</p>"""
    },
    "Calibración": {
        "content": """<h2>Calibración: Enseñándole a la Máquina a Leer</h2>
        <p>Imagina que compraste una balanza que solo te da valores en "energía resortiana", pero tú quieres Kilos. ¡Necesitas enseñarle primero colocando pesas conocidas! Aquí hacemos exactamente lo mismo pero con botes de líquido con concentración química perfecta que compraste o preparaste previamente.</p>
        <h3>¿Cómo realizar una Calibración como un profesional?</h3>
        <ol>
            <li><b>Crea tus Patrones de Prueba:</b> Prepara 5 tubitos con concentraciones progresivas idóneas de lo que vas a investigar. Desde puro solvente (Blanco), a algo intermedio, hasta tu tope más espeso.</li>
            <li><b>Inyección a la Matriz Empírica:</b> Por cada tubo, ingresa en el cajón <i>"Concentración Estándar"</i> su valor real (ej. 10.0), mételo a la máquina y presiona <b>Añadir Punto</b>.</li>
            <li><b>Diagnóstico Visual de la Curva:</b> Verás en el visor cómo los puntos empiezan a alinear una regresión. ¡Escoge el Modelo correct! Si es a baja concentración, <b>Lineal (y = mx + b)</b> es tu mejor amigo, basado en OLS (Mínimos Cuadrados Ordinarios).</li>
            <li><b>Aprueba con el Inspector Artificial:</b> Si el marcador $R^2$ bordea un color Naranja/Rojo (menor a 0.99) ¡Tu recta es pésima! Alguien echó mal la gota. Si es Verde deslumbrante casi 1.000...</li>
            <li><b>CERTIFICACIÓN:</b> Presiona <b>Aplicar Curva a la App</b>. Ahora nuestra humilde máquina AS726X se ha graduado. Cualquier líquido misterioso que insertes en la pantalla "Curva Conc." te escupirá la cantidad exacta basándose en lo que le acabas de enseñar.</li>
        </ol>"""
    },
    "Cámara Térmica": {
        "content": """<h2>Cámara Térmica: Viendo el Calor Infrarrojo</h2>
        <p>A diferencia de la cámara de un celular que ve luz visible, la cámara MLX90640 ve "calor" puro (radiación infrarroja). Toma una "fotografía" de 768 cuadritos (píxeles), cada uno midiendo la temperatura de lo que tiene enfrente.</p>
        <h3>¿Por qué la necesitamos junto al Espectrofotómetro?</h3>
        <p>Una regla química muy estricta dice que si un líquido se calienta un solo grado Celsius, su color (absorbancia) cambia sutilmente porque sus moléculas vibran distinto. Monitorear que la muestra mantenga la temperatura te asegura que el cambio de absorbancia medido sea verdaderamente concentración y no un engaño por temperatura ambiente.</p>
        <h3>Herramientas Especiales</h3>
        <ul>
            <li><b>Paletas de Color (Color Maps):</b> 'Inferno' o 'Viridis' no cambian la temperatura, solo cambian la "pintura" visual para que el ojo humano pueda detectar un milímetro de diferencia y contrastar manchas calientes.</li>
            <li><b>Autoescala Dinámica:</b> Hace que el punto más frío siempre sea negro/azul y el más caliente sea blanco/amarillo, sea cual sea el número límite. Si la desactivas, los rangos se quedan quietos, ideal para ver cómo algo se enfría lentamente a través de los minutos.</li>
        </ul>"""
    },
    "Análisis": {
        "content": """<h2>Suite de Análisis: Para Después del Laboratorio</h2>
        <p>Mientras que el resto de las pestañas son para trabajar "en vivo" recolectando puntos en tiempo real, esta sección sirve para procesar todo el gran montón de datos cuando el equipo ya está apagado.</p>
        <h3>Lo que puedes lograr (Cargando archivos CSV)</h3>
        <ul>
            <li><b>Superposición Cinética:</b> Carga 10 archivos de lecturas a lo largo del tiempo. Verás cómo las líneas espectrales caen o suben armónicamente en el gráfico. ¡Ideal para ver cómo se decolora una sustancia, o como germina un patógeno turbio!.</li>
            <li><b>El Tribunal de Datos (Distribución y Normalidad):</b> La máquina pondrá tus datos bajo <i>Shapiro-Wilk</i> estadísticamente. Básicamente, si cargas 20 repeticiones de una medición, te dirá si caen en una forma de "campana perfecta" o si en realidad estabas introduciendo errores al azar por mal pulso.</li>
            <li><b>La Prueba t (t-Student de 1 Muestra):</b> Imagina que el manual del líquido dice que su Concentración debería medir 100 absoluto. Tú mides cinco réplicas y promedian 98 con desviación. Usando el t-Test aquí sabrás: "¿Fue puro accidente o de verdad mi líquido está echado a perder?". Te entrega una probabilidad (P-value) infalible.</li>
        </ul>"""
    },
    "Acerca de": {
        "content": """<h2>Acerca de la Plataforma</h2>
        <p><b>Software Espectroscópico Avanzado y Térmico — Versión Web Django</b></p>
        <p>Plataforma reconstruida para dotar a micro-fotómetros AS726X y arreglos focales IR un respaldo matricial empírico y estadístico del más potente e intransigente calibre analítico directamente accesible vía un navegador, en pos del análisis químico-físico robusto distribuido.</p>
        <p><br><b>Motor Analítico y Diseño Desarrollado por:</b><br><span style="color:var(--accent-primary); font-size:1.1em; font-weight:bold;">Sebastian Herrera Betancur</span></p>
        <p><b>Grupo Afiliado:</b> Grupo de Investigación en Biomicrosistemas</p>
        <p><b>Institución:</b> <i>Universidad de los Andes, Bogotá - Colombia.</i></p>
        <hr style="border-color:var(--border-color); opacity:0.3; margin:20px 0;">
        <p style="font-size:0.9em; color:var(--text-muted);"><b>Arquitectura:</b> Servidor Django WSGI estándar con API HTTP/JSON. El front-end (SPA) se comunica con el backend mediante peticiones <i>fetch()</i> asíncronas. Gráficos motorizados por <i>Chart.js + Zoom Plugin (Hammer)</i>. Estadística distribuida apoyada sobre librerías <i>NumPy / SciPy</i>. Diseñado como consola web mono-instrumento para un único operador de laboratorio.</p>"""
    },
    "numeric_display": {
        "content": """<h3>Últimos Valores Registrados</h3>
        <p>Matriz de retroalimentación inmediata cruzada espectral.</p>
        <p>Despliega el vector crudo de fotones contabilizados. Si la sustracción de blanco está activada, se aplica <b>I_net = I_sample - I<sub>0</sub></b> (donde I<sub>0</sub> es la referencia medida). La observación técnica de estos valores permite predecir cuándo el CCD fotónico subyacente del AS726X llega a su nivel de saturación óptica (16 bits completos). Si nota clipeo cercano a topes en raw, reduzca la intensidad del emisor LED o aplique diluciones iniciales.</p>"""
    },
    "beer_lambert": {
        "content": """<h3>Cálculo de Concentración (Ley Beer-Lambert)</h3>
        <p>Derivado puro del teorema macroscópico de absorción electromagnética:</p>
        <br>
        <p style="text-align:center; font-size:1.3em; font-family:serif;"><b>A = ε · b · C</b> &nbsp;&nbsp; ⇒ &nbsp;&nbsp; <b>C = A / (ε · b)</b></p>
        <br>
        <ul>
            <li><b>A (Absorbancia Adimensional):</b> Logaritmo de la fracción de decaimiento fotónico, calculada como <i>A = -log₁₀(I / I₀)</i>.</li>
            <li><b>ε (Coeficiente Absortividad Molar):</b> Sensibilidad del analito en <i>L · mol⁻¹ · cm⁻¹</i>.</li>
            <li><b>b (Paso Óptico):</b> Profundidad del rayo incidentando la estructura analítica, típicamente <i>1.0 cm</i> en cubetas.</li>
        </ul>
        <p>El uso empírico prioriza el cruce estadístico OLS donde la máquina sustituye explícitamente <b>(ε·b)</b> por la <b>Pendiente (m)</b> empujada por calibración.</p>"""
    },
    "ref_cal_config_group": {
        "content": """<h3>Calibración de Referencia Matemático</h3>
        <p>Procesamiento algorítmico secundario de "calibración indirecta" forzando la corrección Y-intercept a cero (Directo) o absorbiendo variables latentes.</p>
        <p style="text-align:center; font-family:serif; font-size:1.2em;"><b>A_ref = m·C + b</b> &nbsp;&nbsp;ó&nbsp;&nbsp; <b>A_ref = (Factor)·C</b></p>
        <p>El "Factor Directo" impone una restricción de intercepto nulo <i>(b = 0)</i>. Físicamente asume que en concentración cero existe 0 absorbancia, eliminando luz parásita espuria de la ecuación pero acarreando errores si el hardware tiene ceguera óptica de fábrica (corriente de oscuridad alta).</p>"""
    },
    "blank_subtraction": {
        "content": """<h3>Teorema Sustracción de Blanco Diferencial</h3>
        <p>Implementación matemática del filtro de rechazo de ruido colateral ambiental. Permite computar la Transmitancia verdadera en un vector espacio.</p>
        <p style="text-align:center; font-family:serif; font-size:1.1em;"><b>T(λ) = I_muestra(λ) / I_ref(λ)</b></p>
        <p><b>Nota de implementación:</b> En esta versión, la referencia (<i>I<sub>0</sub></i> o blanco) se usa directamente como divisor. No se implementa una sustracción independiente de corriente oscura (<i>I<sub>dark</sub></i>) ya que el sensor AS726X incluye compensación de offset interna. Si se requiere un pipeline completo con <i>I<sub>dark</sub></i> explícito, se recomienda tomar una lectura con la fuente LED apagada y registrarla manualmente.</p>
        <p>Ignorar el factor del blanco propaga no-linealidades graves a bajas concentraciones (efectos de dispersión Tyndall del propio solvente).</p>"""
    },
    "plot_type": {
        "content": """<h3>¿Cómo quieres ver el gráfico? (Tipos de Trama)</h3>
        <p>No siempre vemos las cosas igual. Aquí cambias el cristal con el que miras la luz:</p>
        <ul>
            <li><b>Cuenta RAW (Fotones Puros):</b> Literalmente cuántos "golpes" de luz recibe el sensor eléctrico. Mide Intensidad. Si tapas el sensor bajará a casi 0. Si lo pones al sol, subirá a 65,000 (se quema o satura). Úsalo solo para calibrar tu linterna.</li>
            <li><b>Transmitancia (%T):</b> ¿Qué tanto porcentaje de luz logró cruzar al otro lado del vaso? 100% es agua cristalina. 0% es un ladrillo negro.</li>
            <li><b>Absorbancia (A):</b> ¡El rey del laboratorio! Mide matemáticamente "cuánta luz se comió el líquido". Se calcula con un logaritmo <b>(-log T)</b>. La magia de la Absorbancia es que si metes el doble de quimico, la Absorbancia subirá exactamente el doble (Regla Lineal Perfecta).</li>
        </ul>"""
    },
    "plot_customization": {
        "content": """<h3>Manejo Tensorial del Gráfico</h3>
        <p>Permite <b>Acoplamiento Múltiple</b> al caché DOM para revisión cualitativa visual.</p>
        <p><b>Escalado Logarítmico eje Y:</b> La ecuación topográfica se transforma gráficamente en base Log10, comprimiendo picos masivos de decaimiento y develando resonancias menores indetectables visualmente en un trazado euleriano plano. Su uso es crítico al auditar la matriz termal y ruido a baja Intensidad Raw.</p>"""
    },
    "chart_tools": {
        "content": """<h3>Procesamiento Geométrico Gráfico (Herramientas Táctiles)</h3>
        <ul>
            <li><b>Horquillas de Varianza (±σ):</b> Computa dinámicamente: <br> <span style="font-family:serif;"><i>σ = √[ Σ(x_i - μ)² / (n - 1) ]</i></span> para trazar las bandas vectoriales indicativas de incertidumbre gausiana en lecturas múltiples estáticas.</li>
            <li><b>Anotador Automático (λmax):</b> Función argmax de subrutina local. Identifica y traza de forma continua en qué <i>λ</i> se asienta actualmente el punto superior diferencial. Fundamental para identificar Bathochromic (Red-shifts) cinéticos de analitos cambiantes.</li>
        </ul>"""
    },
    "spectrum_live_stats": {
        "content": """<h3>Estadística en Vivo (El Detector de Temblores)</h3>
        <p>Cuando observas el gráfico en modo Continuo, parece que "tiembla", ¿cierto? Es normal, los electrones saltan aleatoriamente por calor ambiente y estática. Aquí medimos si ese temblor es aceptable estudiando todos los registros al instante:</p>
        <ul>
            <li><b>Coeficiente de Variación (%CV):</b> <br><span style="font-family:serif; font-size:1.1em;"><i>%CV = ( σ / μ ) × 100</i></span><br> Te dice qué tan estable es la máquina. Si tu %CV es <b>&lt; 5%</b>, puedes brincar de alegría, ¡tus datos valen oro! Si supera <b>15%</b>, ¡detente! Tienes problemas: alguien movió la mesa, burbujas flotan en el vaso o el cable está chispeando suelto.</li>
            <li><b>SNR (Señal a Ruido):</b><br><span style="font-family:serif; font-size:1.1em;"><i>SNR = μ_señal / σ_ruido</i></span><br> A veces la muestra absorbe tanto que casi no llega luz. Si la poca luz que llega (Señal) es casi igual al "ruido" negro estático del mundo, esta métrica bajará muchísimo, avisándote que no confíes en el resultado actual.</li>
        </ul>"""
    },
    "thermal_stats": {
        "content": """<h3>Procesamiento Macro-Térmico Superficial</h3>
        <p>Sintetiza la información de radiación de cuerpo negro entrante al sensor focal MLX90640. Proyecta algorítmicamente la constante global derivando el punto máximo asilar térmico [T_max] contra su mínimo estructural [T_min], promediando el marco ambiental térmico absoluto (μ_temp). Ideal para confirmar isoterma general de las cubetas.</p>"""
    },
    "conc_controls": {
        "content": """<h3>Muestreo y Subrutinas OLS Matrices M-Nx</h3>
        <p>El puente entre control in-situ y matriz regresiva: Ingresando el axioma base experimental (X) en pantalla, se "Captura" a nivel de fotones el estricto valor de la respuesta Absorbancia real detectada en la cubeta (Y). Se construye con cada Click un par coordinado (x_i, y_i) para rellenar la matriz de mínimos cuadrados ordinales posteriores.</p>"""
    },
    "chart_tools_conc": {
        "content": """<h3>Explicación Geométrica Básica: Bandas y Bigotes</h3>
        <p>Hacer 1 medición es fácil. Hacer 5 sobre la misma gota puede que te dé valores minúsculamente diferentes por el ruido puro. Para esto sirven las herramientas avanzadas:</p>
        <ul>
            <li><b>Barras ±σ (Varianza o Desviación Pura):</b> Dibuja "bigotes" en cada puntito de medición. <br><span style="font-family:serif;"><i>σ = √[ Σ(x_i - μ)² / (n - 1) ]</i></span>. <br>Si el 'bigote' es muy alto (alto voltaje/inestabilidad) no insertes ese punto, repitelo. Ideal sí hiciste réplicas en Excel.</li>
            <li><b>Intervalo de Confianza 95% (IC Morado):</b> Dibuja una manga delgada al ras de la línea de la recta media general. Demuestra el "camino seguro matemático" por donde la teoría sugiere que debería navegar la matriz calibrada con 95% de seguridad inferencial.</li>
            <li><b>Intervalo de Predicción 95% (IP Naranja):</b> Esta super-manga ensanchada trata de cazar tu <i>próximo error natural</i>. Le dice a un extraño: "Mira, si mides una nueva muestra aquí, hay un 95% de seguridad de que el punto caerá dentro de esta banda gigantesca naranja".</li>
        </ul>"""
    },
    "regression_stats": {
        "content": """<h3>¿Qué significan las Leytras y Números de la Regresión?</h3>
        <p>Aquí la máquina hace el trabajo de un profesor de estadística evaluando la curva para darte tranquilidad. Lee la guía de abajo si estás confundido:</p>
        <ul>
            <li><b>R² y R² Ajustado:</b> El Coeficiente de Determinación. Un número que va del 0 al 1. Significa: <i>How tightly/closely did your actual points adhere to the drawn ideal magic line?</i> A <b>1.0</b> is absolutely perfect and superimposed. If it's 0.5 or less your data is a cloud of disaster and not useful for measuring anything.</li>
            <li><b>RMSE y SEE:</b> Errores Cuadráticos. Simplemente cuentan el "promedio del desvío bruto" que sufrieron los puntos alejándose hacia arriba y hacia abajo respecto al centro de línea de referencia y entregan un "Castigo" en la misma unidad que pusiste para Y.</li>
            <li><b>LOD y LOQ (Límites Detección):</b> ¿Si el líquido de medida es solo agua clara destilada dará cero matemático? ¡No! El diodo electrónico vibra enviando ruidito residual al PC. LOD calcula el ruido ciego de blanco mínimo que el equipo botará ($\sim 3\sigma$) evitando que midas fantasmas o trazas invisibles. LOQ es el umbral seguro desde donde puedes empezar a medir y publicar papers sin avergonzarte ($\sim 10\sigma$) y se calculan dividiendo la fluctuación oscura sobre tu fuerza calibrada real (LOD = 3.3×σ_{b} / pendiente).</li>
        </ul>"""
    },
    "conc_points": {
        "content": """<h3>Caché de Vectores Multivariables Puntos Curva</h3>
        <p>Reflejo estático de toda memoria matriz bidimensional temporal (X_i, Y_i). Se usa para auditar, depurar manualmente outliers destructivos o resetear el framework interno de regresión por envenenamiento general numérico.</p>"""
    },
    "cal_view": {
        "content": """<h3>Transiciones Topológicas (Mapas Abs vs Ref)</h3>
        <p>Pivote transversal matriz. Alterna entre la correlación natural absoluta <b>(A vs Concentración)</b> y el mapa cruzado o de acoplamiento empírico <b>(A_máquina vs A_referencia)</b> el cual permite portar librerías químicas universales extrayendo factores de corrección de ruido en equipos secundarios.</p>"""
    },
    "cal_add_points": {
        "content": """<h3>Inyección de Muestras Estándar / Spike</h3>
        <p>Acelerador de calibración empírica en tiempo real. Admite encolamiento secuencial manual de diluciones volumétricas progresivas al cubículo del AS726X para retro-alinear un eje coordenado X-Y exactísimo. Cada vez que inyectas diluyente y pulsas Agregar, registras la fotometría final.</p>"""
    },
    "chart_tools_cal": {
        "content": """<h3>Render Varianza y Geometría en Transfer</h3>
        <p>Proyecta, renderiza e iterpoliza visualmente los resultados crudos del back-end OLS-Student, generando los envelopes IC e IP en la fase de Calibración Transferencial para auditar fallas del setup instrumental entre el dispositivo de norma y su fotómetro local, de la misma forma que con las curvas manuales estándar.</p>"""
    },
    "cal_results": {
        "content": """<h3>Certificación Retrospectiva OLS</h3>
        <p>Motor de vinculación con la sesión activa. Genera el puente algorítmico <b><i>App Session Overwrite</i></b> inyectando la matemática extraída [ m, intercepto, corrección espectroscópica residual ] devuelta hacia los cálculos al-vuelo operados en los "Controles de Concentración y Medición".</p>"""
    },
    "analytical_validation": {
        "content": """<h3>Validación Analítica (El Examen Final de la Máquina)</h3>
        <p>¿Cómo sabes si tu calibración fue buena? ¡Haciendo que la máquina intente adivinar un vaso que tú ya conoces! Esto se llama <b>Factor Ponderado de Eficiencia (Recovery Rate)</b>.</p>
        <p><b>¿Cómo funciona?</b> Tomas la línea que acabas de crear y le metes la luz de tu propia muestra patrón hacia atrás, despejando la fórmula para ver cuánta Concentración predice la máquina. Luego, comparas la predicción contra la realidad.</p>
        <ul>
            <li><b>100%:</b> Perfección. El equipo lee exactamente lo que preparaste.</li>
            <li><b>Bajo 95%:</b> Algo salió mal. Quizás el líquido reaccionó, perdió color, o el tubo estaba sucio.</li>
            <li><b>Sobre 105%:</b> Cuidado. Hay "ruido blanco", un falso color extra (luz parásita, o algo turbio flotando) sumando mentiras a la absorbancia.</li>
        </ul>"""
    },
    "quality_control": {
        "content": """<h3>Asistente de Control de Calidad (Reglas de Westgard)</h3>
        <p>En los hospitales y laboratorios serios, un humano no decide si una prueba sirve o no; lo decide una máquina estricta usando Reglas. Aquí tienes tu propio asistente limitante (Go/No-Go):</p>
        <ul>
            <li><b>Bandera Roja (Fallido):</b> Si tu R² es menor a 0.99, o los puntos tienen una varianza matemática inaceptable, la regla condicional detiene todo. <b>¡No midas muestras reales con esta curva!</b> Destruye los datos y empieza de nuevo limpiando bien el vaso.</li>
            <li><b>Bandera Verde (Validado):</b> Implica que pasaste todos los filtros probabilísticos. Puedes usar tu curva ciegamente en el mundo real.</li>
        </ul>"""
    },
    "cal_points": {
        "content": """<h3>Base Persistente Puntos Calibración I/O</h3>
        <p>Visualizador en matriz de celdillas editables localmente. Permite salvaguardar el estado actual del objeto matricial OLS en memoria disco con archivos CSV, protegiendo trabajos arduos paramétricos de horas frente a un corte de energía instrumental o portar calibraciones previas avaladas de un mes anterior.</p>"""
    },
    "thermal_control": {
        "content": """<h3>Controles de la Cámara Infrarroja</h3>
        <p>Aquí decides cómo se enciende el "modo nocturno depredador" o visión térmica de tu laboratorio. Te aseguras de encender y detener el bus de cámara de manera segura.</p>
        <p><b>¿Para qué sirve el botón Iniciar Medición?</b> Al presionarlo, le dices a la cámara: <i>"Ignora la simple vista en vivo, comienza a grabarme metódicamente cada cambio centígrado que ocurra y empaquétamelo para enviarlo e imprimirlo en Excel luego."</i></p>
        <p><b>Auto Scale Automático:</b> El gráfico 2D se fuerza a redibujar sus colores estirándose como banda elástica siempre para abarcar el punto más ardiente y el más gélido del vaso. ¡Ojo! Desactívalo si planeas comparar "antes vs después" seriados, porque sino los tonos te engañarán.</p>"""
    },
    "thermal_advanced": {
        "content": """<h3>Termografía Estadística (Limpiando Pixeles Mentrosos)</h3>
        <p>A veces, 1 de los 768 píxeles de la cámara lee algo tonto (como el reflejo de un foco caliente o está defectuoso de fábrica). Para que no dañe tu lectura promedio, usamos matemáticas defensivas:</p>
        <ul>
            <li><b>La Mediana Rígida (μ_mid):</b> En vez de un promedio tonto que sume el píxel con error, agrupa los 768 valores de menor a mayor y escoge exactamente al del medio. Un píxel en 1000°C no afectará este valor.</li>
            <li><b>Percentil 10 y 90 (Cortando los bordes):</b> Ignora el 10% más bajo y el 10% más alto de los píxeles térmicos. Nos quedamos solo con la carnita térmica real (el 80% central del vaso) descartando ruidos externos milimétricos al borde.</li>
        </ul>"""
    },
    "thermal_measurement": {
        "content": """<h3>Adquisidor Cinético (Registrando el cambio de Temperatura)</h3>
        <p>Si quieres demostrar cómo un químico se enfría o se calienta por sí solo durante 5 minutos, pon este motor en marcha. Creará un historial grabando cómo la Media o los Percentiles se comportan en el tiempo y te permitirá descargar un bonito "Time-Lapse" o CSV en Excel. Matemáticamente extrae la matriz focal y calcula la varianza a lo largo de <b>($\Delta time$)</b>.</p>"""
    },
    "thermal_measurement": {
        "content": """<h3>Adquisidor Cinético (Registrando el cambio de Temperatura)</h3>
        <p>Si quieres demostrar cómo un químico se enfría o se calienta por sí solo durante 5 minutos, pon este motor en marcha. Creará un historial grabando cómo la Media o los Percentiles se comportan en el tiempo y te permitirá descargar un bonito "Time-Lapse" o CSV en Excel. Matemáticamente extrae la matriz focal y calcula la varianza a lo largo de <b>($\Delta time$)</b>.</p>"""
    },
    "analysis_files": {
        "content": """<h3>Input Agregador Multivariables Post-Mórtem</h3>
        <p>Estructura virtual que carga archivos binarios/CSV crudos pasados de "N" corridas o repeticiones de fotometría en paralelo al caché. Es la piedra filosofal para crear el andamio comparativo de "N archivos vs Lambda o Tiempo", requiriendo un "Identificador" manual para apilar data coherente.</p>"""
    },
    "analysis_params": {
        "content": """<h3>Motor de Variables Referenciales Nulas (μ₀ Test)</h3>
        <p>Selecciona por cuál ranura física λ se aplicarán todos los diagnósticos paramétricos transversales intermensuales de los N archivos apilados. Introduce formalmente la <b>Hipótesis Nula (μ₀)</b> teórica para ponerla a prueba rigurosamente contra todo tu pack de repeticiones experimentales reales guardadas (Ejemplo μ₀ = 1.00 Absorbancia exacta teórica impuesta a validar empiracamente).</p>"""
    },
    "analysis_stats": {
        "content": """<h3>Cálculo Inferencial y de Varianza Paramétrica Avanzado (SciPy Engine)</h3>
        <p>Operador maestro matricial para control estadístico formal (QC superior):</p>
        <ul>
            <li><b>Evaluador D-Shapiro Wilk (<i>W</i> statistic):</b> <br>Testea inferencia de distribución poblacional normal. Calcula la correlación del conjunto de residuos estandarizados respecto al Cuantil Norma-Ciego esperado. Si el valor W cae (P-Value &lt; 0.05), repudia la normalidad base, haciendo los test de ±σ y Confianza ciegos un espejismo no-fidedigno.</li>
            <li><b>t-Test Univariado de Estudiante (<i>t</i> value):</b><br><span style="font-family:serif; font-size:1.1em;"><i>t = ( x̄ - μ₀ ) / ( s / √n )</i></span><br> Pone a prueba científicamente hasta qué punto la desviación promedio es matemáticamente imperdonable o simplemente efecto nocivo de muestra ruidosa muy pequeña. Proee un veredicto definitivo (P-value inferido) listísimo de empastar en reporte académico.</li>
            <li><b>Métricas de Desgaste de Asimetría (Skew/Kurt):</b> Calculan sesgo direccional lateral (colas cortas o largas) exponiendo errores humanos constantes si sesgan para un solo eje permanentemente los residuos instrumentales en cubetas rotas o rayadas.</li>
        </ul>"""
    }
}