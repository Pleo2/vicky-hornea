require('dotenv').config();
const { google } = require('googleapis');
const axios = require('axios');
const prismic = require('@prismicio/client');

// --- Configuración ---
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const PRISMIC_API_ENDPOINT = process.env.PRISMIC_API_ENDPOINT;
const PRISMIC_API_TOKEN = process.env.PRISMIC_API_TOKEN;
const YOUTUBE_UPLOADS_PLAYLIST_ID = process.env.YOUTUBE_UPLOADS_PLAYLIST_ID;
const PRISMIC_REPO_NAME = process.env.PRISMIC_REPO_NAME;
const PRISMIC_CUSTOM_TYPE = 'videoarticle'; // El nombre API de tu Custom Type

// --- Clientes API ---
const youtube = google.youtube({
  version: 'v3',
  auth: YOUTUBE_API_KEY,
});

const prismicClient = prismic.createClient(PRISMIC_API_ENDPOINT, {
  accessToken: PRISMIC_API_TOKEN, // Token para lectura (si necesitas verificar existencia)
});

// Endpoint de la API de Escritura de Prismic
const prismicWriteApiUrl = `https://migration.prismic.io/documents`; // Usa la API de Migración/Escritura


// --- Funciones Auxiliares ---

/**
 * Intenta extraer ingredientes y pasos de la descripción.
 * ¡Esta función es MUY BÁSICA y necesitará mejoras!
 * Deberías analizar las descripciones de Vicky para encontrar patrones.
 */
function parseDescription(description) {
  const ingredientsRegex = /(INGREDIENTES:?\s*)([\s\S]*?)(PREPARACIÓN:|PASOS:|ELABORACIÓN:?|$)/i;
  const instructionsRegex = /(PREPARACIÓN:|PASOS:|ELABORACIÓN:?\s*)([\s\S]*)/i;

  const ingredientsMatch = description.match(ingredientsRegex);
  const instructionsMatch = description.match(instructionsRegex);

  // Limpia y formatea como Rich Text básico (párrafos y listas)
  const formatToRichText = (text) => {
      if (!text) return [];
      return text.trim().split('\n').map(line => {
          line = line.trim();
          if (!line) return null;
          // Detecta listas (viñetas o números)
          if (line.match(/^[-*•]\s/) || line.match(/^\d+\.\s/)) {
              // Simplificado: lo trata como párrafo, Prismic lo puede interpretar
              // Una mejora sería crear bloques de lista reales
              return { type: 'paragraph', text: line, spans: [] };
          }
          return { type: 'paragraph', text: line, spans: [] };
      }).filter(Boolean);
  }

  return {
    ingredients: formatToRichText(ingredientsMatch ? ingredientsMatch[2] : ''),
    instructions: formatToRichText(instructionsMatch ? instructionsMatch[2] : ''),
    // Podrías devolver una descripción corta también
    short_description: formatToRichText(description.substring(0, 200) + '...') // Ejemplo básico
  };
}

// VERSIÓN CORRECTA Y DEFINITIVA (basada en las pruebas)
async function checkIfVideoExistsInPrismic(youtubeVideoId) {
    try {
      const existingDoc = await prismicClient.getFirst({
        filters: [
          prismic.filter.at(`my.videoarticle.youtube_video_id`, youtubeVideoId)
        ],
      });
      return !!existingDoc;
    } catch (error) {
       // Si AÚN falla con ParsingError aquí, contactar a soporte.
      if (error.message && error.message.includes("unexpected field 'my.videoarticle.youtube_video_id'")) {
          console.error(`FATAL: La API de Prismic sigue rechazando el path 'my.videoarticle.youtube_video_id' a pesar de ser correcto. Contactar a soporte Prismic.`);
      } else {
           console.error(`Error checking Prismic for video ID ${youtubeVideoId}:`, error);
      }
      return true; // Asume que existe si hay error al verificar
    }
  }
/**
 * Crea un documento en Prismic usando la API de Migración/Escritura.
 */
async function createPrismicDocument(videoData) {
  // 1. Construye el payload del documento según tu Custom Type 'Receta'
  const prismicDocumentPayload = {
    // OBLIGATORIO: Define el tipo y el idioma
    type: PRISMIC_CUSTOM_TYPE,
    lang: 'es-es', // Ajusta si usas otro idioma por defecto

    // OBLIGATORIO: Datos principales según tu Custom Type
    data: {
      title: videoData.title, // Asume title es Key Text o Title field
      publication_date: videoData.publishedAt.split('T')[0], // Formato YYYY-MM-DD
      // Para la imagen, necesitas subirla a Prismic primero o usar la URL directamente
      // La API de Migración permite referenciar una URL externa para que Prismic la importe
      featured_image: {
        origin: { type: 'url', url: videoData.thumbnailUrl },
        url: videoData.thumbnailUrl, // Prismic la descargará
        alt: videoData.title, // Texto alternativo
        // width, height si los tienes
      },
      video_embed: {
        // Necesitas construir el objeto Embed según la API de Prismic
        // Generalmente basta con la URL, pero la estructura exacta puede variar
        // Consulta la documentación de la API REST de Prismic o un doc existente
         embed_url: `https://www.youtube.com/watch?v=${videoData.videoId}`,
         // Probablemente necesites más campos como type, html, provider_name...
         // Inspecciona un campo Embed guardado manualmente via la API REST normal
         // EJEMPLO SIMPLIFICADO (puede necesitar ajustes):
         type: 'video',
         provider_name: 'YouTube',
         // html: `<iframe width="480" height="270" src="https://www.youtube.com/embed/${videoData.videoId}?feature=oembed" ...></iframe>` // O Prismic lo genera
      },
      short_description: videoData.parsedDescription.short_description,
      ingredients: videoData.parsedDescription.ingredients,
      instructions: videoData.parsedDescription.instructions,
      youtube_video_id: videoData.videoId, // Guarda el ID para referencia futura
      // Añade valores por defecto o deja vacíos los otros campos si no los puedes extraer
       prep_time: '', // Dejar vacío o poner un valor por defecto
       cook_time: '',
       servings: '',
       difficulty: 'Fácil', // Valor por defecto
       // category: { id: 'ID_DE_PRISMIC_DE_UNA_CATEGORIA', type: 'category' } // Si tienes una categoría por defecto
    },
    // Opcional: Define el UID si quieres controlarlo
    // uid: `video-${videoData.videoId}` // Asegúrate que sea único
  };

  // 2. Envía la petición a la API de Migración/Escritura
  try {
    const response = await axios.post(
      prismicWriteApiUrl,
      [prismicDocumentPayload], // La API de Migración espera un array de documentos
      {
        headers: {
          'Authorization': `Bearer ${PRISMIC_API_TOKEN}`,
          'x-prismic-repository': PRISMIC_REPO_NAME,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 202) { // 202 Accepted es la respuesta esperada
      console.log(`Documento para video "${videoData.title}" (ID: ${videoData.videoId}) enviado para creación.`);
      // La API de migración es asíncrona, puedes verificar el estado si es necesario
    } else {
      console.error(`Error creando documento para video ${videoData.videoId}. Status: ${response.status}`, response.data);
    }
  } catch (error) {
    console.error(`Error en request a Prismic Write API para video ${videoData.videoId}:`, error.response?.data || error.message);
  }
}


// --- Dentro de la función main() ---
async function main() {
    console.log('Iniciando importación de videos de YouTube a Prismic...');

    try {
      // 1. Obtener IDs de videos de la playlist de Uploads
      let videoIds = [];
      let nextPageToken = null;
      const MAX_VIDEOS_TO_CHECK = 50; // Limita cuántos videos revisar para obtener IDs

      console.log('Fase 1: Obteniendo IDs de video de la playlist...');
      do {
        const playlistItemsResponse = await youtube.playlistItems.list({
          part: 'contentDetails', // Solo necesitamos el videoId aquí
          playlistId: YOUTUBE_UPLOADS_PLAYLIST_ID,
          maxResults: 50, // Máximo por página permitido por la API
          pageToken: nextPageToken,
        });

        videoIds = videoIds.concat(
          playlistItemsResponse.data.items.map(item => item.contentDetails.videoId)
        );
        nextPageToken = playlistItemsResponse.data.nextPageToken;

        console.log(`  Obtenidos ${playlistItemsResponse.data.items.length} IDs. Total acumulado: ${videoIds.length}`);

      } while (nextPageToken && videoIds.length < MAX_VIDEOS_TO_CHECK);

      videoIds = videoIds.slice(0, MAX_VIDEOS_TO_CHECK); // Asegura el límite

      if (videoIds.length === 0) {
        console.log('No se encontraron videos en la playlist.');
        return;
      }
      console.log(`Fase 1 completada. Obtenidos ${videoIds.length} IDs de video.`);

      // 2. Obtener detalles de los videos (incluyendo duración) en lotes
      console.log('Fase 2: Obteniendo detalles y duración de los videos...');
      let allVideoDetails = [];
      // La API de videos.list acepta hasta 50 IDs a la vez
      for (let i = 0; i < videoIds.length; i += 50) {
        const batchIds = videoIds.slice(i, i + 50);
        const videosResponse = await youtube.videos.list({
          part: 'snippet,contentDetails', // Pedimos snippet y duración
          id: batchIds.join(','), // IDs separados por coma
        });
        allVideoDetails = allVideoDetails.concat(videosResponse.data.items);
        console.log(`  Obtenidos detalles para ${videosResponse.data.items.length} videos.`);
      }
      console.log(`Fase 2 completada. Total detalles obtenidos: ${allVideoDetails.length}`);


      // 3. Filtrar Shorts (duración <= 60 segundos)
      console.log('Fase 3: Filtrando YouTube Shorts...');
      const nonShortVideos = allVideoDetails.filter(video => {
          const durationISO = video.contentDetails.duration; // Formato ISO 8601 (e.g., PT1M35S, PT59S)
          // Función simple para convertir ISO 8601 duration a segundos
          const parseISODuration = (isoDuration) => {
              const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
              const matches = isoDuration.match(regex);
              if (!matches) return 0;
              const hours = parseInt(matches[1] || 0);
              const minutes = parseInt(matches[2] || 0);
              const seconds = parseInt(matches[3] || 0);
              return hours * 3600 + minutes * 60 + seconds;
          };
          const durationInSeconds = parseISODuration(durationISO);
          // Excluir videos de 60 segundos o menos
          return durationInSeconds > 60;
      });
      console.log(`Fase 3 completada. Videos no-Shorts encontrados: ${nonShortVideos.length}`);

      // 4. Procesar solo los videos que NO son Shorts
      console.log('Fase 4: Procesando videos válidos para Prismic...');
      let processedCount = 0;
      const MAX_TO_IMPORT_PER_RUN = 10; // Limita cuántos importar realmente en esta ejecución

      for (const video of nonShortVideos) {
         if (processedCount >= MAX_TO_IMPORT_PER_RUN) {
              console.log(`  Límite de importación por ejecución (${MAX_TO_IMPORT_PER_RUN}) alcanzado.`);
              break;
          }

        const videoId = video.id; // ID ya lo tenemos
        const videoTitle = video.snippet.title;
        const videoDescription = video.snippet.description;
        const videoPublishedAt = video.snippet.publishedAt;
        const videoThumbnailUrl = video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url;

        console.log(`\nProcesando video válido: ${videoTitle} (ID: ${videoId})`);

        // 5. Verificar si ya existe en Prismic (USANDO LA FUNCIÓN CORREGIDA)
        const exists = await checkIfVideoExistsInPrismic(videoId);

        if (exists) {
          console.log(`  El video ${videoId} ya existe en Prismic. Saltando.`);
          continue;
        } else {
            console.log(`  El video ${videoId} NO existe en Prismic. Preparando para creación...`);
        }

        // 6. Parsear descripción (Mejorar esto si es necesario)
        const parsed = parseDescription(videoDescription);

        // 7. Preparar datos para Prismic
        const videoDataForPrismic = {
          videoId: videoId,
          title: videoTitle,
          publishedAt: videoPublishedAt,
          thumbnailUrl: videoThumbnailUrl,
          parsedDescription: parsed,
        };

        // 8. Crear el documento en Prismic
        await createPrismicDocument(videoDataForPrismic);
        processedCount++;

        // Espera para no saturar APIs
        await new Promise(resolve => setTimeout(resolve, 1500)); // Aumentar espera a 1.5 seg
      }

      console.log('\nProceso de importación completado.');

    } catch (error) {
      console.error('Error durante el proceso de importación:', error.response?.data?.error || error.message);
       if (error.response?.data) { // Loguear más detalles si es un error de API
           console.error("Detalles del error de API:", JSON.stringify(error.response.data, null, 2));
       }
       if (error.stack) { // Loguear el stack trace
           console.error("Stack trace:", error.stack);
       }
    }
  }

  // Asegúrate que la función parseISODuration esté definida o ponla dentro de main si prefieres
  function parseISODuration(isoDuration) {
      const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
      const matches = isoDuration.match(regex);
      if (!matches) return 0;
      const hours = parseInt(matches[1] || 0);
      const minutes = parseInt(matches[2] || 0);
      const seconds = parseInt(matches[3] || 0);
      return hours * 3600 + minutes * 60 + seconds;
  }

  // Ejecutar la función principal
  main();
