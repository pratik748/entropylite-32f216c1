# EntropyLite

A sophisticated financial intelligence and portfolio analysis platform built with React, TypeScript, and Supabase.

## 🚀 Features

- **Portfolio Management**: Advanced portfolio construction, tracking, and analysis
- **Risk Analytics**: Real-time risk monitoring, stress testing, and scenario analysis
- **Geopolitical Intelligence**: Interactive globe visualization with geopolitical event tracking
- **Market Intelligence**: Live news feeds, sentiment analysis, and market overview
- **Direct Profit Mode**: Evidence-driven decision making with quantitative techniques
- **Augment Layer**: Comprehensive suite of institutional-grade modules including:
  - Order Management
  - Trade Lifecycle Management
  - Risk Modeling & Stress Testing
  - ESG Integration
  - Compliance & Reporting
  - Multi-Asset Support
- **Entropy Sandbox**: Monte Carlo simulations, derivatives engine, and strategy lab
- **Command Palette**: Quick navigation and actions across the platform

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **State Management**: TanStack Query
- **3D Visualization**: Three.js + React Three Fiber
- **Charts**: Recharts
- **Maps**: Leaflet + React Globe GL
- **Routing**: React Router v6

## 📋 Prerequisites

- Node.js 18+ or Bun
- npm or bun package manager
- Git

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/pratik748/entropylite-32f216c1.git
cd entropylite-32f216c1
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   
   The `.env` file is already configured with Supabase credentials. For production, update these values:
```env
SUPABASE_PUBLISHABLE_KEY=your_supabase_key
SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
VITE_SUPABASE_URL=your_supabase_url
```

## 🚀 Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## 🏗️ Build

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm preview
```

## 🧪 Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## 📁 Project Structure

```
entropylite-32f216c1/
├── src/
│   ├── components/        # React components
│   │   ├── augment/      # Augment layer modules
│   │   ├── auth/         # Authentication components
│   │   ├── charts/       # Chart visualizations
│   │   ├── geopolitical/ # Geopolitical intelligence
│   │   ├── risk/         # Risk management
│   │   ├── sandbox/      # Entropy sandbox features
│   │   ├── terminal/     # Trading terminal components
│   │   └── ui/          # shadcn/ui components
│   ├── pages/            # Route pages
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions
│   └── App.tsx           # Main app component
├── public/               # Static assets
├── supabase/            # Supabase config and migrations
└── docs/                # Documentation
```

## 🔐 Authentication

The platform supports:
- Demo access mode for testing
- Supabase authentication integration
- Session management with Lovable Cloud Auth

## 🌐 Deployment

The project is configured for deployment on platforms like:
- Vercel
- Netlify
- Cloudflare Pages

Build command: `npm run build`
Output directory: `dist`

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode

## 🤝 Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Submit a pull request

## 📄 License

This project is proprietary and confidential.

## 🔗 Links

- Repository: https://github.com/pratik748/entropylite-32f216c1
- Supabase Project: https://reprphurmjtveejeqejn.supabase.co

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ using React + TypeScript + Supabase
