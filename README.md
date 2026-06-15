# Lawyer App — Document Management Platform

A document management platform for legal administration, derived from [Floowly](https://github.com/ControlC-io/floowly). Focused on OCR, PDF splitting, metadata extraction, and person-centric document folders.

## Features

- Document library with metadata-based organization and access rules
- **Persons** under administration (each person gets a dedicated folder)
- **Document types** with configurable fields to extract (invoices, contracts, etc.)
- PDF split with AI-suggested page ranges and metadata extraction (Gemini)
- OCR via Mistral; automatic metadata extraction after upload
- Multi-tenant companies, RBAC, user/group management
- MinIO S3-compatible storage

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, Prisma, PostgreSQL
- **Frontend**: React, Vite, TypeScript, shadcn/ui
- **AI**: Gemini (split + metadata), Mistral (OCR)
- **Storage**: MinIO

## Quick Start

```bash
docker-compose up -d
docker-compose exec backend npm run migrate:deploy
```

- Frontend: http://localhost:3000
- API health: http://localhost:3001/api/health

## Project Structure

```
lawyer-app/
├── backend/          # Express API, Prisma, OCR/split services
├── frontend/         # React app
├── shared/           # Shared types
├── infrastructure/   # Nginx, MinIO
└── docker-compose.yml
```

## Upstream

This repo is a vertical fork of `ControlC-io/floowly`. To pull platform fixes:

```bash
git fetch upstream
git merge upstream/main
```

## License

Internal ControlC-io project.
