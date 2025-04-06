/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        viewTransition: true
    },
    reactStrictMode: true,
    async rewrites() {
        return [
            {
                source: "/articles",
                destination: "/"
            }
        ];
    }
};

module.exports = nextConfig;
