/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      utilities: {
        '.image-crisp': {
          'image-rendering': 'pixelated',
        },
        '.image-smooth': {
          'image-rendering': 'auto',
        },
      },
      keyframes: {
        glitch1: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-5px, 5px)' },
          '40%': { transform: 'translate(-5px, -5px)' },
          '60%': { transform: 'translate(5px, 5px)' },
          '80%': { transform: 'translate(5px, -5px)' },
        },
        glitch2: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(5px, 5px)' },
          '40%': { transform: 'translate(5px, -5px)' },
          '60%': { transform: 'translate(-5px, 5px)' },
          '80%': { transform: 'translate(-5px, -5px)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ping-once': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      animation: {
        'glitch-1': 'glitch1 2s infinite',
        'glitch-2': 'glitch2 2s infinite',
        scanline: 'scanline 6s linear infinite',
        fadeIn: 'fadeIn 0.6s ease-out forwards',
        'ping-once': 'ping-once 1s cubic-bezier(0, 0, 0.2, 1) forwards',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [
    // optionally add scrollbar plugin, typography, etc.
    // require('@tailwindcss/typography'),
    // require('@tailwindcss/forms'),
    // require('@tailwindcss/line-clamp'),
    // require('@tailwindcss/aspect-ratio'),
  ],
};
