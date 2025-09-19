# ViQi Prototype - Film & TV Industry Matchmaking

A modern SaaS application that connects Film & TV professionals using AI-powered matching and personalized outreach.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- Docker and Docker Compose
- Google OAuth App (for SSO)

### Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   cd apps/api && pip install -r requirements.txt
   ```

2. **Start local services:**
   ```bash
   docker-compose up -d
   ```

3. **Set up database and seed data:**
   ```bash
   npm run setup
   ```

4. **Configure Google OAuth:**
   - Go to [Google Console](https://console.developers.google.com)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs
   - Update `.env` with your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

5. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## 📋 Features

### Core Functionality
- ✅ Mobile-first responsive design
- ✅ Google OAuth SSO integration
- ✅ AI-powered matching using Gemini
- ✅ Configurable flow (SSO/Paywall positioning)
- ✅ Stripe payments (subscription + credits)
- ✅ Email masking and reveal system
- ✅ Token usage tracking
- ✅ Comprehensive debugging logs

### User Flow
1. **Landing**: User describes what they're looking for
2. **SSO** (configurable): Google OAuth login
3. **Preview**: Shows 4 masked matches with blurred emails
4. **Paywall**: Stripe checkout for credits/subscription
5. **Reveal**: Full contact details and personalized email drafts
6. **Dashboard**: Usage tracking, credits, history

### Configuration
- `apps/web/config/flow.config.ts` - Flow step ordering
- `apps/api/config/llm.config.json` - LLM model switching
- Environment variables for all integrations

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific components
npm run test:web
npm run test:api
```

## 📊 Mock Data

The prototype includes realistic Film & TV industry data:
- **Companies**: Netflix, Warner Bros, Paramount, ILM, Deluxe, etc.
- **People**: Producers, VFX Supervisors, Directors, etc.
- **Content**: Popular movies and TV shows with metadata
- **Pricing**: Starter ($29/mo, 50 credits) and Pro ($79/mo, 200 credits)

## 🔧 Architecture

```
viqi-prototype/
├── apps/
│   ├── web/          # Next.js 14 frontend
│   └── api/          # FastAPI backend
├── packages/
│   └── shared/       # Shared types
└── docker-compose.yml # PostgreSQL + Redis
```

## 🐛 Debug Mode

Set `DEBUG=true` in `.env` to enable comprehensive logging:
- HTTP requests/responses
- Database queries
- LLM API calls
- Authentication flows
- Payment processing

## 🚧 Production Considerations

This is a prototype. For production:
- Replace mock matching with real database queries
- Implement proper error handling
- Add monitoring and alerting
- Set up CI/CD pipeline
- Configure production databases
- Add rate limiting and security headers

## 📞 Support

Check the logs in development mode for detailed debugging information. All major operations are logged with timestamps and request IDs.
