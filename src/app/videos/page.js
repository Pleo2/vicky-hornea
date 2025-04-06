import * as prismic from "@prismicio/client";
import { PrismicNextLink, PrismicNextImage } from "@prismicio/next"; // Asegúrate de importar PrismicNextImage
import { PrismicText, PrismicRichText } from "@prismicio/react"; // Importa PrismicRichText para el excerpt

import { createClient } from "@/prismicio";
import { Layout } from "@/components/Layout";
import { Bounded } from "@/components/Bounded";
// Asumo que tienes un componente Heading, si no, reemplázalo por <h2> o importa uno
import { Heading } from "@/components/Heading";
// Si quieres usar getExcerpt, asegúrate que funcione con RichText o usa short_description
// import { getExcerpt } from "@/lib/getExcerpt";

// Formateador de fecha simple (puedes usar librerías como date-fns si prefieres)
const dateFormatter = new Intl.DateTimeFormat("es-ES", { // Ajusta 'es-ES' a tu locale
  day: "numeric",
  month: "long",
  year: "numeric",
});

export async function generateMetadata() {
  const client = createClient();
  const settings = await client.getSingle("settings");
  const pageTitle = prismic.asText(settings.data.name) || "Blog de Vicky Hornea"; // Fallback title

  // Podrías añadir una descripción por defecto también
  return {
    title: pageTitle,
    // description: "Descubre deliciosas recetas y secretos de repostería...",
  };
}

export default async function Index() {
  const client = createClient();

  // --- CORRECCIÓN 1: Usar el Custom Type ID correcto 'videoarticle' ---
  // --- CORRECCIÓN 2: Usar el campo de ordenamiento correcto 'publication_date' ---
  const videoArticles = await client.getAllByType("videoarticle", { // <-- CORREGIDO
    orderings: [
      { field: "my.videoarticle.publication_date", direction: "desc" }, // <-- CORREGIDO
      { field: "document.first_publication_date", direction: "desc" }, // Fallback es bueno
    ],
    // Opcional: Pedir solo los campos necesarios para la lista mejora rendimiento
    fetch: [
      'videoarticle.title',
      'videoarticle.publication_date',
      'videoarticle.featured_image',
      'videoarticle.short_description', // O el campo que uses para el excerpt
    ],
  });


  const navigation = await client.getSingle("navigation");
  const settings = await client.getSingle("settings");

  return (
    <Layout
      withHeaderDivider={false}
      navigation={navigation}
      settings={settings}
    >
      <Bounded size="widest">
        {/* Añadir un título a la página */}
        <Heading as="h1" size="xl" className="mb-8 text-center">
           Recetas Recientes
        </Heading>
        <ul className="grid grid-cols-1 gap-16">
          {/* --- CORRECCIÓN 3: Iterar sobre la variable correcta 'videoArticles' --- */}
          {videoArticles.map((video) => {
            // --- CORRECCIÓN 4: Lógica de imagen/fecha/extracto DENTRO del loop ---

            // Obtener imagen destacada del video actual
            const featuredImage = prismic.isFilled.image(video.data.featured_image)
              ? video.data.featured_image
              : null; // Opcional: buscar primera imagen en slices si no hay destacada

            // Obtener y formatear fecha del video actual
            const date = prismic.asDate(
              video.data.publication_date || video.first_publication_date
            );

            // Obtener extracto (usando short_description como ejemplo)
            const excerpt = prismic.isFilled.richText(video.data.short_description)
              ? video.data.short_description
              : null;
            // Alternativa si usas getExcerpt: const excerpt = getExcerpt(video.data.slices);

            return (
              // --- CORRECCIÓN 6: Añadir key única ---
              <li key={video.id} className="grid grid-cols-1 items-start gap-6 md:grid-cols-3 md:gap-8">
                {/* Enlace que envuelve la imagen */}
                <PrismicNextLink document={video} tabIndex="-1">
                  <div className="aspect-h-3 aspect-w-4 relative bg-gray-100 rounded-md overflow-hidden">
                    {/* Mostrar imagen si existe */}
                    {featuredImage ? (
                      <PrismicNextImage
                        field={featuredImage}
                        fill={true}
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw" // Ayuda a optimizar carga de imagen
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full bg-gray-200 text-gray-500">
                        <span>Sin imagen</span> {/* Placeholder */}
                      </div>
                    )}
                  </div>
                </PrismicNextLink>

                {/* Contenido de texto */}
                <div className="grid grid-cols-1 gap-3 md:col-span-2">
                  {/* --- CORRECCIÓN 5: Usar 'video.data.title' --- */}
                  <Heading as="h2" size="md"> {/* Ajusta 'size' si es necesario */}
                    <PrismicNextLink document={video}>
                      {/* Usar PrismicText para títulos simples es más eficiente */}
                      <PrismicText field={video.data.title} />
                    </PrismicNextLink>
                  </Heading>
                  {/* --- CORRECCIÓN 5: Usar 'date' calculada dentro del loop --- */}
                  <p className="font-serif text-sm italic tracking-tighter text-slate-500">
                    {/* Asegurarse que date no sea null antes de formatear */}
                    {date ? dateFormatter.format(date) : "Fecha no disponible"}
                  </p>
                  {/* --- CORRECCIÓN 5: Usar 'excerpt' calculado dentro del loop --- */}
                  {/* Usar PrismicRichText para renderizar el excerpt si viene de un campo RichText */}
                  {excerpt && (
                    <div className="font-serif leading-relaxed md:text-lg md:leading-relaxed text-slate-700">
                       {/* Renderizar el RichText, limitado a 1 párrafo por ejemplo */}
                      <PrismicRichText field={excerpt.slice(0, 1)} />
                      {excerpt.length > 1 && '...'} {/* Añadir puntos suspensivos si hay más */}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Bounded>
    </Layout>
  );
}
