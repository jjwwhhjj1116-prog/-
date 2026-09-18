/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f4f7fb",
        surface: "#ffffff",
        primary: {
          DEFAULT: "#00338d",
          hover: "#002366",
          light: "#e8f0fe",
          subtle: "#f0f4fc",
        },
        accent: {
          DEFAULT: "#ef6c00",
          hover: "#d85e00",
          light: "#fff3e0",
        },
        corporate: {
          bg: "#f4f7fb",
          card: "#ffffff",
          border: "#e2e8f0",
          text: "#1e293b",
          muted: "#64748b",
          dark: "#0f172a",
        }
      },
      fontFamily: {
        sans: ['Noto Sans KR', 'Pretendard', 'Inter', 'sans-serif'],
        mono: ['DM Mono', 'JetBrains Mono', 'monospace']
      },
      boxShadow: {
        'card': '0 2px 10px rgba(0, 51, 141, 0.05)',
        'modal': '0 20px 50px rgba(15, 23, 42, 0.25)',
        'gantt-bar': '0 3px 8px rgba(0, 51, 141, 0.2)',
      }
    },
  },
  plugins: [],
}
