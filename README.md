# Axionis Taller

Car repair shop / mechanic workshop management system. Monorepo with a Next.js client and a NestJS server, managed via npm workspaces.

## Prerequisites

- Node.js 20+
- Docker (for the MySQL database)

## Setup

1. Install dependencies for all workspaces from the repo root:

   ```
   npm install
   ```

2. Start the MySQL database:

   ```
   npm run db:up
   ```

3. Generate the Prisma client and run migrations (from `server/`):

   ```
   cd server
   npm run prisma:generate
   npm run prisma:migrate
   ```

## Development

From the repo root:

```
npm run dev:server   # starts the NestJS API in watch mode
npm run dev:client   # starts the Next.js dev server
```

Or, equivalently, `cd client && npm run dev` / `cd server && npm run start:dev`.

## Stopping the database

```
npm run db:down
```
