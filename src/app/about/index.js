import * as prismic from "@prismicio/client";
import { createClient } from "@/prismicio";
import { Layout } from "@/components/Layout";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
    // Ajusta 'es-ES' a tu locale
    day: "numeric",
    month: "long",
    year: "numeric"
});

export async function generateMetadata() {
    const client = createClient();
    const settings = await client.getSingle("settings");
    const pageTitle =
        prismic.asText(settings.data.name) || "Blog de Vicky Hornea"; // Fallback title

    // Podrías añadir una descripción por defecto también
    return {
        title: pageTitle
        // description: "Descubre deliciosas recetas y secretos de repostería...",
    };
}

export default async function Index() {
    const client = createClient();
    const videoArticles = await client.getAllByType("videoarticle", {
        orderings: [
            { field: "my.videoarticle.publication_date", direction: "desc" },
            { field: "document.first_publication_date", direction: "desc" }
        ],
        fetch: [
            "videoarticle.title",
            "videoarticle.publication_date",
            "videoarticle.featured_image",
            "videoarticle.short_description" // O el campo que uses para el excerpt
        ]
    });

    const navigation = await client.getSingle("navigation");
    const settings = await client.getSingle("settings");

    return (
        <Layout
            withHeaderDivider={false}
            withProfile={false}
            navigation={navigation}
            settings={settings}
        ></Layout>
    );
}
