import { notFound } from 'next/navigation';
import { PrismicRichText, PrismicImage, PrismicEmbed } from '@prismicio/react';
import * as prismic from '@prismicio/client'; // Necesario para asText y NotFoundError

import { createClient } from '@/prismicio'; // Ajusta la ruta a tu archivo prismicio.js

// -- Generación de Metadatos (SEO) --
export async function generateMetadata({ params }) {
  const client = createClient();
  let recipe;

  try {
    recipe = await client.getByUID('receta', params.uid);
  } catch (error) {
    // Si el documento no se encuentra, permitimos que la página maneje el 404
    if (error instanceof prismic.NotFoundError) {
        // No hacemos nada aquí, page.js llamará a notFound()
    } else {
      // Otro tipo de error, podríamos loggearlo o manejarlo diferente
      console.error("Error fetching metadata:", error);
      // Devolvemos metadata por defecto o dejamos que Next maneje el error
      return { title: 'Error', description: 'No se pudo cargar la información.' };
    }
  }

  // Si no se encontró la receta (por si acaso el try/catch no fue suficiente)
  if (!recipe) {
      return { title: 'Receta no encontrada' };
  }

  // Extrae los datos SEO, usando fallbacks si es necesario
  const pageTitle = prismic.asText(recipe.data.title) || 'Receta sin título';
  const seoTitle = recipe.data.meta_title || pageTitle; // Usa meta título o el título principal
  const seoDescription = recipe.data.meta_description || prismic.asText(recipe.data.short_description) || ''; // Usa meta desc, desc corta o vacío
  // Usa imagen social, sino la destacada, sino una por defecto (asegúrate que exista /default-social-image.jpg en /public)
  const seoImage = recipe.data.social_card_image?.url || recipe.data.featured_image?.url || '/default-social-image.jpg';

  return {
    title: seoTitle,
    description: seoDescription,
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      images: [
        {
          url: seoImage,
          width: recipe.data.social_card_image?.dimensions?.width || recipe.data.featured_image?.dimensions?.width || 1200, // Usa dimensiones reales si están disponibles
          height: recipe.data.social_card_image?.dimensions?.height || recipe.data.featured_image?.dimensions?.height || 630,
          alt: recipe.data.social_card_image?.alt || recipe.data.featured_image?.alt || pageTitle, // Usa alt de la imagen o el título
        },
      ],
      locale: 'es_ES', // Ajusta tu locale
      type: 'article',
      publishedTime: recipe.data.publication_date || recipe.first_publication_date, // Añade fecha de publicación
      // Podrías añadir autor si lo tienes
      // authors: ['Hornea con Vicky'],
    },
    // Puedes añadir Twitter Cards también si quieres
    // twitter: {
    //   card: 'summary_large_image',
    //   title: seoTitle,
    //   description: seoDescription,
    //   images: [seoImage],
    //   site: '@TuUsuarioTwitter', // Opcional
    //   creator: '@HorneaConVicky', // Opcional
    // },
  };
}

// -- (Opcional pero recomendado) Generación de Parámetros Estáticos (para SSG) --
export async function generateStaticParams() {
  const client = createClient();
  const recipes = await client.getAllByType('receta', {
      // Limita los campos para que sea más rápido, solo necesitamos el uid
      fetch: ['receta.uid'],
  });

  return recipes.map((recipe) => {
    return { uid: recipe.uid };
  });
}

// -- Componente de la Página (Server Component) --
export default async function RecipePage({ params }) {
  const client = createClient();
  let recipe;

  try {
    // Obtenemos la receta por su UID y pedimos el nombre de la categoría relacionada
    recipe = await client.getByUID('receta', params.uid, {
      fetchLinks: ['category.name'], // Asegúrate que el type sea 'category' y tenga un campo 'name'
    });
  } catch (error) {
    if (error instanceof prismic.NotFoundError) {
      notFound(); // Muestra la página 404 predeterminada de Next.js
    } else {
      // Podrías tener una página de error más específica
      console.error("Error fetching recipe page:", error);
      // O lanzar el error para que lo capture error.js si lo tienes
      throw new Error("No se pudo cargar la receta.");
    }
  }

  // Si por alguna razón no se encontró pero no dio error 404 (poco probable con getByUID)
  if (!recipe) {
      notFound();
  }

  return (
    <article className="container mx-auto px-4 py-8"> {/* Ejemplo con Tailwind */}
      {/* Imagen Destacada */}
      <div className="mb-6">
        <PrismicImage
            field={recipe.data.featured_image}
            width={1280} // Puedes omitir width/height si usas fill o CSS
            height={720}
            className="w-full h-auto rounded-lg shadow-md" // Estilo ejemplo
        />
      </div>

      {/* Título */}
      <div className="mb-4 text-center">
        <PrismicRichText
            field={recipe.data.title}
            components={{ // Opcional: personalizar renderizado de H1
                heading1: ({ children }) => <h1 className="text-3xl md:text-4xl font-bold text-gray-800">{children}</h1>,
            }}
        />
      </div>

      {/* Metadatos (fecha, categoría, dificultad) */}
      <div className="flex justify-center items-center space-x-4 mb-6 text-gray-600 text-sm">
        {recipe.data.publication_date && (
          <span>Publicado: {new Date(recipe.data.publication_date).toLocaleDateString('es-ES')}</span>
        )}
        {recipe.data.category?.data?.name && (
          <span>Categoría: <span className="font-medium text-pink-600">{recipe.data.category.data.name}</span></span>
        )}
        {recipe.data.difficulty && (
          <span>Dificultad: <span className="font-medium">{recipe.data.difficulty}</span></span>
        )}
      </div>


      {/* Descripción Corta */}
      <div className="mb-8 text-lg text-gray-700 text-center">
          <PrismicRichText field={recipe.data.short_description} />
      </div>

       {/* Video Embed */}
       <div className="mb-8 aspect-video"> {/* Controla la relación de aspecto */}
            <PrismicEmbed field={recipe.data.video_embed} wrapper="div" className="w-full h-full"/>
        </div>


      {/* Sección Principal: Ingredientes e Instrucciones */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Columna de Ingredientes y Detalles */}
        <div className="md:col-span-1 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-3 text-gray-800 border-b pb-2">Ingredientes</h2>
            <div className="prose prose-sm max-w-none"> {/* Usa prose de Tailwind para formateo básico */}
              <PrismicRichText field={recipe.data.ingredients} />
            </div>
          </div>
          <div>
             <h3 className="text-lg font-semibold mb-2 text-gray-700">Detalles</h3>
             <ul className="list-none space-y-1 text-sm text-gray-600">
                {recipe.data.prep_time && <li><strong>Preparación:</strong> {recipe.data.prep_time}</li>}
                {recipe.data.cook_time && <li><strong>Horneado:</strong> {recipe.data.cook_time}</li>}
                {recipe.data.servings && <li><strong>Porciones:</strong> {recipe.data.servings}</li>}
             </ul>
          </div>
        </div>

        {/* Columna de Instrucciones */}
        <div className="md:col-span-2">
          <h2 className="text-xl font-semibold mb-3 text-gray-800 border-b pb-2">Instrucciones</h2>
          <div className="prose max-w-none"> {/* Prose también ayuda con listas ordenadas */}
            <PrismicRichText field={recipe.data.instructions} />
          </div>
        </div>

      </div>

      {/* Puedes añadir más secciones aquí: notas, consejos, etc. */}

    </article>
  );
}
