import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "../../constants/storageKeys";

type Language = "en" | "es";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {},
  es: {
    "Job Safety Analysis": "Análisis de Seguridad de Trabajo",
    "Digital JSA": "JSA Digital",
    "Job Details": "Detalles del Trabajo",
    "Fill out the basic info for this load.": "Complete la información básica para esta carga.",
    "Fill out the basic info for this job.": "Complete la información básica para este trabajo.",
    "Driver Name": "Nombre del Conductor",
    "Truck #": "Camión #",
    "Job/Activity Name": "Trabajo/Actividad",
    Pusher: "Capataz",
    "Well Name": "Nombre del Pozo",
    "Add Well": "Agregar Pozo",
    "Added Wells": "Pozos Agregados",
    "Saved wells (tap to use):": "Pozos guardados (toca para usar):",
    "Saved locations (tap to use):": "Ubicaciones guardadas (toca para usar):",
    "Other Information": "Otra Información",
    Date: "Fecha",
    Location: "Ubicación",
    Locations: "Ubicaciones",
    Wells: "Pozos",
    "Save Favorite": "Guardar Favorito",
    "View Favorite Locations": "Ver Ubicaciones Favoritas",
    "Current JSA Locations": "Ubicaciones actuales del JSA",
    "Added Locations": "Ubicaciones agregadas",
    "Long press to remove": "Mantenga presionado para eliminar",
    "Next: Steps & Hazards": "Siguiente: Pasos y Peligros",
    "Resume active JSA": "Reanudar JSA activo",
    "Resume the JSA you started earlier today.": "Reanude el JSA que comenzó hoy.",
    "Start New JSA": "Iniciar nuevo JSA",
    "Start New": "Iniciar nuevo",
    "Fill in driver, truck #, and add at least one location to continue.":
      "Complete conductor, camión # y agregue al menos una ubicación para continuar.",
    "Steps & Hazards": "Pasos y Peligros",
    "PPE Checklist": "Lista de EPP",
    "Sign Off": "Cierre",
    "Add another location": "Agregar otra ubicación",
    "Only use if a new stop was added after starting this JSA.":
      "Use solo si se agregó una nueva parada después de iniciar este JSA.",
    "Locations reviewed:": "Ubicaciones revisadas:",
    "Review Next Location": "Revisar siguiente ubicación",
    "I am prepared for work": "Estoy preparado para el trabajo",
    "Signature (type your full name)": "Firma (escriba su nombre completo)",
    "Signature is required before submitting.": "Se requiere firma antes de enviar.",
    "All locations must be acknowledged before submitting.": "Todas las ubicaciones deben ser reconocidas antes de enviar.",
    "Additional Notes": "Notas Adicionales",
    "Submit JSA": "Enviar JSA",
    "Back to Job Details": "Volver a Detalles del Trabajo",
    "Safety Glasses": "Gafas de seguridad",
    "Safety Shoes": "Zapatos de seguridad",
    "FR Clothing": "Ropa FR",
    "Hearing Protection": "Protección auditiva",
    "Hard Hat": "Casco",
    "Respirator": "Respirador",
    "Chemical/Impact Gloves": "Guantes químicos/de impacto",
    "Four Gas Monitor": "Detector de cuatro gases",
    "Fall Protection": "Protección contra caídas",
    Other: "Otro",
    "Job Safety Analysis Report": "Informe de Análisis de Seguridad de Trabajo",
    "Generate PDF JSA report for this job.": "Generar reporte PDF de JSA para este trabajo.",
    Driver: "Conductor",
    "Truck #:": "Camión #:",
    Well: "Pozo",
    "Locations reviewed": "Ubicaciones revisadas",
    "Pusher:": "Capataz:",
    "Well:": "Pozo:",
    "Notes & Signature": "Notas y Firma",
    "JSA Completed": "JSA Completado",
    "Saved JSAs": "JSAs guardados",
    "Select a JSA to continue": "Seleccione un JSA para continuar",
    "No JSAs saved for today for this driver/truck.": "No hay JSAs guardados hoy para este conductor/camión.",
    "Add location": "Agregar ubicación",
    Settings: "Configuración",
    "Choose language": "Elija el idioma",
    Cancel: "Cancelar",
    "Saved": "Guardado",
    "Filter Saved JSAs": "Filtrar JSAs guardados",
    "Driver name": "Nombre del conductor",
    "Date (e.g., 2024-12-01)": "Fecha (ej., 2024-12-01)",
    "No saved JSAs yet.": "Aún no hay JSAs guardados.",
    "View favorite locations": "Ver ubicaciones favoritas",
    "Open saved JSAs": "Abrir JSAs guardados",
    "Today's JSAs": "JSAs de hoy",
    "No JSAs saved for today.": "No hay JSAs guardados hoy.",
    "PPE Required": "EPP Requerido",
    "Additional stop": "Parada adicional",
    "Prepared for Work": "Preparado para el trabajo",
    "Locations are managed on Job Details and Steps.": "Las ubicaciones se gestionan en Detalles del Trabajo y Pasos.",
    "No locations recorded.": "No se registraron ubicaciones.",
    "No PPE recorded.": "No se registró EPP.",
    "No checklist responses recorded.": "No se registraron respuestas de la lista.",
    "No additional notes provided.": "No se proporcionaron notas adicionales.",
    "Step": "Paso",
    "of": "de",
    "Hazard:": "Peligro:",
    "Controls:": "Controles:",
    "Previous": "Anterior",
    "Next": "Siguiente",
    "Other (specify)": "Otro (especificar)",
    "History": "Historial",
    "(acknowledged)": "(reconocido)",
    "(unreviewed)": "(sin revisar)",
    "Emergency Contacts": "Contactos de emergencia",
    "Full name": "Nombre completo",
    "Please review the JSA before starting this location": "Por favor revise el JSA antes de comenzar en esta ubicación",
    "Acknowledge & Continue": "Reconocer y continuar",
    "Add Location": "Agregar ubicación",
    "Enter location": "Ingresar ubicación",
    "Add": "Agregar",
    "Hazard": "Peligro",
    "Controls": "Controles",
    "Enter any notes": "Ingrese notas",
    "Add more stops as you go.": "Agregue más paradas a medida que avanza.",
    "Save location": "Guardar ubicación",
    "Company Contacts": "Contactos de la empresa",
    "Job/Activity": "Trabajo/Actividad",
    "View Favorite Wells": "Ver Pozos Favoritos",
    "Signature Required": "Firma requerida",
    "Locations Not Acknowledged": "Ubicaciones no reconocidas",
    "OK": "OK",
    "You have an incomplete JSA from today": "Tiene un JSA incompleto de hoy",
    "Pick Up Where I Left Off": "Continuar donde lo dejé",
    "Discard & Start New": "Descartar e iniciar nuevo",
    "Done": "Listo",
    "Defaults to today. Edit if needed.": "Predeterminado a hoy. Edite si es necesario.",
    "Fill in driver and truck # to continue.": "Complete conductor y camión # para continuar.",
    "Save & Add": "Guardar y agregar",
    "Remove": "Eliminar",
    "Remove Favorite": "Eliminar favorito",
    "Type & press Done to add": "Escriba y presione Listo para agregar",

    // JSA Step Titles
    "Driving on location": "Conduciendo en la ubicación",
    "Backing": "Retrocediendo",
    "Connecting hoses": "Conectando mangueras",
    "Loading fluids": "Cargando fluidos",
    "Checking levels on frac/production tanks": "Verificando niveles en tanques de fracturación/producción",
    "Offloading fluids": "Descargando fluidos",
    "Disconnecting hoses": "Desconectando mangueras",
    "Spill clean-up": "Limpieza de derrames",
    "Verify task is complete, job clean-up": "Verificar que la tarea esté completa, limpieza del trabajo",

    // JSA Hazards
    "Moving equipment, stationary equipment, personnel, flare, pressurized iron, wellheads, poor lighting/visibility, uneven ground, wet/soft ground, fire/explosion, triggering hazard.":
      "Equipo en movimiento, equipo estacionario, personal, antorcha, hierro presurizado, cabezales de pozo, poca iluminación/visibilidad, terreno irregular, terreno mojado/blando, fuego/explosión, peligro de activación.",
    "Poor lighting/visibility, damage to equipment, personal injury.":
      "Poca iluminación/visibilidad, daño al equipo, lesiones personales.",
    "Pressurized hoses, pinched fingers, poor connection, missing gaskets causing leaks, uneven/soft ground when moving hoses causing slips or falls, personal injury, static charge.":
      "Mangueras presurizadas, dedos pellizcados, mala conexión, juntas faltantes que causan fugas, terreno irregular/blando al mover mangueras causando resbalones o caídas, lesiones personales, carga estática.",
    "Overloading transport causes spills, personal exposure to fluids, and pinched fingers and hands while operating valves.":
      "Sobrecargar el transporte causa derrames, exposición personal a fluidos, y dedos y manos pellizcados al operar válvulas.",
    "Personal injury, slips, and trips when ascending and descending ladder, gases/fumes rising from the tank.":
      "Lesiones personales, resbalones y tropiezos al subir y bajar escaleras, gases/humos que salen del tanque.",
    "Overloading tanks can cause spills, personal exposure to fluids, overpressure of the vacuum tank, and pinched fingers while operating valves.":
      "Sobrecargar tanques puede causar derrames, exposición personal a fluidos, sobrepresión del tanque de vacío, y dedos pellizcados al operar válvulas.",
    "Pressurized hoses, spills, pinched fingers/hands, static charge.":
      "Mangueras presurizadas, derrames, dedos/manos pellizcados, carga estática.",
    "Working around overhead loads can cause injury, as can energized equipment, high-pressure iron causing damage to equipment and personal injury, and unknown fluids.":
      "Trabajar cerca de cargas elevadas puede causar lesiones, al igual que el equipo energizado, hierro de alta presión que causa daño al equipo y lesiones personales, y fluidos desconocidos.",
    "Slips, trips, falls while putting up equipment, leaving equipment or misplacing it while cleaning up, failing to ensure all job tasks are complete, causing poor work, and personal injury.":
      "Resbalones, tropiezos, caídas al guardar equipo, dejar equipo o extraviarlo durante la limpieza, no asegurar que todas las tareas estén completas, causando trabajo deficiente y lesiones personales.",

    // JSA Controls
    "Maintain 5 MPH on location at all times, scan the area while moving forward, maintain a safe distance from potential hazards, identify wind direction, muster points, and emergency evacuation routes, and maintain eye contact with moving personnel.":
      "Mantener 5 MPH en la ubicación en todo momento, escanear el área mientras avanza, mantener una distancia segura de peligros potenciales, identificar la dirección del viento, puntos de reunión y rutas de evacuación de emergencia, y mantener contacto visual con el personal en movimiento.",
    "Use forward movement if possible, use spotters when available, maintain constant radio contact with spotters at all times, walk the area before backing to identify potential hazards, and mark with orange cones.":
      "Usar movimiento hacia adelante si es posible, usar observadores cuando estén disponibles, mantener contacto de radio constante con los observadores en todo momento, caminar el área antes de retroceder para identificar peligros potenciales, y marcar con conos naranjas.",
    "Check for trapped pressure and point hoses in a safe direction before connecting hoses; wear appropriate gloves when connecting hoses; inspect hose, fittings, and gaskets before connection; scan the area while walking on surfaces; connect grounding to prevent static discharge.":
      "Verificar presión atrapada y apuntar mangueras en una dirección segura antes de conectar; usar guantes apropiados al conectar mangueras; inspeccionar manguera, accesorios y juntas antes de conectar; escanear el área mientras camina sobre superficies; conectar tierra para prevenir descarga estática.",
    "Maintain valve control and visual levels at all times, continuously scan hoses, valves, and manifolds for leaks, wear gloves and PPE prior to loading, and use headlights and transport lighting as needed.":
      "Mantener control de válvulas y niveles visuales en todo momento, escanear continuamente mangueras, válvulas y múltiples en busca de fugas, usar guantes y EPP antes de cargar, y usar faros y luces de transporte según sea necesario.",
    "Maintain three points of contact when ascending and descending ladders, wear four gas monitors at all times to identify gases/fumes, and use appropriate measurement tools to ensure accurate levels.":
      "Mantener tres puntos de contacto al subir y bajar escaleras, usar detectores de cuatro gases en todo momento para identificar gases/humos, y usar herramientas de medición apropiadas para asegurar niveles precisos.",
    "Maintain valve control and visual levels at all times, continuously scan hoses, valves, and manifolds for leaks, wear gloves and PPE before loading, use headlights and transport lighting as needed.":
      "Mantener control de válvulas y niveles visuales en todo momento, escanear continuamente mangueras, válvulas y múltiples en busca de fugas, usar guantes y EPP antes de cargar, usar faros y luces de transporte según sea necesario.",
    "Verify valves are closed and hoses are depressurized before disconnecting, watch hand placement, and place buckets under connections to mitigate spills.":
      "Verificar que las válvulas estén cerradas y las mangueras despresurizada antes de desconectar, cuidar la colocación de las manos, y colocar cubetas debajo de las conexiones para mitigar derrames.",
    "Understand overhead load fall radius, use caution while working around equipment, find and gauge high-pressure lines and mark and not run over them, question fluids being cleaned up, and maintain communication with employer in charge of equipment.":
      "Entender el radio de caída de cargas elevadas, usar precaución al trabajar cerca del equipo, encontrar y medir líneas de alta presión y marcarlas y no pasarlas por encima, cuestionar los fluidos que se limpian, y mantener comunicación con el empleador a cargo del equipo.",
    "Utilize appropriate lighting, scan area for hoses and uneven ground, watch footing, walk around equipment to ensure everything is stored for transport, and speak with the pusher or facilities operator to ensure all tasks are complete.":
      "Utilizar iluminación apropiada, escanear el área en busca de mangueras y terreno irregular, cuidar el paso, caminar alrededor del equipo para asegurar que todo esté guardado para el transporte, y hablar con el capataz u operador de instalaciones para asegurar que todas las tareas estén completas.",

    // Prepared for Work checklist items
    "I am properly trained for the job": "Estoy debidamente capacitado para el trabajo",
    "I have the tools & PPE needed for work": "Tengo las herramientas y EPP necesarios para el trabajo",
    "SDS": "HDS",

    // Additional translations
    "All Tasks": "Todas las tareas",
    "Loading": "Cargando",
    "Unloading": "Descargando",
    "Delete": "Eliminar",
    "Edit": "Editar",
    "Share": "Compartir",
    "Task": "Tarea",
    "Edit JSA": "Editar JSA",
    "JSA Details": "Detalles del JSA",
    "Truck number": "Número de camión",
    "Job or activity": "Trabajo o actividad",
    "Pusher name": "Nombre del capataz",
    "Well name": "Nombre del pozo",
    "Other information": "Otra información",
    "Other Info": "Otra Información",
    "JSA has been updated.": "El JSA ha sido actualizado.",
    "Error": "Error",
    "Failed to save changes.": "Error al guardar los cambios.",
    "Save Changes": "Guardar Cambios",
    "PPE Selected": "EPP Seleccionado",
    "Notes": "Notas",
    "Signature": "Firma",
    "Ack": "Rec",
    "Enter notes": "Ingresar notas",
    "Enter driver name": "Ingrese nombre del conductor",
    "e.g. 105": "ej. 105",
    "Lease / site name": "Nombre del sitio / arrendamiento",
    "Notes or other info": "Notas u otra información",
    "Completed": "Completado",
    "Add Another Location": "Agregar otra ubicación",
    "Back": "Atrás",
    "PDF Preview": "Vista previa PDF",
    "Generating...": "Generando...",
    "Generate & Share PDF": "Generar y compartir PDF",
    "Back to Start": "Volver al inicio",
    "Home": "Inicio",
  },
};

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.language);
        if (stored === "es" || stored === "en") {
          setLangState(stored);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const setLang = (next: Language) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEYS.language, next).catch(() => {});
  };

  const toggleLang = () => {
    setLang(lang === "en" ? "es" : "en");
  };

  const t = (text: string) => {
    const translated = translations[lang][text];
    return translated || text;
  };

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang,
      t,
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
};
