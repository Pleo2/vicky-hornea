import { notFound } from 'next/navigation';
import { PrismicRichText, PrismicImage, PrismicEmbed } from '@prismicio/react';
import * as prismic from '@prismicio/client'; // Necesario para asText y NotFoundError

import { createClient } from '@/prismicio'; // Ajusta la ruta a tu archivo prismicio.js
// Asumo que tienes estos componentes o similares
import { Layout } from "@/components/Layout";
import { Bounded } from "@/components/Bounded";
import { Heading } from "@/components/Heading";

// Formateador de fecha (puedes moverlo a un archivo de utilidades)
const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});


// -- Generación de Metadatos (SEO) --
export async function generateMetadata({ params }) {
  const client = createClient();
  let videoArticle; // Renombrar variable para claridad

  try {
    // --- CORRECCIÓN: Usar 'videoarticle' ---
    videoArticle = await client.getByUID('videoarticle', params.uid);
  } catch (error) {
    if (error instanceof prismic.NotFoundError) {
      // No hacemos nada aquí, page.js llamará a notFound()
    } else {
      console.error("Error fetching metadata:", error);
      return { title: 'Error', description: 'No se pudo cargar la información.' };
    }
  }

  if (!videoArticle) {
    return { title: 'Artículo no encontrado' }; // Mensaje ajustado
  }

  // Acceder a los datos de videoArticle
  const pageTitle = prismic.asText(videoArticle.data.title) || 'Video/Receta sin título';
  const seoTitle = videoArticle.data.meta_title || pageTitle;
  const seoDescription = videoArticle.data.meta_description || prismic.asText(videoArticle.data.short_description) || '';
  const seoImage = videoArticle.data.social_card_image?.url || videoArticle.data.featured_image?.url || '/default-social-image.jpg';

  return {
    title: seoTitle,
    description: seoDescription,
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      images: [
        {
          url: seoImage,
          width: videoArticle.data.social_card_image?.dimensions?.width || videoArticle.data.featured_image?.dimensions?.width || 1200,
          height: videoArticle.data.social_card_image?.dimensions?.height || videoArticle.data.featured_image?.dimensions?.height || 630,
          alt: videoArticle.data.social_card_image?.alt || videoArticle.data.featured_image?.alt || pageTitle,
        },
      ],
      locale: 'es_ES',
      type: 'article', // Adecuado para un artículo de video/receta
      publishedTime: videoArticle.data.publication_date || videoArticle.first_publication_date,
      // authors: ['Hornea con Vicky'], // Si quieres añadirlo
    },
    // twitter: { ... } // Puedes mantenerlo si lo usas
  };
}

// -- Generación de Parámetros Estáticos (para SSG) --
export async function generateStaticParams() {
  const client = createClient();
  // --- CORRECCIÓN: Usar 'videoarticle' ---
  const articles = await client.getAllByType('videoarticle', {
      fetch: ['videoarticle.uid'], // <-- CORREGIDO
  });

  return articles.map((article) => {
    return { uid: article.uid };
  });
}

// -- Componente de la Página (Server Component) --
// Puedes renombrar la función si quieres: VideoArticlePage
export default async function VideoArticlePage({ params }) {
  const client = createClient();
  let videoArticle; // Renombrar variable para claridad

  try {
    // --- CORRECCIÓN: Usar 'videoarticle' ---
    videoArticle = await client.getByUID('videoarticle', params.uid, {
      // fetchLinks sigue siendo válido si el campo 'category' existe y linkea a 'category.name'
      fetchLinks: ['category.name'],
    });
  } catch (error) {
    if (error instanceof prismic.NotFoundError) {
      notFound();
    } else {
      console.error("Error fetching video article page:", error);
      throw new Error("No se pudo cargar el artículo.");
    }
  }

  if (!videoArticle) {
    notFound();
  }

  // Necesitamos obtener Navigation y Settings también para el Layout
  const navigation = await client.getSingle("navigation");
  const settings = await client.getSingle("settings");

  // Formatear fecha aquí para usarla en el render
  const publicationDate = prismic.asDate(
    videoArticle.data.publication_date || videoArticle.first_publication_date
  );

  return (
    // Asegúrate que Layout y Bounded estén disponibles y funcionen
    <Layout navigation={navigation} settings={settings}>
      <Bounded>
        <article className="mx-auto max-w-4xl px-4 py-8"> {/* Ajustar clases según necesidad */}

          {/* Título */}
          <div className="mb-6 text-center">
            <PrismicRichText
              field={videoArticle.data.title}
              components={{
                heading1: ({ children }) => <Heading as="h1" size="2xl" className="font-bold text-gray-900">{children}</Heading>, // Usar componente Heading
              }}
            />
          </div>

          {/* Metadatos (fecha, categoría, dificultad) */}
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 mb-8 text-gray-600 text-sm">
            {publicationDate && (
              <span>Publicado: {dateFormatter.format(publicationDate)}</span>
            )}
            {/* Verificar si el enlace de categoría tiene datos antes de acceder a .name */}
            {videoArticle.data.category?.data?.name && (
              <span>Categoría: <span className="font-semibold text-pink-700">{videoArticle.data.category.data.name}</span></span>
            )}
            {videoArticle.data.difficulty && (
              <span>Dificultad: <span className="font-medium">{videoArticle.data.difficulty}</span></span>
            )}
          </div>

          {/* Imagen Destacada (Opcional, podrías priorizar el video) */}
          {prismic.isFilled.image(videoArticle.data.featured_image) && (
            <div className="mb-8 rounded-lg overflow-hidden shadow-lg">
              <PrismicImage
                  field={videoArticle.data.featured_image}
                  width={1280}
                  height={720}
                  className="w-full h-auto"
              />
            </div>
           )}

          {/* Video Embed (Probablemente el contenido principal) */}
          {prismic.isFilled.embed(videoArticle.data.video_embed) && (
            <div className="mb-10 aspect-video shadow-lg"> {/* Controla la relación de aspecto */}
              <PrismicEmbed field={videoArticle.data.video_embed} wrapper="div" className="w-full h-full rounded-md"/>
            </div>
          )}

          {/* Descripción Corta */}
          {prismic.isFilled.richText(videoArticle.data.short_description) && (
            <div className="mb-10 text-lg text-center text-gray-700 prose prose-lg max-w-none">
                <PrismicRichText field={videoArticle.data.short_description} />
            </div>
          )}


          {/* Sección Principal: Ingredientes e Instrucciones */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-10">

            {/* Columna de Ingredientes y Detalles */}
            <div className="md:col-span-1 space-y-8">
              {prismic.isFilled.richText(videoArticle.data.ingredients) && (
                <div>
                  <h2 className="text-xl font-semibold mb-3 text-gray-800 border-b pb-2">Ingredientes</h2>
                  {/* Usar `prose` puede ayudar con el estilo de las listas */}
                  <div className="prose prose-sm max-w-none text-gray-700">
                    <PrismicRichText field={videoArticle.data.ingredients} />
                  </div>
                </div>
               )}
              {/* Mostrar sección de detalles si alguno de los campos tiene valor */}
              {(videoArticle.data.prep_time || videoArticle.data.cook_time || videoArticle.data.servings) && (
                <div>
                   <h3 className="text-lg font-semibold mb-2 text-gray-700">Detalles</h3>
                   <ul className="list-none space-y-1 text-sm text-gray-600">
                      {videoArticle.data.prep_time && <li><strong>Preparación:</strong> {videoArticle.data.prep_time}</li>}
                      {videoArticle.data.cook_time && <li><strong>Horneado:</strong> {videoArticle.data.cook_time}</li>}
                      {videoArticle.data.servings && <li><strong>Porciones:</strong> {videoArticle.data.servings}</li>}
                   </ul>
                </div>
              )}
            </div>

            {/* Columna de Instrucciones */}
            {prismic.isFilled.richText(videoArticle.data.instructions) && (
              <div className="md:col-span-2">
                <h2 className="text-xl font-semibold mb-3 text-gray-800 border-b pb-2">Instrucciones</h2>
                <div className="prose max-w-none text-gray-700">
                  <PrismicRichText field={videoArticle.data.instructions} />
                </div>
              </div>
             )}

          </div>
          {/* Puedes añadir más secciones aquí: notas, consejos, etc. */}
        </article>
      </Bounded>
    </Layout>
  );
}
