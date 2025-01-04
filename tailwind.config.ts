import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { fontFamily } from "tailwindcss/defaultTheme";
import catppuccin from "@catppuccin/tailwindcss";
import { flavorEntries } from "@catppuccin/palette";

export default {
  darkMode: [
    "variant",
    flavorEntries
      .filter(([_, { dark }]) => dark) // Filter to dark Catppuccin themes
      .map(([theme, _]) => `&:where(.${theme}, .${theme} *)`), // Map to a selector targeting elements affected by that theme
  ],
  content: ["./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      height: ({ theme }) => {
        const headerHeight = "52px";
        return {
          header: headerHeight,
          page: `calc(var(--viewport-height) - ${headerHeight} - ${theme("padding.2")}*2)`,
        };
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
        robotoMono: ["var(--font-roboto_mono)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "rgb(var(--ctp-base))", // "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      typography: {
        sm: {
          css: [
            {
              fontSize: `0.9375rem`,
            },
          ],
        },
      },
      dropShadow: {
        "lg-dark": [
          "0 10px 8px rgb(0 0 0 / 0.08)",
          "0 4px 3px rgb(0 0 0 / 0.2)",
        ],
      },
      textShadow: {
        around:
          "-1px -1px 0 var(--tw-shadow-color), 1px -1px 0 var(--tw-shadow-color), -1px 1px 0 var(--tw-shadow-color), 1px 1px 0 var(--tw-shadow-color)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    catppuccin({
      defaultFlavour: "latte",
    }),
    plugin(function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          "text-shadow": (value: string) => ({
            textShadow: value,
          }),
        },
        { values: theme("textShadow") },
      );
    }),
    catppuccin({
      defaultFlavour: "latte",
    }),
  ],
} satisfies Config;
