// scripts/youtube-prismic-importer.js
// Final Version using createWriteClient and createMigration

// ========================================================================
// 1. SETUP: LOAD ENVIRONMENT VARIABLES & IMPORT LIBRARIES
// ========================================================================
require('dotenv').config(); // Load variables from .env file first
const { google } = require('googleapis');
const prismic = require('@prismicio/client');
// Import createMigration function correctly
const { createMigration } = require('@prismicio/client');

// ========================================================================
// 2. CONSTANTS & CONFIGURATION
// ========================================================================

// --- Configuration from .env file ---
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const PRISMIC_API_ENDPOINT = process.env.PRISMIC_API_ENDPOINT; // e.g., https://your-repo-name.prismic.io/api/v2
const PRISMIC_WRITE_TOKEN = process.env.PRISMIC_WRITE_TOKEN; // --- IMPORTANT: Token MUST have WRITE permissions! ---
const YOUTUBE_UPLOADS_PLAYLIST_ID = process.env.YOUTUBE_UPLOADS_PLAYLIST_ID; // Channel's Uploads playlist ID (usually starts with UU)
const PRISMIC_REPO_NAME = process.env.PRISMIC_REPO_NAME; // Your Prismic repository name

// --- Script Settings ---
const PRISMIC_CUSTOM_TYPE = 'videoarticle'; // API ID of your Prismic Custom Type
const PRISMIC_LANG = 'es-es';             // Default language for new documents
const MAX_VIDEOS_TO_CHECK_YT = 50;        // Max recent videos to fetch details for from YouTube
const MAX_VIDEOS_TO_IMPORT_PRISMIC = 1;  // Max new documents to create in Prismic per script run
const DELAY_FOR_YT_API = 500;             // Delay (ms) between YouTube API calls to avoid rate limits

// --- Essential Configuration Validation ---
if (!YOUTUBE_API_KEY || !PRISMIC_API_ENDPOINT || !PRISMIC_WRITE_TOKEN || !YOUTUBE_UPLOADS_PLAYLIST_ID || !PRISMIC_REPO_NAME) {
    console.error("❌ FATAL ERROR: Missing essential environment variables.");
    console.error("   Please check your .env file for: YOUTUBE_API_KEY, PRISMIC_API_ENDPOINT, PRISMIC_WRITE_TOKEN, YOUTUBE_UPLOADS_PLAYLIST_ID, PRISMIC_REPO_NAME");
    process.exit(1); // Stop execution
}

// ========================================================================
// 3. API CLIENT INITIALIZATION
// ========================================================================

// --- YouTube API Client ---
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

// --- Prismic Read Client (for checking existence) ---
// Uses the standard createClient. The Write Token often has read permissions too.
const prismicReadClient = prismic.createClient(PRISMIC_API_ENDPOINT, {
    accessToken: PRISMIC_WRITE_TOKEN
});

// --- Prismic Write Client (using the modern migration API) ---
const prismicWriteClient = prismic.createWriteClient(PRISMIC_REPO_NAME, {
    writeToken: PRISMIC_WRITE_TOKEN,
});
console.log(`✅ Prismic clients initialized for repository: ${PRISMIC_REPO_NAME}`);

// ========================================================================
// 4. HELPER FUNCTIONS
// ========================================================================

/**
 * Converts ISO 8601 duration (e.g., "PT1M35S") to total seconds.
 * @param {string} isoDuration - Duration string from YouTube API.
 * @returns {number} - Duration in seconds.
 */
function parseISODuration(isoDuration) {
    if (!isoDuration) return 0;
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || 0);
    const minutes = parseInt(matches[2] || 0);
    const seconds = parseInt(matches[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Basic parsing of YouTube description for ingredients and instructions.
 * Looks for simple keywords. Needs improvement for robust extraction.
 * @param {string} description - Full video description.
 * @returns {{ingredients: Array, instructions: Array, short_description: Array}} - Prismic Rich Text paragraph arrays.
 */
function parseDescription(description) {
    description = description || "";
    // Regex patterns looking for keywords (case-insensitive)
    const ingredientsRegex = /(INGREDIENTES(?:[:\s\n]+))([\s\S]*?)(?:PREPARACIÓN:|PASOS:|ELABORACIÓN:|$)/i;
    const instructionsRegex = /(PREPARACIÓN:|PASOS:|ELABORACIÓN:?)([\s\S]*)/i;
    const ingredientsMatch = description.match(ingredientsRegex);
    const instructionsMatch = description.match(instructionsRegex);

    // Helper to format lines into basic Prismic paragraph blocks
    const formatToRichText = (text) => !text ? [] : text.trim().split('\n')
                                                    .map(l => l.trim())
                                                    .filter(l => l.length > 0)
                                                    .map(l => ({ type: 'paragraph', text: l, spans: [] }));

    // Basic short description (first ~250 chars, trying to end at a sentence)
    let shortDesc = description.substring(0, 250);
    const lastP = shortDesc.lastIndexOf('.');
    if (lastP > 100) { shortDesc = shortDesc.substring(0, lastP + 1); }
    else if (description.length > 250) { shortDesc += '...'; }

    return {
        ingredients: formatToRichText(ingredientsMatch ? ingredientsMatch[2] : ''),
        instructions: formatToRichText(instructionsMatch ? instructionsMatch[2] : ''),
        short_description: formatToRichText(shortDesc)
    };
}

/**
 * Checks if a video article already exists in Prismic based on youtube_video_id.
 * *** Includes WORKAROUND to ignore the specific ParsingError ***
 * @param {string} youtubeVideoId - The YouTube video ID.
 * @returns {Promise<boolean>} - false if doesn't exist or known ParsingError occurs, true otherwise (exists or other error).
 */
async function checkIfVideoExistsInPrismic(youtubeVideoId) {
    try {
        const existingDoc = await prismicReadClient.getFirst({
            filters: [prismic.filter.at(`my.${PRISMIC_CUSTOM_TYPE}.youtube_video_id`, youtubeVideoId)],
            fetch: [] // Only need to know if it exists
        });
        return !!existingDoc; // Returns true if document found, false otherwise
    } catch (error) {
        // *** WORKAROUND: Check specifically for the known ParsingError ***
        if (error instanceof prismic.ParsingError && error.message?.includes(`unexpected field 'my.${PRISMIC_CUSTOM_TYPE}.youtube_video_id'`)) {
            console.warn(`   ⚠️ IGNORANDO ParsingError conocido para ${youtubeVideoId}. Se asumirá que NO existe. (Necesita revisión de Prismic Support)`);
            return false; // Treat this specific error as "doesn't exist" to allow creation attempt
        } else {
            // For any other error (network, auth, etc.), log it and assume it exists to be safe
            console.error(`   ❌ Error (inesperado) verificando existencia para ${youtubeVideoId}:`, error.message);
            return true; // Assume exists on other errors to prevent potential duplicates
        }
    }
}

// ========================================================================
// 6. MAIN IMPORT LOGIC
// ========================================================================
async function main() {
    console.log('=================================================');
    console.log(`🚀 Iniciando importación YT -> Prismic (createMigration) (${new Date().toISOString()})`);
    console.log(`   Repositorio Prismic: ${PRISMIC_REPO_NAME}`);
    console.log(`   Custom Type: ${PRISMIC_CUSTOM_TYPE}`);
    console.log('=================================================');

    try {
        // --- FASE 1: GET YOUTUBE VIDEO IDs ---
        console.log("\n Fase 1: Obteniendo IDs de videos recientes...");
        let videoIds = []; let nextPageToken = null; let pagesFetched = 0; const maxPages = 3;
        do {
            pagesFetched++; console.log(`   Consultando pág ${pagesFetched} de la playlist...`);
            const resp = await youtube.playlistItems.list({ part: 'contentDetails', playlistId: YOUTUBE_UPLOADS_PLAYLIST_ID, maxResults: 50, pageToken: nextPageToken });
            if (!resp.data.items) { console.log("   No se encontraron más items."); break; }
            const ids = resp.data.items.map(i => i.contentDetails?.videoId).filter(Boolean); // Filter out null/undefined IDs
            videoIds = videoIds.concat(ids); nextPageToken = resp.data.nextPageToken; console.log(`     +${ids.length} IDs. Total: ${videoIds.length}`);
            if (videoIds.length >= MAX_VIDEOS_TO_CHECK_YT) { console.log(`   Alcanzado límite de ${MAX_VIDEOS_TO_CHECK_YT} IDs a revisar.`); break; }
            await new Promise(res => setTimeout(res, DELAY_FOR_YT_API)); // Pause between YT API calls
        } while (nextPageToken && pagesFetched < maxPages);
        videoIds = videoIds.slice(0, MAX_VIDEOS_TO_CHECK_YT); // Ensure limit
        if (videoIds.length === 0) { console.log('✅ Fase 1: No se encontraron videos en la playlist.'); return; }
        console.log(`✅ Fase 1: Obtenidos ${videoIds.length} IDs.`);

        // --- FASE 2: GET YOUTUBE VIDEO DETAILS (incl. duration) ---
        console.log("\n Fase 2: Obteniendo detalles de videos...");
        let allVideoDetails = [];
        for (let i = 0; i < videoIds.length; i += 50) {
            const batchIds = videoIds.slice(i, i + 50); console.log(`   Consultando lote de ${batchIds.length} videos...`);
            try {
                const resp = await youtube.videos.list({ part: 'snippet,contentDetails', id: batchIds.join(',') });
                if (resp.data.items) { allVideoDetails = allVideoDetails.concat(resp.data.items); }
            } catch (ytError) {
                console.error(`   ❌ Error obteniendo detalles de lote YT [${batchIds.join(',')}]: ${ytError.message}`);
            }
            await new Promise(res => setTimeout(res, DELAY_FOR_YT_API)); // Pause between YT API calls
        }
        console.log(`✅ Fase 2: Obtenidos detalles para ${allVideoDetails.length} videos.`);

        // --- FASE 3: FILTER OUT SHORTS ---
        console.log("\n Fase 3: Filtrando YouTube Shorts...");
        const nonShortVideos = allVideoDetails.filter(v => {
             const duration = parseISODuration(v.contentDetails?.duration);
             // Treat videos with 0 duration (rare) as non-shorts for safety
             return duration === 0 || duration > 60;
        });
        console.log(`✅ Fase 3: ${nonShortVideos.length} videos no-Shorts encontrados.`);
        if (nonShortVideos.length === 0) { console.log("   No hay videos válidos (no-Shorts) para procesar."); return; }

        // --- FASE 4: PREPARE PRISMIC MIGRATION ---
        console.log(`\n Fase 4: Preparando migración (hasta ${MAX_VIDEOS_TO_IMPORT_PRISMIC} documentos)...`);
        const migration = createMigration(); // Create the migration object
        let documentsStaged = 0; // Count documents added to this migration run

        for (const video of nonShortVideos) {
            if (documentsStaged >= MAX_VIDEOS_TO_IMPORT_PRISMIC) {
                console.log(`   Alcanzado límite ${MAX_VIDEOS_TO_IMPORT_PRISMIC} para esta ejecución.`);
                break; // Stop adding more documents
            }

            // Extract data safely with fallbacks
            const videoId = video.id;
            const videoTitle = video.snippet?.title || "Video Sin Título";
            const videoDescription = video.snippet?.description;
            const videoPublishedAt = video.snippet?.publishedAt;
            const thumbnailUrl = video.snippet?.thumbnails?.maxres?.url
                              || video.snippet?.thumbnails?.standard?.url
                              || video.snippet?.thumbnails?.high?.url
                              || video.snippet?.thumbnails?.medium?.url
                              || video.snippet?.thumbnails?.default?.url;

            console.log(`\n Procesando: "${videoTitle}" (ID: ${videoId})`);

            // 5. Check if exists in Prismic (using function with WORKAROUND)
            console.log(`   Verificando existencia...`);
            const exists = await checkIfVideoExistsInPrismic(videoId);
            if (exists) {
                console.log(`   ➡️ Existe o error verificando (ignorando ParsingError). Saltando.`);
                continue; // Skip to the next video
            } else {
                console.log(`   ✅ No existe (o ParsingError ignorado). Preparando documento...`);
            }

            // 6. Parse description for content
            const parsed = parseDescription(videoDescription);

            // 7. Register image assets for Prismic
            let featuredImageAsset = null;
            let socialImageAsset = null;
            const filenameBase = videoId || 'video_thumbnail'; // Base for filename

            if (thumbnailUrl) {
                try {
                    console.log(`      Registrando asset para thumbnail: ${thumbnailUrl}`);
                    // Register the asset using the migration object
                    featuredImageAsset = migration.createAsset(
                        thumbnailUrl,
                        `${filenameBase}.jpg`, // Suggested filename
                        { alt: videoTitle }    // Optional metadata
                    );
                    socialImageAsset = featuredImageAsset; // Use the same asset for social card
                    console.log(`      -> Asset registrado.`);
                } catch (assetError) {
                    console.error(`   ❌ Error al registrar asset para ${videoId} desde ${thumbnailUrl}:`, assetError.message);
                    // featuredImageAsset and socialImageAsset remain null
                }
            } else {
                console.warn(`   ⚠️ No se encontró thumbnail URL para video ${videoId}.`);
            }

            // 8. Prepare the Prismic document data object
            const formattedTitle = [{ type: 'heading1', content: { text: videoTitle, spans: [] } }];
            const metaTitle = videoTitle.substring(0, 60);
            const firstShortDescPara = parsed?.short_description?.[0]?.text;
            const metaDescription = (firstShortDescPara || videoTitle).substring(0, 160);

            const documentData = {
                title: formattedTitle,
                youtube_video_id: videoId,
                // publication_date: videoPublishedAt?.split('T')[0] || null,
                // featured_image: featuredImageAsset, // Assign the registered asset object (or null)
                // video_embed: videoId ? { embed_url: `https://www.youtube.com/watch?v=${videoId}` } : null,
                // short_description: parsed.short_description,
                // ingredients: parsed.ingredients,
                // instructions: parsed.instructions,
                // meta_title: metaTitle,
                // meta_description: metaDescription,
                // social_card_image: socialImageAsset, // Assign the registered asset object (or null)
                // prep_time: '', cook_time: '', servings: '', difficulty: 'Fácil', category: null,
            };

            // Clean up null/empty values before adding to migration if needed
            Object.keys(documentData).forEach(key => {
                if (documentData[key] === null) {
                   delete documentData[key];
                }
             });

             // 8. Añadir la operación de creación a la migración (SIN CAMBIOS AQUÍ)
             try {
                 migration.createDocument(
                     { type: PRISMIC_CUSTOM_TYPE, lang: PRISMIC_LANG, data: documentData },
                     `YT Import: ${videoTitle}`
                 );
                 documentsStaged++;
                 console.log(`   -> Añadida operación 'document.create' (simplificada) a la migración.`);
             } catch (createError) {
                 console.error(`   ❌ Error al preparar documento ${videoId} para migración:`, createError.message);
             }

            // 9. Add the "create document" operation to the migration object
            try {
                migration.createDocument(
                    { // Document definition
                        type: PRISMIC_CUSTOM_TYPE,
                        lang: PRISMIC_LANG,
                        data: documentData,
                        // uid: `video-${videoId}` // Optional: Uncomment to set predictable UIDs
                    },
                    `YT Import: ${videoTitle}` // Optional title for Prismic history
                );
                documentsStaged++;
                console.log(`   -> Añadida operación 'document.create' a la migración.`);
            } catch (createError) {
                console.error(`   ❌ Error al añadir documento ${videoId} a la migración:`, createError.message);
                // Consider whether to continue or stop if one document fails preparation
            }
        } // End of for loop processing videos

        console.log(`✅ Fase 4: Preparación completada. ${documentsStaged} documentos añadidos a la migración.`);

        // --- FASE 5: EXECUTE THE MIGRATION ---
        if (documentsStaged > 0) {
            console.log(`\n Fase 5: Ejecutando migración para ${documentsStaged} documento(s)...`);
            try {
                // Execute all staged operations (create assets, create documents)
                await prismicWriteClient.migrate(
                    migration, // The migration object containing all operations
                    { // Options
                        reporter: (event) => console.log(`   [Migration Report] type: ${event.type}, status: ${event.status}, ${event.message || ''}`),
                        // concurrency: 5 // Optional: Adjust concurrency if needed
                    }
                );
                console.log(`✅ Fase 5: Migración enviada. Prismic procesará las operaciones.`);
                console.log(`   -> Revisa tu repositorio Prismic en unos momentos.`);
            } catch (migrationError) {
                console.error(`  ❌ ERROR DURANTE LA EJECUCIÓN DE LA MIGRACIÓN:`);
                console.error(`     Mensaje: ${migrationError.message}`);
                if (migrationError.cause) { console.error("     Causa:", migrationError.cause); }
                if (migrationError.response?.data) { console.error("     Data:", JSON.stringify(migrationError.response.data, null, 2)); }
                if (migrationError.message?.includes('403') || migrationError.cause?.toString().includes('403') || migrationError.response?.status === 403) {
                    console.error(`     ¡ERROR 403 DETECTADO! Verifica los permisos/validez del PRISMIC_WRITE_TOKEN.`);
                }
                // Log the full error object for more details if needed
                // console.error("     Full Migration Error Object:", migrationError);
            }
        } else {
            console.log("\n Fase 5: No hay nuevos documentos para migrar en esta ejecución.");
        }

    } catch (error) { // Catch general script errors (e.g., YouTube API failures)
        console.error('\n==================== ERROR GENERAL DEL SCRIPT ====================');
        console.error(error);
        console.error('====================================================================');
    } finally {
        console.log(`\n🏁 Proceso de importación finalizado (${new Date().toISOString()}).`);
    }
}

// ========================================================================
// 7. EXECUTE SCRIPT
// ========================================================================
main();
