// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: "Bagel ECS",
    tagline: "The web's best TS ECS implementation",
    favicon: "img/favicon.ico",

    // Set the production url of your site here
    url: "https://bagel03.github.io",
    // Set the /<baseUrl>/ pathname under which your site is served
    // For GitHub pages deployment, it is often '/<projectName>/'
    baseUrl: "/BagelECS/",

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: "Bagel03", // Usually your GitHub org/user name.
    projectName: "BagelECS", // Usually your repo name.
    deploymentBranch: "gh-pages",

    trailingSlash: false,

    onBrokenLinks: "throw",
    onBrokenMarkdownLinks: "warn",

    // Even if you don't use internalization, you can use this field to set useful
    // metadata like html lang. For example, if your site is Chinese, you may want
    // to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },

    presets: [
        [
            "classic",
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    sidebarPath: require.resolve("./sidebars.js"),
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    editUrl:
                        "https://github.com/Bagel03/BagelECS/edit/master/docs",
                },
                theme: {
                    // customCss: require.resolve("./src/css/custom.css"),
                },
            }),
        ],
    ],

    themeConfig:
        /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
        ({
            navbar: {
                title: "Bagel ECS",
                logo: {
                    alt: "Bagel ECS Logo",
                    src: "img/logo.svg",
                },
                items: [
                    {
                        type: "docSidebar",
                        sidebarId: "tutorialSidebar",
                        position: "left",
                        label: "Docs",
                    },
                    // { to: "/blog", label: "Blog", position: "left" },
                    {
                        href: "https://github.com/Bagel03/BagelECS",
                        label: "GitHub",
                        position: "right",
                    },
                ],
            },
            footer: {
                style: "dark",
                links: [
                    {
                        title: "Links",

                        items: [
                            {
                                label: "Discord",
                                href: "https://discord.gg/XrFmm7raSs",
                            },
                            {
                                label: "GitHub",
                                href: "https://github.com/Bagel03/BagelECS",
                            },
                        ],
                    },
                ],
                copyright: `Copyright ©${new Date().getFullYear()} @Bagel03. Website built with Docusaurus.`,
            },
            prism: {
                theme: lightCodeTheme,
                darkTheme: darkCodeTheme,
            },
            colorMode: {
                defaultMode: "dark",
                respectPrefersColorScheme: false,
                disableSwitch: false,
            },
            docs: {
                sidebar: {
                    autoCollapseCategories: false,
                },
            },
        }),
};

module.exports = config;
