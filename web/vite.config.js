import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Custom plugin to copy PHP files
const copyPhpFiles = () => {
  return {
    name: 'copy-php-files',
    closeBundle() {
      const games = [
        // Map the generic game API to the specific game endpoint
        { src: '../php/api.php', dest: 'dist/games/NeonRecall/api.php' },
        { src: '../php/db.php', dest: 'dist/api/db.php' },
        { src: '../php/auth.php', dest: 'dist/api/auth.php' },
        { src: '../php/setup.php', dest: 'dist/api/setup.php' }
      ]

      games.forEach(game => {
        const srcPath = resolve(__dirname, game.src)
        const destPath = resolve(__dirname, game.dest)
        const destDir = dirname(destPath)

        if (fs.existsSync(srcPath)) {
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
          }
          fs.copyFileSync(srcPath, destPath)
          console.log(`Copied ${game.src} to ${game.dest}`)
        } else {
          console.warn(`Warning: Could not find ${srcPath}`)
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    copyPhpFiles(),
  ],
  base: './',
})
