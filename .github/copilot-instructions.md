# SecureExam Pro - Development Instructions

## Project Overview
SecureExam Pro is a SaaS-based secure online examination platform with:
- React.js frontend with TypeScript and Tailwind CSS
- Node.js/Express backend with TypeScript
- Supabase for database and authentication
- Socket.IO for real-time monitoring
- TensorFlow.js for AI-based webcam proctoring
- SheetJS for Excel report generation

## Project Structure
```
/client          - React frontend application
/server          - Node.js/Express backend API
/shared          - Shared types and utilities
```

## Development Commands
- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:client` - Start only the frontend
- `npm run dev:server` - Start only the backend
- `npm run build` - Build both applications for production

## Key Features
- Browser lockdown and anti-cheat system
- Webcam-based AI proctoring (optional)
- Real-time risk scoring and monitoring
- Device fingerprinting and IP logging
- Keyboard integrity monitoring
- Excel report generation

## Environment Variables
Configure `.env` files in both `/client` and `/server` directories.
