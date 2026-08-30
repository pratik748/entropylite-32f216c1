# EntropyLite Setup Guide

## ✅ Setup Completed

Your GitHub repository is now fully configured and ready for development!

### What's Been Set Up

1. **Repository**: Connected to https://github.com/pratik748/entropylite-32f216c1
2. **Dependencies**: All npm packages installed (626 packages)
3. **Tests**: All 271 tests passing ✓
4. **Environment**: Supabase configured with your project credentials

## 🚀 Quick Start

### Start Development Server
```bash
cd entropylite-32f216c1
npm run dev
```
Access at: http://localhost:5173

### Run Tests
```bash
npm test              # Run tests once
npm run test:watch    # Run in watch mode
```

### Build for Production
```bash
npm run build         # Creates optimized build in dist/
npm run preview       # Preview production build
```

## 📂 Project Overview

This is a **React + TypeScript + Vite** financial intelligence platform with:

- **Backend**: Supabase (PostgreSQL + Auth)
- **UI Framework**: shadcn/ui + Tailwind CSS
- **3D Graphics**: Three.js + React Three Fiber
- **State**: TanStack Query
- **Routing**: React Router v6

## 🔧 Configuration Files

- `.env` - Supabase credentials (already configured)
- `vite.config.ts` - Vite build configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `components.json` - shadcn/ui components config

## 📋 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build |
| `npm run build:dev` | Development build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run all tests |
| `npm run test:watch` | Tests in watch mode |

## 🌿 Git Workflow

Current branch: `main`

### Creating a Feature Branch
```bash
git checkout -b feature/your-feature-name
git add .
git commit -m "feat: your feature description"
git push -u origin feature/your-feature-name
```

### Creating a Pull Request
Use GitHub CLI:
```bash
gh pr create --title "Your PR Title" --body "Description"
```

Or visit: https://github.com/pratik748/entropylite-32f216c1/compare

## 🔐 Environment Variables

Already configured in `.env`:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` - Project identifier

## 🧪 Testing

The project uses **Vitest** with React Testing Library:
- 15 test files
- 271 tests passing
- Coverage includes auth, workstation, and component tests

## ⚠️ Known Issues

### Security Vulnerabilities
There are 21 vulnerabilities reported by npm audit:
- 1 low, 3 moderate, 16 high, 1 critical

Run to review:
```bash
npm audit
npm audit fix
```

### Dependency Warnings
- Three.js version conflict (project uses 0.160.1, some packages need >=0.168)
- Some deprecated packages (whatwg-encoding, abab, domexception, three-mesh-bvh)

These warnings don't affect functionality but should be addressed in future updates.

## 📦 Key Dependencies

### Production
- React 18.3.1
- TypeScript 5.8.3
- Vite 5.4.19
- Supabase JS 2.97.0
- TanStack Query 5.83.0
- shadcn/ui (Radix UI components)
- Recharts 2.15.4
- Three.js 0.160.1

### Development
- Vitest 3.2.4
- ESLint 9.32.0
- Tailwind CSS 3.4.17
- Testing Library

## 🚢 Deployment

### Recommended Platforms
- **Vercel** (recommended for Vite apps)
- Netlify
- Cloudflare Pages

### Build Configuration
- Build command: `npm run build`
- Output directory: `dist`
- Node version: 18+

### Environment Variables for Deployment
Make sure to set these in your deployment platform:
```
VITE_SUPABASE_URL=https://reprphurmjtveejeqejn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_key
VITE_SUPABASE_PROJECT_ID=reprphurmjtveejeqejn
```

## 📚 Next Steps

1. **Start Development**: `npm run dev`
2. **Review Code**: Explore the `src/` directory
3. **Check Documentation**: See `docs/` folder
4. **Run Tests**: `npm test` before committing
5. **Create Feature Branch**: Before making changes
6. **Address Security Issues**: Run `npm audit fix`

## 🆘 Troubleshooting

### Port Already in Use
If port 5173 is occupied:
```bash
npm run dev -- --port 3000
```

### Node Modules Issues
```bash
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors
```bash
npm run build
# Check tsconfig.json for any issues
```

### Test Failures
```bash
npm run test:watch
# Debug specific test files
```

## 📞 Support

- **Repository**: https://github.com/pratik748/entropylite-32f216c1
- **Issues**: Open an issue on GitHub
- **Supabase Dashboard**: https://reprphurmjtveejeqejn.supabase.co

---

**Setup completed on**: 2026-08-30
**Setup status**: ✅ Ready for development
